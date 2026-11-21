import type { WorldBoxStructure } from '../world/neoVeridiaBlock.js';
import type { Vec3 } from '../protocol/binaryProtocol.js';
import { immutable } from './worldLore.js';
import { BOSS_ENCOUNTER_REGISTRY } from './enemyAndBossRegistry.js';
import { MISSION_EXECUTION_REGISTRY } from './missionArchetypeRegistry.js';
import { SF_LANDMARK_QUEST_REGISTRY, CITIZEN_INTERVENTION_REGISTRY, LOMBARD_CHECKPOINTS } from './activitiesAndCollectiblesRegistry.js';
export const TIER4_LIFT_REGISTRY = immutable([
  ...BOSS_ENCOUNTER_REGISTRY.filter(b=>!b.isRoamingHunter).map(b=>({id:`LIFT_${b.id}`,position:{x:b.position.x+24,y:.25,z:b.position.z},top:b.position.y})),
  ...MISSION_EXECUTION_REGISTRY.filter(m=>m.archetype==='VERTICAL_HEIST').map(m=>({id:`LIFT_${m.id}`,position:{x:m.objectives[0].x+10,y:.25,z:m.objectives[0].z},top:m.objectives[0].y-1})),
  {id:'LIFT_FERRY',position:{x:-424,y:.25,z:520},top:17},
  {id:'LIFT_COIT',position:{x:530,y:.25,z:-500},top:79},
  {id:'LIFT_PAINTED',position:{x:430,y:.25,z:520},top:25},
  {id:'LIFT_MEDICAL',position:{x:500,y:.25,z:300},top:23},
  {id:'LIFT_CRANE',position:{x:-480,y:.25,z:295},top:35},
]);
export const TIER4_GLASS_REGISTRY = immutable([-1,1].map((side,i)=>({id:`GRAVES_GLASS_${i}`,position:{x:470+side*22,y:263,z:-350},half:{x:.15,y:3,z:18},hp:100})));
export function buildTier4Structures(): WorldBoxStructure[] {
  const out:WorldBoxStructure[]=[];
  const box=(id:string,p:Vec3,h:Vec3,material:WorldBoxStructure['material']='obsidian_steel',sensor=false)=>out.push({id:`tier4-${id}`,center:p,halfExtents:h,material,isSensorOnly:sensor,excludeOrbPlacement:true});
  for(const b of BOSS_ENCOUNTER_REGISTRY.filter(b=>!b.isRoamingHunter)) {
    const p=b.position;
    box(`${b.id}-deck`,{...p,y:p.y-.5},{x:26,y:.5,z:22},b.mechanic==='STASIS_WAVES'?'industrial_grate':'obsidian_steel');
    for(const dx of [-23,23]) for(const dz of [-19,19]) box(`${b.id}-column-${dx}-${dz}`,{x:p.x+dx,y:p.y/2,z:p.z+dz},{x:.8,y:Math.max(.5,p.y/2),z:.8});
    for(const dx of [-10,10]) box(`${b.id}-cover-${dx}`,{x:p.x+dx,y:p.y+1,z:p.z+7},{x:2,y:1,z:1.2},'brutalist_concrete');
    if(b.mechanic==='HARPOON') {
      box('drydock-water',{...p,y:1},{x:30,y:.1,z:27},'harbor_water',true);
      box('megacrane-boom',{...p,y:32},{x:29,y:1,z:1},'neon_amber');
      for(const dx of [-25,25]) box(`megacrane-leg-${dx}`,{x:p.x+dx,y:16,z:p.z},{x:1,y:16,z:1},'industrial_grate');
      box('nursery-barge',{x:p.x-8,y:3,z:p.z+32},{x:12,y:1,z:6},'shipping_container');
    }
    if(b.mechanic==='STASIS_WAVES') for(let i=0;i<6;i++)box(`stasis-pod-${i}`,{x:p.x-15+i*6,y:p.y+1.8,z:p.z-15},{x:1,y:1.8,z:1},'neon_cyan');
  }
  for(const m of MISSION_EXECUTION_REGISTRY.filter(m=>m.archetype==='VERTICAL_HEIST'))box(`${m.id}-archive`,{...m.objectives[0],y:m.objectives[0].y-1.5},{x:12,y:.5,z:5},'industrial_grate');
  for(const lift of TIER4_LIFT_REGISTRY){box(`${lift.id}-rail`,{x:lift.position.x+3,y:lift.top/2,z:lift.position.z},{x:.25,y:lift.top/2,z:.25},'neon_amber');}
  // Alcatraz: open detention yard, barred cells, two watch posts and an archive plinth.
  box('alcatraz-yard',{x:-520,y:.08,z:-515},{x:18,y:.08,z:22},'industrial_grate');
  for(const x of [-538,-502]){
    box(`alcatraz-watch-${x}`,{x,y:5,z:-536},{x:2,y:5,z:2},'brutalist_concrete');
    box(`alcatraz-watch-roof-${x}`,{x,y:10.3,z:-536},{x:3,y:.3,z:3},'obsidian_steel');
  }
  for(let i=0;i<8;i++)box(`alcatraz-bar-${i}`,{x:-537+i*2,y:2,z:-529},{x:.08,y:2,z:.08},'obsidian_steel');
  box('alcatraz-evidence-console',{x:-510,y:.5,z:-522},{x:1,y:.5,z:.7},'neon_cyan');
  // Painted hairpin lanes are authored from the same checkpoint route as the timing controller.
  for(let i=0;i<LOMBARD_CHECKPOINTS.length-1;i++){
    const a=LOMBARD_CHECKPOINTS[i],b=LOMBARD_CHECKPOINTS[i+1],dx=b.x-a.x,dz=b.z-a.z;
    box(`lombard-road-${i}`,{x:(a.x+b.x)/2,y:.04,z:(a.z+b.z)/2},{x:5,y:.04,z:Math.hypot(dx,dz)/2+3},'plaza_asphalt');out[out.length-1].rotation={x:0,y:Math.atan2(dx,dz),z:0};
    box(`lombard-chevron-${i}`,{x:a.x,y:.13,z:a.z},{x:2,y:.05,z:.2},'neon_amber');
  }
  box('ferry-clocktower',{x:-430,y:8,z:520},{x:3,y:8,z:3},'brutalist_concrete');
  box('ferry-crown',{x:-430,y:16.5,z:520},{x:8,y:.5,z:6},'industrial_grate');
  for(const dx of [-6,6])box(`coit-wall-${dx}`,{x:520+dx,y:40,z:-500},{x:.5,y:40,z:6},'brutalist_concrete');
  box('coit-back',{x:520,y:40,z:-506},{x:6,y:40,z:.5},'brutalist_concrete');
  box('coit-drop-landing',{x:520,y:1,z:-500},{x:5,y:1,z:5},'industrial_grate');
  box('coit-crown-walk',{x:526,y:78.5,z:-500},{x:6,y:.5,z:5},'industrial_grate');
  for(let i=0;i<3;i++)box(`painted-lady-${i}`,{x:408+i*12,y:12,z:520},{x:5,y:12,z:8},['neon_cyan','neon_magenta','neon_amber'][i] as WorldBoxStructure['material']);
  box('painted-rooftop',{x:420,y:24.5,z:520},{x:23,y:.5,z:10},'industrial_grate');
  box('clinic-landing',{x:490,y:22.5,z:300},{x:12,y:.5,z:5},'industrial_grate');
  box('crew-platform',{x:-490,y:34.5,z:295},{x:12,y:.5,z:5},'industrial_grate');
  // Bridge entry ramps reach the existing fourteen-metre seawall without a traversal build gate.
  box('north-bridge-ramp',{x:-160,y:7,z:-565},{x:12,y:.5,z:32},'plaza_asphalt'); out[out.length-1].rotation={x:Math.atan2(14,60),y:0,z:0};
  box('east-bridge-ramp',{x:565,y:7,z:160},{x:32,y:.5,z:12},'plaza_asphalt'); out[out.length-1].rotation={x:0,y:0,z:Math.atan2(14,60)};
  return out;
}
