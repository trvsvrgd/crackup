import assert from 'node:assert/strict';
import {SharedPhysicsWorld,type AgentPhysicsBody} from '../shared/physics/characterController.js';
import {INPUT_FLAG_OBJECTIVE_JETPACK as H,INPUT_FLAG_VEHICLE_INTERACT as E,EnemyLimbId} from '../shared/constants.js';
import {SANDBOX_ACTIVITY_REGISTRY as ACTIVITIES} from '../shared/content/activitiesAndCollectiblesRegistry.js';
import type {Tier4Award} from '../shared/world/tier4World.js';
import type {Vec3} from '../shared/protocol/binaryProtocol.js';
export function verifyTier4Activities():string[]{
  const sim=new SharedPhysicsWorld(),a=sim.createAgent(1,'ACTIVITY-ONE',{x:0,y:0,z:0}),b=sim.createAgent(2,'ACTIVITY-TWO',{x:0,y:0,z:0});a.spawnProtectionSec=b.spawnProtectionSec=1e6;
  const checks:string[]=[],awards:{agent:number;award:Tier4Award}[]=[];sim.tier4.onAward=(agent,award)=>awards.push({agent:agent.entityId,award});let seq=0;
  const place=(agent:AgentPhysicsBody,p:Vec3)=>{agent.position={...p};agent.velocity={x:0,y:0,z:0};agent.prevButtons=0;agent.grounded=false;agent.mantling=agent.grappleActive=false;sim.syncAgentKinematicTransform(agent);sim.world.propagateModifiedBodyPositionsToColliders();sim.world.updateSceneQueries();};
  const input=(agent:AgentPhysicsBody,buttons:number)=>{sim.applyAgentInput(agent,{seq:++seq,dt:1/60,moveX:0,moveZ:0,yaw:0,pitch:0,buttons});sim.stepWorld();};
  const step=(sec=.1)=>{for(let i=0;i<Math.ceil(sec*10);i++){sim.tier4.step(.1);sim.world.step();}};
  const kill=(ids:number[])=>{for(const id of ids){const enemy=sim.combatManager.enemies.get(id);if(enemy&&enemy.hp>0)sim.combatManager.applyLimbDamage(a,enemy,EnemyLimbId.TORSO,100000);}};
  try{
    for(const id of [...sim.combatManager.enemies.keys()])sim.combatManager.removeEnemy(id);
    for(const c of sim.tier4.citizens){place(a,{...c.spec.position,x:c.spec.position.x+5});step();assert.ok(c.active,`${c.spec.id} dynamically spawns near player`);
      if(c.spec.guards)assert.equal(c.enemies.length,c.spec.guards);
      if(c.spec.kind==='VAN'){const v=sim.tier4.vehicles.get(c.vehicleId!)!;const before={...v.position};step(1);assert.notDeepEqual(v.position,before,'harvest van moves');sim.vehiclePropManager.triggerSphericalExplosion(a,v.position,10);kill(c.enemies);place(a,c.position);a.prevButtons=H;step(2.3);}
      else if(c.spec.kind==='RESCUE'){kill(c.enemies);place(a,c.position);a.prevButtons=H;step(2.3);}
      else{place(a,c.spec.position);a.prevButtons=H;step();assert.equal(c.stage,1);place(a,c.spec.destination);a.prevButtons=H;step(2.3);}
      assert.equal(c.outcome,'SUCCESS',c.spec.id);const award=awards.find(r=>r.agent===a.entityId&&r.award.id.startsWith(c.spec.id+':'))!;assert.equal(award.award.reward.xp,c.spec.reward.xp);assert.equal(award.award.reward.stability,c.spec.reward.stability);
    }
    checks.push('All four interventions spawn, resolve actual threats/transport/delivery/evacuation and award registered civic deltas');
    const fail=sim.tier4.citizens[2];fail.cooldown=0;place(a,fail.spec.position);step();fail.elapsed=fail.spec.durationSec-.05;step();assert.equal(fail.outcome,'FAILED');assert.ok(awards.some(r=>r.award.id.startsWith(fail.spec.id+':')&&r.award.reward.stability===fail.spec.failure.stability));
    checks.push('Citizen deadline expiry applies failure deltas and enters cooldown instead of paying success');
    for(const s of ACTIVITIES.filter(s=>s.kind!=='CRUCIBLE')){
      place(a,s.position);input(a,H);let c=sim.tier4.profile(a).course!;assert.ok(c,`${s.id} starts`);
      if(s.kind==='RACE'){
        const v=sim.vehiclePropManager.spawnVehicle(65000,s.id,s.position,true);place(a,{...s.position,x:s.position.x+1});input(a,E);assert.equal(a.mountedVehicleId,v.vehicleId);
        const old=c.checkpoint;place(a,s.checkpoints[2]);step();assert.equal(c.checkpoint,old,'cannot skip checkpoint');place(a,s.position);c.previous.set(a.entityId,{...a.position});
      }else{a.mountedVehicleId=0;a.jetpackFuelSec=.1;a.airDashesRemaining=0;}
      for(const point of s.checkpoints){
        const from={...a.position};const n=Math.max(1,Math.ceil(Math.hypot(point.x-from.x,point.y-from.y,point.z-from.z)/35));
        for(let i=1;i<=n;i++){place(a,{x:from.x+(point.x-from.x)*i/n,y:from.y+(point.y-from.y)*i/n,z:from.z+(point.z-from.z)*i/n});step();}
      }
      assert.ok(sim.tier4.profile(a).completed.has(s.id),`${s.id} completes`);if(s.kind==='RINGS'){assert.ok(a.jetpackFuelSec>.1);assert.ok(a.airDashesRemaining>0);}
      a.mountedVehicleId=0;const v=sim.vehiclePropManager.vehicles.get(65000);if(v)v.driverEntityId=0;
    }
    checks.push('Four street races and four aerial ring courses enforce ordered physical crossings, vehicle mode and fuel/dash refills');
    const race=ACTIVITIES.find(s=>s.kind==='RACE')!;place(a,race.position);input(a,H);const expired=sim.tier4.profile(a).course!;expired.elapsed=race.durationSec;step();assert.equal(sim.tier4.profile(a).course,null);assert.match(sim.tier4.profile(a).message,/failed/);
    for(const s of ACTIVITIES.filter(s=>s.kind==='CRUCIBLE')){
      place(a,s.position);place(b,{...s.position,x:s.position.x+1});input(a,H);input(b,H);const c=sim.tier4.profile(a).course!;assert.equal(sim.tier4.profile(b).course,c);
      for(let i=0;i<11;i++){step();kill(c.enemies);}
      step();assert.equal(c.wave,10);assert.ok(sim.tier4.profile(a).completed.has(s.id));assert.ok(sim.tier4.profile(b).completed.has(s.id));assert.equal(awards.filter(r=>r.award.id===s.id).length,2);
    }
    checks.push('Both Crucibles execute ten escalating physical enemy waves and grant completion to two surviving co-op participants');
    return checks;
  }finally{sim.world.free();}
}
