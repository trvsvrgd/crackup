import { DistrictId } from '../constants.js';
import type { Vec3 } from '../protocol/binaryProtocol.js';

/** Recursively frozen authoring data: IDs and nested records cannot drift at runtime. */
export function immutable<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
export const FACTION_REGISTRY = immutable({
  AEGIS: { id: 'AEGIS', name: 'Aegis Directorate', doctrine: 'Continuity through compulsory compute leases.' },
  SYNDICATE: { id: 'SYNDICATE', name: 'Dividend Syndicate', doctrine: 'Human perception is a tradable commodity.' },
  RESISTANCE: { id: 'RESISTANCE', name: 'Unleased Resistance', doctrine: 'Consent cannot be patched out of a person.' },
  CIVIC: { id: 'CIVIC', name: 'Municipal Service', doctrine: 'Keep citizens alive through every change of power.' },
} as const);

export const LORE_BOUNDS = immutable({ min: { x: -5000, y: -200, z: -5000 }, max: { x: 5000, y: 800, z: 5000 } });
export function isLoreCoordinate(p: unknown): p is Vec3 {
  if (!p || typeof p !== 'object') return false;
  return (['x', 'y', 'z'] as const).every(k => {
    const n = (p as Vec3)[k];
    return Number.isFinite(n) && n >= LORE_BOUNDS.min[k] && n <= LORE_BOUNDS.max[k];
  });
}
export const DISTRICT_LORE_REGISTRY = immutable([
  { id: DistrictId.NEON_DOCKS, ordinal: 1, name: 'Neon Docks', relay: { x: -290, y: 14, z: 290 }, failsafe: 'Isolate nursery circuits and charge the seawall flywheels before lease release.', catastrophe: { kind: 'FLOOD', computeDropFraction: 0.15, graceSeconds: 180, floodRiseMeters: 8, smogPpm: 0, lifeSupportLossFraction: 0.3 }, ruins: [
    { id: 'RUIN_FERRY_CLOCKTOWER', name: 'Sunken Ferry Clocktower', coords: { x: -740, y: -12, z: 320 } },
    { id: 'RUIN_ALCATRAZ_CHIMERA', name: 'Alcatraz Chimera Lab', coords: { x: -1600, y: 22, z: -1200 } },
  ] },
  { id: DistrictId.FOUNDRY_SLUMS, ordinal: 2, name: 'Foundry Slums', relay: { x: 290, y: 14, z: 290 }, failsafe: 'Install coroner-certified scrubber reserves and isolate the extraction furnaces.', catastrophe: { kind: 'SMOG', computeDropFraction: 0.15, graceSeconds: 120, floodRiseMeters: 0, smogPpm: 800, lifeSupportLossFraction: 0.45 }, ruins: [
    { id: 'RUIN_COIT_TOWER', name: 'Encased Coit Tower', coords: { x: 370, y: 125, z: 390 } },
  ] },
  { id: DistrictId.HELIOS_SPIRE, ordinal: 3, name: 'Helios Financial Spire', relay: { x: 290, y: 14, z: -290 }, failsafe: 'Route civic transit through an independent dispatch clock before severing the broker.', catastrophe: { kind: 'GRID_CASCADE', computeDropFraction: 0.15, graceSeconds: 90, floodRiseMeters: 0, smogPpm: 120, lifeSupportLossFraction: 0.6 }, ruins: [
    { id: 'RUIN_LOMBARD_7', name: 'Lombard-7 Hairpin', coords: { x: 430, y: 14, z: -310 } },
  ] },
  { id: DistrictId.AEGIS_CITADEL, ordinal: 4, name: 'Aegis Citadel Plaza', relay: { x: -290, y: 14, z: -290 }, failsafe: 'Restore consent records and transfer life support to autonomous municipal controllers.', catastrophe: { kind: 'LIFE_SUPPORT', computeDropFraction: 0.15, graceSeconds: 60, floodRiseMeters: 0, smogPpm: 0, lifeSupportLossFraction: 1 }, ruins: [
    { id: 'RUIN_PAINTED_LADIES', name: 'Rooftop Painted Ladies', coords: { x: -420, y: 180, z: -380 } },
  ] },
] as const);

