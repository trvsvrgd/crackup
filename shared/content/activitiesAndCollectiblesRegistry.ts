import { DistrictId } from '../constants.js';
import type { Vec3 } from '../protocol/binaryProtocol.js';
import { immutable, RESONANCE_MEMORY_FRAGMENTS } from './worldLore.js';
import { GESTALT_ECHO_REGISTRY } from './characterRegistry.js';
import { TIER2_DISTRICTS } from './worldSystemsRegistry.js';
import { BRIDGES, bridgePoint } from '../world/bayVista.js';

export interface ContentReward { xp: number; stability: number; resonance: number; unlocks: readonly string[] }
export interface LoreCollectible { id: string; set: 'CHIMERA_LOG' | 'SOMNA_DOSSIER' | 'MEMORY_TAG'; district: DistrictId; position: Vec3; title: string; transcript: string; subjectId?: string; citizenId?: string; wallId?: number; reward: ContentReward }
const logTranscripts = [
  ['I ran the night mail over seven roofs. The intake form called my route an evasion disorder.', 'If you hear me inside your head, count the exits. The last one is always for somebody else.'],
  ['The barge cable snapped. I held it while the children crossed. Aegis billed me for the damaged winch.', 'They offered my family a pension for the use of my motor cortex. I never signed for forever.'],
  ['I drove the evacuation bus with the doors tied open. Every stop was somebody refusing to leave a neighbor.', 'The city still has a route home. Read the lights between the official roads.'],
  ['My scope showed a weapon. Then it showed a lunch box. I disobeyed the order and lowered the rifle.', 'Precision is the space you leave around a life. Do not let them rename certainty as justice.'],
  ['We cleared the factory before the blast. The basement lease roster had been redacted.', 'I remember every name that was missing. A charge should open a door, never erase the people behind it.'],
  ['The rescue beacon was below the smog. Command ordered altitude. I went down and brought four people out.', 'My flight record calls it equipment loss. Listen closely: that sound is a child breathing again.'],
  ['I represented citizens who could not wake for their hearings. The court marked silence as consent.', 'Seven witnesses now share one body. Speak each name before you ask what their sacrifice was worth.'],
];
const memoSubjects = ['Quota revision', 'Consent exception', 'Clinic transfer', 'Emergency escalation', 'Retention order'];
const memoTexts = [
  'Increase leased hours by twelve percent. Classify pump continuity as emergency authority; do not notify sleeping signatories.',
  'A waking lease is not revocable through the public terminal. Route appeals to the same office that issues the lease.',
  'Move donors under charity ambulance credentials. Episodic memory loss must be coded as an industrial exposure.',
  'If district throughput falls, authorize armed recovery. Protect the compute racks before the residential evacuation lifts.',
  'Retain original voluntary contracts in the Crown archive. Destroy local copies after the silence-lock firmware update.',
];
export const LORE_COLLECTIBLE_REGISTRY: readonly LoreCollectible[] = immutable([
  ...GESTALT_ECHO_REGISTRY.flatMap((echo, i): LoreCollectible[] => [0,1].map(j => {
    const d = TIER2_DISTRICTS[i % 4];
    return { id: `CHIMERA_${String(i + 1).padStart(2,'0')}_${j + 1}`, set: 'CHIMERA_LOG', district: d.district, subjectId: `SUBJECT_${String(i + 1).padStart(2,'0')}`, title: `Subject ${i + 1}: ${echo.name} / ${j ? 'After intake' : 'Before intake'}`, position: { x: d.x - Math.sign(d.x) * (28 + Math.floor(i / 4) * 10), y: 1, z: d.z + 72 + j * 8 }, transcript: logTranscripts[i][j], reward: { xp: 100, stability: 0, resonance: 1, unlocks: [] } };
  })),
  ...TIER2_DISTRICTS.flatMap((d, i): LoreCollectible[] => memoSubjects.map((subject, j) => ({ id: `DOSSIER_D${i + 1}_${j + 1}`, set: 'SOMNA_DOSSIER', district: d.district, title: `Aegis / D${i + 1} / ${subject}`, position: { x: d.x - 4 + j * 2, y: 33, z: d.z - 2 }, wallId: 10 + i, transcript: `District ${i + 1}, internal circulation only. ${memoTexts[j]}`, reward: { xp: 100, stability: 0, resonance: 1, unlocks: [] } }))),
  ...RESONANCE_MEMORY_FRAGMENTS.map((c): LoreCollectible => ({ id: `TAG_${c.citizenId}`, set: 'MEMORY_TAG', citizenId: c.citizenId, district: c.districtOfOrigin, position: { ...c.dormantMemoryTriggerCoords, y: c.dormantMemoryTriggerCoords.y + .3 }, title: `${c.name} / ${c.formerOccupation}`, transcript: c.transcript, reward: { xp: 150, stability: 0, resonance: 2, unlocks: [] } })),
]);
export const CHIMERA_SET_REWARD = immutable({ id: 'CHIMERA_FULL_SET', count: 14, unlocks: ['GN_10'] });
export interface QuestStage { id: string; title: string; kind: 'INTERACT' | 'COMBAT' | 'DEFEND' | 'DROP' | 'RACE'; position: Vec3; durationSec: number; enemyId?: string; courseId?: string }
export interface LandmarkQuest { id: string; name: string; district: DistrictId; position: Vec3; stages: readonly QuestStage[]; reward: ContentReward }
export const SF_LANDMARK_QUEST_REGISTRY: readonly LandmarkQuest[] = immutable([
  { id: 'QUEST_FERRY_CLOCK', name: 'Sunken Ferry Clocktower', district: DistrictId.NEON_DOCKS, position: { x: -430,y: 1,z: 525 }, stages: [
    { id: 'FERRY_POWER', title: 'Restore the tidal clock regulator', kind: 'INTERACT', position: { x: -430,y: 1,z: 525 }, durationSec: 3 },
    { id: 'FERRY_BELL', title: 'Ring the recovered ferry bell', kind: 'INTERACT', position: { x: -430,y: 18,z: 520 }, durationSec: 3 },
    { id: 'FERRY_ARCHIVE', title: 'Recover the seven-voice chronometer', kind: 'INTERACT', position: { x: -420,y: 1,z: 520 }, durationSec: 3 },
  ], reward: { xp: 1050, stability: 3, resonance: 3, unlocks: ['RELIC_01','GN_10'] } },
  { id: 'QUEST_ALCATRAZ', name: 'Alcatraz Black-Site', district: DistrictId.AEGIS_CITADEL, position: { x: -520,y: 1,z: -500 }, stages: [
    { id: 'ALCATRAZ_KEY', title: 'Read the prisoner transfer manifest', kind: 'INTERACT', position: { x: -520,y: 1,z: -500 }, durationSec: 3 },
    { id: 'ALCATRAZ_UNIT00', title: 'Defeat Chimera Unit 00', kind: 'COMBAT', position: { x: -520,y: 0,z: -520 }, durationSec: 0, enemyId: 'ENEMY_AEGIS_ELITE_EXOSUIT' },
    { id: 'ALCATRAZ_RELEASE', title: 'Release the gravity restraints', kind: 'INTERACT', position: { x: -510,y: 1,z: -520 }, durationSec: 3 },
  ], reward: { xp: 1200, stability: 4, resonance: 4, unlocks: ['ML_09'] } },
  { id: 'QUEST_COIT', name: 'Encased Coit Tower', district: DistrictId.HELIOS_SPIRE, position: { x: 520,y: 3,z: -500 }, stages: [
    { id: 'COIT_SEAL', title: 'Open the encasement maintenance route', kind: 'INTERACT', position: { x: 520,y: 3,z: -500 }, durationSec: 3 },
    { id: 'COIT_CROWN', title: 'Reach the interior drop shaft', kind: 'INTERACT', position: { x: 520,y: 80,z: -500 }, durationSec: 2 },
    { id: 'COIT_DROP', title: 'Drop through the hollow tower interior', kind: 'DROP', position: { x: 520,y: 3,z: -500 }, durationSec: 0 },
  ], reward: { xp: 1200, stability: 2, resonance: 3, unlocks: ['ML_10'] } },
  { id: 'QUEST_LOMBARD7', name: 'Lombard-7 Hairpin Drift Trial', district: DistrictId.HELIOS_SPIRE, position: { x: 420,y: 1,z: -80 }, stages: [
    { id: 'LOMBARD_ENTRY', title: 'Register at the hairpin timing gate', kind: 'INTERACT', position: { x: 420,y: 1,z: -80 }, durationSec: 2 },
    { id: 'LOMBARD_DRIFT', title: 'Finish all seven hairpins in a ground vehicle', kind: 'RACE', position: { x: 420,y: 1,z: -80 }, durationSec: 100, courseId: 'LOMBARD_TRIAL' },
    { id: 'LOMBARD_GARAGE', title: 'Claim the Spectre ignition cipher', kind: 'INTERACT', position: { x: 420,y: 1,z: -80 }, durationSec: 2 },
  ], reward: { xp: 1000, stability: 1, resonance: 1, unlocks: ['VH_G05'] } },
  { id: 'QUEST_PAINTED_LADIES', name: 'Rooftop Painted Ladies Defense', district: DistrictId.FOUNDRY_SLUMS, position: { x: 420,y: 1,z: 532 }, stages: [
    { id: 'LADIES_CALL', title: 'Answer the rooftop residents', kind: 'INTERACT', position: { x: 420,y: 1,z: 532 }, durationSec: 2 },
    { id: 'LADIES_DEFEND', title: 'Protect the rooftop refuge', kind: 'DEFEND', position: { x: 420,y: 26,z: 520 }, durationSec: 45, enemyId: 'ENEMY_SYNDICATE_GRUNT' },
    { id: 'LADIES_CROWN', title: 'Accept the community memory crown', kind: 'INTERACT', position: { x: 420,y: 26,z: 526 }, durationSec: 2 },
  ], reward: { xp: 1050, stability: 5, resonance: 5, unlocks: ['RELIC_02'] } },
]);
export const LOMBARD_CHECKPOINTS = immutable([0,1,2,3,4,5,6,7].map((n) => ({ x: 420 + (n % 2 ? 35 : 0), y: 1, z: -80 - n * 18 })));
export const CITIZEN_INTERVENTION_REGISTRY = immutable([
  { id: 'UNLAWFUL_HARVEST_VAN', name: 'Stop the unlawful harvest van', district: DistrictId.NEON_DOCKS, position: { x: -490,y: 1,z: 270 }, destination: { x: -420,y: 1,z: 270 }, durationSec: 100, kind: 'VAN' as const, guards: 2, reward: { xp: 350, stability: 4, resonance: 4, unlocks: [] }, failure: { stability: -3, resonance: -2 } },
  { id: 'OVERCLOCK_MEDICAL_DROP', name: 'Deliver overclock medicine', district: DistrictId.FOUNDRY_SLUMS, position: { x: 490,y: 1,z: 270 }, destination: { x: 490,y: 24,z: 300 }, durationSec: 90, kind: 'DELIVERY' as const, guards: 0, reward: { xp: 250, stability: 3, resonance: 3, unlocks: [] }, failure: { stability: -2, resonance: -1 } },
  { id: 'STOREFRONT_SHAKEDOWN', name: 'End the storefront shakedown', district: DistrictId.HELIOS_SPIRE, position: { x: 490,y: 1,z: -270 }, destination: { x: 490,y: 1,z: -275 }, durationSec: 75, kind: 'RESCUE' as const, guards: 3, reward: { xp: 300, stability: 3, resonance: 3, unlocks: [] }, failure: { stability: -3, resonance: -2 } },
  { id: 'STRANDED_CRANE_CREW', name: 'Evacuate the stranded crane crew', district: DistrictId.NEON_DOCKS, position: { x: -490,y: 36,z: 295 }, destination: { x: -490,y: 1,z: 310 }, durationSec: 120, kind: 'EVACUATE' as const, guards: 0, reward: { xp: 300, stability: 3, resonance: 4, unlocks: [] }, failure: { stability: -2, resonance: -2 } },
]);
export interface SandboxActivity { id: string; name: string; district: DistrictId; kind: 'RACE' | 'RINGS' | 'CRUCIBLE'; position: Vec3; checkpoints: readonly Vec3[]; durationSec: number; waves: number; reward: ContentReward }
const street = (x: number, z: number) => [{x,y:1,z},{x:x+45,y:1,z},{x:x+45,y:1,z:z+75},{x,y:1,z:z+75},{x,y:1,z}];
export const SANDBOX_ACTIVITY_REGISTRY: readonly SandboxActivity[] = immutable([
  { id: 'RACE_DOCKS', name: 'Midnight Circuit: Dock Run', district: DistrictId.NEON_DOCKS, kind: 'RACE', position: { x: -570,y:1,z:180 }, checkpoints: street(-570,180), durationSec: 70, waves: 0, reward: { xp: 300,stability:0,resonance:0,unlocks:[] } },
  { id: 'RACE_FOUNDRY', name: 'Midnight Circuit: Furnace Loop', district: DistrictId.FOUNDRY_SLUMS, kind: 'RACE', position: { x: 520,y:1,z:400 }, checkpoints: street(520,400), durationSec: 70, waves: 0, reward: { xp: 300,stability:0,resonance:0,unlocks:[] } },
  ...BRIDGES.map((b,i): SandboxActivity => ({ id: `RACE_BRIDGE_${i+1}`, name: `Midnight Circuit: ${b.id} suspension bridge`, district: i ? DistrictId.FOUNDRY_SLUMS : DistrictId.AEGIS_CITADEL, kind:'RACE', position:bridgePoint(b,20,0), checkpoints: [20,150,350,550,800,1100,1400].map(n=>bridgePoint(b,n,0,undefined)), durationSec:120,waves:0,reward:{xp:600,stability:0,resonance:0,unlocks:[]} })),
  ...TIER2_DISTRICTS.map((d,i): SandboxActivity=>({id:`RINGS_D${i+1}`,name:`Skyline Stunt Rings: ${d.district}`,district:d.district,kind:'RINGS',position:{x:d.x-35,y:18,z:d.z+100},checkpoints:[0,1,2,3,4,5].map(n=>({x:d.x-35+(n%2)*12,y:18+n*8,z:d.z+100+n*14})),durationSec:100,waves:0,reward:{xp:500,stability:0,resonance:1,unlocks:[]}})),
  ...[0,1].map((i): SandboxActivity=>({id:`CRUCIBLE_${i+1}`,name:`Foundry Crucible ${i+1}`,district:DistrictId.FOUNDRY_SLUMS,kind:'CRUCIBLE',position:{x:400+i*70,y:0,z:440},checkpoints:[{x:400+i*70,y:0,z:440}],durationSec:600,waves:10,reward:{xp:1500,stability:4,resonance:3,unlocks:[]}})),
]);
export const TIER4_ACTIVITY_RULES = immutable({ interactRadiusM: 3, collectRadiusM: 1.8, ringRadiusM: 5, checkpointRadiusM: 7, citizenActivationRadiusM: 55, citizenCooldownSec: 180 });
