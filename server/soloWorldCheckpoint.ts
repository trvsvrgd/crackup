import { DreadnoughtPhase, EnemyCombatState } from '../shared/constants.js';
import { parseSoloCampaign, type SoloCampaignState } from '../shared/campaign/soloCampaign.js';
import type { SharedPhysicsWorld } from '../shared/physics/characterController.js';

export function captureSoloWorld(world: SharedPhysicsWorld, presentation: SoloCampaignState['presentation'] = null): SoloCampaignState {
  return parseSoloCampaign({ version: 2, presentation,
    districts: [...world.phase5Director.districtLoops.values()].map(loop => ({ district: loop.spec.district,
      stage: loop.currentStage, terminal1Hacked: loop.terminal1Hacked, terminal2Hacked: loop.terminal2Hacked,
      kingpinDefeated: loop.kingpinDefeated })),
    dreadnoughtDefeated: world.dreadnoughtDirector.phase === DreadnoughtPhase.DEFEATED });
}

/** Restore onto a fresh world. Encounters restart; completed objectives never award again. */
export function restoreSoloWorld(world: SharedPhysicsWorld, state: SoloCampaignState): void {
  parseSoloCampaign(state);
  const director = world.phase5Director;
  for (const checkpoint of state.districts) {
    const loop = director.districtLoops.get(checkpoint.district)!;
    if (checkpoint.stage >= 2) director.advanceDistrictLoopToStage2(loop);
    if (checkpoint.stage >= 3) {
      director.advanceDistrictLoopToStage3(loop);
      world.combatManager.removeEnemy(loop.spec.lieutenantEnemyId);
    }
    loop.currentStage = checkpoint.stage;
    loop.terminal1Hacked = checkpoint.terminal1Hacked;
    loop.terminal2Hacked = checkpoint.terminal2Hacked;
    loop.lieutenantDefeated = checkpoint.stage >= 3;
    loop.kingpinDefeated = checkpoint.kingpinDefeated;
    if (checkpoint.kingpinDefeated) {
      const kingpin = world.combatManager.enemies.get(loop.spec.kingpinEnemyId)!;
      kingpin.hp = 0; kingpin.combatState = EnemyCombatState.DEAD;
      world.combatManager.syncEnemyBoneColliders(kingpin);
    }
    if (checkpoint.stage === 4) director.unlockedDistrictRewards.add(loop.spec.rewardId);
  }
  director.pendingNotifications.length = 0;
  world.relaySystem.step(0);
  world.dreadnoughtDirector.allowRespawn = false;
  if (state.dreadnoughtDefeated) {
    world.dreadnoughtDirector.phase = DreadnoughtPhase.DEFEATED;
    world.dreadnoughtDirector.respawnTimerSec = 0;
    for (const part of world.dreadnoughtDirector.parts.values()) { part.hp = 0; part.collider.setEnabled(false); }
  }
}