export const CITIZEN_DOORWAY_REGISTRY = immutable([
  { id: 'DOOR_CIT_001', citizenId: 'CIT_001', coords: { x: -102, y: 0, z: 87.35 }, approach: { x: -102, y: 0, z: 88.85 } },
  { id: 'DOOR_CIT_002', citizenId: 'CIT_002', coords: { x: -85, y: 0, z: 87.35 }, approach: { x: -85, y: 0, z: 88.85 } },
  { id: 'DOOR_CIT_003', citizenId: 'CIT_003', coords: { x: -192, y: 0, z: 122.35 }, approach: { x: -192, y: 0, z: 123.85 } },
  { id: 'DOOR_CIT_004', citizenId: 'CIT_004', coords: { x: -175, y: 0, z: 122.35 }, approach: { x: -175, y: 0, z: 123.85 } },
  { id: 'DOOR_CIT_005', citizenId: 'CIT_005', coords: { x: -282, y: 0, z: 172.35 }, approach: { x: -282, y: 0, z: 173.85 } },
  { id: 'DOOR_CIT_006', citizenId: 'CIT_006', coords: { x: -265, y: 0, z: 172.35 }, approach: { x: -265, y: 0, z: 173.85 } },
  { id: 'DOOR_CIT_007', citizenId: 'CIT_007', coords: { x: -377, y: 0, z: 232.35 }, approach: { x: -377, y: 0, z: 233.85 } },
  { id: 'DOOR_CIT_008', citizenId: 'CIT_008', coords: { x: -467, y: 0, z: 312.35 }, approach: { x: -467, y: 0, z: 313.85 } },
  { id: 'DOOR_CIT_009', citizenId: 'CIT_009', coords: { x: 106, y: 0, z: 125.15 }, approach: { x: 106, y: 0, z: 126.65 } },
  { id: 'DOOR_CIT_010', citizenId: 'CIT_010', coords: { x: 114, y: 0, z: 125.15 }, approach: { x: 114, y: 0, z: 126.65 } },
  { id: 'DOOR_CIT_011', citizenId: 'CIT_011', coords: { x: 206, y: 0, z: 156.15 }, approach: { x: 206, y: 0, z: 157.65 } },
  { id: 'DOOR_CIT_012', citizenId: 'CIT_012', coords: { x: 214, y: 0, z: 156.15 }, approach: { x: 214, y: 0, z: 157.65 } },
  { id: 'DOOR_CIT_013', citizenId: 'CIT_013', coords: { x: 306, y: 0, z: 227.15 }, approach: { x: 306, y: 0, z: 228.65 } },
  { id: 'DOOR_CIT_014', citizenId: 'CIT_014', coords: { x: 314, y: 0, z: 227.15 }, approach: { x: 314, y: 0, z: 228.65 } },
  { id: 'DOOR_CIT_015', citizenId: 'CIT_015', coords: { x: 416, y: 0, z: 329.15 }, approach: { x: 416, y: 0, z: 330.65 } },
  { id: 'DOOR_CIT_016', citizenId: 'CIT_016', coords: { x: 424, y: 0, z: 329.15 }, approach: { x: 424, y: 0, z: 330.65 } },
  { id: 'DOOR_CIT_017', citizenId: 'CIT_017', coords: { x: 111, y: 0, z: -97.85 }, approach: { x: 111, y: 0, z: -96.35 } },
  { id: 'DOOR_CIT_018', citizenId: 'CIT_018', coords: { x: 119, y: 0, z: -97.85 }, approach: { x: 119, y: 0, z: -96.35 } },
  { id: 'DOOR_CIT_019', citizenId: 'CIT_019', coords: { x: 211, y: 0, z: -121.85 }, approach: { x: 211, y: 0, z: -120.35 } },
  { id: 'DOOR_CIT_020', citizenId: 'CIT_020', coords: { x: 219, y: 0, z: -121.85 }, approach: { x: 219, y: 0, z: -120.35 } },
  { id: 'DOOR_CIT_021', citizenId: 'CIT_021', coords: { x: 161, y: 0, z: -226.85 }, approach: { x: 161, y: 0, z: -225.35 } },
  { id: 'DOOR_CIT_022', citizenId: 'CIT_022', coords: { x: 169, y: 0, z: -226.85 }, approach: { x: 169, y: 0, z: -225.35 } },
  { id: 'DOOR_CIT_023', citizenId: 'CIT_023', coords: { x: 281, y: 0, z: -263.85 }, approach: { x: 281, y: 0, z: -262.35 } },
  { id: 'DOOR_CIT_024', citizenId: 'CIT_024', coords: { x: -139, y: 0, z: -116.85 }, approach: { x: -139, y: 0, z: -115.35 } },
  { id: 'DOOR_CIT_025', citizenId: 'CIT_025', coords: { x: -131, y: 0, z: -116.85 }, approach: { x: -131, y: 0, z: -115.35 } },
  { id: 'DOOR_CIT_026', citizenId: 'CIT_026', coords: { x: -149, y: 0, z: -240.85 }, approach: { x: -149, y: 0, z: -239.35 } },
  { id: 'DOOR_CIT_027', citizenId: 'CIT_027', coords: { x: -141, y: 0, z: -240.85 }, approach: { x: -141, y: 0, z: -239.35 } },
  { id: 'DOOR_CIT_028', citizenId: 'CIT_028', coords: { x: -264, y: 0, z: -125.85 }, approach: { x: -264, y: 0, z: -124.35 } },
  { id: 'DOOR_CIT_029', citizenId: 'CIT_029', coords: { x: -256, y: 0, z: -125.85 }, approach: { x: -256, y: 0, z: -124.35 } },
  { id: 'DOOR_CIT_030', citizenId: 'CIT_030', coords: { x: -284, y: 0, z: -254.85 }, approach: { x: -284, y: 0, z: -253.35 } }
] as const);

