import * as THREE from 'three';
import { VEHICLE_WHEEL_RADIUS_M, VEHICLE_WHEEL_REST_LENGTH_M } from '../../shared/constants.js';
import type { VehicleBinarySnapshotState } from '../../shared/protocol/binaryProtocol.js';
import type { VehicleDamageState } from '../../shared/protocol/vehicleDamageProtocol.js';
import { VEHICLE_COLLISION_SHAPES, VEHICLE_PANELS, VEHICLE_WHEEL_MOUNTS, VehiclePanelId } from '../../shared/vehicles/vehicleDefinition.js';
import { productionAssets } from '../assets/productionAssets.js';
import { stylizePBR } from '../shaders/factionPalette.js';
import { BuilderResourcePool, type BuilderResourceScope, type BuilderResult } from './builderContract.js';

export interface VehicleWheelVisual { suspension: THREE.Object3D; steering: THREE.Object3D; axle: THREE.Object3D }
export interface VehicleBuildResult extends BuilderResult {
  wheels: VehicleWheelVisual[];
  panels: Map<VehiclePanelId, THREE.Object3D>;
  thruster: THREE.Object3D;
  updateVehicle(snapshot: VehicleBinarySnapshotState, damage: VehicleDamageState | undefined, dt: number): void;
}

/** Cross-section loft with chamfered shoulders. Wheel stations lift the lower sill into wheel wells. */
function loft(sections: { z: number; width: number; bottom: number; top: number }[]): THREE.BufferGeometry {
  const positions: number[] = [], indices: number[] = [];
  for (const s of sections) positions.push(-s.width, s.bottom, s.z, s.width, s.bottom, s.z, s.width * 0.93, s.top, s.z, -s.width * 0.93, s.top, s.z);
  for (let i = 0; i < sections.length - 1; i++) for (let side = 0; side < 4; side++) {
    const a = i * 4 + side, b = i * 4 + (side + 1) % 4, c = b + 4, d = a + 4; indices.push(a, b, c, a, c, d);
  }
  indices.push(0, 2, 1, 0, 3, 2); const n = positions.length / 3 - 4; indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}
function glassQuad(points: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); g.setIndex([0, 2, 1, 0, 3, 2]); g.computeVertexNormals(); return g;
}

