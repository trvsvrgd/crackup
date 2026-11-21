import RAPIER from '@dimforge/rapier3d-compat';

import { DistrictId, EnemyCombatState, EnemyLimbId, INPUT_FLAG_OBJECTIVE_JETPACK, INPUT_FLAG_MELEE, DreadnoughtPhase, getAgilityParams, getExplosivesParams } from '../constants.js';

import type { AgentPhysicsBody, SharedPhysicsWorld } from '../physics/characterController.js';

import type { EnemyPhysicsEntity, CombatEventResult } from '../combat/enemyRigSystem.js';

import type { Vec3 } from '../protocol/binaryProtocol.js';

import { quatFromYaw } from '../protocol/binaryProtocol.js';

import { EffectKind,effectSpec } from '../protocol/presentationProtocol.js';

import { WEAPON_BY_ID,VEHICLE_BY_ID } from '../content/arsenalAndVehicleRegistry.js';

import { ENEMY_ARCHETYPE_BY_ID,ENEMY_ARCHETYPE_REGISTRY,BOSS_ENCOUNTER_REGISTRY,FACTION_PATROL_REGISTRY,HUNTER_RULES } from '../content/enemyAndBossRegistry.js';

import { LORE_COLLECTIBLE_REGISTRY,SF_LANDMARK_QUEST_REGISTRY,CITIZEN_INTERVENTION_REGISTRY,SANDBOX_ACTIVITY_REGISTRY,LOMBARD_CHECKPOINTS,TIER4_ACTIVITY_RULES as RULES,type ContentReward,type LandmarkQuest,type SandboxActivity } from '../content/activitiesAndCollectiblesRegistry.js';

import { CAMPAIGN_GRAPH } from '../content/campaignGraph.js';

import { MISSION_EXECUTION_REGISTRY } from '../content/missionArchetypeRegistry.js';

import { TIER4_GLASS_REGISTRY,TIER4_LIFT_REGISTRY } from '../content/tier4WorldGeometry.js';

import { createMissionController,type MissionArchetypeController } from './missionArchetypeControllers.js';

import { RoamingHunterDirector } from './roamingHunterDirector.js';

const dist=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

const held=(a:AgentPhysicsBody)=>!!(a.prevButtons&INPUT_FLAG_OBJECTIVE_JETPACK);

export interface Tier4Progress { collectedLore:string[];completedQuests:string[];unlocks:string[] }

export interface Tier4Award { id:string;district:DistrictId;reward:ContentReward;message:string }

interface Profile { collected:Set<string>;completed:Set<string>;unlocks:Set<string>;message:string;quest:QuestRun|null;course:CourseRun|null }

interface Target {id:string;position:Vec3;hp:number;maxHp:number;body:RAPIER.RigidBody;collider:RAPIER.Collider;kind:'NODE'|'GLASS';owner:string}

interface NPCVehicle {id:number;variantId:string;position:Vec3;yaw:number;hp:number;maxHp:number;enemyId:number;body:RAPIER.RigidBody;collider:RAPIER.Collider;route:readonly Vec3[];index:number;stopped:boolean}

interface MissionRun {controller:MissionArchetypeController;participants:Set<number>;enemies:number[];targets:string[];vehicleId?:number;objectiveHp:number;wave:number;work:number;bossId?:string}

interface QuestRun {spec:LandmarkQuest;stage:number;elapsed:number;work:number;enemies:number[];hp:number;checkpoint:number;wave:number;dropArmed:boolean}

interface CourseRun {spec:SandboxActivity;checkpoint:number;elapsed:number;wave:number;enemies:number[];participants:Set<number>;previous:Map<number,Vec3>}

interface CitizenRun {spec:typeof CITIZEN_INTERVENTION_REGISTRY[number];active:boolean;elapsed:number;cooldown:number;stage:number;enemies:number[];vehicleId?:number;participants:Set<number>;work:number;sequence:number;position:Vec3;outcome:string}

export interface Tier4Snapshot {

  collectedLore:string[];completedQuests:string[];unlocks:string[];message:string;heat:number;

  markers:{id:string;label:string;position:Vec3;kind:string}[];

  objectives:{id:string;label:string;position:Vec3;hp?:number;maxHp?:number;remaining?:number;progress?:number}[];

  enemies:{id:number;archetypeId:string}[];vehicles:{id:number;variantId:string;position:Vec3;yaw:number;hp:number}[];

  citizens:{id:string;position:Vec3;kind:string;stage:number}[];
  targets:{id:string;position:Vec3;hp:number;maxHp:number}[];

  glass:{id:string;hp:number}[];lifts:{id:string;position:Vec3}[];nurseryRevealed:boolean;

}

export class Tier4WorldSystem {

  public authoritative=true;

  public onAward:((agent:AgentPhysicsBody,award:Tier4Award)=>void)|null=null;

  public readonly profiles=new Map<number,Profile>();

  public readonly missions=new Map<string,MissionRun>();

  public readonly targets=new Map<string,Target>();

  public readonly vehicles=new Map<number,NPCVehicle>();

  public readonly bosses=new Map<string,number>();

  public readonly citizens:CitizenRun[]=CITIZEN_INTERVENTION_REGISTRY.map(spec=>({spec,active:false,elapsed:0,cooldown:0,stage:0,enemies:[],participants:new Set(),work:0,sequence:0,position:{...spec.position},outcome:''}));

  public readonly lifts=new Map<string,{body:RAPIER.RigidBody;position:Vec3;top:number;goal:number;wait:number}>();

  public readonly hunter:RoamingHunterDirector;

  private nextEnemy=2000; private nextVehicle=3000; private elapsed=0;

  private readonly spawnedPatrols=new Set<string>();

  private readonly ranged=new Map<number,number>();

  private readonly heatDamage=new Map<number,number>();
  private readonly civilianBodies=new Map<string,RAPIER.RigidBody>();
  private readonly impactCooldown=new Map<string,number>();

  private readonly bossWave=new Map<string,number>();

  private readonly defeatedBosses=new Set<string>();

  private readonly courses=new Map<string,CourseRun>();

