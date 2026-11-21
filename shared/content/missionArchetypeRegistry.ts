import { DistrictId } from '../constants.js';
import type { Vec3 } from '../protocol/binaryProtocol.js';
import { immutable } from './worldLore.js';
import type { ContentReward } from './activitiesAndCollectiblesRegistry.js';
export type MissionArchetype = 'SABOTAGE' | 'CONVOY_INTERCEPT' | 'VERTICAL_HEIST' | 'TURF_DEFENSE' | 'TARGET_HUNT';
export const MISSION_ARCHETYPE_REGISTRY = immutable([
  {id:'SABOTAGE',name:'Isolate the infrastructure',durationSec:300},
  {id:'CONVOY_INTERCEPT',name:'Stop the transport and recover cargo',durationSec:240},
  {id:'VERTICAL_HEIST',name:'Recover the elevated archive and extract',durationSec:360},
  {id:'TURF_DEFENSE',name:'Defend the civic bypass',durationSec:180},
  {id:'TARGET_HUNT',name:'Locate and defeat the marked target',durationSec:600},
]);
export interface MissionExecutionSpec { id: string; archetype: MissionArchetype; district: DistrictId; position: Vec3; objectives: readonly Vec3[]; durationSec: number; defenseSec: number; bossId?: string; reward: ContentReward }
const layouts: readonly (readonly MissionArchetype[])[] = [
  ['SABOTAGE','CONVOY_INTERCEPT','VERTICAL_HEIST','TURF_DEFENSE','TARGET_HUNT','SABOTAGE'],
  ['VERTICAL_HEIST','CONVOY_INTERCEPT','TARGET_HUNT','VERTICAL_HEIST','TARGET_HUNT','TURF_DEFENSE'],
  ['CONVOY_INTERCEPT','TURF_DEFENSE','TARGET_HUNT','VERTICAL_HEIST','TARGET_HUNT','SABOTAGE'],
  ['VERTICAL_HEIST','SABOTAGE','TARGET_HUNT','CONVOY_INTERCEPT','TARGET_HUNT','TURF_DEFENSE'],
];
const districts = [DistrictId.NEON_DOCKS,DistrictId.FOUNDRY_SLUMS,DistrictId.HELIOS_SPIRE,DistrictId.AEGIS_CITADEL];
export const MISSION_EXECUTION_REGISTRY: readonly MissionExecutionSpec[] = immutable(layouts.flatMap((row,d)=>row.map((archetype,m)=>{
  const x = (d===0||d===3?-1:1)*450, z=(d<2?1:-1)*(90+m*28);
  const position={x,y:1,z};
  return { id:`MISSION_D${d+1}_${String(m+1).padStart(2,'0')}`,archetype,district:districts[d],position,
    objectives: archetype==='SABOTAGE'?[{x:x-8,y:1,z:z+10},{x:x+8,y:1,z:z+10},{x,y:1,z:z+18}]:archetype==='VERTICAL_HEIST'?[{x,y:35+d*10,z:z+10},position]:archetype==='CONVOY_INTERCEPT'?[{x:x+15,y:1,z},{x:x+75,y:1,z}]:[{x,y:0,z:z+10}],
    durationSec:MISSION_ARCHETYPE_REGISTRY.find(a=>a.id===archetype)!.durationSec,defenseSec:45+d*5,
    bossId:m===4?['BOSS_D1_KAEL','BOSS_D2_SOLANGE','BOSS_D3_GRAVES','BOSS_D4_THORNE'][d]:d===2&&m===2?'BOSS_D3_LT_CASSIA':undefined,
    reward:{xp:400+d*150+m*50,stability:3,resonance:2,unlocks:[]},
  };
})));
