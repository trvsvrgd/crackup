import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {CrackupAuthoritativeServer} from '../server/gameServer.js';
import {LORE_COLLECTIBLE_REGISTRY as LORE} from '../shared/content/activitiesAndCollectiblesRegistry.js';
import {MISSION_EXECUTION_REGISTRY as MISSIONS} from '../shared/content/missionArchetypeRegistry.js';
import {encodeClientInput} from '../shared/protocol/binaryProtocol.js';
import {INPUT_FLAG_OBJECTIVE_JETPACK as H} from '../shared/constants.js';
export async function verifyTier4Network():Promise<string[]>{
  const server=new CrackupAuthoritativeServer({port:0,dbPath:':memory:'});const sockets:WebSocket[]=[];const checks:string[]=[];
  const wait=async(predicate:()=>boolean)=>{const end=Date.now()+7000;while(!predicate()){assert.ok(Date.now()<end,'Timed out awaiting Tier 4 authoritative state');await new Promise(resolve=>setTimeout(resolve,20));}};
  let seq=0;
  try{
    const port=await server.start();
    const connect=async(callsign:string)=>{const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`);sockets.push(ws);const messages:any[]=[];let id=0;ws.on('message',(data,binary)=>{if(!binary){const m=JSON.parse(data.toString());messages.push(m);if(m.type==='AUTH_OK')id=m.entityId;}});await once(ws,'open');ws.send(JSON.stringify({type:'AUTH',callsign,pin:'1234'}));await wait(()=>id>0);return{ws,messages,id};};
    const first=await connect('TIER4-LIVE-ONE'),second=await connect('TIER4-LIVE-TWO');const a=server.physicsWorld.agents.get(first.id)!,b=server.physicsWorld.agents.get(second.id)!;a.spawnProtectionSec=b.spawnProtectionSec=999;
    const place=(agent:typeof a,p:typeof a.position)=>{agent.position={...p};agent.velocity={x:0,y:0,z:0};agent.prevButtons=0;server.physicsWorld.syncAgentKinematicTransform(agent);server.physicsWorld.world.propagateModifiedBodyPositionsToColliders();server.physicsWorld.world.updateSceneQueries();};
    const before=server.db.getAgent('TIER4-LIVE-ONE')!;
    first.ws.send(JSON.stringify({type:'TIER4_COLLECT',id:LORE[0].id,xp:99999,completedQuests:MISSIONS.map(m=>m.id),unlocks:['GN_10']}));
    first.ws.send(JSON.stringify({type:'TIER3_EQUIP',id:'GN_10',attributes:{shooting:5,vigilante:5}}));await wait(()=>first.messages.some(m=>m.type==='CONTROL_ERROR'));assert.equal(a.tier3.weaponId,'');assert.deepEqual(server.physicsWorld.tier4.progress(a).collectedLore,[]);assert.equal(server.db.getAgent('TIER4-LIVE-ONE')!.xp.vigilante,before.xp.vigilante);
    place(a,LORE[0].position);await wait(()=>server.db.getAgent('TIER4-LIVE-ONE')!.collectedLore?.includes(LORE[0].id)===true);await wait(()=>first.messages.some(m=>m.type==='PLAYER_STATE'&&m.tier4?.collectedLore.includes(LORE[0].id)));
    assert.equal(server.db.getAgent('TIER4-LIVE-ONE')!.xp.vigilante,before.xp.vigilante+LORE[0].reward.xp);assert.ok(!server.db.getAgent('TIER4-LIVE-TWO')!.collectedLore?.includes(LORE[0].id));
    checks.push('Live WebSocket authority rejects forged collection/reward/equipment and persists actual proximity collection only for its collector');
    place(a,{...MISSIONS[0].position,y:0});place(b,{...MISSIONS[0].position,x:MISSIONS[0].position.x+5,y:0});first.ws.send(encodeClientInput({seq:++seq,dt:1/60,moveX:0,moveZ:0,yaw:0,pitch:0,buttons:H}));await wait(()=>server.physicsWorld.tier4.missions.has(MISSIONS[0].id));
    await wait(()=>second.messages.some(m=>m.type==='PLAYER_STATE'&&m.tier4?.targets.length===3));
    const one=first.messages.filter(m=>m.type==='PLAYER_STATE'&&m.tier4?.targets.length===3).at(-1);const two=second.messages.filter(m=>m.type==='PLAYER_STATE'&&m.tier4?.targets.length===3).at(-1);await wait(()=>!!first.messages.find(m=>m.type==='PLAYER_STATE'&&m.tier4?.targets.length===3));assert.equal(two.tier4.targets[0].id,`${MISSIONS[0].id}_NODE_0`);
    const client=new (server.physicsWorld.constructor as typeof import('../shared/physics/characterController.js').SharedPhysicsWorld)();try{client.tier4.authoritative=false;client.tier4.applySnapshot(two.tier4);assert.equal([...client.tier4.targets.values()].filter(t=>t.kind==='NODE').length,3);assert.ok(client.tier4.targets.get(two.tier4.targets[0].id)!.collider.isEnabled());}finally{client.world.free();}
    checks.push('Normal binary H input starts an operation; another peer receives all three physical nodes and reconstructs matching colliders');
    first.ws.close();await once(first.ws,'close');await wait(()=>!server.physicsWorld.agents.has(first.id));
    const rejoined=await connect('TIER4-LIVE-ONE');await wait(()=>rejoined.messages.some(m=>m.type==='PLAYER_STATE'&&m.tier4?.collectedLore.includes(LORE[0].id)));const restored=server.physicsWorld.agents.get(rejoined.id)!;place(restored,LORE[0].position);await new Promise(resolve=>setTimeout(resolve,150));assert.equal(server.db.getAgent('TIER4-LIVE-ONE')!.xp.vigilante,before.xp.vigilante+LORE[0].reward.xp);
    checks.push('Reconnect restores collection and prevents a second XP award while the other peer remains connected');
    return checks;
  }finally{for(const ws of sockets)ws.close();await server.stop();}
}