  constructor(public readonly sim:SharedPhysicsWorld){

    this.hunter=new RoamingHunterDirector({

      completed:(a,id)=>this.profile(a).completed.has(id),

      spawnHunter:p=>{

        const enemy=this.spawnBoss('BOSS_D3_LT_CASSIA',p);enemy.externalDrive=true;

        const carrier=this.spawnVehicle('VH_A06',p,enemy.enemyId,[]);

        const escorts=[-1,1].map(side=>{const pos={x:p.x+side*7,y:1,z:p.z+7};const e=this.spawnEnemy('ENEMY_SYNDICATE_AGILE_RUSH',pos);e.externalDrive=true;return this.spawnVehicle('VH_G02',pos,e.enemyId,[]).id;});

        return {enemy,vehicleIds:[carrier.id,...escorts]};

      },

      moveHunter:(e,p,dt)=>{const carrier=this.vehicles.get(this.hunter.vehicleIds[0]);const diving=carrier?.hp===0||this.elapsed%12>8;this.moveEnemy(e,{...p,y:diving?p.y-11:p.y},diving?18:HUNTER_RULES.speedMps,dt,true);},

      updateHunterVehicles:(ids,e,a,dt)=>{

        const carrier=this.vehicles.get(ids[0]);if(carrier&&carrier.hp>0){carrier.position={...e.position};carrier.yaw=e.yaw;carrier.hp=Math.min(carrier.hp,e.hp);this.syncVehicle(carrier);}

        ids.slice(1).forEach((id,i)=>{const v=this.vehicles.get(id);if(!v)return;const rider=this.sim.combatManager.enemies.get(v.enemyId);if(!rider||rider.hp<=0){v.hp=0;v.collider.setEnabled(false);return;}this.moveVehicle(v,{x:a.position.x+(i?7:-7),y:1,z:a.position.z+6},dt,24);rider.position={...v.position,y:v.position.y+.4};rider.yaw=v.yaw;});

      },

      hunterDefeated:e=>{this.finishBoss('BOSS_D3_LT_CASSIA',e);for(const id of this.hunter.vehicleIds){const v=this.vehicles.get(id);if(v&&v.enemyId!==e.enemyId)this.removeEnemies([v.enemyId]);this.removeVehicle(id);}},

    });

    for(const g of TIER4_GLASS_REGISTRY)this.addTarget(g.id,g.position,g.half,g.hp,'GLASS','BOSS_D3_GRAVES');

    for(const l of TIER4_LIFT_REGISTRY){const body=sim.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(l.position.x,l.position.y,l.position.z));sim.world.createCollider(RAPIER.ColliderDesc.cuboid(2.5,.25,2.5),body);this.lifts.set(l.id,{body,position:{...l.position},top:l.top,goal:.25,wait:0});}

    sim.combatManager.weaponObstacleProbes.set('tier4',(agent,origin,direction,maxDistance)=>{

      const ray=new RAPIER.Ray(origin,direction);let nearest:{distance:number;resolve:()=>CombatEventResult}|null=null;

      const accept=(collider:RAPIER.Collider,resolve:()=>number)=>{if(!collider.isEnabled())return;const hit=collider.castRay(ray,maxDistance,true);if(hit<0||!Number.isFinite(hit)||nearest&&hit>=nearest.distance)return;const point={x:origin.x+direction.x*hit,y:origin.y+direction.y*hit,z:origin.z+direction.z*hit};nearest={distance:hit,resolve:()=>({type:'WEAPON_HIT',attackerEntityId:agent.entityId,targetEnemyId:0,damageDealt:resolve(),armorStripped:0,isCrit:false,limbCrippled:false,shockwaveTriggered:false,shockwaveHits:0,impactPoint:point})};};

      const damage=WEAPON_BY_ID.get(agent.tier3.weaponId)?.damage??42;

      for(const t of this.targets.values())if(t.hp>0)accept(t.collider,()=>this.damageTarget(t,damage));

      for(const v of this.vehicles.values())if(v.hp>0)accept(v.collider,()=>this.damageVehicle(v,damage,agent));

      return nearest;

    });

