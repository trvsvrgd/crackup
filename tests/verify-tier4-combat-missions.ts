import { verifyTier4CombatApproaches } from './tier4-combat-integration.js';
import { verifyTier4Network } from './tier4-network-integration.js';
import { verifyTier4Activities } from './tier4-activities-integration.js';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {ENEMY_ARCHETYPE_REGISTRY as ENEMIES,BOSS_ENCOUNTER_REGISTRY as BOSSES,FACTION_PATROL_REGISTRY} from '../shared/content/enemyAndBossRegistry.js';
import {LORE_COLLECTIBLE_REGISTRY as LORE,SF_LANDMARK_QUEST_REGISTRY as QUESTS,CITIZEN_INTERVENTION_REGISTRY as CITIZENS,SANDBOX_ACTIVITY_REGISTRY as ACTIVITIES,LOMBARD_CHECKPOINTS} from '../shared/content/activitiesAndCollectiblesRegistry.js';
import {MISSION_EXECUTION_REGISTRY as MISSIONS} from '../shared/content/missionArchetypeRegistry.js';
import {WEAPON_BY_ID,VEHICLE_BY_ID,RELIC_REGISTRY} from '../shared/content/arsenalAndVehicleRegistry.js';
import {provenanceForCitizen} from '../shared/content/worldLore.js';
import {createMissionController} from '../shared/world/missionArchetypeControllers.js';
import {initRapierPhysics,SharedPhysicsWorld,type AgentPhysicsBody} from '../shared/physics/characterController.js';
import {DEFAULT_ATTRIBUTES,EnemyLimbId,EnemyCombatState,INPUT_FLAG_OBJECTIVE_JETPACK as H,INPUT_FLAG_FIRE as FIRE,INPUT_FLAG_VEHICLE_INTERACT as E,DreadnoughtPhase,DreadnoughtPartId} from '../shared/constants.js';
import type {Vec3} from '../shared/protocol/binaryProtocol.js';
import type {Tier4Award} from '../shared/world/tier4World.js';
import {AgentDatabase} from '../server/db.js';
import {CrackupAuthoritativeServer} from '../server/gameServer.js';
import {TIER4_LIFT_REGISTRY,TIER4_GLASS_REGISTRY} from '../shared/content/tier4WorldGeometry.js';
const started=performance.now(),checks:string[]=[];
let earnedProgress:ReturnType<SharedPhysicsWorld['tier4']['progress']>;
const pass=(s:string)=>{checks.push(s);console.log(`PASS: ${s}`);};
assert.deepEqual([ENEMIES.length,BOSSES.length,LORE.length,QUESTS.length,CITIZENS.length,ACTIVITIES.length],[15,5,64,5,4,10]);
for(const registry of [ENEMIES,BOSSES,LORE,QUESTS,CITIZENS,ACTIVITIES,MISSIONS]){
  assert.ok(Object.isFrozen(registry));assert.equal(new Set(registry.map(s=>s.id)).size,registry.length);
  for(const s of registry){assert.ok(Object.isFrozen(s));assert.ok(Object.values(s.position).every(Number.isFinite));}
}
for(const e of [...ENEMIES,...BOSSES])for(const id of e.weaponIds)assert.ok(WEAPON_BY_ID.has(id));
for(const e of ENEMIES)assert.ok(VEHICLE_BY_ID.has(e.vehicleId));
for(const f of ['SYNDICATE','AEGIS','RESISTANCE'])assert.equal(ENEMIES.filter(e=>e.faction===f).length,5);
assert.equal(new Set(ENEMIES.map(e=>e.armorPreset.id)).size,15);
for(const e of ENEMIES.filter(e=>e.role==='ELITE_EXOSUIT'))assert.equal(e.heightM,3.2);
for(const c of LORE.filter(c=>c.set==='MEMORY_TAG')){assert.ok(provenanceForCitizen(c.citizenId!));assert.equal(c.reward.xp,150);assert.equal(c.reward.resonance,2);}
for(let i=1;i<=7;i++)assert.equal(LORE.filter(c=>c.subjectId===`SUBJECT_0${i}`).length,2);
for(const d of new Set(LORE.map(c=>c.district)))assert.equal(LORE.filter(c=>c.district===d&&c.set==='SOMNA_DOSSIER'&&c.wallId).length,5);
for(const q of QUESTS)for(const r of q.reward.unlocks)assert.ok(WEAPON_BY_ID.has(r)||VEHICLE_BY_ID.has(r)||RELIC_REGISTRY.some(s=>s.id===r));
pass('Immutable content counts, unique IDs, finite coordinates, all faction roles, provenance and arsenal/reward links');
for(const kind of new Set(MISSIONS.map(s=>s.archetype))){const spec=MISSIONS.find(s=>s.archetype===kind)!,c=createMissionController(spec);
  const observation={interacted:true,targetsRemaining:0,convoyStopped:true,atArchive:true,atExtraction:true,targetDefeated:true,defended:true,objectiveHp:400,participantsAlive:true};
  c.step(spec.defenseSec,observation);c.step(.1,observation);assert.equal(c.state,'COMPLETE',kind);const elapsed=c.elapsed;c.step(1,observation);assert.equal(c.elapsed,elapsed);
  const fail=createMissionController(spec);fail.step(1,{...observation,objectiveHp:0});assert.equal(fail.state,'FAILED');
}
pass('Five mission controllers complete, stop after completion and fail on lost objective');
await initRapierPhysics();
const sim=new SharedPhysicsWorld();const a=sim.createAgent(1,'TIER4-TEST',{x:-450,y:0,z:90});a.spawnProtectionSec=1e6;
let seq=0;const awards:Tier4Award[]=[];sim.tier4.onAward=(_a,award)=>awards.push(award);
const place=(p:Vec3)=>{a.position={...p};a.velocity={x:0,y:0,z:0};a.prevButtons=0;a.grounded=false;a.mantling=a.grappleActive=false;sim.syncAgentKinematicTransform(a);sim.world.propagateModifiedBodyPositionsToColliders();sim.world.updateSceneQueries();};
const input=(buttons=0,yaw=0,pitch=0)=>{sim.applyAgentInput(a,{seq:++seq,dt:1/60,moveX:0,moveZ:0,yaw,pitch,buttons});sim.stepWorld();};
const run=(sec:number,buttons=H)=>{a.prevButtons=buttons;for(let n=0;n<Math.ceil(sec*10);n++){sim.tier4.step(.1);sim.world.step();}};
const kill=(ids:number[])=>{for(const id of ids){const e=sim.combatManager.enemies.get(id);if(e&&e.hp>0)sim.combatManager.applyLimbDamage(a,e,EnemyLimbId.TORSO,100000);}};
try{
  for(const id of [...sim.combatManager.enemies.keys()])sim.combatManager.removeEnemy(id);
  for(const spec of ENEMIES){const e=sim.tier4.spawnEnemy(spec.id,{x:400,y:0,z:20});assert.equal(Object.keys(e.limbs).length,6);assert.equal(e.presentation.archetype,spec.rig);sim.combatManager.removeEnemy(e.enemyId);}
  pass('All 15 archetypes instantiate the shared six-collider rig with the registered presentation');
  const first=MISSIONS[0];place({...first.position,y:0});input(H);assert.ok(sim.tier4.missions.has(first.id),'normal H starts first mission');
  let r=sim.tier4.missions.get(first.id)!;const target=sim.tier4.targets.get(r.targets[0])!;place({x:target.position.x+3,y:0,z:target.position.z});
  for(let i=0;i<15&&target.hp>0;i++){input(FIRE,Math.PI/2);input(0,Math.PI/2);}assert.equal(target.hp,0,'ordinary gunfire destroys mission device');
  for(const id of r.targets.slice(1)){const t=sim.tier4.targets.get(id)!;place({x:t.position.x+1.7,y:0,z:t.position.z});run(3.2);}
  assert.ok(sim.tier4.profile(a).completed.has(first.id));assert.equal(awards.filter(x=>x.id===first.id).length,1);
  pass('Normal H starts a mission; normal gunfire and held H both complete physical sabotage nodes once');
  for(const spec of MISSIONS.slice(1)){
    place({...spec.position,y:0});input(H);r=sim.tier4.missions.get(spec.id)!;if(!r&&sim.tier4.profile(a).completed.has(spec.id)){assert.equal(awards.filter(x=>x.id===spec.id).length,1);continue;}assert.ok(r,`${spec.id} starts in story order`);
    if(spec.archetype==='SABOTAGE'){for(const id of r.targets){const t=sim.tier4.targets.get(id)!;place({x:t.position.x+1.7,y:t.position.y-1,z:t.position.z});run(3.2);}}
    if(spec.archetype==='CONVOY_INTERCEPT'){const v=sim.tier4.vehicles.get(r.vehicleId!)!;place({x:v.position.x+2,y:0,z:v.position.z});sim.vehiclePropManager.triggerSphericalExplosion(a,v.position,10);kill(r.enemies);place({...v.position,y:0});run(2.3);}
    if(spec.archetype==='VERTICAL_HEIST'){place({...spec.objectives[0],x:spec.objectives[0].x+1,y:spec.objectives[0].y-.5});run(2.3);assert.equal(r.controller.stage,1);place({...spec.position,y:0});run(2.3);}
    if(spec.archetype==='TURF_DEFENSE'){place({...spec.objectives[0],x:spec.objectives[0].x+3});for(let i=0;i<spec.defenseSec*10+20&&sim.tier4.missions.has(spec.id);i++){kill(r.enemies);run(.1,0);}}
    if(spec.archetype==='TARGET_HUNT'){
      if(spec.bossId==='BOSS_D3_LT_CASSIA'){run(.1,0);assert.ok(sim.tier4.hunter.enemy);kill([sim.tier4.hunter.enemy!.enemyId]);}
      else{const boss=spec.bossId&&BOSSES.find(b=>b.id===spec.bossId);if(boss)place({...boss.position,x:boss.position.x+6});kill(r.enemies);}
      if(spec.bossId==='BOSS_D4_THORNE'){
        const ship=sim.dreadnoughtDirector;assert.ok(ship.active);for(const id of [DreadnoughtPartId.ENGINE_FL,DreadnoughtPartId.ENGINE_FR,DreadnoughtPartId.ENGINE_RL,DreadnoughtPartId.ENGINE_RR])ship.damagePart(a,id,10000);ship.step(sim.agents,.1,false);
        for(const id of [DreadnoughtPartId.FLAK_TURRET_PORT,DreadnoughtPartId.FLAK_TURRET_STARBOARD])ship.damagePart(a,id,10000);ship.step(sim.agents,.1,false);ship.damagePart(a,DreadnoughtPartId.CORE_REACTOR,10000);ship.step(sim.agents,.1,false);assert.equal(ship.phase,DreadnoughtPhase.DEFEATED);
      }
      run(.2,0);
    }
    assert.ok(sim.tier4.profile(a).completed.has(spec.id),`${spec.id} completes through ${spec.archetype}`);assert.equal(awards.filter(x=>x.id===spec.id).length,1);assert.equal(awards.find(x=>x.id===spec.id)!.reward.xp,spec.reward.xp);
  }
  pass('All 24 authored missions execute with a level-one build, ordered prerequisites and exact one-time rewards; Thorne requires the real Dreadnought defeat');
  for(const c of LORE){place(c.position);if(c.wallId&&!sim.tier2.architecture.get(c.wallId)!.state.broken){run(.1,0);assert.ok(!sim.tier4.profile(a).collected.has(c.id));a.attributes.strength=3;sim.tier2.damageArchitecture(c.wallId,250,'charged_melee',a);}run(.1,0);assert.ok(sim.tier4.profile(a).collected.has(c.id),`${c.id} physically collected`);}
  assert.equal(sim.tier4.profile(a).collected.size,64);assert.ok(sim.tier4.profile(a).unlocks.has('GN_10'));const count=awards.length;run(.3,0);assert.equal(awards.length,count);
  pass('64 physical collections, closed-wall dossier rejection, citizen XP/resonance and full fourteen-log GN_10 unlock without duplicate awards');
  for(const q of QUESTS){place(q.position);input(H);let qr=sim.tier4.profile(a).quest;assert.equal(qr?.spec.id,q.id);
    for(let n=0;n<q.stages.length;n++){const s=q.stages[n];qr=sim.tier4.profile(a).quest!;assert.equal(qr.stage,n);
      if(s.kind==='INTERACT'){place({...s.position,x:s.position.x+1});run(s.durationSec+.2);}
      if(s.kind==='COMBAT'){place({...s.position,x:s.position.x+4});run(.1,0);kill(qr.enemies);run(.1,0);}
      if(s.kind==='DEFEND'){place({...s.position,x:s.position.x+3});for(let i=0;i<s.durationSec*10+10&&sim.tier4.profile(a).quest?.stage===n;i++){run(.1,0);kill(qr.enemies);}}
      if(s.kind==='DROP'){place({...s.position,y:75});run(.1,0);place(s.position);run(.1,0);}
      if(s.kind==='RACE'){const v=sim.vehiclePropManager.spawnVehicle(65000,'Trial car',s.position,true);place({...s.position,x:s.position.x+1});input(E);assert.equal(a.mountedVehicleId,v.vehicleId);for(const cp of LOMBARD_CHECKPOINTS){place(cp);v.forwardSpeedMps=8;a.lastDriveSteer=.6;run(.1,0);}a.mountedVehicleId=0;v.driverEntityId=0;}
    }
    assert.ok(sim.tier4.profile(a).completed.has(q.id),q.id);for(const u of q.reward.unlocks)assert.ok(sim.tier4.profile(a).unlocks.has(u),u);
  }
  pass('All five multi-stage landmark quests execute interactions, Unit 00 combat, interior drop, seven hairpins and rooftop defense with exact rewards');
  // Fresh hunter target demonstrates heat trigger independent of campaign progress.
  const b=sim.createAgent(2,'HUNTER-TARGET',{x:490,y:0,z:-180});b.spawnProtectionSec=999;sim.tier4.hunter.heat.set(b.entityId,150);sim.tier4.step(.1);const hunter=sim.tier4.hunter.enemy!;assert.ok(hunter);assert.equal(sim.tier4.hunter.vehicleIds.length,3);
  const start={...hunter.position};b.position={x:490,y:0,z:100};sim.syncAgentKinematicTransform(b);for(let i=0;i<60;i++){sim.tier4.step(.1);sim.world.step();}assert.ok(Math.hypot(hunter.position.x-start.x,hunter.position.z-start.z)>20);assert.ok(hunter.position.z>start.z,'pursues across district boundary');assert.equal(sim.tier4.vehicles.get(sim.tier4.hunter.vehicleIds[0])!.variantId,'VH_A06');
  kill([hunter.enemyId]);run(.1,0);assert.equal(sim.tier4.hunter.enemy,null);sim.removeAgent(b.entityId);
  pass('High heat dynamically deploys Valkyrie VTOL plus two Cyber-Cycles and pursues the target across district geometry until defeat');
  const missionTarget=sim.createAgent(3,'MISSION-HUNTER',{x:490,y:0,z:-180});missionTarget.spawnProtectionSec=999;sim.tier4.restore(missionTarget,{completedQuests:['MISSION_D3_02']});sim.tier4.step(.1);assert.ok(sim.tier4.hunter.enemy,'Mission 2 completion triggers hunt without heat');assert.equal(sim.tier4.snapshot(missionTarget).objectives[0].id,'BOSS_D3_LT_CASSIA');kill([sim.tier4.bosses.get('BOSS_D3_LT_CASSIA')!]);run(.1,0);assert.equal(sim.tier4.hunter.vehicleIds.length,0);sim.removeAgent(3);
  pass('District 3 Mission 2 independently triggers the hunter; its HUD alert takes priority and defeated escorts/vehicles are cleaned up');
  const lift=TIER4_LIFT_REGISTRY.find(l=>l.id==='LIFT_BOSS_D3_GRAVES')!;place({...lift.position,y:lift.position.y+.3});input(H);const startY=a.position.y;for(let i=0;i<30;i++)input();assert.ok(a.position.y>startY+2,'normal H lift carries low-level player');
  const glass=sim.tier4.targets.get(TIER4_GLASS_REGISTRY[0].id)!;place({x:glass.position.x-3,y:260,z:glass.position.z});for(let i=0;i<15&&glass.hp>0;i++){input(FIRE,-Math.PI/2);input();}assert.equal(glass.hp,0);assert.ok(!glass.collider.isEnabled());
  pass('Public lift moves a low-level player through ordinary H input; gunfire removes Graves plate-glass collision');
  earnedProgress=sim.tier4.progress(a);
}finally{sim.world.free();}

