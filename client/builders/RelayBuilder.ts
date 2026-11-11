import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RELAY_BASE_HEIGHT, RELAY_BASE_RADIUS, RELAY_VENT_MAX_HP, RelayMode, relayBaseVertices, type RelayPlan } from '../../shared/world/relayDefinition.js';
import type { RelayState } from '../../shared/protocol/relayProtocol.js';
import { productionAssets } from '../assets/productionAssets.js';
import { stylizePBR } from '../shaders/factionPalette.js';
import { BuilderResourcePool, type BuilderResourceScope, type BuilderResult } from './builderContract.js';

export interface RelayBuildResult extends BuilderResult {
  readonly plan: RelayPlan;
  readonly baseHull: readonly number[];
  dishes: THREE.Object3D[];
  vents: THREE.Object3D[];
  updateRelay(dt: number, state: RelayState, timeSec: number, cameraPosition?: THREE.Vector3): void;
}
const PALETTES = [0x24d9ed, 0xff9c35, 0x83b6ff, 0xe355a8];
export class RelayBuilder {
  public readonly resources = new BuilderResourcePool();
  private serial = 0;
  private readonly attempted = new WeakMap<RelayBuildResult, object>();
  private readonly imports = new WeakMap<RelayBuildResult, THREE.Object3D>();
  private batchRigid(scope: BuilderResourceScope, root: THREE.Group, key: string, filter: (mesh: THREE.Mesh) => boolean = () => true): void {
    root.updateWorldMatrix(true, true); const inverse = root.matrixWorld.clone().invert(), groups = new Map<THREE.Material, THREE.Mesh[]>();
    root.traverse(o => { if (o instanceof THREE.Mesh && !Array.isArray(o.material) && filter(o)) { const list = groups.get(o.material) ?? []; list.push(o); groups.set(o.material, list); } });
    let index = 0;
    for (const [material, meshes] of groups) {
      if (meshes.length < 2) continue;
      const geometry = scope.get(`relay:batch:${key}:${index++}`, () => {
        const fragments: THREE.BufferGeometry[] = [];
        for (const mesh of meshes) {
          const transform = inverse.clone().multiply(mesh.matrixWorld);
          if (mesh instanceof THREE.InstancedMesh) for (let i = 0; i < mesh.count; i++) {
            const instance = new THREE.Matrix4(); mesh.getMatrixAt(i, instance); fragments.push(mesh.geometry.clone().applyMatrix4(transform.clone().multiply(instance)));
          } else fragments.push(mesh.geometry.clone().applyMatrix4(transform));
        }
        const combined = mergeGeometries(fragments, false)!; fragments.forEach(g => g.dispose()); return combined;
      });
      const batch = new THREE.Mesh(geometry, material); batch.name = 'BatchedRigidHardware'; batch.castShadow = batch.receiveShadow = true; root.add(batch);
      // Keep named source transforms available for import validation and collider verification.
      meshes.forEach(mesh => mesh.visible = false);
    }
  }
  private material(scope: BuilderResourceScope, key: string, color: number, emissive = false): THREE.MeshStandardMaterial {
    return scope.get(`relay:mat:${key}`, () => stylizePBR(new THREE.MeshStandardMaterial({ color, metalness: key === 'bunker' ? 0.1 : 0.5, roughness: key === 'bunker' ? 0.7 : 0.48, emissive: emissive ? color : 0, emissiveIntensity: emissive ? 1 : 0 })));
  }
  public build(plan: RelayPlan): RelayBuildResult {
    const scope = this.resources.scope(), serial = ++this.serial, root = new THREE.Group();
    root.name = `Relay_${plan.relayId}`; root.userData.entityKind = 'relay'; root.position.set(plan.origin.x, plan.origin.y, plan.origin.z);
    const anchors = new Map<string, THREE.Object3D>(), animatedParts = new Map<string, THREE.Object3D>(), materials = new Set<THREE.Material>();
    const steel = this.material(scope, 'steel', 0x3b5263), concrete = this.material(scope, 'bunker', 0x52616a), rubber = this.material(scope, 'dark', 0x101b26);
    const accent = this.material(scope, `accent:${plan.districtIndex}`, PALETTES[plan.districtIndex], true);
    const plasma = this.material(scope, `plasma:${serial}`, PALETTES[plan.districtIndex], true), danger = this.material(scope, 'hazard', 0xf3b837);
    const unit = scope.get('relay:unit', () => new THREE.BoxGeometry(1, 1, 1)), o = plan.towerOffset;
    const mesh = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, position: THREE.Vector3, parent: THREE.Object3D = root) => {
      const m = new THREE.Mesh(geometry, material); m.name = name; m.position.copy(position); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
    };
    const box = (name: string, size: [number, number, number], pos: [number, number, number], material: THREE.Material, parent: THREE.Object3D = root) => {
      const m = mesh(name, unit, material, new THREE.Vector3(...pos), parent); m.scale.set(...size); return m;
    };
    const bunker = mesh('BunkerBase', scope.get('relay:octagonal-bunker', () => new THREE.CylinderGeometry(RELAY_BASE_RADIUS, RELAY_BASE_RADIUS, RELAY_BASE_HEIGHT, 8)), concrete,
      new THREE.Vector3(o.x, o.y + RELAY_BASE_HEIGHT / 2, o.z)); anchors.set('BunkerBase', bunker);
    const crown = mesh('OctagonalRoofLip', scope.get('relay:roof-trim', () => new THREE.CylinderGeometry(1.83, 1.83, 0.06, 8)), steel, new THREE.Vector3(o.x, 1.58, o.z));
    // Grounded structural steel is instanced directly from the same descriptors as Rapier.
    const lattice = new THREE.InstancedMesh(unit, steel, plan.boxes.length); lattice.name = 'TwelveMeterLattice'; lattice.castShadow = lattice.receiveShadow = true;
    const pose = new THREE.Object3D();
    plan.boxes.forEach((b, i) => { pose.position.set(b.center.x, b.center.y, b.center.z); pose.rotation.set(b.rotation?.x ?? 0, 0, b.rotation?.z ?? 0); pose.scale.set(b.halfExtents.x * 2, b.halfExtents.y * 2, b.halfExtents.z * 2); pose.updateMatrix(); lattice.setMatrixAt(i, pose.matrix); }); root.add(lattice);
    const stripes = new THREE.InstancedMesh(unit, danger, 24); stripes.name = 'BunkerHazardStriping';
    for (let face = 0; face < 8; face++) for (let j = 0; j < 3; j++) {
      const a = (face + 0.5) * Math.PI / 4, tangent = (j - 1) * 0.3, radius = RELAY_BASE_RADIUS * Math.cos(Math.PI / 8) + 0.015;
      pose.position.set(o.x + Math.sin(a) * radius + Math.cos(a) * tangent, 0.24, o.z + Math.cos(a) * radius - Math.sin(a) * tangent);
      pose.rotation.set(0, a, -0.38); pose.scale.set(0.13, 0.22, 0.025); pose.updateMatrix(); stripes.setMatrixAt(face * 3 + j, pose.matrix);
    } root.add(stripes);
    const vents: THREE.Object3D[] = [];
    for (const spec of plan.vents) {
      const vent = new THREE.Group(); vent.name = spec.name; vent.position.set(spec.center.x, spec.center.y, spec.center.z);
      if (spec.ventId === 0) vent.rotation.y = -Math.PI / 2; if (spec.ventId === 1) vent.rotation.y = Math.PI / 2; if (spec.ventId === 2) vent.rotation.y = Math.PI;
      root.add(vent); vents.push(vent); anchors.set(spec.name, vent);
      box('VentFrame', [1.1, 0.84, 0.18], [0, 0, 0], steel, vent);
      const louvers = new THREE.Group(); louvers.name = 'VentLouvers'; vent.add(louvers);
      const slats = new THREE.InstancedMesh(unit, concrete, 7); slats.name = 'CoolingLouverSlats';
      for (let i = 0; i < 7; i++) { pose.position.set(0, -0.32 + i * 0.106, 0.12); pose.rotation.set(-0.3, 0, 0); pose.scale.set(0.94, 0.055, 0.12); pose.updateMatrix(); slats.setMatrixAt(i, pose.matrix); } louvers.add(slats);
      const coil = new THREE.Group(); coil.name = 'VentExposedCoil'; coil.visible = false; vent.add(coil);
      box('OpenCoolingCavity', [0.94, 0.69, 0.04], [0, 0, 0.102], rubber, coil);
      for (const x of [-0.3, 0, 0.3]) box('ExposedPlasmaFin', [0.08, 0.59, 0.06], [x, 0, 0.15], plasma, coil);
      box('TornLouver', [0.5, 0.08, 0.12], [0.22, -0.3, 0.2], concrete, coil).rotation.z = -0.5;
    }
    const coolingAnchor = new THREE.Group(); coolingAnchor.name = 'CoolingVent'; coolingAnchor.position.copy(vents[0].position); root.add(coolingAnchor); anchors.set('CoolingVent', coolingAnchor);
    const tubes = new THREE.Group(); tubes.name = 'PlasmaTubes'; root.add(tubes); anchors.set('PlasmaTubes', tubes);
    const tubeGeometry = scope.get('relay:plasma-tube', () => new THREE.CylinderGeometry(0.11, 0.11, 8.2, 10));
    for (const x of [-0.3, 0.3]) mesh('PlasmaConduit', tubeGeometry, plasma, new THREE.Vector3(o.x + x, 5.9, o.z), tubes);
    const collars = new THREE.InstancedMesh(scope.get('relay:collar', () => new THREE.TorusGeometry(0.15, 0.04, 5, 10)), steel, 10); collars.name = 'PlasmaTubeCollars';
    for (let i = 0; i < 10; i++) { pose.position.set(o.x + (i % 2 ? 0.3 : -0.3), 2.1 + Math.floor(i / 2) * 1.8, o.z); pose.rotation.set(Math.PI / 2, 0, 0); pose.scale.set(1, 1, 1); pose.updateMatrix(); collars.setMatrixAt(i, pose.matrix); } tubes.add(collars);
    const dishes: THREE.Object3D[] = [], dishGeometry = scope.get('relay:parabolic-dish', () => new THREE.LatheGeometry(Array.from({ length: 11 }, (_, i) => { const r = i / 10; return new THREE.Vector2(r, r * r * 0.32); }), 16));
    const dishMaterial = scope.get('relay:dish-coating', () => { const m = stylizePBR(new THREE.MeshStandardMaterial({ color: 0xa6b7c3, metalness: 0.48, roughness: 0.3, side: THREE.DoubleSide })); return m; });
    const rimGeometry = scope.get('relay:dish-rim', () => { const g = new THREE.TorusGeometry(1, 0.045, 6, 24); g.rotateX(Math.PI / 2); return g; });
    for (let i = 0; i < 3; i++) {
      const pivot = new THREE.Group(); pivot.name = `DishPivot${i + 1}`; pivot.position.set(o.x, 4.8 + i * 3.5, o.z); pivot.rotation.y = i * Math.PI * 2 / 3;
      root.add(pivot); dishes.push(pivot); anchors.set(pivot.name, pivot); animatedParts.set(pivot.name, pivot);
      box('DishCantilever', [1.3, 0.12, 0.12], [0.65, 0, 0], steel, pivot);
      const tilt = new THREE.Group(); tilt.name = 'DishElevation'; tilt.position.x = 1.15; tilt.rotation.z = -Math.PI / 2.5; pivot.add(tilt);
      mesh('ParabolicMicrowaveReflector', dishGeometry, dishMaterial, new THREE.Vector3(), tilt);
      mesh('ReflectorRim', rimGeometry, steel, new THREE.Vector3(0, 0.32, 0), tilt);
      box('MicrowaveFeedHorn', [0.15, 0.32, 0.15], [0, 0.55, 0], accent, tilt);
      for (const side of [-1, 1]) box('FeedSupport', [0.035, 0.72, 0.035], [side * 0.27, 0.35, 0], steel, tilt).rotation.z = side * 0.72;
      this.batchRigid(scope, pivot, `dish:${serial}:${i}`);
    }
    const terminal = new THREE.Group(); terminal.name = 'Terminal'; root.add(terminal); anchors.set('Terminal', terminal);
    box('ConsolePedestal', [0.8, 0.65, 0.65], [0, 0.325, 0], steel, terminal);
    box('ConsoleControlDeck', [1.05, 0.1, 0.65], [0, 0.74, 0.1], rubber, terminal).rotation.x = -0.15;
    for (const x of [-0.3, 0, 0.3]) box('ConsoleKey', [0.12, 0.035, 0.12], [x, 0.81, 0.1], accent, terminal);
    const holoMaterial = scope.get(`relay:holo:${serial}`, () => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { time: { value: 0 }, color: { value: new THREE.Color(PALETTES[plan.districtIndex]) } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec2 vUv; uniform float time; uniform vec3 color; void main(){vec2 g=abs(fract(vUv*vec2(10.,6.))-.5);float grid=step(.46,max(g.x,g.y));float sweep=pow(max(0.,sin(vUv.y*18.-time*2.)),12.);float map=step(length(vUv-vec2(.5)),.32)*.24;gl_FragColor=vec4(color*(.6+grid+ sweep),.18+grid*.35+sweep*.25+map);}',
    }));
    const holo = mesh('HolographicDisplay', scope.get('relay:hologram', () => new THREE.PlaneGeometry(1.15, 0.85)), holoMaterial, new THREE.Vector3(0, 1.38, 0), terminal); holo.rotation.x = -0.18;
    const ringMaterial = scope.get(`relay:ring:${serial}`, () => new THREE.MeshBasicMaterial({ color: PALETTES[plan.districtIndex], transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    const ring = mesh('TerminalRing', scope.get('relay:terminal-ring', () => { const g = new THREE.RingGeometry(1.15, 1.35, 32); g.rotateX(-Math.PI / 2); return g; }), ringMaterial, new THREE.Vector3(0, 0.025, 0));
    // Embedded conduit marks the link without creating a new step across the console approach.
    const conduit = box('EmbeddedDataConduit', [Math.hypot(o.x, o.z), 0.006, 0.045], [o.x / 2, 0.008, o.z / 2], accent); conduit.rotation.y = -Math.atan2(o.z, o.x);
    this.batchRigid(scope, tubes, `tubes:${serial}`);
    this.batchRigid(scope, root, `body:${serial}`, m => {
      if (['HolographicDisplay', 'TerminalRing', 'BatchedRigidHardware'].includes(m.name)) return false;
      for (let p = m.parent; p && p !== root; p = p.parent) if (/^(DishPivot|VentLouvers|VentExposedCoil|PlasmaTubes)/.test(p.name)) return false;
      return true;
    });
    root.traverse(object => { if (object instanceof THREE.Mesh) (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m)); });
    let disposed = false, elapsed = 0;
    let current: RelayState = { relayId: plan.relayId, generation: 1, hacked: false, mode: RelayMode.ONLINE, heat: 0, rebootSec: 0, ventHp: [120, 120, 120] };
    const updateRelay = (dt: number, state: RelayState, timeSec: number, cameraPosition?: THREE.Vector3) => {
      if (disposed) return; current = state;
      const speed = state.mode === RelayMode.SHUTDOWN ? 0 : state.hacked ? 0.05 : 0.23;
      for (const [i, dish] of dishes.entries()) dish.rotation.y += Math.max(0, Math.min(dt, 0.1)) * speed * (i % 2 ? -1 : 1);
      for (const [i, vent] of vents.entries()) {
        vent.getObjectByName('VentLouvers')!.visible = state.ventHp[i] > 0;
        vent.getObjectByName('VentExposedCoil')!.visible = state.ventHp[i] === 0;
      }
      const color = new THREE.Color(state.hacked ? 0x40df8c : PALETTES[plan.districtIndex]).lerp(new THREE.Color(0xff3a16), state.hacked ? 0 : state.heat);
      plasma.color.copy(color); plasma.emissive.copy(color); plasma.emissiveIntensity = state.mode === RelayMode.SHUTDOWN ? 0.12 : 1.1 + Math.sin(timeSec * 5) * 0.4;
      ringMaterial.color.copy(color); holoMaterial.uniforms.color.value.copy(color); holoMaterial.uniforms.time.value = timeSec;
      const imported = this.imports.get(result);
      if (imported) {
        imported.getObjectByName('PlasmaTubes')!.traverse(o => { if (o instanceof THREE.Mesh) for (const mat of Array.isArray(o.material) ? o.material : [o.material]) if (mat instanceof THREE.MeshStandardMaterial) { mat.emissive.copy(color); mat.emissiveIntensity = plasma.emissiveIntensity; } });
        const display = imported.getObjectByName('HolographicDisplay') as THREE.Mesh, importedRing = imported.getObjectByName('TerminalRing') as THREE.Mesh;
        for (const mat of Array.isArray(display.material) ? display.material : [display.material]) {
          if (mat instanceof THREE.ShaderMaterial) { if (mat.uniforms.time) mat.uniforms.time.value = timeSec; if (mat.uniforms.color) mat.uniforms.color.value.copy(color); }
          else if (mat instanceof THREE.MeshBasicMaterial || mat instanceof THREE.MeshStandardMaterial) mat.color.copy(color);
        }
        for (const mat of Array.isArray(importedRing.material) ? importedRing.material : [importedRing.material]) if (mat instanceof THREE.MeshBasicMaterial || mat instanceof THREE.MeshStandardMaterial) mat.color.copy(color);
      }
      const distant = !!cameraPosition && cameraPosition.distanceTo(root.position) > 140;
      holo.visible = !distant; ring.visible = !distant;
    };
    const result: RelayBuildResult = { plan, root, dishes, vents, baseHull: relayBaseVertices(o), anchors, animatedParts, materials,
      source: 'procedural', collisions: plan.boxes.map(b => ({ ...b, center: { x: b.center.x + plan.origin.x, y: b.center.y + plan.origin.y, z: b.center.z + plan.origin.z } })),
      updateRelay, update: (dt, camera) => { elapsed += dt; updateRelay(dt, current, elapsed, camera); },
      dispose: () => { if (disposed) return; disposed = true; root.removeFromParent(); root.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); }); scope.dispose(); root.clear(); } };
    this.attachModel(result); return result;
  }
  public attachModel(result: RelayBuildResult): boolean {
    if (result.source === 'gltf') return true;
    const name = `district-${result.plan.districtIndex}`, template = productionAssets.models.get(`relay:${name}`);
    if (!template || this.attempted.get(result) === template) return false; this.attempted.set(result, template);
    const model = productionAssets.createModel('relay', name); if (!model) return false;
    const fail = () => { this.disposeModel(model.scene); return false; };
    if (model.scene.position.length() > 0.001 || model.scene.quaternion.angleTo(new THREE.Quaternion()) > 0.001 || model.scene.scale.distanceTo(new THREE.Vector3(1, 1, 1)) > 0.001) return fail();
    model.scene.updateMatrixWorld(true);
    const terminal = model.scene.getObjectByName('Terminal'), plasma = model.scene.getObjectByName('PlasmaTubes'), cooling = model.scene.getObjectByName('CoolingVent');
    if (!terminal || terminal.getWorldPosition(new THREE.Vector3()).length() > 0.05 || !plasma || !cooling || !(model.scene.getObjectByName('HolographicDisplay') instanceof THREE.Mesh) || !(model.scene.getObjectByName('TerminalRing') instanceof THREE.Mesh)) return fail();
    const bunker = model.scene.getObjectByName('BunkerBase'), tower = model.scene.getObjectByName('TwelveMeterLattice'), offset = result.plan.towerOffset;
    if (!bunker || !tower) return fail();
    const baseBounds = new THREE.Box3().setFromObject(bunker), expectedBase = new THREE.Box3(new THREE.Vector3(offset.x - RELAY_BASE_RADIUS, 0, offset.z - RELAY_BASE_RADIUS), new THREE.Vector3(offset.x + RELAY_BASE_RADIUS, RELAY_BASE_HEIGHT, offset.z + RELAY_BASE_RADIUS));
    if (baseBounds.min.distanceTo(expectedBase.min) > 0.06 || baseBounds.max.distanceTo(expectedBase.max) > 0.06) return fail();
    const towerBounds = new THREE.Box3().setFromObject(tower), expectedTower = new THREE.Box3();
    for (const b of result.plan.boxes) {
      const box = new THREE.Box3(new THREE.Vector3(-b.halfExtents.x, -b.halfExtents.y, -b.halfExtents.z), new THREE.Vector3(b.halfExtents.x, b.halfExtents.y, b.halfExtents.z));
      box.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(b.center.x, b.center.y, b.center.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(b.rotation?.x ?? 0, 0, b.rotation?.z ?? 0)), new THREE.Vector3(1, 1, 1))); expectedTower.union(box);
    }
    if (towerBounds.min.distanceTo(expectedTower.min) > 0.06 || towerBounds.max.distanceTo(expectedTower.max) > 0.06) return fail();
    const vents: THREE.Object3D[] = [];
    for (const spec of result.plan.vents) {
      const vent = model.scene.getObjectByName(spec.name);
      if (!vent || vent.parent !== model.scene || vent.scale.distanceTo(new THREE.Vector3(1, 1, 1)) > 0.001 || !vent.getObjectByName('VentLouvers') || !vent.getObjectByName('VentExposedCoil') ||
        vent.getWorldQuaternion(new THREE.Quaternion()).angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spec.ventId === 0 ? -Math.PI / 2 : spec.ventId === 1 ? Math.PI / 2 : Math.PI)) > 0.01 ||
        vent.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(spec.center.x, spec.center.y, spec.center.z)) > 0.05) return fail();
      vents.push(vent);
    }
    const dishes = [1, 2, 3].map(i => model.scene.getObjectByName(`DishPivot${i}`));
    if (dishes.some((d, i) => !d || d.parent !== model.scene || d.position.distanceTo(new THREE.Vector3(result.plan.towerOffset.x, 4.8 + i * 3.5, result.plan.towerOffset.z)) > 0.05)) return fail();
    const bounds = new THREE.Box3().setFromObject(model.scene), o = result.plan.towerOffset;
    if (bounds.isEmpty() || bounds.min.y < -0.1 || bounds.max.y > 14.3 || bounds.min.x < Math.min(-1.5, o.x - 2.7) || bounds.max.x > Math.max(1.5, o.x + 2.7) ||
      bounds.min.z < Math.min(-1.5, o.z - 2.7) || bounds.max.z > Math.max(1.5, o.z + 2.7)) return fail();
    const fallback = new THREE.Group(); fallback.name = 'ProceduralRelayFallback'; for (const child of [...result.root.children]) fallback.add(child); fallback.visible = false;
    result.root.add(fallback, model.scene); result.dishes.splice(0, 3, ...dishes as THREE.Object3D[]); result.vents.splice(0, 3, ...vents); result.source = 'gltf'; this.imports.set(result, model.scene);
    result.anchors = new Map([...result.anchors, ['Terminal', terminal], ['CoolingVent', cooling], ['PlasmaTubes', plasma], ...vents.map(v => [v.name, v] as const), ...result.dishes.map(d => [d.name, d] as const)]);
    result.animatedParts = new Map(result.dishes.map(d => [d.name, d]));
    model.scene.traverse(o => { if (o instanceof THREE.Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => (result.materials as Set<THREE.Material>).add(m)); });
    let disposed = false; const previous = result.dispose;
    result.dispose = () => { if (disposed) return; disposed = true; this.disposeModel(model.scene); model.scene.removeFromParent(); previous(); }; return true;
  }
  private disposeModel(root: THREE.Object3D): void {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    root.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.dispose(); if (o instanceof THREE.InstancedMesh) o.dispose();
      if (o instanceof THREE.Mesh) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); } });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  }
}
