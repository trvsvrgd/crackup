import type { Vec3 } from '../protocol/binaryProtocol.js';
import { SKILL_TREE_NODES } from '../progression/skillTreeSystem.js';

export const OPENING_MISSION_ID = 'docks_signal_01';
export const OPENING_REWARD_ID = 'RWD-SIGNAL-01';
export const OPENING_CHOICES = ['upgrade_point', ...SKILL_TREE_NODES.filter(n => n.tier === 1).map(n => n.id)];
export const OPENING_POINTS = {
  hub: { x: -20, y: 0, z: 210 }, exit: { x: -20, y: 0, z: 218 },
  seal: { x: -20, y: 0, z: 242 }, lobby: { x: -20, y: 0, z: 258 },
  service: { x: -35, y: 0, z: 274 }, ledger: { x: -20, y: 0, z: 276 },
  roof: { x: -20, y: 5.4, z: 306 }, quay: { x: -20, y: 0, z: 341 },
} as const;
export const OPENING_ENEMIES = [
  { id: 61010, callsign: 'CUSTOMS-WATCH-01', encounter: 'customs', position: { x: -24, y: 0, z: 269 }, hp: 160, armor: 20, elite: false },
  { id: 61011, callsign: 'CUSTOMS-WATCH-02', encounter: 'customs', position: { x: -16, y: 0, z: 273 }, hp: 160, armor: 20, elite: false },
  { id: 61020, callsign: 'QUAY-FOREMAN', encounter: 'quay', position: { x: -20, y: 0, z: 362 }, hp: 320, armor: 60, elite: true },
  { id: 61021, callsign: 'QUAY-ENFORCER', encounter: 'quay', position: { x: -29, y: 0, z: 357 }, hp: 160, armor: 20, elite: false },
] as const;
export type OpeningStage = 'arrival' | 'street_lead' | 'customs' | 'roof_transfer' | 'quay_fight' | 'return' | 'complete';
export type OpeningCheckpoint = 'CP-ARRIVAL' | 'CP-LEAD' | 'CP-CUSTOMS' | 'CP-LEDGER' | 'CP-ROOF' | 'CP-QUAY' | 'CP-COMPLETE';
export interface OpeningProgress {
  missionId: typeof OPENING_MISSION_ID;
  revision: 1;
  stage: OpeningStage;
  checkpoint: OpeningCheckpoint;
  approach: 'lobby' | 'service' | null;
  defeated: number[];
  delivered: boolean;
  rewardChoice: string | null;
}
export interface OpeningTarget { id: string; label: string; position: Vec3; enemyId?: number }
export interface OpeningView {
  progress: OpeningProgress | null;
  targets: OpeningTarget[];
  canStart: boolean;
  canChoose: boolean;
  rewardClaimed: boolean;
  recap: string;
}
export function newOpeningProgress(): OpeningProgress {
  return { missionId: OPENING_MISSION_ID, revision: 1, stage: 'arrival', checkpoint: 'CP-ARRIVAL',
    approach: null, defeated: [], delivered: false, rewardChoice: null };
}
export function encounterCleared(p: OpeningProgress, encounter: 'customs' | 'quay'): boolean {
  return OPENING_ENEMIES.filter(e => e.encounter === encounter).every(e => p.defeated.includes(e.id));
}
export function parseOpeningProgress(value: unknown): OpeningProgress {
  const p = value as OpeningProgress;
  const fail = () => { throw Error('Unsupported or damaged opening mission. The save was not overwritten.'); };
  if (!p || p.missionId !== OPENING_MISSION_ID || p.revision !== 1 ||
    !['arrival', 'street_lead', 'customs', 'roof_transfer', 'quay_fight', 'return', 'complete'].includes(p.stage) ||
    !['CP-ARRIVAL', 'CP-LEAD', 'CP-CUSTOMS', 'CP-LEDGER', 'CP-ROOF', 'CP-QUAY', 'CP-COMPLETE'].includes(p.checkpoint) ||
    ![null, 'lobby', 'service'].includes(p.approach) || !Array.isArray(p.defeated) ||
    new Set(p.defeated).size !== p.defeated.length || p.defeated.some(id => !OPENING_ENEMIES.some(e => e.id === id)) ||
    typeof p.delivered !== 'boolean' || (p.rewardChoice !== null && !OPENING_CHOICES.includes(p.rewardChoice))) fail();
  const allowed: Record<OpeningCheckpoint, OpeningStage[]> = {
    'CP-ARRIVAL': ['arrival', 'street_lead'], 'CP-LEAD': ['customs'], 'CP-CUSTOMS': ['customs'],
    'CP-LEDGER': ['roof_transfer'], 'CP-ROOF': ['quay_fight'], 'CP-QUAY': ['quay_fight', 'return'], 'CP-COMPLETE': ['complete'],
  };
  if (!allowed[p.checkpoint].includes(p.stage)) fail();
  const early = ['CP-ARRIVAL', 'CP-LEAD'].includes(p.checkpoint);
  if (early ? p.approach !== null || p.defeated.length > 0 : p.approach === null) fail();
  if (['CP-LEDGER', 'CP-ROOF', 'CP-QUAY', 'CP-COMPLETE'].includes(p.checkpoint) && !encounterCleared(p, 'customs')) fail();
  if (!['CP-QUAY', 'CP-COMPLETE'].includes(p.checkpoint) && p.defeated.some(id => id >= 61020)) fail();
  if (['return', 'complete'].includes(p.stage) && !encounterCleared(p, 'quay')) fail();
  if ((p.delivered && !['return', 'complete'].includes(p.stage)) || (p.stage === 'complete' && (!p.delivered || !p.rewardChoice)) || (p.stage !== 'complete' && p.rewardChoice !== null)) fail();
  return structuredClone(p);
}
export function openingAnchor(p: OpeningProgress): Vec3 {
  const point = p.checkpoint === 'CP-LEAD' ? OPENING_POINTS.seal
    : p.checkpoint === 'CP-CUSTOMS' ? OPENING_POINTS[p.approach ?? 'lobby']
    : p.checkpoint === 'CP-LEDGER' ? OPENING_POINTS.lobby
    : p.checkpoint === 'CP-ROOF' ? OPENING_POINTS.roof
    : p.checkpoint === 'CP-QUAY' && p.stage !== 'return' ? OPENING_POINTS.quay : OPENING_POINTS.hub;
  return { ...point };
}
export function openingTargets(p: OpeningProgress): OpeningTarget[] {
  const target = (id: keyof typeof OPENING_POINTS, label: string) => ({ id, label, position: { ...OPENING_POINTS[id] } });
  const foes = (encounter: 'customs' | 'quay') => OPENING_ENEMIES.filter(e => e.encounter === encounter && !p.defeated.includes(e.id))
    .map(e => ({ id: `enemy-${e.id}`, label: e.callsign, position: { ...e.position }, enemyId: e.id }));
  if (p.stage === 'arrival') return [target('exit', 'Leave Tidewatch')];
  if (p.stage === 'street_lead') return [target('seal', 'Inspect the freight seal')];
  if (p.stage === 'customs') return p.approach === null ? [target('lobby', 'Enter Customs lobby'), target('service', 'Use the service entrance')]
    : encounterCleared(p, 'customs') ? [target('ledger', 'Recover the signal ledger')] : foes('customs');
  if (p.stage === 'roof_transfer') return [target('roof', 'Transmit from Crane Walk')];
  if (p.stage === 'quay_fight') return p.checkpoint === 'CP-ROOF' ? [target('quay', 'Enter Pump Quay')] : foes('quay');
  if (p.stage === 'return') return [target('hub', p.delivered ? 'Choose your upgrade in the field menu' : 'Deliver the ledger to Sera')];
  return [];
}
export function openingRecap(p: OpeningProgress): string {
  if (p.stage === 'complete') return 'A Signal in the Salt complete. Sera has the ledger; its unexplained human identifiers need investigation. Continue district work.';
  if (p.delivered) return 'Ledger delivered. Choose an opening upgrade in the field menu.';
  if (p.stage === 'return') return 'Pump Quay is secure. Bring the recovered ledger to Sera at Tidewatch.';
  if (p.stage === 'quay_fight') return 'The ledger transmission is safe. Clear the route home through Pump Quay.';
  if (p.stage === 'roof_transfer') return 'Ledger recovered from Customs. It stays with the operation through defeat or disconnect. Reach Crane Walk.';
  if (p.stage === 'customs') return `The freight seal contradicts the cargo report. Recover the Customs ledger${p.approach ? ` via the ${p.approach} approach` : ''}.`;
  return 'Sera: Follow the cargo signal from Tidewatch. Find the freight seal on Lantern Row.';
}