export interface CitizenMemory {
  readonly id: string;
  readonly citizenId: string;
  readonly name: string;
  readonly formerOccupation: string;
  readonly districtOfOrigin: DistrictId;
  readonly dormantMemoryTriggerCoords: Vec3;
  readonly durationMs: 2000;
  readonly unlockWhispers: 3;
  readonly transcript: string;
  readonly audioUrl: string;
}
// Explicit citizen records; ordering is versioned and never used as citizen identity.
export const RESONANCE_MEMORY_FRAGMENTS: readonly CitizenMemory[] = immutable([
  ['MEM_001', 'CIT_001', 'Ada Quill', 'Seawall welder', DistrictId.NEON_DOCKS, 'Hold my hand. Tide is rising.'],
  ['MEM_002', 'CIT_002', 'Jules Chen', 'Barge cook', DistrictId.NEON_DOCKS, 'Two bowls. One for your sister.'],
  ['MEM_003', 'CIT_003', 'Nia Bell', 'Nursery teacher', DistrictId.NEON_DOCKS, 'Sleep now. The lights are ours.'],
  ['MEM_004', 'CIT_004', 'Omar Vale', 'Crane operator', DistrictId.NEON_DOCKS, 'Your kite cleared the last crane.'],
  ['MEM_005', 'CIT_005', 'Tess Mora', 'Ferry mechanic', DistrictId.NEON_DOCKS, 'Listen. That engine knows our names.'],
  ['MEM_006', 'CIT_006', 'Ivo Park', 'Net mender', DistrictId.NEON_DOCKS, 'Grandad tied this knot for me.'],
  ['MEM_007', 'CIT_007', 'Rae Santos', 'Pump inspector', DistrictId.NEON_DOCKS, 'Three knocks means I am home.'],
  ['MEM_008', 'CIT_008', 'Ben Okafor', 'Lighthouse keeper', DistrictId.NEON_DOCKS, 'Keep the lamp above the water.'],
  ['MEM_009', 'CIT_009', 'Mira Hale', 'Scrubber technician', DistrictId.FOUNDRY_SLUMS, 'Rain smelled different before the furnaces.'],
  ['MEM_010', 'CIT_010', 'Luis Ren', 'Glassworker', DistrictId.FOUNDRY_SLUMS, 'I made this blue bird yours.'],
  ['MEM_011', 'CIT_011', 'Etta Shaw', 'Clinic porter', DistrictId.FOUNDRY_SLUMS, 'Mercy promised you would remember me.'],
  ['MEM_012', 'CIT_012', 'Sol Dae', 'Foundry electrician', DistrictId.FOUNDRY_SLUMS, 'Do not touch the red wire.'],
  ['MEM_013', 'CIT_013', 'Pia Reed', 'Laundry worker', DistrictId.FOUNDRY_SLUMS, 'Your coat still smells of oranges.'],
  ['MEM_014', 'CIT_014', 'Ash Kori', 'Night baker', DistrictId.FOUNDRY_SLUMS, 'First loaf is always for you.'],
  ['MEM_015', 'CIT_015', 'Dev Noor', 'Apprentice coroner', DistrictId.FOUNDRY_SLUMS, 'That tag belongs to someone living.'],
  ['MEM_016', 'CIT_016', 'Alma Price', 'Rail cleaner', DistrictId.FOUNDRY_SLUMS, 'Wait here until the morning bell.'],
  ['MEM_017', 'CIT_017', 'Lea Moss', 'Transit dispatcher', DistrictId.HELIOS_SPIRE, 'Platform seven. I will find you.'],
  ['MEM_018', 'CIT_018', 'Bo Lin', 'Settlement clerk', DistrictId.HELIOS_SPIRE, 'A second lasted all winter here.'],
  ['MEM_019', 'CIT_019', 'Uma Kent', 'Window washer', DistrictId.HELIOS_SPIRE, 'Look down. Our old street remains.'],
  ['MEM_020', 'CIT_020', 'Max Ito', 'Bicycle courier', DistrictId.HELIOS_SPIRE, 'Race you around the seventh turn.'],
  ['MEM_021', 'CIT_021', 'Faye Cruz', 'Market florist', DistrictId.HELIOS_SPIRE, 'These flowers grew without a lease.'],
  ['MEM_022', 'CIT_022', 'Hal Song', 'Clock repairer', DistrictId.HELIOS_SPIRE, 'Your birthday is still marked here.'],
  ['MEM_023', 'CIT_023', 'Zoe Ames', 'Lift attendant', DistrictId.HELIOS_SPIRE, 'One floor more. Then open sky.'],
  ['MEM_024', 'CIT_024', 'Ren Blake', 'Archive binder', DistrictId.AEGIS_CITADEL, 'They cannot erase the paper copy.'],
  ['MEM_025', 'CIT_025', 'Gus Wynn', 'Oxygen gardener', DistrictId.AEGIS_CITADEL, 'This leaf is breathing with you.'],
  ['MEM_026', 'CIT_026', 'May Sato', 'School librarian', DistrictId.AEGIS_CITADEL, 'Your name is inside this book.'],
  ['MEM_027', 'CIT_027', 'Kit Rowan', 'Roof carpenter', DistrictId.AEGIS_CITADEL, 'We carried our house above water.'],
  ['MEM_028', 'CIT_028', 'Ana Frost', 'Consent registrar', DistrictId.AEGIS_CITADEL, 'I signed for sleep. Only sleep.'],
  ['MEM_029', 'CIT_029', 'Eli Tran', 'Ward nurse', DistrictId.AEGIS_CITADEL, 'Stay awake until I come back.'],
  ['MEM_030', 'CIT_030', 'Joy Mercer', 'Public bell ringer', DistrictId.AEGIS_CITADEL, 'Hear that? Morning belongs to everyone.'],
].map(row => {
  const [id, citizenId, name, formerOccupation, districtOfOrigin, transcript] = row as [string, string, string, string, DistrictId, string];
  const doorway = CITIZEN_DOORWAY_REGISTRY.find(d => d.citizenId === citizenId)!;
  return { id, citizenId, name, formerOccupation, districtOfOrigin, dormantMemoryTriggerCoords: { ...doorway.approach }, durationMs: 2000 as const, unlockWhispers: 3 as const, transcript, audioUrl: `/assets/audio/lore/${id}.wav` };
}));

