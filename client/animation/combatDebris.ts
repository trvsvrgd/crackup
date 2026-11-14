import * as THREE from 'three';
import type { DroppedWeaponState } from '../../shared/combat/combatPresentation.js';
import { weaponBuilder, type WeaponBuildResult } from '../builders/WeaponBuilder.js';
import { WeaponVariant } from '../../shared/combat/weaponPresentation.js';

export class CombatDebrisRenderer {
  public readonly root = new THREE.Group();
  private readonly weapons = new Map<number, WeaponBuildResult>();
  public update(states: DroppedWeaponState[]): void {
    const active = new Set(states.map(s => s.id));
    for (const state of states) {
      let weapon = this.weapons.get(state.id);
      const variant = state.variant ?? WeaponVariant.CARBINE;
      if (weapon && weapon.variant !== variant) { weapon.dispose(); this.weapons.delete(state.id); weapon = undefined; }
      if (!weapon) { weapon = weaponBuilder.build(variant); this.weapons.set(state.id, weapon); this.root.add(weapon.root); }
      const mesh = weapon.root;
      mesh.scale.setScalar(state.scale ?? 1);
      mesh.position.set(state.position.x, state.position.y, state.position.z);
      mesh.quaternion.set(state.rotation.x, state.rotation.y, state.rotation.z, state.rotation.w);
    }
    for (const [id, weapon] of this.weapons) if (!active.has(id)) {
      weapon.dispose(); this.weapons.delete(id);
    }
  }
  public dispose(): void { this.update([]); this.root.removeFromParent(); }
}
