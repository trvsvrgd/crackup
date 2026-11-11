import * as THREE from 'three';
import type { DroppedWeaponState } from '../../shared/combat/combatPresentation.js';
import { createRigFirearm } from './humanoidRig.js';

export class CombatDebrisRenderer {
  public readonly root = new THREE.Group();
  private readonly weapons = new Map<number, THREE.Group>();
  public update(states: DroppedWeaponState[]): void {
    const active = new Set(states.map(s => s.id));
    for (const state of states) {
      let mesh = this.weapons.get(state.id);
      if (!mesh) { mesh = createRigFirearm(); this.weapons.set(state.id, mesh); this.root.add(mesh); }
      mesh.position.set(state.position.x, state.position.y, state.position.z);
      mesh.quaternion.set(state.rotation.x, state.rotation.y, state.rotation.z, state.rotation.w);
    }
    for (const [id, mesh] of this.weapons) if (!active.has(id)) {
      mesh.removeFromParent(); mesh.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } }); this.weapons.delete(id);
    }
  }
}
