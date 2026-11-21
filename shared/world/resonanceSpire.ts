import { getAgilityParams } from '../constants.js';
import type { AgentPhysicsBody } from '../physics/characterController.js';
import { RESONANCE_MEMORY_FRAGMENTS, RESONANCE_SPIRE_RULES } from '../content/worldLore.js';

export interface SpireCollectionPresentation { readonly memoryId: string; readonly filtered: boolean; readonly transcript: string; readonly durationMs: number }
export function resolveSpireMemory(orbId: number, whisperOrbsCollected: number): SpireCollectionPresentation {
  const memory = RESONANCE_MEMORY_FRAGMENTS[((Math.trunc(orbId) - 1) % RESONANCE_MEMORY_FRAGMENTS.length + RESONANCE_MEMORY_FRAGMENTS.length) % RESONANCE_MEMORY_FRAGMENTS.length]!;
  const filtered = whisperOrbsCollected < RESONANCE_SPIRE_RULES.unlockWhispers;
  return { memoryId: memory.id, filtered, transcript: filtered ? RESONANCE_SPIRE_RULES.filteredCaption : memory.transcript, durationMs: memory.durationMs };
}
/** Called once per accepted server collection. Kinematic capsule consumes velocity next tick. */
export function applySpireTraversal(agent: AgentPhysicsBody): void {
  agent.velocity.y += RESONANCE_SPIRE_RULES.boostMps;
  agent.grounded = false;
  agent.airDashesRemaining = getAgilityParams(agent.attributes.agility).maxAirDashes + agent.buildModifiers.bonusAirDashes;
  agent.jetpackFuelSec = agent.maxJetpackFuelSec;
}
