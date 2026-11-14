import { parseCampaignPresentation, type CampaignPresentation } from './presentation.js';
import { DistrictId } from '../constants.js';
import { DISTRICT_LOOP_SPECS } from '../world/phase5Systems.js';

/** Versioned checkpoint data for the existing district campaign, not future authored missions. */
export interface SoloDistrictCheckpoint {
  district: DistrictId;
  stage: 1 | 2 | 3 | 4;
  terminal1Hacked: boolean;
  terminal2Hacked: boolean;
  kingpinDefeated: boolean;
}
export interface SoloCampaignState {
  version: 2;
  /** Null permits the first import of legacy browser presentation. */
  presentation: CampaignPresentation | null;
  districts: SoloDistrictCheckpoint[];
  dreadnoughtDefeated: boolean;
}
// Existing agency deployment area. Resume never uses a saved airborne/vehicle/interior position.
export const SOLO_RESUME_POSITION = { x: -14, y: 0, z: 13 } as const;

export function newSoloCampaign(): SoloCampaignState {
  return { version: 2, presentation: null, districts: DISTRICT_LOOP_SPECS.map(spec => ({ district: spec.district,
    stage: 1, terminal1Hacked: false, terminal2Hacked: false, kingpinDefeated: false })), dreadnoughtDefeated: false };
}

/** Reject unknown versions/corruption without silently resetting the player's world. */
export function parseSoloCampaign(value: unknown): SoloCampaignState {
  const state = value as Omit<SoloCampaignState, 'version'> & { version: number };
  if (!state || ![1, 2].includes(state.version) || !Array.isArray(state.districts) || state.districts.length !== DISTRICT_LOOP_SPECS.length ||
      typeof state.dreadnoughtDefeated !== 'boolean') throw new Error('Unsupported or damaged solo campaign. Your save was not overwritten.');
  const districts = DISTRICT_LOOP_SPECS.map(spec => {
    const matches = state.districts.filter(d => d?.district === spec.district);
    const d = matches[0];
    if (matches.length !== 1 || ![1, 2, 3, 4].includes(d.stage) ||
        [d.terminal1Hacked, d.terminal2Hacked, d.kingpinDefeated].some(v => typeof v !== 'boolean') ||
        (d.stage > 1 && (!d.terminal1Hacked || !d.terminal2Hacked)) ||
        (d.stage < 3 && d.kingpinDefeated) || (d.stage === 4 && !d.kingpinDefeated) ||
        (d.stage === 1 && d.terminal1Hacked && d.terminal2Hacked)) throw new Error('Invalid solo district checkpoint. Your save was not overwritten.');
    return { district: d.district, stage: d.stage, terminal1Hacked: d.terminal1Hacked,
      terminal2Hacked: d.terminal2Hacked, kingpinDefeated: d.kingpinDefeated };
  });
  if (state.dreadnoughtDefeated && districts.some(d => d.stage !== 4)) throw new Error('Invalid final campaign checkpoint. Your save was not overwritten.');
  return { version: 2, districts, dreadnoughtDefeated: state.dreadnoughtDefeated,
    presentation: state.version === 1 || state.presentation === null ? null : parseCampaignPresentation(state.presentation) };
}

export function soloCheckpointLabel(state: SoloCampaignState): string {
  if (state.dreadnoughtDefeated) return 'Dreadnought defeated';
  const next = state.districts.find(d => d.stage < 4);
  if (!next) return 'Dreadnought operation';
  const name = DISTRICT_LOOP_SPECS.find(s => s.district === next.district)!.name;
  const objective = next.stage === 1 ? `relays ${Number(next.terminal1Hacked) + Number(next.terminal2Hacked)}/2`
    : next.stage === 2 ? 'lieutenant' : next.kingpinDefeated ? 'core override' : 'kingpin';
  return `${name}: ${objective}`;
}