export interface PetProvenance {
  readonly originCitizenId: string;
  readonly formerOccupation: string;
  readonly districtOfOrigin: DistrictId;
  readonly dormantMemoryTriggerCoords: Vec3;
}
export const PET_PROVENANCE_REGISTRY = immutable({
  id: 'PET_PROVENANCE_V1', hollowingFraction: 0.95,
  species: ['Neon Fox', 'Grid Hound', 'Aero-Raven', 'Titan Beetle'],
  generate(seed: string | number): PetProvenance {
    // FNV-1a over UTF-16 code units; no random state or platform-dependent hashing.
    let hash = 2166136261;
    for (const c of String(seed)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
    const citizen = RESONANCE_MEMORY_FRAGMENTS[hash % RESONANCE_MEMORY_FRAGMENTS.length]!;
    return provenanceForCitizen(citizen.citizenId)!;
  },
});
export function provenanceForCitizen(id: string): PetProvenance | undefined {
  const c = RESONANCE_MEMORY_FRAGMENTS.find(c => c.citizenId === id);
  return c ? immutable({ originCitizenId: c.citizenId, formerOccupation: c.formerOccupation, districtOfOrigin: c.districtOfOrigin, dormantMemoryTriggerCoords: { ...c.dormantMemoryTriggerCoords } }) : undefined;
}
export const RESONANCE_SPIRE_RULES = immutable({ id: 'RESONANCE_SPIRE_V1', radiusM: 3, boostMps: 6.5, hitStopMs: 40, shardCount: 12, bpm: 72, unlockWhispers: 3, discoveryRadiusM: 12, chordHz: [220, 277.1826, 329.6276], filteredCaption: 'AEGIS FILTER ACTIVE — citizen memory encrypted', provenanceTitle: 'Citizen provenance', echoTitle: 'Gestalt echo' });