export class VehicleBuilder {
  public readonly resources = new BuilderResourcePool();
  private serial = 0;
  private readonly attempted = new WeakMap<VehicleBuildResult, object>();
  private readonly imported = new WeakMap<VehicleBuildResult, THREE.Object3D>();
  /** Batch repeated rigid hardware inside one independently animated component. */
  private batchStaticDetails(root: THREE.Group): void {
    const groups = new Map<THREE.BufferGeometry, Map<THREE.Material, THREE.Mesh[]>>();
    for (const child of root.children) if (child instanceof THREE.Mesh && !(child instanceof THREE.InstancedMesh) && !Array.isArray(child.material) &&
      !['LeftHeadlight', 'RightHeadlight', 'UnderglowRail', 'FullWidthTailLightBar', 'ScorchedChassis', 'WallThrusterPlume'].includes(child.name)) {
      let byMaterial = groups.get(child.geometry); if (!byMaterial) { byMaterial = new Map(); groups.set(child.geometry, byMaterial); }
      const list = byMaterial.get(child.material) ?? []; list.push(child); byMaterial.set(child.material, list);
    }
    for (const byMaterial of groups.values()) for (const meshes of byMaterial.values()) if (meshes.length > 1) {
      const batch = new THREE.InstancedMesh(meshes[0].geometry, meshes[0].material, meshes.length); batch.name = 'BatchedRigidHardware'; batch.castShadow = batch.receiveShadow = true;
      meshes.forEach((mesh, i) => {
        mesh.updateMatrix(); batch.setMatrixAt(i, mesh.matrix);
        const anchor = new THREE.Group(); anchor.name = mesh.name; anchor.position.copy(mesh.position); anchor.quaternion.copy(mesh.quaternion); anchor.scale.copy(mesh.scale);
        root.remove(mesh); root.add(anchor);
      }); root.add(batch);
    }
  }
  private material(scope: BuilderResourceScope, key: string, color: number, emissive = false): THREE.MeshStandardMaterial {
    return scope.get(`vehicle:material:${key}`, () => stylizePBR(new THREE.MeshStandardMaterial({ color, metalness: 0.65, roughness: emissive ? 0.22 : 0.4,
      emissive: emissive ? color : 0, emissiveIntensity: emissive ? 1.5 : 0 })));
  }
  private panel(scope: BuilderResourceScope, id: VehiclePanelId, interceptor: boolean): THREE.Group {
    const group = new THREE.Group(); group.name = VEHICLE_PANELS[id].name;
    const body = this.material(scope, interceptor ? 'ceramic' : 'corten', interceptor ? 0xb3c5d0 : 0x81543c);
    const steel = this.material(scope, 'steel', 0x253746), trim = this.material(scope, interceptor ? 'cyan' : 'amber', interceptor ? 0x24d7ff : 0xffa128, true);
    const unit = scope.get('vehicle:unit', () => new THREE.BoxGeometry(1, 1, 1));
    const add = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], scale?: [number, number, number]) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.set(...position); if (scale) mesh.scale.set(...scale); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh;
    };
    if (id === VehiclePanelId.HOOD || id === VehiclePanelId.TRUNK) {
      const s = VEHICLE_PANELS[id];
      add('SculptedPanelSkin', scope.get(`vehicle:panel:${id}`, () => loft([
        { z: -s.halfExtents.z, width: s.halfExtents.x * 0.88, bottom: -s.halfExtents.y, top: s.halfExtents.y * 0.4 },
        { z: s.halfExtents.z, width: s.halfExtents.x, bottom: -s.halfExtents.y, top: s.halfExtents.y },
      ])), body, [0, 0, 0]);
      for (const side of [-1, 1]) add('PanelReinforcementRail', unit, steel, [side * 0.55, -0.07, 0], [0.08, 0.035, s.halfExtents.z * 1.5]);
      add('PanelChargeStrip', unit, trim, [0, s.halfExtents.y + 0.005, 0.05], [0.055, 0.015, s.halfExtents.z * 1.3]);
    } else {
      add('DoorCeramicSkin', unit, body, [0, -0.18, 0], [0.105, 0.44, 1.3]);
      const glass = this.material(scope, 'door-glass', 0x173c52);
      add('DoorWindow', unit, glass, [0, 0.2, -0.02], [0.075, 0.3, 1.15]);
      for (const z of [-0.64, 0.64]) add('DoorPillar', unit, steel, [0, 0.19, z], [0.11, 0.42, 0.06]);
      add('DoorWindowHeader', unit, steel, [0, 0.38, 0], [0.12, 0.045, 1.34]);
      add('DoorHandle', unit, steel, [id === VehiclePanelId.LEFT_DOOR ? -0.07 : 0.07, 0.01, 0.36], [0.045, 0.035, 0.22]);
      add('DoorPoweredTrim', unit, trim, [id === VehiclePanelId.LEFT_DOOR ? -0.057 : 0.057, -0.12, 0], [0.018, 0.035, 1.1]);
    }
    this.batchStaticDetails(group); return group;
  }
  public buildDetachedPanel(panelId: VehiclePanelId, isInterceptor: boolean, source?: VehicleBuildResult): BuilderResult {
    const original = source?.source === 'gltf' ? source.panels.get(panelId) : undefined;
    if (original) {
      const root = new THREE.Group(), part = original.clone(true), materials = new Set<THREE.Material>();
      part.position.set(0, 0, 0); part.quaternion.identity(); part.visible = true; root.add(part);
      root.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry = o.geometry.clone(); o.material = (Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone()); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); } });
      let disposed = false;
      return { root, materials, source: 'gltf', anchors: new Map(), animatedParts: new Map(), collisions: [], update: () => {}, dispose: () => {
        if (disposed) return; disposed = true; root.removeFromParent(); this.disposeModel(root); root.clear();
      } };
    }
    const scope = this.resources.scope(), root = this.panel(scope, panelId, isInterceptor), materials = new Set<THREE.Material>();
    root.userData.entityKind = 'vehicle-panel'; root.traverse(o => { if (o instanceof THREE.Mesh) materials.add(o.material as THREE.Material); });
    let disposed = false;
    return { root, materials, anchors: new Map(), animatedParts: new Map(), collisions: [], source: 'procedural', update: () => {},
      dispose: () => { if (disposed) return; disposed = true; root.removeFromParent(); root.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); }); scope.dispose(); root.clear(); } };
  }
  public build(isInterceptor: boolean): VehicleBuildResult {
    const scope = this.resources.scope(), instanceId = ++this.serial;
    const root = new THREE.Group(); root.name = isInterceptor ? 'AgencyInterceptor' : 'SyndicateCruiser'; root.userData.entityKind = 'vehicle';
    const body = this.material(scope, isInterceptor ? 'ceramic' : 'corten', isInterceptor ? 0xb3c5d0 : 0x81543c), steel = this.material(scope, 'steel', 0x253746);
    const rubber = this.material(scope, 'rubber', 0x0d141b), alloy = this.material(scope, 'alloy', 0x96a8b5), glass = this.material(scope, 'canopy-glass', 0x1b4259);
    const trim = this.material(scope, isInterceptor ? 'cyan' : 'amber', isInterceptor ? 0x24d7ff : 0xffa128, true);
    const headlight = this.material(scope, 'headlights', 0xb9edff, true), brake = this.material(scope, `brake:${instanceId}`, 0xff203b, true);
    const unit = scope.get('vehicle:unit', () => new THREE.BoxGeometry(1, 1, 1));
    const materials = new Set<THREE.Material>(), anchors = new Map<string, THREE.Object3D>(), animatedParts = new Map<string, THREE.Object3D>(), panels = new Map<VehiclePanelId, THREE.Object3D>();
    const add = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], parent: THREE.Object3D = root) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.set(...position); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
    };
    const box = (name: string, size: [number, number, number], position: [number, number, number], material: THREE.Material, parent: THREE.Object3D = root) => {
      const mesh = add(name, unit, material, position, parent); mesh.scale.set(...size); return mesh;
    };
    const hull = scope.get('vehicle:sculpted-chassis', () => loft([
      { z: -2.3, width: 0.83, bottom: -0.2, top: 0.06 }, { z: -1.95, width: 1.03, bottom: -0.22, top: 0.18 },
      { z: -1.55, width: 1.03, bottom: 0.04, top: 0.24 }, { z: -1.15, width: 1.03, bottom: -0.25, top: 0.25 },
      { z: -0.65, width: 1.02, bottom: -0.28, top: 0.25 }, { z: 0.7, width: 1.02, bottom: -0.28, top: 0.25 },
      { z: 1.2, width: 1.03, bottom: -0.23, top: 0.25 }, { z: 1.55, width: 1.03, bottom: 0.04, top: 0.24 },
      { z: 1.95, width: 1, bottom: -0.22, top: 0.2 }, { z: 2.3, width: 0.91, bottom: -0.2, top: 0.05 },
    ]));
    add('SculptedChassis', hull, body, [0, 0, 0]);
    const wreck = add('ScorchedChassis', hull, this.material(scope, 'wreck', 0x242625), [0, 0, 0]); wreck.scale.setScalar(1.004); wreck.visible = false;
    box('CabinFloor', [1.7, 0.12, 1.5], [0, -0.18, 0.05], steel);
    for (const x of [-0.43, 0.43]) {
      box('BucketSeatBase', [0.5, 0.15, 0.45], [x, 0.03, 0.35], rubber);
      box('BucketSeatBack', [0.5, 0.55, 0.12], [x, 0.32, 0.62], rubber).rotation.x = -0.15;
    }
    box('Dashboard', [1.6, 0.16, 0.18], [0, 0.35, -0.65], steel);
    box('CabinRoof', [1.46, 0.11, 0.95], [0, 0.86, 0.1], body);
    add('AngledWindshield', scope.get('vehicle:windshield', () => glassQuad([-0.88, 0.35, -0.83, 0.88, 0.35, -0.83, 0.72, 0.82, -0.37, -0.72, 0.82, -0.37])), glass, [0, 0, 0]);
    add('RearFastbackGlass', scope.get('vehicle:rear-window', () => glassQuad([0.72, 0.82, 0.57, 0.88, 0.32, 1.2, -0.88, 0.32, 1.2, -0.72, 0.82, 0.57])), glass, [0, 0, 0]);
    const strut = (name: string, from: THREE.Vector3, to: THREE.Vector3, width: number, material: THREE.Material) => {
      const midpoint = from.clone().add(to).multiplyScalar(0.5), delta = to.clone().sub(from);
      const part = box(name, [width, delta.length(), width], [midpoint.x, midpoint.y, midpoint.z], material); part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return part;
    };
    for (const side of [-1, 1]) {
      strut(`A_Pillar${side}`, new THREE.Vector3(side * 0.9, 0.32, -0.85), new THREE.Vector3(side * 0.74, 0.85, -0.37), 0.075, body);
      strut(`RearPillar${side}`, new THREE.Vector3(side * 0.74, 0.85, 0.57), new THREE.Vector3(side * 0.9, 0.29, 1.2), 0.095, body);
      box('SideSkirt', [0.1, 0.12, 2.1], [side * 1.02, -0.25, 0], steel);
    }
    const lights: THREE.Object3D[] = [];
    for (const side of [-1, 1]) {
      lights.push(box(side < 0 ? 'LeftHeadlight' : 'RightHeadlight', [0.5, 0.075, 0.04], [side * 0.58, 0.11, -2.29], headlight));
      lights.push(box('UnderglowRail', [0.025, 0.035, 2], [side * 1.065, -0.29, 0], trim));
      box('BumperIntake', [0.35, 0.13, 0.06], [side * 0.56, -0.08, -2.31], rubber);
    }
    box('FullWidthTailLightBar', [1.74, 0.075, 0.05], [0, 0.12, 2.3], brake);
    box('FrontSplitter', [1.86, 0.07, 0.22], [0, -0.22, -2.2], steel);
    box('RearDiffuser', [1.85, 0.08, 0.25], [0, -0.22, 2.2], steel);
    for (const id of [0, 1, 2, 3] as VehiclePanelId[]) {
      const panel = this.panel(scope, id, isInterceptor), spec = VEHICLE_PANELS[id]; panel.position.set(spec.position.x, spec.position.y, spec.position.z); panel.quaternion.set(spec.rotation.x, spec.rotation.y, spec.rotation.z, spec.rotation.w);
      root.add(panel); panels.set(id, panel); anchors.set(spec.name, panel);
    }
    const engineBay = new THREE.Group(); engineBay.name = 'ExposedEngineBay'; root.add(engineBay);
    box('EngineBayTray', [1.5, 0.025, 1.05], [0, 0.267, -1.42], rubber, engineBay);
    for (const x of [-0.45, 0, 0.45]) {
      box('PowerCellHousing', [0.3, 0.12, 0.75], [x, 0.3, -1.42], steel, engineBay);
      box('PowerCellChargeRail', [0.035, 0.015, 0.6], [x, 0.368, -1.42], trim, engineBay);
    }
    this.batchStaticDetails(engineBay); engineBay.visible = false;
    const wheels: VehicleWheelVisual[] = [];
    const tire = scope.get('vehicle:tire', () => { const g = new THREE.CylinderGeometry(VEHICLE_WHEEL_RADIUS_M, VEHICLE_WHEEL_RADIUS_M, 0.28, 24); g.rotateZ(Math.PI / 2); return g; });
    const rim = scope.get('vehicle:rim', () => { const g = new THREE.TorusGeometry(0.25, 0.035, 6, 20); g.rotateY(Math.PI / 2); return g; });
    const arch = scope.get('vehicle:arch', () => { const g = new THREE.TorusGeometry(0.445, 0.055, 6, 24, Math.PI); g.rotateY(Math.PI / 2); return g; });
    for (const mount of VEHICLE_WHEEL_MOUNTS) {
      const suspension = new THREE.Group(); suspension.name = `Wheel${mount.name}`; suspension.position.set(mount.offset.x, -0.55, mount.offset.z); root.add(suspension);
      const steering = new THREE.Group(); steering.name = `Steer${mount.name}`; suspension.add(steering);
      const axle = new THREE.Group(); axle.name = `Axle${mount.name}`; steering.add(axle);
      add('TreadedTire', tire, rubber, [0, 0, 0], axle);
      const side = Math.sign(mount.offset.x);
      add('AlloyRim', rim, alloy, [side * 0.145, 0, 0], axle);
      const spokes = new THREE.InstancedMesh(unit, alloy, 5), pose = new THREE.Object3D(); spokes.name = 'AlloyRimSpokes';
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 2 / 5; pose.position.set(side * 0.16, Math.cos(angle) * 0.12, Math.sin(angle) * 0.12); pose.rotation.x = angle; pose.scale.set(0.035, 0.24, 0.035); pose.updateMatrix(); spokes.setMatrixAt(i, pose.matrix);
      }
      axle.add(spokes);
      const tread = new THREE.InstancedMesh(unit, steel, 24); tread.name = 'IndependentTireTread';
      for (let i = 0; i < 24; i++) {
        const angle = i * Math.PI / 12; pose.position.set(0, Math.cos(angle) * 0.378, Math.sin(angle) * 0.378); pose.rotation.x = angle; pose.scale.set(0.255, 0.016, 0.045); pose.updateMatrix(); tread.setMatrixAt(i, pose.matrix);
      }
      axle.add(tread); box('StationaryBrakeCaliper', [0.09, 0.15, 0.12], [side * 0.17, 0.13, 0.14], brake, steering);
      add(`WheelWell${mount.name}`, arch, body, [side * 1.025, -0.45, mount.offset.z]);
      wheels.push({ suspension, steering, axle }); anchors.set(suspension.name, suspension); animatedParts.set(axle.name, axle);
    }
    const thruster = add('WallThrusterPlume', scope.get('vehicle:thruster', () => { const g = new THREE.ConeGeometry(0.65, 1.2, 12); g.rotateX(Math.PI); return g; }), trim, [0, -0.85, 0]); thruster.visible = false;
    this.batchStaticDetails(root);
    const materialsInScene = () => root.traverse(o => { if (o instanceof THREE.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); }); materialsInScene();
    let disposed = false, phase = 0, generation = -1;
    const updateVehicle = (snapshot: VehicleBinarySnapshotState, damage: VehicleDamageState | undefined, dt: number) => {
      if (disposed) return;
      root.position.set(snapshot.position.x, snapshot.position.y, snapshot.position.z); root.quaternion.set(snapshot.rotation.x, snapshot.rotation.y, snapshot.rotation.z, snapshot.rotation.w);
      if (damage && damage.generation !== generation) { generation = damage.generation; phase = damage.wheelAngle; }
      phase += snapshot.speedMps * Math.min(0.1, Math.max(0, dt)) / VEHICLE_WHEEL_RADIUS_M;
      for (const [i, wheel] of wheels.entries()) {
        const mount = VEHICLE_WHEEL_MOUNTS[i]; wheel.suspension.position.y = mount.offset.y - VEHICLE_WHEEL_REST_LENGTH_M * (1 - snapshot.wheelCompressionRatio[i]);
        wheel.steering.rotation.y = i < 2 ? snapshot.steerAngleRad : 0; wheel.axle.rotation.x = phase;
      }
      for (const [id, panel] of panels) panel.visible = !((damage?.detachedMask ?? 0) & (1 << id));
      engineBay.visible = !!((damage?.detachedMask ?? 0) & 1);
      wreck.visible = damage?.destroyed ?? false; lights.forEach(light => light.visible = !damage?.destroyed);
      brake.emissiveIntensity = damage?.destroyed ? 0 : damage?.braking ? 4 : 0.65;
      thruster.visible = snapshot.wallThrusterActive && !damage?.destroyed;
      const imported = this.imported.get(result);
      if (imported) {
        imported.getObjectByName('WallThrusterPlume')!.visible = thruster.visible;
        const tail = imported.getObjectByName('FullWidthTailLightBar') as THREE.Mesh;
        for (const material of Array.isArray(tail.material) ? tail.material : [tail.material]) if (material instanceof THREE.MeshStandardMaterial) material.emissiveIntensity = brake.emissiveIntensity;
        for (const name of ['LeftHeadlight', 'RightHeadlight']) { const light = imported.getObjectByName(name); if (light) light.visible = !damage?.destroyed; }
      }
    };
    const result: VehicleBuildResult = { root, wheels, panels, thruster, anchors, animatedParts, materials, source: 'procedural', updateVehicle, update: () => {},
      collisions: VEHICLE_COLLISION_SHAPES.map(s => ({ id: `vehicle_${s.name}`, center: { ...s.position }, halfExtents: { ...s.halfExtents }, material: 'obsidian_steel', isSensorOnly: true })),
      dispose: () => { if (disposed) return; disposed = true; root.removeFromParent(); root.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); }); scope.dispose(); root.clear(); } };
    this.attachModel(result, isInterceptor); return result;
  }

  public attachModel(result: VehicleBuildResult, interceptor: boolean): boolean {
    if (result.source === 'gltf') return true;
    const name = interceptor ? 'interceptor' : 'syndicate-cruiser', template = productionAssets.models.get(`vehicle:${name}`);
    if (!template || this.attempted.get(result) === template) return false;
    this.attempted.set(result, template);
    const model = productionAssets.createModel('vehicle', name); if (!model) return false;
    const dispose = () => this.disposeModel(model.scene);
    if (model.scene.position.length() > 0.001 || model.scene.quaternion.angleTo(new THREE.Quaternion()) > 0.001 || model.scene.scale.distanceTo(new THREE.Vector3(1, 1, 1)) > 0.001 ||
      !(model.scene.getObjectByName('FullWidthTailLightBar') instanceof THREE.Mesh) || !model.scene.getObjectByName('WallThrusterPlume') || !model.scene.getObjectByName('LeftHeadlight') || !model.scene.getObjectByName('RightHeadlight')) { dispose(); return false; }
    model.scene.updateMatrixWorld(true);
    const importedWheels: VehicleWheelVisual[] = [];
    for (const mount of VEHICLE_WHEEL_MOUNTS) {
      const suspension = model.scene.getObjectByName(`Wheel${mount.name}`), steering = model.scene.getObjectByName(`Steer${mount.name}`), axle = model.scene.getObjectByName(`Axle${mount.name}`);
      if (!suspension || !steering || !axle || suspension.parent !== model.scene || steering.parent !== suspension || axle.parent !== steering || Math.abs(suspension.position.x - mount.offset.x) > 0.05 || Math.abs(suspension.position.z - mount.offset.z) > 0.05 || suspension.quaternion.angleTo(new THREE.Quaternion()) > 0.001) { dispose(); return false; }
      importedWheels.push({ suspension, steering, axle });
    }
    const importedPanels = new Map<VehiclePanelId, THREE.Object3D>();
    for (const id of [0, 1, 2, 3] as VehiclePanelId[]) {
      const part = model.scene.getObjectByName(VEHICLE_PANELS[id].name), spec = VEHICLE_PANELS[id];
      if (!part || part.parent !== model.scene || part.scale.distanceTo(new THREE.Vector3(1, 1, 1)) > 0.001 || part.quaternion.angleTo(new THREE.Quaternion(spec.rotation.x, spec.rotation.y, spec.rotation.z, spec.rotation.w)) > 0.01 || part.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(spec.position.x, spec.position.y, spec.position.z)) > 0.05) { dispose(); return false; }
      importedPanels.set(id, part);
    }
    const bounds = new THREE.Box3(); model.scene.traverseVisible(o => { if (o instanceof THREE.Mesh) bounds.expandByObject(o); });
    if (bounds.min.x < -1.5 || bounds.max.x > 1.5 || bounds.min.z < -2.7 || bounds.max.z > 2.7 || bounds.max.y > 1.4 || bounds.min.y < -1.25) { dispose(); return false; }
    const fallback = new THREE.Group(); fallback.name = 'ProceduralVehicleFallback'; for (const child of [...result.root.children]) fallback.add(child);
    fallback.visible = false; result.root.add(fallback, model.scene); result.wheels.splice(0, 4, ...importedWheels); result.panels.clear(); for (const [id, panel] of importedPanels) result.panels.set(id, panel);
    this.imported.set(result, model.scene);
    result.thruster = model.scene.getObjectByName('WallThrusterPlume')!;
    result.anchors = new Map([...result.anchors, ...importedWheels.map((w, i) => [`Wheel${VEHICLE_WHEEL_MOUNTS[i].name}`, w.suspension] as const), ...[...importedPanels].map(([id, part]) => [VEHICLE_PANELS[id].name, part] as const)]);
    result.animatedParts = new Map(importedWheels.map((w, i) => [`Axle${VEHICLE_WHEEL_MOUNTS[i].name}`, w.axle]));
    model.scene.traverse(o => { if (o instanceof THREE.Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => (result.materials as Set<THREE.Material>).add(m)); });
    result.source = 'gltf'; let disposed = false; const previousDispose = result.dispose;
    result.dispose = () => { if (disposed) return; disposed = true; dispose(); model.scene.removeFromParent(); previousDispose(); }; return true;
  }
  private disposeModel(root: THREE.Object3D): void {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    root.traverse(o => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.dispose();
      if (o instanceof THREE.InstancedMesh) o.dispose();
      if (o instanceof THREE.Mesh) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); }
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  }
}
