import * as THREE from 'three';
import { TIER3_RULES, WEAPON_BY_ID } from '../../shared/content/arsenalAndVehicleRegistry.js';
import { WORLD_GRAVITY } from '../../shared/constants.js';
import { RAPIER, type AgentPhysicsBody, type SharedPhysicsWorld } from '../../shared/physics/characterController.js';
import type { Vec3 } from '../../shared/protocol/binaryProtocol.js';

/** Fixed pools: trajectory preview and authoritative grenade positions allocate no per-frame geometry. */
export class Tier3Effects {
  public readonly root = new THREE.Group();
  private readonly points = new Float32Array((TIER3_RULES.arcSegments + 1) * 3);
  private readonly arc = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffc45e, transparent: true, opacity: .8 }));
  private readonly grenades = new THREE.InstancedMesh(new THREE.SphereGeometry(.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff934f }), TIER3_RULES.maxActiveVolumes);
  private readonly shield = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.5), new THREE.MeshBasicMaterial({ color: 0x38e9ff, transparent: true, opacity: .24, side: THREE.DoubleSide, depthWrite: false }));
  private readonly transform = new THREE.Matrix4();
  constructor() {
    this.arc.geometry.setAttribute('position', new THREE.BufferAttribute(this.points, 3));
    this.arc.frustumCulled = this.grenades.frustumCulled = false;
    this.root.add(this.arc, this.grenades, this.shield); this.root.visible = false;
  }
  public update(agent: AgentPhysicsBody | null, sim: SharedPhysicsWorld, yaw: number, pitch: number, aiming: boolean, projectiles: { position: Vec3 }[]): void {
    this.root.visible = !!agent; if (!agent) return;
    this.grenades.count = Math.min(projectiles.length, TIER3_RULES.maxActiveVolumes);
    for (let i = 0; i < this.grenades.count; i++) { const p = projectiles[i].position; this.grenades.setMatrixAt(i, this.transform.makeTranslation(p.x, p.y, p.z)); }
    this.grenades.instanceMatrix.needsUpdate = true;
    this.shield.visible = agent.tier3.petShieldSec > 0 || agent.tier3.mode === 'ShieldSurfSlide';
    this.shield.position.set(agent.position.x - Math.sin(agent.facingYaw) * 1.5, agent.position.y + 1.2, agent.position.z - Math.cos(agent.facingYaw) * 1.5);
    this.shield.rotation.y = agent.facingYaw;
    this.arc.visible = aiming && agent.attributes.explosives >= 2 && WEAPON_BY_ID.get(agent.tier3.weaponId)?.category === 'explosive' && !['EX_05', 'EX_08'].includes(agent.tier3.weaponId);
    if (!this.arc.visible) return;
    const d = { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
    const origin = { x: agent.position.x + d.x * .8, y: agent.position.y + 1.4 + d.y * .8, z: agent.position.z + d.z * .8 };
    let previous = origin, count = 0;
    for (let i = 0; i <= TIER3_RULES.arcSegments; i++) {
      const t = i / TIER3_RULES.arcSegments * TIER3_RULES.projectileFuseSec;
      const p = { x: origin.x + d.x * TIER3_RULES.projectileSpeedMps * t, y: origin.y + d.y * TIER3_RULES.projectileSpeedMps * t + .5 * WORLD_GRAVITY.y * t * t, z: origin.z + d.z * TIER3_RULES.projectileSpeedMps * t };
      const delta = { x: p.x - previous.x, y: p.y - previous.y, z: p.z - previous.z }, len = Math.hypot(delta.x, delta.y, delta.z);
      const hit = len > 0 ? sim.world.castRay(new RAPIER.Ray(previous, { x: delta.x / len, y: delta.y / len, z: delta.z / len }), len, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, agent.collider) : null;
      this.points.set([p.x, p.y, p.z], i * 3); count++; previous = p; if (hit) break;
    }
    this.arc.geometry.setDrawRange(0, count); this.arc.geometry.getAttribute('position').needsUpdate = true;
  }
  public dispose(): void { for (const mesh of [this.arc, this.grenades, this.shield]) { mesh.geometry.dispose(); mesh.material.dispose(); } this.root.removeFromParent(); }
}
