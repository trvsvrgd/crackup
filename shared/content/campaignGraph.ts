import { MISSION_EXECUTION_REGISTRY, type MissionArchetype } from './missionArchetypeRegistry.js';
import { DistrictId, type AgentAttributes } from '../constants.js';
import { immutable } from './worldLore.js';

export type MunicipalGridStability = Record<DistrictId, number>;
export const DEFAULT_GRID_STABILITY: Readonly<MunicipalGridStability> = immutable({ NEON_DOCKS: 85, FOUNDRY_SLUMS: 85, HELIOS_SPIRE: 85, AEGIS_CITADEL: 85 });
export interface MicroActionTelemetry { citizensSpared: number; infrastructurePreserved: number; memoriesRecovered: number; coerciveActions: number; purgeActions: number }
export const DEFAULT_MICRO_TELEMETRY: Readonly<MicroActionTelemetry> = immutable({ citizensSpared: 0, infrastructurePreserved: 0, memoriesRecovered: 0, coerciveActions: 0, purgeActions: 0 });
export const ENDING_REGISTRY = immutable({
  VANCE_COMPROMISE: { id: 'VANCE_COMPROMISE', name: 'The Vance Compromise', outcome: 'The grid survives; compulsory leases remain.' },
  VOSS_PURGE: { id: 'VOSS_PURGE', name: 'The Voss Purge', outcome: 'Protocol Eclipse kills every citizen at 50% or greater Hollowing.' },
  ASCENDANT_GESTALT: { id: 'ASCENDANT_GESTALT', name: 'The Ascendant Gestalt', outcome: 'Seven minds cooperate to replace forced compute and restore consent.' },
  APEX_USURPER: { id: 'APEX_USURPER', name: 'The Apex Usurper', outcome: 'The Agent seizes the network and enslaves the city.' },
} as const);
export type CampaignEnding = keyof typeof ENDING_REGISTRY;
export const ENDING_RULES = immutable({ id: 'ENDING_RULES_V1', tyrantResonance: -50, heroResonance: 50, heroGridMinimum: 70, purgeGridBelow: 35, dominationMargin: 8, purgeMargin: 3 });
export function normalizeGrid(value?: Partial<MunicipalGridStability>): MunicipalGridStability {
  return Object.fromEntries(Object.entries(DEFAULT_GRID_STABILITY).map(([k, fallback]) => [k, Number.isFinite(value?.[k as DistrictId]) ? Math.max(0, Math.min(100, value![k as DistrictId]!)) : fallback])) as MunicipalGridStability;
}
export function normalizeResonance(value?: number): number { return Number.isFinite(value) ? Math.max(-100, Math.min(100, value!)) : 0; }
export function resolveCampaignEnding(telemetry: Partial<MicroActionTelemetry>, gridStability: MunicipalGridStability, gestaltResonance: number): CampaignEnding {
  const count = (k: keyof MicroActionTelemetry) => Number.isFinite(telemetry[k]) ? Math.max(0, telemetry[k]!) : 0;
  const mercy = count('citizensSpared') + count('infrastructurePreserved') + count('memoriesRecovered');
  const coercion = count('coerciveActions');
  const purge = count('purgeActions');
  const minGrid = Math.min(...Object.values(normalizeGrid(gridStability)));
  const resonance = normalizeResonance(gestaltResonance);
  if (resonance <= ENDING_RULES.tyrantResonance || coercion - mercy >= ENDING_RULES.dominationMargin) return 'APEX_USURPER';
  if (resonance >= ENDING_RULES.heroResonance && minGrid >= ENDING_RULES.heroGridMinimum && mercy > coercion + purge) return 'ASCENDANT_GESTALT';
  if (minGrid < ENDING_RULES.purgeGridBelow || purge - count('infrastructurePreserved') >= ENDING_RULES.purgeMargin) return 'VOSS_PURGE';
  return 'VANCE_COMPROMISE';
}
export const MICRO_ACTION_REGISTRY = immutable({
  RECOVER_MEMORY: { id: 'RECOVER_MEMORY', counter: 'memoriesRecovered', grid: 0, resonance: 2 },
  DISCOVER_PROVENANCE: { id: 'DISCOVER_PROVENANCE', counter: 'memoriesRecovered', grid: 0, resonance: 5 },
  SPARE_CITIZEN: { id: 'SPARE_CITIZEN', counter: 'citizensSpared', grid: 0, resonance: 3 },
  PRESERVE_INFRASTRUCTURE: { id: 'PRESERVE_INFRASTRUCTURE', counter: 'infrastructurePreserved', grid: 5, resonance: 3 },
  COERCE_CITIZEN: { id: 'COERCE_CITIZEN', counter: 'coerciveActions', grid: -2, resonance: -5 },
  PURGE_RELAY: { id: 'PURGE_RELAY', counter: 'purgeActions', grid: -20, resonance: -8 },
} as const);
export type MicroActionKind = keyof typeof MICRO_ACTION_REGISTRY;
export interface LoreProgress {
  municipalGridStability: MunicipalGridStability;
  gestaltResonance: number;
  microActionTelemetry: MicroActionTelemetry;
}
export function applyMicroAction(state: LoreProgress, kind: MicroActionKind, district: DistrictId): void {
  const action = MICRO_ACTION_REGISTRY[kind];
  state.municipalGridStability = normalizeGrid(state.municipalGridStability);
  state.municipalGridStability[district] = Math.max(0, Math.min(100, state.municipalGridStability[district] + action.grid));
  state.gestaltResonance = normalizeResonance(state.gestaltResonance + action.resonance);
  state.microActionTelemetry[action.counter] = (state.microActionTelemetry[action.counter] || 0) + 1;
}

