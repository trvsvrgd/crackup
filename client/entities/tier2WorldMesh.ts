import * as THREE from 'three';
import { ARCHITECTURE_PLACEMENTS, DYNAMIC_SKIRMISH_TABLE, RADAR_NODE_SPECS, SAFE_HOUSE_REGISTRY, VERTICAL_HAZARD_SPECS } from '../../shared/content/worldSystemsRegistry.js';
import type { Tier2Snapshot } from '../../shared/protocol/tier2Protocol.js';
import type { AgentPhysicsBody } from '../../shared/physics/characterController.js';

/** Visible counterparts of the authoritative colliders; all geometry/materials are reused. */
export class Tier2WorldRenderer {
  public readonly root = new THREE.Group();
  private readonly architecture = new Map<number, THREE.Group>();
  private readonly anchors = new Map<number, THREE.Mesh>();
  private readonly radar = new Map<number, THREE.Group>();
  private readonly aircraft = new Map<number, THREE.Group>();
  private readonly events = new Map<number, THREE.Group>();
  private readonly pads = new Map<number, THREE.Mesh>();
  private readonly hazards = new Map<string, THREE.Mesh>();
  private readonly status = document.createElement('div');
  constructor(scene: THREE.Scene) {
    scene.add(this.root); this.root.name = 'Tier 2 world systems';
    this.status.id = 'tier2-status'; this.status.style.cssText = 'position:fixed;left:50%;bottom:135px;transform:translateX(-50%);color:#b8ffff;background:#07131ee8;padding:8px 14px;border:1px solid #48b3be;font:12px monospace;pointer-events:none;white-space:pre-line;text-align:center;display:none';
    document.body.append(this.status);
    const steel = new THREE.MeshStandardMaterial({ color: 0x364957, metalness: 0.75, roughness: 0.4 });
    const concrete = new THREE.MeshStandardMaterial({ color: 0x8a8783, roughness: 0.95 });
    const amber = new THREE.MeshStandardMaterial({ color: 0xffb642, emissive: 0x9b4e08, emissiveIntensity: 0.7 });
    const cyan = new THREE.MeshStandardMaterial({ color: 0x56c9db, emissive: 0x16718a, metalness: 0.4, roughness: 0.3 });
    const box = (parent: THREE.Object3D, w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
    };
    for (const spec of ARCHITECTURE_PLACEMENTS) {
      const group = new THREE.Group(), h = spec.halfExtents; group.position.copy(spec.center); group.name = spec.name;
      box(group, h.x * 2, h.y * 2, h.z * 2, spec.kind === 'BREACHABLE_WALL' ? concrete : steel);
      if (spec.kind === 'BREACHABLE_WALL') {
        const points = [-2, -1.4, -0.4, 0.5, 1.4, 2].map((y, i) => new THREE.Vector3(i % 2 ? 0.3 : -0.2, y, h.z + 0.012));
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x171719 })));
        box(group, 0.8, 0.3, 0.02, amber, 1.6, 0, h.z + 0.02);
        // Neon Fox access grille: matches PET_VENT_REGISTRY on the cache door.
        box(group, .9, .7, .08, steel, -1.6, -1.4, h.z + .05);
        for (let row = 0; row < 4; row++) box(group, .7, .035, .04, cyan, -1.6, -1.65 + row * .16, h.z + .11);
      } else {
        for (const x of [-h.x * 0.7, h.x * 0.7]) box(group, 0.12, h.y * 2 + 0.1, h.z * 2 + 0.1, amber, x);
        if (spec.name.includes('holo')) box(group, h.x * 1.8, h.y * 1.5, 0.06, cyan, 0, 0, h.z + 0.04);
        const anchor = box(this.root, 0.8, 1.2, 0.8, amber, spec.anchor.x, spec.anchor.y, spec.anchor.z); this.anchors.set(spec.id, anchor);
      }
      this.root.add(group); this.architecture.set(spec.id, group);
    }
    for (const node of RADAR_NODE_SPECS) {
      const group = new THREE.Group(); group.position.copy(node.center); box(group, 1.4, 2, 1.4, steel);
      const dish = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 8, 0, Math.PI), cyan); dish.scale.set(1, 1, 0.25); dish.position.y = 0.8; group.add(dish);
      this.root.add(group); this.radar.set(node.id, group);
    }
    for (const h of SAFE_HOUSE_REGISTRY) {
      const pad = box(this.root, 11, 0.06, 9, amber.clone(), h.center.x, h.center.y - 0.95, h.center.z); this.pads.set(h.id, pad);
      if (h.kind !== 'ROOFTOP_PAD') continue;
      const craft = new THREE.Group(); box(craft, 3.6, 1.4, 6, steel); box(craft, 2.3, 1.2, 2.4, cyan, 0, 0.7, -0.7);
      box(craft, 7, 0.2, 1.5, steel, 0, 0.3, 0.5);
      for (const x of [-2.8, 2.8]) {
        const duct = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.14, 8, 20), steel); duct.rotation.x = Math.PI / 2; duct.position.set(x, 0.5, 0.5); craft.add(duct);
        const rotor = box(craft, 1.9, 0.04, 0.15, amber, x, 0.5, 0.5); rotor.name = 'rotor';
      }
      box(craft, 0.25, 0.35, 4, steel, -1.4, -1, 0); box(craft, 0.25, 0.35, 4, steel, 1.4, -1, 0);
      craft.visible = false; this.root.add(craft); this.aircraft.set(1000 + h.id, craft);
    }
    for (const h of VERTICAL_HAZARD_SPECS.filter(h => h.kind !== 'SAM_CEILING')) {
      const mat = new THREE.MeshBasicMaterial({ color: h.kind === 'TIMED_LOUVER' ? 0xff6125 : 0x59cddc, transparent: true, opacity: h.kind === 'TIMED_LOUVER' ? 0.3 : 0.045, depthWrite: false, wireframe: h.kind === 'CANYON_CROSSWIND' });
      const mesh = box(this.root, h.halfExtents.x * 2, h.halfExtents.y * 2, h.halfExtents.z * 2, mat, h.center.x, h.center.y, h.center.z); this.hazards.set(h.id, mesh);
    }
    for (let i = 0; i < 4; i++) {
      const event = new THREE.Group();
      const citizen = new THREE.Group(); citizen.name = 'Municipal technician';
      box(citizen, 0.48, 0.7, 0.3, amber, 0, 0.1);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8), new THREE.MeshStandardMaterial({ color: 0xb88a65, roughness: 0.9 })); head.position.y = 0.65; citizen.add(head);
      for (const x of [-0.14, 0.14]) { const leg = box(citizen, 0.15, 0.65, 0.18, steel, x, -0.55); leg.name = 'leg'; }
      for (const x of [-0.33, 0.33]) box(citizen, 0.15, 0.6, 0.18, amber, x, 0.1);
      box(citizen, 0.5, 0.1, 0.32, cyan, 0, 0.2); event.add(citizen);

      const generator = new THREE.Group(); generator.name = 'Municipal repair cabinet';
      box(generator, 1.6, 2, 1.2, steel); box(generator, 0.9, 0.4, 0.04, cyan, 0, 0.5, 0.62);
      for (let row = 0; row < 5; row++) box(generator, 1.1, 0.06, 0.08, amber, 0, -0.6 + row * 0.16, 0.64);
      event.add(generator);

      const van = new THREE.Group(); van.name = 'Syndicate armored cash van';
      box(van, 2.8, 2.4, 6, steel); box(van, 2.4, 0.65, 0.08, cyan, 0, 0.65, 3.04);
      box(van, 2.9, 0.2, 0.2, amber, 0, -0.5, 3.1);
      for (const x of [-1.45, 1.45]) for (const z of [-1.9, 1.9]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.2, 12), steel); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, -0.8, z); van.add(wheel);
      }
      for (const x of [-0.7, 0.7]) box(van, 1.2, 1.8, 0.08, amber, x, 0, -3.04);
      event.add(van);

      const clinic = new THREE.Group(); clinic.name = 'Riot clinic treatment module';
      box(clinic, 4, 3, 4, concrete); box(clinic, 1.3, 2.3, 0.05, steel, 0, -0.3, 2.03);
      box(clinic, 1.2, 0.25, 0.08, cyan, 0, 1.1, 2.08); box(clinic, 0.25, 0.65, 0.08, cyan, 0, 1.1, 2.08);
      for (const x of [-1.35, 1.35]) box(clinic, 0.8, 0.7, 0.05, cyan, x, 0.3, 2.04);
      event.add(clinic);

      const beacon = new THREE.Group(); beacon.name = 'Aegis ambush trip sensor';
      box(beacon, 0.35, 0.7, 0.35, steel, 0, -0.6);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.06, 8, 20), amber); ring.rotation.x = Math.PI / 2; beacon.add(ring); event.add(beacon);
      event.visible = false; this.root.add(event); this.events.set(i, event);
    }
  }
  public update(snapshot: Tier2Snapshot | null, agent: AgentPhysicsBody | undefined, time: number, shapedCharges = 3): void {
    if (!snapshot) { this.status.style.display = 'none'; return; }
    for (const s of snapshot.architecture) {
      const mesh = this.architecture.get(s.id)!; mesh.position.copy(s.position); mesh.quaternion.copy(s.rotation); mesh.visible = this.anchors.has(s.id) || !s.broken;
      const anchor = this.anchors.get(s.id); if (anchor) anchor.visible = !s.broken;
    }
    for (const s of snapshot.radar) this.radar.get(s.id)!.visible = s.hp > 0;
    for (const s of snapshot.aircraft) {
      const mesh = this.aircraft.get(s.id)!; mesh.visible = s.active; mesh.position.copy(s.position); mesh.quaternion.copy(s.rotation);
      for (const child of mesh.children) if (child.name === 'rotor') child.rotation.y = s.stallSec > 0 ? 0 : time * 35;
    }
    for (const [id, mesh] of this.pads) (mesh.material as THREE.MeshStandardMaterial).color.setHex(snapshot.houses.includes(id) ? 0x36cc9c : 0xe9a436);
    for (const h of VERTICAL_HAZARD_SPECS) if (h.kind === 'TIMED_LOUVER') this.hazards.get(h.id)!.visible = (snapshot.elapsed + h.phaseSec) % h.periodSec < h.activeSec;
    for (const s of snapshot.skirmishes) {
      const mesh = this.events.get(s.districtIndex)!; mesh.visible = s.active; mesh.position.copy(s.position);
      mesh.children.forEach((child, index) => { child.visible = index === s.kindIndex; });
      if (s.kindIndex === 0) mesh.children[0].children.filter(c => c.name === 'leg').forEach((leg, i) => { leg.rotation.x = Math.sin(s.progress * 65 + i * Math.PI) * 0.35; });
    }
    let message = '';
    if (agent) {
      const craft = snapshot.aircraft.find(a => a.pilotId === agent.entityId);
      if (craft) message = craft.stallSec > 0 ? `EMP STALL ${craft.stallSec.toFixed(1)}s — rotor lift disabled` : craft.lockSec > 0 ? `RADAR LOCK — EMP in ${(3 - craft.lockSec).toFixed(1)}s\nFlying Lv 4: [Ctrl / X] EMP flare` : 'VTOL: W/S thrust · A/D yaw · Space climb · Shift descend · E exit';
      else {
        const house = SAFE_HOUSE_REGISTRY.find(h => Math.hypot(h.center.x - agent.position.x, h.center.y - agent.position.y, h.center.z - agent.position.z) < 10);
        if (house) message = snapshot.houses.includes(house.id) ? `[H] Resupply / deploy vehicle · [B] Augment Chassis\n[E] Board VTOL · Shaped charges: ${shapedCharges} (RMB + fire within 3m) · Breach: hold V / C` : 'FORWARD OPERATING SITE — clear local defenders to unlock';
        const event = snapshot.skirmishes.find(s => s.outcome > 0 && Math.hypot(s.position.x - agent.position.x, s.position.y - agent.position.y, s.position.z - agent.position.z) < 50);
        if (event) {
          const task = event.kindIndex === 0 ? 'Accompany the technician to safety' : event.kindIndex === 1 ? 'Hold H beside the cabinet to repair'
            : event.kindIndex === 2 ? event.objectiveHp > 0 ? 'Stop the armored van before it escapes' : 'Clear the crew, then hold H beside the van to recover cargo'
            : event.kindIndex === 3 ? `Protect the clinic · ${(Math.max(0, 45 - event.elapsed)).toFixed(0)}s defense remaining`
            : event.stage === 0 ? 'Aegis trip sensor detected' : `Keep Agent ${event.targetEntityId} alive and defeat the hit squad`;
          message += `\n${DYNAMIC_SKIRMISH_TABLE[event.kindIndex].kind.replaceAll('_', ' ')} — ${event.outcome === 2 ? 'SUCCEEDED' : event.outcome === 3 ? 'FAILED' : task}`;
          if (event.active && event.maxObjectiveHp > 0) message += `\nObjective HP ${event.objectiveHp.toFixed(0)}/${event.maxObjectiveHp} · ${(event.progress * 100).toFixed(0)}%`;
        }
      }
    }
    this.status.textContent = message.trim(); this.status.style.display = message ? 'block' : 'none';
  }
}