    const previousThrownHit=sim.vehiclePropManager.thrownArchitectureHit;
    sim.vehiclePropManager.thrownArchitectureHit=(agent,origin,delta,half,damage)=>{
      if(previousThrownHit?.(agent,origin,delta,half,damage))return true;
      if(!this.authoritative)return false;
      const hit=sim.world.castShape(origin,{x:0,y:0,z:0,w:1},delta,new RAPIER.Cuboid(half.x,half.y,half.z),0,1,true,undefined,undefined,agent.collider,undefined,c=>[...this.targets.values()].some(t=>t.hp>0&&t.collider.handle===c.handle)||[...this.vehicles.values()].some(v=>v.hp>0&&v.collider.handle===c.handle));
      if(!hit)return false;
      const target=[...this.targets.values()].find(t=>t.collider.handle===hit.collider.handle);if(target)this.damageTarget(target,damage);
      const vehicle=[...this.vehicles.values()].find(v=>v.collider.handle===hit.collider.handle);if(vehicle)this.damageVehicle(vehicle,damage,agent);
      return true;
    };
    sim.vehiclePropManager.extraExplosionHandlers.push((a,p,scale)=>{if(!this.authoritative)return[];const radius=getExplosivesParams(a.attributes.explosives).blastRadiusMeters*a.buildModifiers.blastRadiusMultiplier*scale;for(const t of this.targets.values())if(dist(t.position,p)<radius&&this.visible(p,t.position,a,t.collider))this.damageTarget(t,150*scale);for(const v of this.vehicles.values())if(dist(v.position,p)<radius&&this.visible(p,v.position,a))this.damageVehicle(v,150*scale,a);return[];});

  }

  public profile(a:AgentPhysicsBody):Profile {let p=this.profiles.get(a.entityId);if(!p){p={collected:new Set(),completed:new Set(),unlocks:new Set(),message:'H: begin a marked operation or use a lift.',quest:null,course:null};this.profiles.set(a.entityId,p);this.heatDamage.set(a.entityId,a.telemetry.totalDamageDealt??0);}return p;}

  public restore(a:AgentPhysicsBody,s:Partial<Tier4Progress>):void {const p=this.profile(a);p.collected=new Set(s.collectedLore??[]);p.completed=new Set(s.completedQuests??[]);p.unlocks=new Set(s.unlocks??[]);for(const id of p.unlocks)if(id.startsWith('RELIC_'))a.unlockedRelics.add(id);}

  public progress(a:AgentPhysicsBody):Tier4Progress {const p=this.profile(a);return{collectedLore:[...p.collected].sort(),completedQuests:[...p.completed].sort(),unlocks:[...p.unlocks].sort()};}

  public releaseAgent(id:number):void {const p=this.profiles.get(id);if(p?.quest)this.removeEnemies(p.quest.enemies);this.profiles.delete(id);this.hunter.heat.delete(id);this.heatDamage.delete(id);}

  private award(a:AgentPhysicsBody,id:string,district:DistrictId,reward:ContentReward,message:string,collection=false):void {

    const p=this.profile(a),set=collection?p.collected:p.completed;if(set.has(id))return;set.add(id);for(const u of reward.unlocks){p.unlocks.add(u);if(u.startsWith('RELIC_'))a.unlockedRelics.add(u);}p.message=message;this.onAward?.(a,{id,district,reward,message});

  }

  public spawnEnemy(id:string,position:Vec3,name?:string):EnemyPhysicsEntity {

    const spec=ENEMY_ARCHETYPE_BY_ID.get(id);if(!spec)throw new Error(`Unknown enemy ${id}`);

    while(this.sim.combatManager.enemies.has(this.nextEnemy))this.nextEnemy=this.nextEnemy>=59999?2000:this.nextEnemy+1;
    const enemyId=this.nextEnemy;this.nextEnemy=this.nextEnemy>=59999?2000:this.nextEnemy+1;
    const enemy=this.sim.combatManager.spawnEnemy(enemyId,name??spec.name,position,spec.role==='ELITE_EXOSUIT'||spec.role==='AGILE_RUSH',{contentId:id,faction:spec.factionId,maxHp:spec.hp,maxArmor:spec.armor,disableAutoRespawn:true});enemy.weaponIds=spec.weaponIds;return enemy;

  }

  private removeEnemies(ids:number[]):void {for(const id of ids){this.sim.combatManager.removeEnemy(id);this.ranged.delete(id);}}

  private alive(ids:number[]):number {return ids.filter(id=>(this.sim.combatManager.enemies.get(id)?.hp??0)>0).length;}

  private wave(position:Vec3,count:number,tier=0):number[]{return Array.from({length:count},(_,i)=>this.spawnEnemy(ENEMY_ARCHETYPE_REGISTRY[(tier*3+i)%15].id,{x:position.x+Math.cos(i*2.4)*13,y:position.y,z:position.z+Math.sin(i*2.4)*13}).enemyId);}

  public spawnBoss(id:string,position?:Vec3):EnemyPhysicsEntity {

    const previous=this.bosses.get(id),old=previous&&this.sim.combatManager.enemies.get(previous);if(old&&old.hp>0)return old;if(old)this.removeEnemies([old.enemyId]);this.bossWave.delete(id);

    const b=BOSS_ENCOUNTER_REGISTRY.find(b=>b.id===id)!;const e=this.spawnEnemy(b.archetypeId,position??b.position,b.name);e.hp=e.maxHp=b.hp;e.weaponIds=b.weaponIds;for(const l of Object.values(e.limbs)){l.hp=l.maxHp=b.hp*.6;}this.bosses.set(id,e.enemyId);this.defeatedBosses.delete(id);if(b.mechanic==='DREADNOUGHT'){this.sim.dreadnoughtDirector.arenaOrbit={center:{...b.position},radiusM:55};this.sim.dreadnoughtDirector.deploy();}return e;

  }

  private finishBoss(id:string,e:EnemyPhysicsEntity):void {

    if(this.defeatedBosses.has(id))return;

    const b=BOSS_ENCOUNTER_REGISTRY.find(b=>b.id===id)!;

    if(b.mechanic==='DREADNOUGHT'&&this.sim.dreadnoughtDirector.phase!==DreadnoughtPhase.DEFEATED)return;

    this.defeatedBosses.add(id);

    for(const a of this.sim.agents.values())if(a.hp>0&&(dist(a.position,e.position)<150||e.lastAttacker?.entityId===a.entityId||this.hunter.targetId===a.entityId))this.award(a,id,b.district,{xp:1000,stability:4,resonance:3,unlocks:[]},b.reveal);

    for(const v of this.vehicles.values())if(v.enemyId===e.enemyId){v.hp=0;v.collider.setEnabled(false);}

  }

  private addTarget(id:string,position:Vec3,half:Vec3,hp:number,kind:Target['kind'],owner:string):Target {

    const old=this.targets.get(id);if(old)this.sim.world.removeRigidBody(old.body);

    const body=this.sim.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(position.x,position.y,position.z));const collider=this.sim.world.createCollider(RAPIER.ColliderDesc.cuboid(half.x,half.y,half.z),body);

    const t={id,position:{...position},hp,maxHp:hp,body,collider,kind,owner};this.targets.set(id,t);return t;

  }

  private damageTarget(t:Target,amount:number):number {if(!this.authoritative||t.hp<=0||amount<=0)return 0;const damage=Math.min(t.hp,amount);t.hp-=damage;if(t.hp===0){t.collider.setEnabled(false);this.sim.effects.emit(effectSpec(EffectKind.DESTRUCTION,t.position,{radius:2}));}return damage;}

  private spawnVehicle(variantId:string,p:Vec3,enemyId:number,route:readonly Vec3[],networkId?:number):NPCVehicle {

    const spec=VEHICLE_BY_ID.get(variantId)!;const body=this.sim.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x,p.y,p.z));const collider=this.sim.world.createCollider(RAPIER.ColliderDesc.cuboid(variantId.startsWith('VH_A')?3:1,.65,2.4).setSensor(true),body);

    const v={id:networkId??this.nextVehicle++,variantId,position:{...p},yaw:0,hp:spec.hp,maxHp:spec.hp,enemyId,body,collider,route,index:0,stopped:false};this.vehicles.set(v.id,v);return v;

  }

  private damageVehicle(v:NPCVehicle,amount:number,a:AgentPhysicsBody):number {

    if(!this.authoritative||v.hp<=0)return 0;const damage=Math.min(v.hp,amount);v.hp-=damage;

    const e=this.sim.combatManager.enemies.get(v.enemyId);if(e&&e.hp>0){const event=this.sim.combatManager.applyLimbDamage(a,e,EnemyLimbId.TORSO,amount);this.sim.pendingCombatEvents.push(event);}

    if(v.hp<=0){v.stopped=true;v.collider.setEnabled(false);if(e&&e.hp>0){e.externalDrive=false;e.position.y=v.variantId.startsWith('VH_A')?e.position.y:0;}}

    return damage;

  }

  private syncVehicle(v:NPCVehicle):void {v.body.setNextKinematicTranslation(v.position);v.body.setNextKinematicRotation(quatFromYaw(v.yaw));}

  private moveVehicle(v:NPCVehicle,target:Vec3,dt:number,speed=8):void {if(v.stopped||v.hp<=0)return;const p=this.sweep(v.position,target,speed*dt,.6);v.yaw=Math.atan2(v.position.x-target.x,v.position.z-target.z);v.position=p;this.syncVehicle(v);}

  private sweep(from:Vec3,to:Vec3,travel:number,radius=.5):Vec3 {

    const d=dist(from,to);if(d<.01)return{...from};const dir={x:(to.x-from.x)/d,y:(to.y-from.y)/d,z:(to.z-from.z)/d};

    const hit=this.sim.world.castShape(from,{x:0,y:0,z:0,w:1},dir,new RAPIER.Ball(radius),0,Math.min(travel,d),true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,undefined,c=>c.isEnabled());

    const n=hit?Math.max(0,hit.time_of_impact-.05):Math.min(travel,d);return{x:from.x+dir.x*n,y:from.y+dir.y*n,z:from.z+dir.z*n};

  }

  public moveEnemy(e:EnemyPhysicsEntity,p:Vec3,speed:number,dt:number,air=false):void {

    if(e.hp<=0||e.staggerTimer>0||e.presentation.timer>0)return;

    const from={...e.position,y:e.position.y+1};let goal={...p,y:p.y+1};

    let next=this.sweep(from,goal,speed*dt,air?1:.45);

    if(dist(from,next)<speed*dt*.3){

      if(air)next=this.sweep(from,{x:from.x,y:from.y+12,z:from.z},speed*dt,1);

      else {const dx=goal.x-from.x,dz=goal.z-from.z;next=this.sweep(from,{x:from.x-dz,y:from.y,z:from.z+dx},speed*dt,.45);}

    }

    e.yaw=Math.atan2(from.x-goal.x,from.z-goal.z);e.velocity={x:(next.x-from.x)/dt,y:(next.y-from.y)/dt,z:(next.z-from.z)/dt};e.position={...next,y:next.y-1};e.combatState=EnemyCombatState.CHASE;

  }

  private visible(from:Vec3,to:Vec3,a?:AgentPhysicsBody,ignored?:RAPIER.Collider,ignoreAgents=false):boolean {const d=dist(from,to);if(d<.01)return true;const hit=this.sim.world.castRay(new RAPIER.Ray(from,{x:(to.x-from.x)/d,y:(to.y-from.y)/d,z:(to.z-from.z)/d}),Math.max(0,d-.25),true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,a?.collider,undefined,c=>c.handle!==ignored?.handle&&(!ignoreAgents||![...this.sim.agents.values()].some(a=>a.collider.handle===c.handle)));return !hit;}

  private near(a:AgentPhysicsBody,p:Vec3,r=RULES.interactRadiusM):boolean{const target=[...this.targets.values()].find(t=>dist(t.position,p)<.01);return a.hp>0&&dist(a.position,p)<=r&&this.visible({...a.position,y:a.position.y+1},{...p,y:p.y+.4},a,target?.collider,true);}

  public interact(a:AgentPhysicsBody):boolean {

    if(!this.authoritative||a.hp<=0)return false;

    for(const l of this.lifts.values())if(this.near(a,l.position,4)){l.goal=l.position.y<l.top/2?l.top:.25;l.wait=0;this.profile(a).message='Lift moving. Stay on the platform; H reverses direction.';return true;}

    const p=this.profile(a);

    if(!p.quest){const q=SF_LANDMARK_QUEST_REGISTRY.find(q=>!p.completed.has(q.id)&&this.near(a,q.position));if(q){p.quest={spec:q,stage:0,elapsed:0,work:0,enemies:[],hp:350,checkpoint:0,wave:0,dropArmed:false};return true;}}

    if(!p.course){const s=SANDBOX_ACTIVITY_REGISTRY.find(s=>this.near(a,s.position,7));if(s){this.startCourse(a,s);return true;}}

    const m=MISSION_EXECUTION_REGISTRY.find(m=>this.near(a,m.position)&&!p.completed.has(m.id));

    if(m){const required=CAMPAIGN_GRAPH.find(c=>c.id===m.id)!.prerequisites;if(!required.every(id=>p.completed.has(id))){p.message=`Complete ${required.join(', ')} first.`;return true;}if(this.missions.has(m.id)){this.missions.get(m.id)!.participants.add(a.entityId);return true;}this.startMission(a,m.id);return true;}

    return false;

  }

  public startMission(a:AgentPhysicsBody,id:string):boolean {

    const spec=MISSION_EXECUTION_REGISTRY.find(m=>m.id===id);if(!this.authoritative||!spec||!this.near(a,spec.position)||this.profile(a).completed.has(id)||!CAMPAIGN_GRAPH.find(c=>c.id===id)!.prerequisites.every(id=>this.profile(a).completed.has(id)))return false;

    if(this.missions.has(id))return false;

    const r:MissionRun={controller:createMissionController(spec),participants:new Set([a.entityId]),enemies:[],targets:[],objectiveHp:400,wave:0,work:0,bossId:spec.bossId};this.missions.set(id,r);

    if(spec.archetype==='SABOTAGE')r.targets=spec.objectives.map((p,i)=>this.addTarget(`${id}_NODE_${i}`,p,{x:.65,y:1,z:.65},120,'NODE',id).id);

    if(spec.archetype==='CONVOY_INTERCEPT'){const v=this.spawnVehicle('VH_G04',spec.objectives[0],0,spec.objectives);v.index=1;r.vehicleId=v.id;r.enemies=this.wave(spec.objectives[0],2);}

    if(spec.archetype==='TURF_DEFENSE')r.enemies=this.wave(spec.objectives[0],2);

    if(spec.archetype==='TARGET_HUNT'){

      if(spec.bossId==='BOSS_D3_LT_CASSIA')this.hunter.heat.set(a.entityId,150);

      else r.enemies=[spec.bossId?this.spawnBoss(spec.bossId).enemyId:this.spawnEnemy('ENEMY_AEGIS_HEAVY',spec.objectives[0],CAMPAIGN_GRAPH.find(m=>m.id===id)!.title).enemyId];

    }

    this.profile(a).message=`Operation started: ${CAMPAIGN_GRAPH.find(m=>m.id===id)!.title}`;return true;

  }

  private stepMissions(dt:number):void {

    for(const [id,r]of this.missions){

      const spec=r.controller.spec;

      const near=[...this.sim.agents.values()].filter(a=>a.hp>0&&(dist(a.position,spec.position)<70||spec.bossId&&dist(a.position,BOSS_ENCOUNTER_REGISTRY.find(b=>b.id===spec.bossId)!.position)<70));

      for(const a of near)if(CAMPAIGN_GRAPH.find(m=>m.id===id)!.prerequisites.every(id=>this.profile(a).completed.has(id)))r.participants.add(a.entityId);

      const party=[...r.participants].map(id=>this.sim.agents.get(id)).filter((a):a is AgentPhysicsBody=>!!a&&a.hp>0);

      const v=r.vehicleId?this.vehicles.get(r.vehicleId):undefined;

      if(v&&v.hp>0&&!v.stopped){this.moveVehicle(v,spec.objectives[1],dt,2);if(dist(v.position,spec.objectives[1])<2){r.controller.state='FAILED';}}

      const interactionPoint=v?.position??spec.objectives[r.controller.stage]??spec.position;

      const interacting=party.some(a=>held(a)&&this.near(a,interactionPoint,3.5));

      r.work=interacting?r.work+dt:0;

      if(spec.archetype==='SABOTAGE')for(const targetId of r.targets){const t=this.targets.get(targetId)!;if(t.hp>0&&party.some(a=>held(a)&&this.near(a,t.position)))this.damageTarget(t,45*dt);}

      if(spec.archetype==='TURF_DEFENSE'){

        const wave=Math.min(2,Math.floor(r.controller.defenseElapsed/15));if(wave>r.wave){r.wave=wave;r.enemies.push(...this.wave(spec.objectives[0],2+wave,wave));}

        for(const eid of r.enemies){const e=this.sim.combatManager.enemies.get(eid);if(e&&e.hp>0&&dist(e.position,spec.objectives[0])<18&&this.visible({...e.position,y:e.position.y+1},{...spec.objectives[0],y:spec.objectives[0].y+1}))r.objectiveHp-=5*dt;}

      }

      const bossDone=spec.bossId?this.defeatedBosses.has(spec.bossId)||party.some(a=>this.profile(a).completed.has(spec.bossId!)):this.alive(r.enemies)===0;

      r.controller.step(dt,{interacted:r.work>=2,targetsRemaining:spec.archetype==='SABOTAGE'?r.targets.filter(id=>this.targets.get(id)!.hp>0).length:this.alive(r.enemies),convoyStopped:!!v&&(v.hp<=0||v.stopped),atArchive:party.some(a=>this.near(a,spec.objectives[0])),atExtraction:party.some(a=>this.near(a,spec.position)),targetDefeated:bossDone,defended:near.length>0,objectiveHp:r.objectiveHp,participantsAlive:party.length>0});

      if(r.controller.state!=='ACTIVE'){

        for(const a of party){if(r.controller.state==='COMPLETE')this.award(a,id,spec.district,spec.reward,`${CAMPAIGN_GRAPH.find(m=>m.id===id)!.title} complete: +${spec.reward.xp} Vigilante XP`);else this.profile(a).message='Operation failed. Return to its start marker to retry.';}

        if(!spec.bossId)this.removeEnemies(r.enemies);

        for(const tid of r.targets){const t=this.targets.get(tid);if(t){this.sim.world.removeRigidBody(t.body);this.targets.delete(tid);}}

        if(v)this.removeVehicle(v.id);this.missions.delete(id);

      }

    }

  }

  private removeVehicle(id:number):void{const v=this.vehicles.get(id);if(v){this.sim.world.removeRigidBody(v.body);this.vehicles.delete(id);}}

  private stepQuest(a:AgentPhysicsBody,q:QuestRun,dt:number):void {

    const p=this.profile(a),s=q.spec.stages[q.stage];if(!s)return;

    if(a.hp<=0){this.removeEnemies(q.enemies);p.quest=null;p.message='Quest interrupted. Return to the landmark to retry.';return;}

    q.elapsed+=dt;

    const near=this.near(a,s.position,3.5);let done=false;

    if(s.kind==='INTERACT'){q.work=near&&held(a)?q.work+dt:0;done=q.work>=s.durationSec;}

    if(s.kind==='COMBAT'){if(q.wave===0){q.enemies=[this.spawnEnemy(s.enemyId!,s.position,s.id==='ALCATRAZ_UNIT00'?'Chimera Unit 00':s.title).enemyId];q.wave=1;}done=this.alive(q.enemies)===0;}

    if(s.kind==='DEFEND'){

      if(q.wave===0&&dist(a.position,s.position)<35){q.enemies=this.wave(s.position,2);q.wave=1;q.elapsed=0;}

      if(q.wave>0){const wave=Math.min(3,1+Math.floor(q.elapsed/15));if(wave>q.wave){q.wave=wave;q.enemies.push(...this.wave(s.position,2,wave));}for(const eid of q.enemies){const e=this.sim.combatManager.enemies.get(eid);if(e&&e.hp>0&&dist(e.position,s.position)<18)q.hp-=4*dt;}done=q.elapsed>=s.durationSec&&this.alive(q.enemies)===0&&dist(a.position,s.position)<40;}

      if(q.hp<=0||dist(a.position,s.position)>150&&q.wave>0){this.removeEnemies(q.enemies);p.quest=null;p.message='The rooftop refuge fell. Return to retry.';return;}

    }

    if(s.kind==='DROP'){if(a.position.y>65)q.dropArmed=true;done=q.dropArmed&&near;if(q.dropArmed&&Math.abs(a.position.x-s.position.x)<5&&Math.abs(a.position.z-s.position.z)<5&&a.position.y<12)a.velocity.y=Math.max(a.velocity.y,-8);}

    if(s.kind==='RACE'){

      if(q.elapsed>s.durationSec){q.checkpoint=0;q.elapsed=0;p.message='Lombard time expired. Restart at the first hairpin.';}

      const point=LOMBARD_CHECKPOINTS[q.checkpoint];const ground=a.mountedVehicleId&&this.sim.vehiclePropManager.vehicles.get(a.mountedVehicleId);

      if(point&&ground&&dist(a.position,point)<7&&(q.checkpoint===0||q.checkpoint===LOMBARD_CHECKPOINTS.length-1||Math.abs(ground.forwardSpeedMps)>3&&Math.abs(a.lastDriveSteer)>.15))q.checkpoint++;

      done=q.checkpoint===LOMBARD_CHECKPOINTS.length;

    }

    if(done){this.removeEnemies(q.enemies);q.enemies=[];q.stage++;q.elapsed=0;q.work=0;q.wave=0;if(q.stage===q.spec.stages.length){this.award(a,q.spec.id,q.spec.district,q.spec.reward,`${q.spec.name} complete. Unlocked ${q.spec.reward.unlocks.join(', ')}`);p.quest=null;}}

  }

  private startCourse(a:AgentPhysicsBody,s:SandboxActivity):void {

    const p=this.profile(a);if(p.course)return;

    let c=this.courses.get(s.id);if(!c){c={spec:s,checkpoint:0,elapsed:0,wave:0,enemies:[],participants:new Set(),previous:new Map()};this.courses.set(s.id,c);}

    // Racing and ring timing belongs to the entrant; survival is one shared arena.

    if(s.kind!=='CRUCIBLE'){c={...c,participants:new Set(),previous:new Map()};this.courses.set(`${s.id}:${a.entityId}`,c);this.courses.delete(s.id);}

    c.participants.add(a.entityId);c.previous.set(a.entityId,{...a.position});p.course=c;p.message=`${s.name}: ${s.kind==='CRUCIBLE'?'survive ten waves':'cross the highlighted checkpoints in order'}`;

  }

  private stepCourses(dt:number):void {

    for(const [key,c]of this.courses){c.elapsed+=dt;const party=[...c.participants].map(id=>this.sim.agents.get(id)).filter((a):a is AgentPhysicsBody=>!!a&&a.hp>0);

      let done=false;let failed=!party.length||c.elapsed>c.spec.durationSec;

      if(c.spec.kind==='CRUCIBLE'){

        if(party.every(a=>dist(a.position,c.spec.position)>65))failed=true;

        if(!failed&&this.alive(c.enemies)===0){this.removeEnemies(c.enemies);c.enemies=[];if(c.wave===c.spec.waves)done=true;else{c.wave++;c.enemies=this.wave(c.spec.position,2+Math.floor(c.wave/2),c.wave);}}

      }else for(const a of party){

        const point=c.spec.checkpoints[c.checkpoint];if(!point)continue;

        const vehicle=this.sim.vehiclePropManager.vehicles.get(a.mountedVehicleId);const validMode=c.spec.kind==='RACE'?!!vehicle:!a.grounded||!!this.sim.tier2.airspace.aircraft.get(a.mountedVehicleId);

        const previous=c.previous.get(a.entityId)??a.position;

        const dx=a.position.x-previous.x,dy=a.position.y-previous.y,dz=a.position.z-previous.z,len=dx*dx+dy*dy+dz*dz;

        const t=len?Math.max(0,Math.min(1,((point.x-previous.x)*dx+(point.y-previous.y)*dy+(point.z-previous.z)*dz)/len)):0;

        const closest={x:previous.x+dx*t,y:previous.y+dy*t,z:previous.z+dz*t};

        if(validMode&&Math.sqrt(len)<100&&dist(closest,point)<(c.spec.kind==='RINGS'?RULES.ringRadiusM:RULES.checkpointRadiusM)){

          c.checkpoint++;if(c.spec.kind==='RINGS'){a.jetpackFuelSec=a.maxJetpackFuelSec;a.airDashesRemaining=getAgilityParams(a.attributes.agility).maxAirDashes;this.sim.tier3.onSpire(a);}done=c.checkpoint===c.spec.checkpoints.length;

        }

        c.previous.set(a.entityId,{...a.position});

      }

      if(done||failed){for(const id of c.participants){const a=this.sim.agents.get(id);if(!a)continue;const p=this.profile(a);if(done&&a.hp>0)this.award(a,c.spec.id,c.spec.district,c.spec.reward,`${c.spec.name} complete: +${c.spec.reward.xp} XP`);else p.message=`${c.spec.name} failed. Return to its start to retry.`;p.course=null;}this.removeEnemies(c.enemies);this.courses.delete(key);}

    }

  }

  private stepCitizens(dt:number):void {

    for(const c of this.citizens){c.cooldown=Math.max(0,c.cooldown-dt);

      if(!c.active){if(c.cooldown>0)continue;const nearby=[...this.sim.agents.values()].filter(a=>a.hp>0&&dist(a.position,c.spec.position)<RULES.citizenActivationRadiusM);if(!nearby.length)continue;c.active=true;c.elapsed=0;c.stage=0;c.work=0;c.sequence++;c.position={...c.spec.position};c.participants=new Set(nearby.map(a=>a.entityId));c.enemies=this.wave({...c.position,y:Math.max(0,c.position.y-1)},c.spec.guards);c.outcome='ACTIVE';if(c.spec.kind==='VAN')c.vehicleId=this.spawnVehicle('VH_G04',c.position,0,[c.spec.position,c.spec.destination]).id;}

      c.elapsed+=dt;

      for(const a of this.sim.agents.values())if(a.hp>0&&dist(a.position,c.position)<55)c.participants.add(a.entityId);

      const party=[...c.participants].map(id=>this.sim.agents.get(id)).filter((a):a is AgentPhysicsBody=>!!a&&a.hp>0);

      const v=c.vehicleId?this.vehicles.get(c.vehicleId):undefined;if(v&&v.hp>0){this.moveVehicle(v,c.spec.destination,dt,1);c.position={...v.position};}

      let done=false;

      if(c.spec.kind==='VAN'||c.spec.kind==='RESCUE'){

        const ready=this.alive(c.enemies)===0&&(!v||v.hp<=0);

        c.work=ready&&party.some(a=>held(a)&&this.near(a,c.position))?c.work+dt:0;done=c.work>=2;

      }else {

        if(c.stage===0&&party.some(a=>held(a)&&this.near(a,c.spec.position))){c.stage=1;for(const a of party)this.profile(a).message=c.spec.kind==='DELIVERY'?'Medicine collected. Reach the clinic landing.':'Crew secured. Escort them to the street evacuation point.';}

        if(c.stage===1){const carrier=party[0];if(carrier&&c.spec.kind==='EVACUATE')c.position={...carrier.position,x:carrier.position.x+1};c.work=party.some(a=>held(a)&&this.near(a,c.spec.destination))?c.work+dt:0;done=c.work>=2;}

      }

      const failed=c.elapsed>=c.spec.durationSec||!party.length||!!v&&v.hp>0&&dist(v.position,c.spec.destination)<2;

      if(done||failed){for(const id of c.participants){const a=this.sim.agents.get(id);if(!a)continue;this.award(a,`${c.spec.id}:${[...this.profile(a).completed].filter(id=>id.startsWith(c.spec.id+":")).length+1}`,c.spec.district,done?c.spec.reward:{xp:0,stability:c.spec.failure.stability,resonance:c.spec.failure.resonance,unlocks:[]},`${c.spec.name}: ${done?'citizens safe':'intervention failed'}`);}c.active=false;c.cooldown=RULES.citizenCooldownSec;c.outcome=done?'SUCCESS':'FAILED';this.removeEnemies(c.enemies);c.enemies=[];if(c.vehicleId)this.removeVehicle(c.vehicleId);c.vehicleId=undefined;}

    }

  }

  private stepCombat(dt:number):void {

    for(const e of this.sim.combatManager.enemies.values()){

      if(!e.contentId||e.hp<=0)continue;const spec=ENEMY_ARCHETYPE_BY_ID.get(e.contentId)!;

      const cooldown=Math.max(0,(this.ranged.get(e.enemyId)??1)-dt);this.ranged.set(e.enemyId,cooldown);

      if(cooldown>0||e.staggerTimer>0||e.armsCrippledTimer>0||e.presentation.weaponDropped)continue;

      const target=[...this.sim.agents.values()].filter(a=>a.hp>0&&a.spawnProtectionSec<=0).sort((a,b)=>dist(a.position,e.position)-dist(b.position,e.position))[0];if(!target)continue;

      const weapons=(e.weaponIds??spec.weaponIds).map(id=>WEAPON_BY_ID.get(id)!);

      const d=dist(e.position,target.position);const viable=weapons.filter(w=>w.category!=='melee'||d<=3);const w=viable[Math.floor(this.elapsed)%Math.max(1,viable.length)];if(!w)continue;

      if(d>(w.category==='melee'?3:Math.max(spec.range,e.externalDrive?90:0)))continue;

      const from={...e.position,y:e.position.y+1.4},to={...target.position,y:target.position.y+1};if(!this.visible(from,to,target))continue;

      this.ranged.set(e.enemyId,Math.max(.8,w.cooldownSec*2));e.yaw=Math.atan2(from.x-to.x,from.z-to.z);

      const raw=w.damage*.20*(1-target.buildModifiers.incomingDamageReduction);const shield=Math.min(target.tier3.shield,raw);target.tier3.shield-=shield;target.hp=Math.max(0,target.hp-(raw-shield));

      this.sim.combatManager.onEffect?.(effectSpec(EffectKind.SHOT,from,{actor:e.enemyId,target:target.entityId}));

      this.sim.combatManager.onEffect?.(effectSpec(EffectKind.HIT,to,{actor:e.enemyId,target:target.entityId}));

      if(w.id==='EX_07'){const n=dist(from,to)||1;target.velocity.x+=(from.x-to.x)/n*8;target.velocity.z+=(from.z-to.z)/n*8;}

    }

    for(const [id,eid]of this.bosses){const e=this.sim.combatManager.enemies.get(eid);if(!e)continue;if(e.hp<=0){this.finishBoss(id,e);continue;}const b=BOSS_ENCOUNTER_REGISTRY.find(b=>b.id===id)!;

      if(b.mechanic==='STASIS_WAVES'){e.position.y=b.position.y+2+Math.sin(this.elapsed)*.6;const wave=Math.floor((1-e.hp/e.maxHp)*3);if(wave>(this.bossWave.get(id)??0)){this.bossWave.set(id,wave);this.wave({...b.position},3,wave);}}

      if(b.mechanic==='DASH_GLASS'&&Math.floor(this.elapsed*2)%8===0){const a=[...this.sim.agents.values()].find(a=>a.hp>0&&dist(a.position,e.position)<45);if(a)this.moveEnemy(e,{...a.position,y:e.position.y},24,dt);}

    }

  }

  public step(dt:number):void {

    if(!this.authoritative)return;this.elapsed+=dt;

    for(const a of this.sim.agents.values()){

      const p=this.profile(a);const damage=a.telemetry.totalDamageDealt??0;this.hunter.addHeat(a.entityId,Math.max(0,damage-(this.heatDamage.get(a.entityId)??damage)));this.heatDamage.set(a.entityId,damage);if(a.hp>0)for(const c of LORE_COLLECTIBLE_REGISTRY){if(p.collected.has(c.id)||!this.near(a,c.position,RULES.collectRadiusM))continue;if(c.wallId&&!this.sim.tier2.architecture.get(c.wallId)?.state.broken)continue;this.award(a,c.id,c.district,c.reward,`${c.title}: ${c.transcript}`,true);}

      if(!p.completed.has('CHIMERA_FULL_SET')&&LORE_COLLECTIBLE_REGISTRY.filter(c=>c.set==='CHIMERA_LOG').every(c=>p.collected.has(c.id)))this.award(a,'CHIMERA_FULL_SET',DistrictId.NEON_DOCKS,{xp:0,stability:0,resonance:0,unlocks:['GN_10']},'All seven voices recovered. GN_10 unlocked.');

      if(p.quest)this.stepQuest(a,p.quest,dt);

      if(!p.course&&a.hp>0&&!a.grounded){const course=SANDBOX_ACTIVITY_REGISTRY.find(c=>c.kind==='RINGS'&&dist(c.position,a.position)<5);if(course)this.startCourse(a,course);}

      if(a.hp>0&&(a.prevButtons&INPUT_FLAG_MELEE)){for(const t of this.targets.values())if(this.near(a,t.position,3))this.damageTarget(t,55*dt);for(const v of this.vehicles.values())if(this.near(a,v.position,3))this.damageVehicle(v,55*dt,a);}

    }

    for(const patrol of FACTION_PATROL_REGISTRY)if(!this.spawnedPatrols.has(patrol.id)&&[...this.sim.agents.values()].some(a=>a.hp>0&&dist(a.position,patrol.position)<90)){

      this.spawnedPatrols.add(patrol.id);const enemy=this.spawnEnemy(patrol.archetypeId,patrol.position);enemy.externalDrive=true;this.spawnVehicle(patrol.vehicleId,patrol.position,enemy.enemyId,patrol.route);

      const faction=ENEMY_ARCHETYPE_BY_ID.get(patrol.archetypeId)!.faction;for(const spec of ENEMY_ARCHETYPE_REGISTRY.filter(e=>e.faction===faction&&e.role!=='GRUNT'))this.spawnEnemy(spec.id,spec.position);

    }

    for(const v of this.vehicles.values())if(v.route.length>2&&v.hp>0){const rider=this.sim.combatManager.enemies.get(v.enemyId);if(rider&&rider.hp<=0){v.stopped=true;continue;}this.moveVehicle(v,v.route[v.index],dt,7);if(dist(v.position,v.route[v.index])<2)v.index=(v.index+1)%v.route.length;if(rider){rider.position={...v.position,y:v.position.y+.3};rider.yaw=v.yaw;}}

    this.stepVehicleImpacts(dt);
    this.hunter.step(dt,this.sim.agents);this.stepCombat(dt);this.stepMissions(dt);this.stepCitizens(dt);this.stepCourses(dt);this.stepLifts(dt);

  }

  private stepVehicleImpacts(dt:number):void {
    for(const [id,t]of this.impactCooldown){if(t<=dt)this.impactCooldown.delete(id);else this.impactCooldown.set(id,t-dt);}
    for(const v of this.sim.vehiclePropManager.vehicles.values()){
      const a=this.sim.agents.get(v.driverEntityId);const speed=Math.hypot(v.velocity.x,v.velocity.z);if(!a||a.hp<=0||speed<4)continue;
      const damage=Math.min(500,v.chassisMassKg*speed/100);
      for(const target of this.targets.values())if(target.hp>0&&dist(v.position,target.position)<4&&!this.impactCooldown.has(`t${v.vehicleId}:${target.id}`)){this.damageTarget(target,damage);this.impactCooldown.set(`t${v.vehicleId}:${target.id}`,1);}
      for(const target of this.vehicles.values())if(target.hp>0&&dist(v.position,target.position)<4&&!this.impactCooldown.has(`v${v.vehicleId}:${target.id}`)){this.damageVehicle(target,damage,a);this.impactCooldown.set(`v${v.vehicleId}:${target.id}`,1);}
    }
    for(const c of this.citizens){let body=this.civilianBodies.get(c.spec.id);if(c.active){if(!body){body=this.sim.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());this.sim.world.createCollider(RAPIER.ColliderDesc.capsule(.55,.3).setSensor(true),body);this.civilianBodies.set(c.spec.id,body);}const point=c.spec.kind==='DELIVERY'?c.spec.destination:c.position;body.setNextKinematicTranslation({...point,y:point.y+.8});}else if(body){this.sim.world.removeRigidBody(body);this.civilianBodies.delete(c.spec.id);}}
  }
  private stepLifts(dt:number):void {

    for(const l of this.lifts.values()){

      const old=l.position.y;const delta=Math.sign(l.goal-old)*Math.min(Math.abs(l.goal-old),12*dt);l.position.y+=delta;l.body.setNextKinematicTranslation(l.position);

      for(const a of this.sim.agents.values())if(a.hp>0&&Math.abs(a.position.x-l.position.x)<2.5&&Math.abs(a.position.z-l.position.z)<2.5&&a.position.y>=old-.1&&a.position.y<old+2.5){a.position.y+=delta;a.rigidBody.setTranslation(a.position,true);}

      if(Math.abs(l.goal-l.position.y)<.01){l.wait+=dt;if(l.wait>8&&l.goal>1){l.goal=.25;l.wait=0;}}

    }

  }



  public applySnapshot(s:Tier4Snapshot):void {

    if(this.authoritative)return;

    for(const g of s.glass){const t=this.targets.get(g.id);if(t){t.hp=g.hp;t.collider.setEnabled(g.hp>0);}}

    for(const [id,t]of this.targets)if(t.kind==='NODE'&&!s.targets.some(n=>n.id===id)){this.sim.world.removeRigidBody(t.body);this.targets.delete(id);}

    for(const n of s.targets){const t=this.targets.get(n.id)??this.addTarget(n.id,n.position,{x:.65,y:1,z:.65},n.maxHp,'NODE','network');t.hp=n.hp;t.collider.setEnabled(n.hp>0);}

    for(const l of s.lifts){const lift=this.lifts.get(l.id);if(lift){lift.position={...l.position};lift.body.setTranslation(l.position,true);}}

    for(const [id]of this.vehicles)if(!s.vehicles.some(v=>v.id===id))this.removeVehicle(id);

    for(const v of s.vehicles){const vehicle=this.vehicles.get(v.id)??this.spawnVehicle(v.variantId,v.position,0,[],v.id);vehicle.position={...v.position};vehicle.yaw=v.yaw;vehicle.hp=v.hp;vehicle.body.setTranslation(v.position,true);vehicle.body.setRotation(quatFromYaw(v.yaw),true);vehicle.collider.setEnabled(v.hp>0);}

  }

  public snapshot(a:AgentPhysicsBody):Tier4Snapshot {

    const p=this.profile(a);const markers:Tier4Snapshot['markers']=[];const objectives:Tier4Snapshot['objectives']=[];

    for(const m of MISSION_EXECUTION_REGISTRY)if(!p.completed.has(m.id)&&CAMPAIGN_GRAPH.find(c=>c.id===m.id)!.prerequisites.every(id=>p.completed.has(id)))markers.push({id:m.id,label:`H: ${CAMPAIGN_GRAPH.find(c=>c.id===m.id)!.title}`,position:m.position,kind:'MISSION'});

    for(const q of SF_LANDMARK_QUEST_REGISTRY)if(!p.completed.has(q.id))markers.push({id:q.id,label:`H: ${q.name}`,position:q.position,kind:'QUEST'});

    for(const c of SANDBOX_ACTIVITY_REGISTRY)markers.push({id:c.id,label:`${c.kind==='RINGS'?'Fly through':'H:'} ${c.name}`,position:c.position,kind:c.kind});

    for(const c of LORE_COLLECTIBLE_REGISTRY)if(!p.collected.has(c.id))markers.push({id:c.id,label:c.title,position:c.position,kind:c.set});

    for(const [id,l]of this.lifts)markers.push({id,label:'H: public lift',position:l.position,kind:'LIFT'});

    for(const [id,r]of this.missions)if(r.participants.has(a.entityId)){

      const s=r.controller.spec;const v=r.vehicleId&&this.vehicles.get(r.vehicleId);const boss=s.bossId&&this.bosses.get(s.bossId);const enemy=boss&&this.sim.combatManager.enemies.get(boss);

      const position=enemy?enemy.position:v?v.position:s.archetype==='SABOTAGE'?r.targets.map(id=>this.targets.get(id)!).find(t=>t.hp>0)?.position??s.position:s.objectives[r.controller.stage]??s.objectives[0];

      const labels={SABOTAGE:'Destroy nodes or hold H to isolate',CONVOY_INTERCEPT:'Stop the van, clear guards, hold H at cargo',VERTICAL_HEIST:r.controller.stage?'Hold H at extraction':'Reach archive and hold H; use the public lift',TURF_DEFENSE:'Defend the bypass; clear every wave',TARGET_HUNT:'Defeat the marked target'};

      objectives.push({id,label:labels[s.archetype],position,hp:r.objectiveHp,maxHp:400,remaining:s.durationSec-r.controller.elapsed,progress:r.controller.defenseElapsed/s.defenseSec});

      for(const tid of r.targets){const t=this.targets.get(tid)!;if(t.hp>0)objectives.push({id:tid,label:'Isolate node: damage or hold H',position:t.position,hp:t.hp,maxHp:t.maxHp});}

    }

    if(p.quest){const q=p.quest,s=q.spec.stages[q.stage];objectives.push({id:s.id,label:`${q.spec.name}: ${s.title}${s.kind==='INTERACT'?' (hold H)':''}`,position:s.kind==='RACE'?LOMBARD_CHECKPOINTS[q.checkpoint]??s.position:s.position,hp:q.hp,maxHp:350,remaining:s.durationSec?Math.max(0,s.durationSec-q.elapsed):undefined});}

    if(p.course){const c=p.course;objectives.push({id:c.spec.id,label:`${c.spec.name}: ${c.spec.kind==='CRUCIBLE'?`wave ${c.wave}/10`:`checkpoint ${c.checkpoint+1}/${c.spec.checkpoints.length}`}`,position:c.spec.checkpoints[c.checkpoint]??c.spec.position,remaining:c.spec.durationSec-c.elapsed});}

    for(const c of this.citizens)if(c.active)objectives.push({id:c.spec.id,label:`${c.spec.name}${c.stage?' — reach evacuation/delivery point and hold H':' — clear threats / hold H'}`,position:c.stage?c.spec.destination:c.position,remaining:c.spec.durationSec-c.elapsed});

    if(this.hunter.enemy)objectives.unshift({id:'BOSS_D3_LT_CASSIA',label:'Valkyrie-9 is hunting you',position:this.hunter.enemy.position,hp:this.hunter.enemy.hp,maxHp:this.hunter.enemy.maxHp});

    return {...this.progress(a),citizens:this.citizens.filter(c=>c.active).map(c=>({id:c.spec.id,kind:c.spec.kind,stage:c.stage,position:c.spec.kind==='DELIVERY'?c.spec.destination:c.position})),message:p.message,heat:this.hunter.heat.get(a.entityId)??0,markers,objectives,enemies:[...this.sim.combatManager.enemies.values()].filter(e=>e.contentId).map(e=>({id:e.enemyId,archetypeId:e.contentId!})),vehicles:[...this.vehicles.values()].map(v=>({id:v.id,variantId:v.variantId,position:v.position,yaw:v.yaw,hp:v.hp})),targets:[...this.targets.values()].filter(t=>t.kind==='NODE').map(t=>({id:t.id,position:t.position,hp:t.hp,maxHp:t.maxHp})),glass:[...this.targets.values()].filter(t=>t.kind==='GLASS').map(t=>({id:t.id,hp:t.hp})),lifts:[...this.lifts].map(([id,l])=>({id,position:l.position})),nurseryRevealed:this.defeatedBosses.has('BOSS_D1_KAEL')||p.completed.has('BOSS_D1_KAEL')};

  }

}