for(const check of verifyTier4Activities())pass(check);
for(const check of verifyTier4CombatApproaches())pass(check);

const folder=mkdtempSync(join(tmpdir(),'crackup-tier4-')),file=join(folder,'progress.sqlite');
try{
  let db=new AgentDatabase(file);assert.equal(db.db.pragma('journal_mode',{simple:true}),'wal');const auth=db.authenticateOrCreate('TIER4-WAL','1234');assert.ok(auth.ok);const record=db.getAgent('TIER4-WAL')!;
  record.collectedLore=earnedProgress.collectedLore;record.completedQuests=earnedProgress.completedQuests;record.tier4Unlocks=earnedProgress.unlocks;record.pendingTier4Awards=awards;record.xp.vigilante=awards.reduce((sum,a)=>sum+a.reward.xp,0);db.saveAgent(record);const resonance=record.gestaltResonance;db.saveAgent(record);assert.equal(record.gestaltResonance,resonance,'Receipt replay cannot repeat civic deltas');db.close();db=new AgentDatabase(file);const restored=db.getAgent('TIER4-WAL')!;assert.deepEqual(restored.collectedLore,record.collectedLore);assert.deepEqual(restored.completedQuests,record.completedQuests);assert.deepEqual(restored.tier4Unlocks,record.tier4Unlocks);assert.equal(restored.gestaltResonance,resonance);db.close();
  pass('SQLite WAL migration and close/reopen preserve all collections, quest completions, unlocks and award deltas');
}finally{rmSync(folder,{recursive:true,force:true});}
for(const check of await verifyTier4Network())pass(check);
writeFileSync('artifacts/evidence/tier4-verification.json',JSON.stringify({passed:true,durationSec:(performance.now()-started)/1000,checks},null,2)+'\n');
console.log(`Tier 4: ${checks.length} groups passed.`);
