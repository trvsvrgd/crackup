import { DistrictId, FactionId } from '../constants.js';
import type { Vec3 } from '../protocol/binaryProtocol.js';
import { EnemyArchetype } from '../combat/combatPresentation.js';
import { immutable } from './worldLore.js';

export type CombatFaction = 'SYNDICATE' | 'AEGIS' | 'RESISTANCE';
export type EnemyRole = 'GRUNT' | 'SHIELDED' | 'AGILE_RUSH' | 'HEAVY' | 'ELITE_EXOSUIT';
export interface EnemyArchetypeSpec {
  id: string; faction: CombatFaction; factionId: FactionId; role: EnemyRole; name: string;
  weaponIds: readonly string[]; vehicleId: string; hp: number; armor: number; speed: number; range: number;
  rig: EnemyArchetype; heightM: number; position: Vec3;
  armorPreset: { id: string; primary: number; accent: number; shoulderWidth: number; chestDepth: number; dorsalRails: number; shield: boolean };
}
const factions = [
  { id: 'SYNDICATE' as const, factionId: FactionId.NEON_SYNDICATE, names: ['Toll Collector', 'Debt Bulwark', 'Memory Razor', 'Slag Suppressor', 'Harvest Colossus'], primary: 0x682b58, accent: 0xffa12d, vehicle: 'VH_G04', x: -490, z: 180, guns: ['GN_02','GN_04','ML_03','GN_06','EX_07'] },
  { id: 'AEGIS' as const, factionId: FactionId.AEGIS_DIRECTORATE, names: ['Lease Enforcer', 'Compliance Shield', 'Purge Runner', 'Grid Artillerist', 'Crown Exosuit'], primary: 0xced9e2, accent: 0x26d9ff, vehicle: 'VH_G06', x: -490, z: -180, guns: ['GN_03','GN_05','ML_06','GN_07','GN_09'] },
  { id: 'RESISTANCE' as const, factionId: FactionId.FOUNDRY_IRONCLAD, names: ['Barge Militia', 'Nursery Defender', 'Roof Courier', 'Flywheel Gunner', 'Salvage Exosuit'], primary: 0x385b47, accent: 0xe7e178, vehicle: 'VH_G02', x: 490, z: 180, guns: ['GN_01','ML_05','ML_02','GN_08','ML_07'] },
];
const roles: readonly EnemyRole[] = ['GRUNT','SHIELDED','AGILE_RUSH','HEAVY','ELITE_EXOSUIT'];
export const ENEMY_ARCHETYPE_REGISTRY: readonly EnemyArchetypeSpec[] = immutable(factions.flatMap((f, fi) => roles.map((role, i) => ({
  id: `ENEMY_${f.id}_${role}`, faction: f.id, factionId: f.factionId, role, name: f.names[i],
  weaponIds: [f.guns[i], ...(role === 'SHIELDED' ? ['ML_05'] : [])], vehicleId: f.vehicle,
  hp: [160,240,140,320,650][i], armor: [25,160,15,100,220][i], speed: [5.4,4,10,3.8,5.8][i], range: [28,20,3,45,40][i],
  rig: role === 'ELITE_EXOSUIT' ? EnemyArchetype.SECTOR_WARDEN : role === 'AGILE_RUSH' ? EnemyArchetype.CYBER_RONIN : role === 'SHIELDED' || role === 'HEAVY' ? EnemyArchetype.AEGIS_SHOCK_TROOPER : EnemyArchetype.STREET_ENFORCER,
  heightM: role === 'ELITE_EXOSUIT' ? 3.2 : 1.88, position: { x: f.x + (i - 2) * 5, y: 0, z: f.z },
  armorPreset: { id: `ARMOR_${f.id}_${role}`, primary: f.primary, accent: f.accent, shoulderWidth: .20 + i * .04 + fi * .025, chestDepth: .24 + fi * .025 + i * .015, dorsalRails: fi + 1, shield: role === 'SHIELDED' },
}))));
export const ENEMY_ARCHETYPE_BY_ID = new Map(ENEMY_ARCHETYPE_REGISTRY.map(s => [s.id,s]));
export interface BossEncounterSpec {
  id: string; name: string; district: DistrictId; arena: string; position: Vec3; archetypeId: string;
  hp: number; weaponIds: readonly string[]; isRoamingHunter: boolean; vehicleId?: string; escortVehicleIds?: readonly string[];
  mechanic: 'HARPOON' | 'STASIS_WAVES' | 'HUNTER' | 'DASH_GLASS' | 'DREADNOUGHT'; reveal: string;
}
export const BOSS_ENCOUNTER_REGISTRY: readonly BossEncounterSpec[] = immutable([
  { id: 'BOSS_D1_KAEL', name: 'Captain Mateo Kael', district: DistrictId.NEON_DOCKS, arena: 'Flooded Megacrane Drydock', position: { x: -470, y: 4, z: 350 }, archetypeId: 'ENEMY_RESISTANCE_ELITE_EXOSUIT', hp: 1600, weaponIds: ['EX_07','GN_06'], isRoamingHunter: false, mechanic: 'HARPOON', reveal: 'Faraday nursery barge: the stolen power kept these children outside the Somna-Mesh.' },
  { id: 'BOSS_D2_SOLANGE', name: 'Mother Solange', district: DistrictId.FOUNDRY_SLUMS, arena: 'Cathedral of Molten Glass', position: { x: 470, y: 8, z: 350 }, archetypeId: 'ENEMY_SYNDICATE_HEAVY', hp: 1800, weaponIds: ['GN_08'], isRoamingHunter: false, mechanic: 'STASIS_WAVES', reveal: 'The stasis pods contain living donors. Mercy sold their memories.' },
  { id: 'BOSS_D3_LT_CASSIA', name: 'Valkyrie-9 / Cassia', district: DistrictId.HELIOS_SPIRE, arena: 'Open-world Hunter-Killer', position: { x: 490, y: 80, z: -180 }, archetypeId: 'ENEMY_SYNDICATE_AGILE_RUSH', hp: 1400, weaponIds: ['GN_07','ML_10'], vehicleId: 'VH_A06', escortVehicleIds: ['VH_G02','VH_G02'], isRoamingHunter: true, mechanic: 'HUNTER', reveal: 'Flight record recovered: Cassia was a human rescue pilot.' },
  { id: 'BOSS_D3_GRAVES', name: 'Sterling Graves', district: DistrictId.HELIOS_SPIRE, arena: '260m Sky-Vault Penthouse', position: { x: 470, y: 260, z: -350 }, archetypeId: 'ENEMY_SYNDICATE_AGILE_RUSH', hp: 1900, weaponIds: ['GN_05','ML_10'], isRoamingHunter: false, mechanic: 'DASH_GLASS', reveal: 'Four thousand rented minds emerge from accelerated winters.' },
  { id: 'BOSS_D4_THORNE', name: 'Provost Marshal Thorne', district: DistrictId.AEGIS_CITADEL, arena: '320m Crown command deck', position: { x: -470, y: 320, z: -350 }, archetypeId: 'ENEMY_AEGIS_ELITE_EXOSUIT', hp: 2400, weaponIds: ['GN_09','EX_08'], isRoamingHunter: false, mechanic: 'DREADNOUGHT', reveal: 'Silent lock command chain exposed. Consent belongs to the city.' },
]);
export const FACTION_PATROL_REGISTRY = immutable(factions.map((f, i) => ({ id: `PATROL_${f.id}`, faction: f.id, vehicleId: f.vehicle, archetypeId: `ENEMY_${f.id}_GRUNT`, position: { x: f.x, y: 1, z: f.z + 40 }, route: [{ x: f.x, y: 1, z: f.z + 40 }, { x: f.x + 60, y: 1, z: f.z + 40 }, { x: f.x + 60, y: 1, z: f.z + 65 }, { x: f.x, y: 1, z: f.z + 65 }] })));
export const HUNTER_RULES = immutable({ heatTrigger: 100, damageHeat: .12, heatDecaySec: 1, spawnDistanceM: 65, speedMps: 38, altitudeM: 28, fireRangeM: 90 });