export const EQUIPMENT_REGISTRY = immutable([
  { id: 'EQUIP_INSULATED_TAP', name: 'Insulated relay tap', maxLevel: 3 },
  { id: 'EQUIP_RESPIRATOR', name: 'Industrial respirator', maxLevel: 3 },
  { id: 'EQUIP_SIGNAL_DECODER', name: 'Consent signal decoder', maxLevel: 3 },
  { id: 'EQUIP_CHIMERA_KEY', name: 'Chimera controller key', maxLevel: 3 },
] as const);
export type EquipmentId = typeof EQUIPMENT_REGISTRY[number]['id'];
export const PREPARATION_REGISTRY = immutable([
  { id: 'PREP_SEAWALL', characterId: 'CHAR_ENGINEER', district: DistrictId.NEON_DOCKS, objective: 'Charge the seawall flywheels and wire a nursery barge bypass.', reward: 'PRESERVE_INFRASTRUCTURE', equipmentId: 'EQUIP_INSULATED_TAP' },
  { id: 'PREP_CORONER', characterId: 'CHAR_CORONER', district: DistrictId.FOUNDRY_SLUMS, objective: 'Match three clinic tags to living donors and secure scrubber reserves.', reward: 'PRESERVE_INFRASTRUCTURE', equipmentId: 'EQUIP_RESPIRATOR' },
  { id: 'PREP_TRANSIT', characterId: 'CHAR_DISPATCHER', district: DistrictId.HELIOS_SPIRE, objective: 'Reroute emergency trams onto an independent dispatch clock.', reward: 'PRESERVE_INFRASTRUCTURE', equipmentId: 'EQUIP_SIGNAL_DECODER' },
  { id: 'PREP_ARCHIVE', characterId: 'CHAR_CIVIC_ARCHIVIST', district: DistrictId.AEGIS_CITADEL, objective: 'Recover original consent contracts and life-support controller keys.', reward: 'PRESERVE_INFRASTRUCTURE', equipmentId: 'EQUIP_CHIMERA_KEY' },
] as const);
export interface ThresholdGate {
  readonly kind: 'ATTRIBUTE' | 'EQUIPMENT';
  readonly key: keyof AgentAttributes | EquipmentId;
  readonly minimum: number;
  readonly enforcement: 'HARD' | 'SOFT';
}
export interface CampaignMission {
  readonly id: string; readonly district: DistrictId; readonly title: string; readonly objective: string; readonly archetype: MissionArchetype;
  readonly prerequisites: readonly string[]; readonly gates: readonly ThresholdGate[]; readonly prepObjectiveIds: readonly string[];
}
type MissionAuthoring = readonly [string, string, string, keyof AgentAttributes, number, keyof AgentAttributes, number, number];
const authored: readonly MissionAuthoring[] = [
  ['MISSION_D1_01', 'Wake Debt', 'Trace a waking lease to the dock relay without interrupting the pumps.', 'agility', 1, 'shooting', 2, 0],
  ['MISSION_D1_02', 'Seawall Hours', 'Escort the engineer to the flywheel controls through the flood line.', 'strength', 1, 'driving', 2, 0],
  ['MISSION_D1_03', 'Manifest of Ghosts', 'Take Vane\'s maintenance ledger and identify concealed nursery routes.', 'shooting', 1, 'vigilante', 2, 1],
  ['MISSION_D1_04', 'Faraday Lullaby', 'Reach a shielded barge and preserve its independent power feed.', 'driving', 1, 'agility', 2, 1],
  ['MISSION_D1_05', 'The Terrorist\'s Children', 'Confront Kael with the nursery evidence before judging his raids.', 'vigilante', 2, 'strength', 2, 1],
  ['MISSION_D1_06', 'Hold the Water', 'Isolate the district relay while the prepared bypass carries pump load.', 'agility', 2, 'explosives', 2, 1],
  ['MISSION_D2_01', 'Mercy Queue', 'Enter Solange\'s clinic and trace the missing patients.', 'vigilante', 2, 'shooting', 3, 0],
  ['MISSION_D2_02', 'Names on the Tags', 'Help the coroner preserve tissue records before the furnace shift.', 'driving', 2, 'strength', 3, 0],
  ['MISSION_D2_03', 'Ignis Shift', 'Stop Ignis from burning the donor manifests.', 'strength', 2, 'explosives', 3, 1],
  ['MISSION_D2_04', 'Unfiltered', 'Carry Sera\'s decoder through the stacks and recover uncensored memories.', 'agility', 2, 'flying', 3, 1],
  ['MISSION_D2_05', 'Sister\'s Ledger', 'Expose the charity chop-shop and confront Mother Solange.', 'shooting', 3, 'vigilante', 3, 1],
  ['MISSION_D2_06', 'A Breath Unleased', 'Transfer scrubber controls before disconnecting the extraction pool.', 'explosives', 2, 'flying', 3, 2],
  ['MISSION_D3_01', 'Borrowed Seconds', 'Follow a slowed citizen signal into the settlement exchange.', 'flying', 2, 'agility', 3, 0],
  ['MISSION_D3_02', 'Independent Clock', 'Protect the dispatcher while emergency transit leaves the trading clock.', 'driving', 3, 'vigilante', 3, 0],
  ['MISSION_D3_03', 'Cassia Below Nine', 'Disable Valkyrie-9\'s command uplink and recover Cassia\'s flight record.', 'shooting', 3, 'flying', 4, 1],
  ['MISSION_D3_04', 'Four Thousand Winters', 'Locate the rented brains and measure their accelerated perception.', 'agility', 3, 'strength', 4, 1],
  ['MISSION_D3_05', 'Closing Bell', 'Confront Graves before he liquidates the biological compute pool.', 'vigilante', 3, 'shooting', 4, 2],
  ['MISSION_D3_06', 'Time Returned', 'Release the trading leases without starving the civic distribution clock.', 'flying', 3, 'explosives', 4, 2],
  ['MISSION_D4_01', 'Original Consent', 'Reach the Civic Archivist and recover the voluntary sleep contracts.', 'agility', 3, 'driving', 4, 0],
  ['MISSION_D4_02', 'Rook\'s Vault', 'Open the compliance vault and preserve independent controller keys.', 'strength', 3, 'shooting', 4, 0],
  ['MISSION_D4_03', 'The Order Argument', 'Force Vance to disclose why the waking lease firmware cannot be revoked.', 'vigilante', 4, 'agility', 5, 1],
  ['MISSION_D4_04', 'Half a Person', 'Audit Voss\' virus against the 50-percent Hollowing mortality threshold.', 'flying', 4, 'explosives', 5, 2],
  ['MISSION_D4_05', 'Marshal of Silence', 'Defeat Thorne and expose the silent lock command chain.', 'shooting', 4, 'strength', 5, 2],
  ['MISSION_D4_06', 'Protocol Eclipse', 'Resolve the lease network using accumulated civic actions and Gestalt resonance.', 'vigilante', 4, 'flying', 5, 3],
];
export const CAMPAIGN_GRAPH: readonly CampaignMission[] = immutable(authored.map((m, i) => {
  const prep = PREPARATION_REGISTRY[Math.floor(i / 6)]!;
  return { id: m[0], archetype: MISSION_EXECUTION_REGISTRY[i]!.archetype, district: prep.district, title: m[1], objective: m[2], prerequisites: i ? [authored[i - 1]![0]] : [], prepObjectiveIds: [prep.id], gates: [
    { kind: 'ATTRIBUTE' as const, key: m[3], minimum: m[4], enforcement: 'HARD' as const },
    { kind: 'ATTRIBUTE' as const, key: m[5], minimum: m[6], enforcement: 'SOFT' as const },
    { kind: 'EQUIPMENT' as const, key: prep.equipmentId, minimum: m[7], enforcement: 'HARD' as const },
    { kind: 'EQUIPMENT' as const, key: prep.equipmentId, minimum: Math.min(3, m[7] + 1), enforcement: 'SOFT' as const },
  ] };
}));
export function evaluateMissionGates(mission: CampaignMission, attributes: AgentAttributes, equipment: Partial<Record<EquipmentId, number>>, completed: ReadonlySet<string>) {
  const unmet = mission.gates.filter(g => {
    const value = g.kind === 'ATTRIBUTE' ? attributes[g.key as keyof AgentAttributes] : equipment[g.key as EquipmentId] ?? 0;
    return !Number.isFinite(value) || value < g.minimum;
  });
  return { allowed: mission.prerequisites.every(id => completed.has(id)) && !unmet.some(g => g.enforcement === 'HARD'), unmetHard: unmet.filter(g => g.enforcement === 'HARD'), warnings: unmet.filter(g => g.enforcement === 'SOFT') };
}
