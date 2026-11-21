import type { AgentAttributes } from '../constants.js';
import type { NeuralDriftRatios } from '../world/phase5Systems.js';
import { immutable } from './worldLore.js';

export interface GestaltEcho {
  readonly id: string;
  readonly attribute: keyof AgentAttributes;
  readonly name: string;
  readonly personality: string;
  readonly ratio: keyof NeuralDriftRatios;
  readonly minimum: number;
  readonly maximum: number;
  readonly line: string;
}
export const GESTALT_ECHO_REGISTRY: readonly GestaltEcho[] = immutable([
  { id: 'ECHO_AGILITY', attribute: 'agility', name: 'Kestrel', personality: 'An impatient rooftop courier who counts escape routes.', ratio: 'airborne_time_ratio', minimum: 0.25, maximum: 0.6, line: 'One more ledge. They cannot lease the sky.' },
  { id: 'ECHO_STRENGTH', attribute: 'strength', name: 'Anchor', personality: 'A dock rescuer who measures strength by what it can shelter.', ratio: 'limb_cripple_to_kill_ratio', minimum: 0.8, maximum: 2, line: 'Break the weapon arm. Leave the person breathing.' },
  { id: 'ECHO_DRIVING', attribute: 'driving', name: 'Switch', personality: 'A municipal driver who remembers every evacuation route.', ratio: 'collateral_blast_damage_ratio', minimum: 0, maximum: 0.15, line: 'Clear lanes save lives. Keep the crossing open.' },
  { id: 'ECHO_SHOOTING', attribute: 'shooting', name: 'Glass', personality: 'A marksman who distrusts the certainty of orders.', ratio: 'limb_cripple_to_kill_ratio', minimum: 0.3, maximum: 0.8, line: 'A clean sightline is not permission to kill.' },
  { id: 'ECHO_EXPLOSIVES', attribute: 'explosives', name: 'Fuse', personality: 'A demolition engineer haunted by a failed evacuation.', ratio: 'collateral_blast_damage_ratio', minimum: 0.35, maximum: 1, line: 'That blast shook occupied rooms. Count the cost.' },
  { id: 'ECHO_FLYING', attribute: 'flying', name: 'Lark', personality: 'A rescue pilot who finds calm above the smog.', ratio: 'airborne_time_ratio', minimum: 0.6, maximum: 1, line: 'Above the haze, I can still see their windows.' },
  { id: 'ECHO_VIGILANTE', attribute: 'vigilante', name: 'Witness', personality: 'A public defender who refuses to reduce people to telemetry.', ratio: 'squad_revive_and_nonlethal_ratio', minimum: 0.5, maximum: 1, line: 'Seven voices. One promise: bring them home alive.' },
]);
export function resolveGestaltEcho(ratios: NeuralDriftRatios): GestaltEcho | undefined {
  return [...GESTALT_ECHO_REGISTRY].reverse().find(e => Number.isFinite(ratios[e.ratio]) && ratios[e.ratio] >= e.minimum && ratios[e.ratio] <= e.maximum);
}
export interface RevealCondition { readonly kind: 'MISSION' | 'WHISPERS' | 'PREPARATION'; readonly id: string; readonly minimum: number }
export interface CharacterRecord {
  readonly legacyCallsign?: string;
  readonly id: string;
  readonly name: string;
  readonly role: 'DIRECTOR' | 'SCIENTIST' | 'ARCHIVIST' | 'KINGPIN' | 'LIEUTENANT' | 'PUBLIC_SERVANT';
  readonly factionId: 'AEGIS' | 'SYNDICATE' | 'RESISTANCE' | 'CIVIC';
  readonly district: 1 | 2 | 3 | 4;
  readonly publicBio: string;
  readonly trueBio: string;
  readonly twistTriggerCondition: RevealCondition;
}
export const CHARACTER_REGISTRY: readonly CharacterRecord[] = immutable([
  { id: 'CHAR_VANCE', name: 'Director Julian Vance', role: 'DIRECTOR', factionId: 'AEGIS', district: 4, publicBio: 'Architect of municipal continuity and patron of the Agents.', trueBio: 'Maintains forced waking leases because he values order above freedom.', twistTriggerCondition: { kind: 'MISSION', id: 'MISSION_D4_03', minimum: 1 } },
  { id: 'CHAR_VOSS', name: 'Dr. Kaelen Voss', role: 'SCIENTIST', factionId: 'RESISTANCE', district: 4, publicBio: 'Chimera scientist promising to end the lease network.', trueBio: 'Protocol Eclipse kills everyone at 50% or greater Hollowing; he accepts this as the price of a clean slate.', twistTriggerCondition: { kind: 'MISSION', id: 'MISSION_D4_04', minimum: 1 } },
  { id: 'CHAR_SERA', name: 'Sera Lin', role: 'ARCHIVIST', factionId: 'CIVIC', district: 2, publicBio: 'A signal archivist recovering corrupted municipal recordings.', trueBio: 'The recordings were censored. She strips the Aegis filters to expose intact citizen voices.', twistTriggerCondition: { kind: 'WHISPERS', id: 'WHISPER_COLLECTION', minimum: 3 } },
  { id: 'CHAR_KAEL', legacyCallsign: 'KINGPIN-KRAKEN', name: 'Captain Mateo "Barge" Kael', role: 'KINGPIN', factionId: 'RESISTANCE', district: 1, publicBio: 'A terrorist stealing power and hiding fugitives in the harbor.', trueBio: 'Powers Faraday nursery barges so children can grow outside the Somna-Mesh.', twistTriggerCondition: { kind: 'MISSION', id: 'MISSION_D1_05', minimum: 1 } },
  { id: 'CHAR_VANE', legacyCallsign: 'SYNDICATE-LT-VEX', name: 'Harbor Master Vane', role: 'LIEUTENANT', factionId: 'RESISTANCE', district: 1, publicBio: 'Kael\'s smuggling quartermaster and keeper of harbor tolls.', trueBio: 'Conceals nursery manifests in pump maintenance schedules.', twistTriggerCondition: { kind: 'PREPARATION', id: 'PREP_SEAWALL', minimum: 1 } },
  { id: 'CHAR_SOLANGE', legacyCallsign: 'KINGPIN-SLAG', name: 'Mother Solange / Sister Mercy', role: 'KINGPIN', factionId: 'SYNDICATE', district: 2, publicBio: 'A charity healer offering free treatment to leased workers.', trueBio: 'Runs a memory-harvesting chop-shop and sells the episodic lives of her patients.', twistTriggerCondition: { kind: 'MISSION', id: 'MISSION_D2_05', minimum: 1 } },
  { id: 'CHAR_IGNIS', legacyCallsign: 'IRONCLAD-LT-VULCAN', name: 'Foreman Ignis', role: 'LIEUTENANT', factionId: 'SYNDICATE', district: 2, publicBio: 'An industrial foreman protecting the clinic\'s energy supply.', trueBio: 'Uses furnace throughput to conceal biological extraction and disposal.', twistTriggerCondition: { kind: 'PREPARATION', id: 'PREP_CORONER', minimum: 1 } },
  { id: 'CHAR_GRAVES', legacyCallsign: 'KINGPIN-HELIO', name: 'Sterling Graves', role: 'KINGPIN', factionId: 'SYNDICATE', district: 3, publicBio: 'A visionary broker financing Neo-Veridia\'s recovery.', trueBio: 'Runs 4,000 rented slum brains at tenfold perception speed to monopolize high-frequency trading.', twistTriggerCondition: { kind: 'MISSION', id: 'MISSION_D3_05', minimum: 1 } },
  { id: 'CHAR_CASSIA', legacyCallsign: 'HELIOS-LT-SOLARIS', name: 'Valkyrie-9 (Cassia)', role: 'LIEUTENANT', factionId: 'SYNDICATE', district: 3, publicBio: 'An autonomous security asset guarding settlement traffic.', trueBio: 'Cassia was a human pilot; her designation hides a surviving personal identity.', twistTriggerCondition: { kind: 'PREPARATION', id: 'PREP_TRANSIT', minimum: 1 } },
  { id: 'CHAR_THORNE', legacyCallsign: 'COMMANDER-KRONOS', name: 'Provost Marshal Thorne', role: 'KINGPIN', factionId: 'AEGIS', district: 4, publicBio: 'The final guardian of civic order.', trueBio: 'Commands the silent firmware lock and treats withdrawal of consent as sabotage.', twistTriggerCondition: { kind: 'MISSION', id: 'MISSION_D4_05', minimum: 1 } },
  { id: 'CHAR_ROOK', legacyCallsign: 'AEGIS-LT-PRAETOR', name: 'Warden Iona Rook', role: 'LIEUTENANT', factionId: 'AEGIS', district: 4, publicBio: 'Custodian of the Citadel\'s compliance vault.', trueBio: 'Keeps original voluntary contracts that prove waking leases were never authorized.', twistTriggerCondition: { kind: 'PREPARATION', id: 'PREP_ARCHIVE', minimum: 1 } },
  { id: 'CHAR_ENGINEER', name: 'Seawall Engineer', role: 'PUBLIC_SERVANT', factionId: 'CIVIC', district: 1, publicBio: 'Maintains pumps at the harbor flood line.', trueBio: 'Has a flywheel bypass that can protect the nursery barges during relay isolation.', twistTriggerCondition: { kind: 'PREPARATION', id: 'PREP_SEAWALL', minimum: 1 } },
  { id: 'CHAR_CORONER', name: 'Municipal Coroner', role: 'PUBLIC_SERVANT', factionId: 'CIVIC', district: 2, publicBio: 'Certifies worker deaths and industrial accidents.', trueBio: 'Retains mismatched tissue records linking Mercy\'s charity to living memory donors.', twistTriggerCondition: { kind: 'PREPARATION', id: 'PREP_CORONER', minimum: 1 } },
  { id: 'CHAR_DISPATCHER', name: 'Grid Transit Dispatcher', role: 'PUBLIC_SERVANT', factionId: 'CIVIC', district: 3, publicBio: 'Routes trams and emergency supplies through the Spire.', trueBio: 'Can separate municipal routing clocks from Graves\' financial compute pool.', twistTriggerCondition: { kind: 'PREPARATION', id: 'PREP_TRANSIT', minimum: 1 } },
  { id: 'CHAR_CIVIC_ARCHIVIST', name: 'Civic Archivist', role: 'PUBLIC_SERVANT', factionId: 'CIVIC', district: 4, publicBio: 'Catalogues the city\'s pre-flood records.', trueBio: 'Preserves consent originals and the controller keys for independent life support.', twistTriggerCondition: { kind: 'PREPARATION', id: 'PREP_ARCHIVE', minimum: 1 } },
]);
export const PLAYABLE_GESTALTS = immutable([
  { id: 'AGENT_01', callsign: 'Breakwater' }, { id: 'AGENT_02', callsign: 'Cinder' },
  { id: 'AGENT_03', callsign: 'Parallax' }, { id: 'AGENT_04', callsign: 'Bastion' },
  { id: 'AGENT_05', callsign: 'Undertow' }, { id: 'AGENT_06', callsign: 'Halcyon' },
  { id: 'AGENT_07', callsign: 'Meridian' }, { id: 'AGENT_08', callsign: 'Afterimage' },
].map(a => ({ ...a, echoIds: GESTALT_ECHO_REGISTRY.map(e => e.id) })));

export function characterNameForCallsign(callsign: string): string {
  return CHARACTER_REGISTRY.find(c => c.legacyCallsign === callsign)?.name ?? callsign;
}
