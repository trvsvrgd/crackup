import assert from 'node:assert/strict';
import {SharedPhysicsWorld} from '../shared/physics/characterController.js';
import {DynamicPropType,EnemyLimbId,INPUT_FLAG_OBJECTIVE_JETPACK as H,INPUT_FLAG_GRAB_THROW as F,INPUT_FLAG_VEHICLE_INTERACT as E,DEFAULT_ATTRIBUTES} from '../shared/constants.js';
import {MISSION_EXECUTION_REGISTRY} from '../shared/content/missionArchetypeRegistry.js';
import type {Vec3} from '../shared/protocol/binaryProtocol.js';
export function verifyTier4CombatApproaches():string[]{
  const sim=new SharedPhysicsWorld();const a=sim.createAgent(1,'COMBAT-PATHS',{x:-450,y:0,z:90},undefined,{...DEFAULT_ATTRIBUTES,strength:3});a.spawnProtectionSec=1e6;let seq=0;
  const place=(p:Vec3)=>{a.position={...p};a.velocity={x:0,y:0,z:0};a.prevButtons=0;sim.syncAgentKinematicTransform(a);sim.world.propagateModifiedBodyPositionsToColliders();sim.world.updateSceneQueries();};
  const step=(buttons=0)=>{sim.applyAgentInput(a,{seq:++seq,dt:1/60,moveX:0,moveZ:0,yaw:0,pitch:0,buttons});sim.stepWorld();};
  try{
    for(const id of [...sim.combatManager.enemies.keys()])sim.combatManager.removeEnemy(id);
    const shield=sim.tier4.spawnEnemy('ENEMY_AEGIS_SHIELDED',{x:400,y:0,z:0});place({x:400,y:0,z:-3});const front=sim.combatManager.applyLimbDamage(a,shield,EnemyLimbId.TORSO,20);assert.equal(front.damageDealt,8);place({x:400,y:0,z:3});const rear=sim.combatManager.applyLimbDamage(a,shield,EnemyLimbId.TORSO,20);assert.equal(rear.damageDealt,20);sim.combatManager.removeEnemy(shield.enemyId);
    place({...MISSION_EXECUTION_REGISTRY[0].position,y:0});step(H);const r=sim.tier4.missions.get(MISSION_EXECUTION_REGISTRY[0].id)!;const t=sim.tier4.targets.get(r.targets[0])!;
    place({x:t.position.x,y:.2,z:t.position.z+4});const prop=sim.vehiclePropManager.spawnDynamicProp(65000,DynamicPropType.CARGO_CONTAINER,{x:a.position.x,y:1,z:a.position.z+1});sim.world.updateSceneQueries();step(F);assert.equal(a.heldPropId,prop.propId);step();step(F);assert.equal(a.heldPropId,0);for(let i=0;i<90&&t.hp>0;i++)step();assert.equal(t.hp,0,'Normal prop throw destroys a sabotage device');
    const next=sim.tier4.targets.get(r.targets[1])!;const v=sim.vehiclePropManager.spawnVehicle(65000,'Ram fixture',{x:next.position.x,y:1,z:next.position.z+3},true);place({x:v.position.x+1,y:0,z:v.position.z});step(E);assert.equal(a.mountedVehicleId,v.vehicleId);v.position={x:next.position.x,y:1,z:next.position.z+2};v.velocity={x:0,y:0,z:-15};sim.tier4.step(.1);assert.equal(next.hp,0,'Moving driven vehicle damages sabotage device');
    return ['Faction shields resist frontal torso fire while exposing flanks; normal prop throws and driven-vehicle impacts damage mission infrastructure'];
  }finally{sim.world.free();}
}
