import * as THREE from 'three';
import { DistrictId } from '../../shared/constants.js';
import type { ArchitecturePlan } from '../../shared/world/architecture.js';
import type { WorldBoxStructure } from '../../shared/world/neoVeridiaBlock.js';
import { createInteriorMaterial } from '../shaders/interiorMapping.js';
import { stylizePBR } from '../shaders/factionPalette.js';
import { BuilderResourcePool, type BuilderResult, type BuilderResourceScope } from './builderContract.js';
import { productionAssets } from '../assets/productionAssets.js';

const STYLES = {
  [DistrictId.NEON_DOCKS]: { facade: 0x3d6572, podium: 0x4a5258, steel: 0x23343d, trim: 0x35dce4, room: 0x91d8d3 },
  [DistrictId.FOUNDRY_SLUMS]: { facade: 0x67564a, podium: 0x45443f, steel: 0x362c27, trim: 0xffa535, room: 0xffc58a },
  [DistrictId.HELIOS_SPIRE]: { facade: 0x294e67, podium: 0x374c5a, steel: 0x122c3c, trim: 0x42d4ff, room: 0xa9d7f2 },
  [DistrictId.AEGIS_CITADEL]: { facade: 0x303c4d, podium: 0xa8b8c2, steel: 0x273340, trim: 0x408dff, room: 0xd3e3fc },
};

function signTexture(text: string, color: number): THREE.Texture {
  if (typeof document === 'undefined') {
    const data = new Uint8Array([25, 180, 230, 255]);
    const texture = new THREE.DataTexture(data, 1, 1); texture.needsUpdate = true; return texture;
  }
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 768;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#08141e'; ctx.fillRect(0, 0, 128, 768);
  ctx.strokeStyle = `#${color.toString(16).padStart(6, '0')}`; ctx.lineWidth = 4; ctx.strokeRect(7, 7, 114, 754);
  ctx.fillStyle = ctx.strokeStyle; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 12;
  ctx.font = 'bold 56px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const letters = text.replaceAll(' ', '').slice(0, 9);
  [...letters].forEach((letter, i) => ctx.fillText(letter, 64, 70 + i * 68));
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

export class ArchBuilder {
  public readonly resources = new BuilderResourcePool();
  /** Asset coordinates are meters with the same ground origin as the shared building plan. */
  public attachModel(result: BuilderResult, plan: ArchitecturePlan): boolean {
    if (result.source === 'gltf') return true;
    const model = productionAssets.createModel('building', plan.id); if (!model) return false;
    model.scene.updateMatrixWorld(true);
    const valid = ['Entrance', 'RoofEntry', 'Helipad'].every(name => {
      const anchor = model.scene.getObjectByName(name); if (!anchor) return false;
      const expected = plan.anchors[name], actual = anchor.getWorldPosition(new THREE.Vector3());
      return actual.distanceTo(new THREE.Vector3(expected.x, expected.y, expected.z)) < 0.25;
    });
    const disposeModel = () => model.scene.traverse(o => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.dispose();
      if (o instanceof THREE.Mesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); }
    });
    const bounds = new THREE.Box3().setFromObject(model.scene), size = bounds.getSize(new THREE.Vector3());
    const requiredBounds = new THREE.Box3();
    for (const part of result.collisions) requiredBounds.union(new THREE.Box3(
      new THREE.Vector3(part.center.x - plan.origin.x - part.halfExtents.x, part.center.y - part.halfExtents.y, part.center.z - plan.origin.z - part.halfExtents.z),
      new THREE.Vector3(part.center.x - plan.origin.x + part.halfExtents.x, part.center.y + part.halfExtents.y, part.center.z - plan.origin.z + part.halfExtents.z)));
    const coversFootprint = bounds.min.x <= requiredBounds.min.x + 0.5 && bounds.max.x >= requiredBounds.max.x - 0.5 && bounds.min.z <= requiredBounds.min.z + 0.5 && bounds.max.z >= requiredBounds.max.z - 0.5;
    if (!valid || !coversFootprint || Math.abs(bounds.min.y) > 0.25 || Math.abs(size.y - plan.height) > 10) { disposeModel(); return false; }
    const fallback = new THREE.Group(); fallback.name = 'ProceduralArchitectureFallback';
    for (const child of [...result.root.children]) if (!(result.anchors.has(child.name))) fallback.add(child);
    fallback.visible = false; result.root.add(fallback, model.scene); result.source = 'gltf';
    const originalUpdate = result.update, originalDispose = result.dispose;
    const mixer = new THREE.AnimationMixer(model.scene); for (const clip of model.animations) mixer.clipAction(clip).play();
    result.update = (dt, camera) => { originalUpdate(dt, camera); mixer.update(Math.min(0.25, Math.max(0, dt))); };
    let disposed = false;
    result.dispose = () => { if (disposed) return; disposed = true; mixer.stopAllAction(); mixer.uncacheRoot(model.scene); disposeModel(); originalDispose(); };
    return true;
  }
  public build(plan: ArchitecturePlan): BuilderResult {
    const scope = this.resources.scope(), palette = STYLES[plan.district];
    const root = new THREE.Group(); root.name = `ArchBuilder_${plan.id}`; root.position.set(plan.origin.x, 0, plan.origin.z);
    root.userData.entityKind = 'building'; root.userData.buildingId = plan.id; root.userData.district = plan.district;
    const materials = new Set<THREE.Material>(), anchors = new Map<string, THREE.Object3D>(), animatedParts = new Map<string, THREE.Object3D>();
    const windows = new THREE.Group(); windows.name = 'InteriorWindowBays'; root.add(windows);
    const details = new THREE.Group(); details.name = 'RooftopAndStreetDetail'; root.add(details);
    const structural = new THREE.Group(); structural.name = 'ColliderMatchedStructure'; root.add(structural);
    const standard = (role: string, color: number, roughness = 0.65, metalness = 0.3, emissive = false) => {
      const material = scope.get(`mat:${plan.district}:${role}`, () => stylizePBR(new THREE.MeshStandardMaterial({ color, roughness, metalness,
        emissive: emissive ? color : 0, emissiveIntensity: emissive ? 1.1 : 0 })));
      materials.add(material); return material;
    };
    const facade = standard('facade', palette.facade, 0.48, 0.4), podium = standard('podium', palette.podium, 0.8, 0.15);
    const steel = standard('steel', palette.steel, 0.42, 0.75), trim = standard('trim', palette.trim, 0.3, 0.4, true);
    const ceramic = standard('ceramic', plan.district === DistrictId.AEGIS_CITADEL ? 0xc5d2db : 0x81939f, 0.6, 0.25);
    const unitBox = scope.get('geo:unit-box', () => new THREE.BoxGeometry(1, 1, 1));
    const boxes: Array<{ part: WorldBoxStructure; material: THREE.MeshStandardMaterial }> = [...plan.members, ...plan.additions].map(part => ({ part,
      material: part.material === 'ledge_trim' || part.id.includes('parapet') ? ceramic : part.id.endsWith('_podium') || part.id.endsWith('_pier') ? podium
        : part.material === 'industrial_grate' || part.material === 'obsidian_steel' && !part.id.includes('shaft') ? steel : facade }));
    for (const material of [facade, podium, steel, ceramic]) {
      const batch = boxes.filter(b => b.material === material); if (!batch.length) continue;
      const mesh = new THREE.InstancedMesh(unitBox, material, batch.length); mesh.name = `${material === ceramic ? 'ParkourLedgesAndParapets' : 'BuildingMassAndHardware'}`;
      const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion();
      for (const [i, { part }] of batch.entries()) {
        rotation.setFromEuler(new THREE.Euler(part.rotation?.x ?? 0, part.rotation?.y ?? 0, part.rotation?.z ?? 0));
        matrix.compose(new THREE.Vector3(part.center.x - plan.origin.x, part.center.y, part.center.z - plan.origin.z), rotation,
          new THREE.Vector3(part.halfExtents.x * 2, part.halfExtents.y * 2, part.halfExtents.z * 2)); mesh.setMatrixAt(i, matrix);
      }
      mesh.castShadow = mesh.receiveShadow = true; mesh.userData.collisionIds = batch.map(b => b.part.id); structural.add(mesh);
    }
    // Additional facade columns and rim lights are batched separately from collision-bearing geometry.
    const columnTransforms: THREE.Matrix4[] = [], trimTransforms: THREE.Matrix4[] = [];
    const transform = (x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(sx, sy, sz));
    for (const section of plan.members.filter(p => /_(lower_shaft|upper_shaft|core|shaft|mast)$/.test(p.id))) {
      const width = section.halfExtents.x * 2, depth = section.halfExtents.z * 2;
      const minY = Math.max(plan.podiumHeight, section.center.y - section.halfExtents.y), maxY = section.center.y + section.halfExtents.y;
      if (maxY <= minY) continue;
      for (const x of [-1, 1]) for (const z of [-1, 1]) {
        columnTransforms.push(transform(x * (width / 2 - 0.22), (minY + maxY) / 2, z * (depth / 2 - 0.22), 0.45, maxY - minY, 0.45));
        trimTransforms.push(transform(x * (width / 2 + 0.025), (minY + maxY) / 2, z * (depth / 2 - 0.5), 0.05, maxY - minY, 0.08));
      }
      this.addWindows(scope, windows, materials, plan, width, depth, minY, maxY, palette.room);
    }
    const batchDecoration = (name: string, transforms: THREE.Matrix4[], material: THREE.Material, parent = root) => {
      const batch = new THREE.InstancedMesh(unitBox, material, transforms.length); batch.name = name;
      transforms.forEach((m, i) => batch.setMatrixAt(i, m)); batch.castShadow = batch.receiveShadow = true; parent.add(batch); return batch;
    };
    batchDecoration('StructuralCornerColumns', columnTransforms, ceramic);
    batchDecoration('VerticalEmissiveRails', trimTransforms, trim);
    for (const [name, position] of Object.entries(plan.anchors)) {
      const anchor = new THREE.Object3D(); anchor.name = name; anchor.position.set(position.x, position.y, position.z); root.add(anchor); anchors.set(name, anchor);
    }
    const addMesh = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, position: THREE.Vector3, parent = details) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.copy(position); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
    };
    const box = (name: string, size: [number, number, number], position: [number, number, number], material = steel, parent = details) => {
      const mesh = addMesh(name, unitBox, material, new THREE.Vector3(...position), parent); mesh.scale.set(...size); return mesh;
    };
    const front = plan.members.find(p => p.id.endsWith('_podium') || p.id.endsWith('_pier'))!.halfExtents.z;
    const baseWidth = plan.members.find(p => p.id.endsWith('_podium') || p.id.endsWith('_pier'))!.halfExtents.x * 2;
    if (plan.podiumHeight > 7) this.addWindows(scope, windows, materials, plan, baseWidth, front * 2, 6.2, plan.podiumHeight - 0.8, palette.room);
    // Glazed storefront behind the external colonnade and awning, with a deep illuminated vestibule reveal.
    const glazing = standard('storefront', 0x294b60, 0.18, 0.7);
    box('RecessedLobbyGlazing', [8, 4.8, 0.12], [0, 2.5, -front - 0.06], glazing);
    const lobbyFrames = [-4, 0, 4].map(x => transform(x, 2.5, -front - 0.15, 0.12, 5, 0.16));
    batchDecoration('LobbyDoorMullions', lobbyFrames, ceramic, details);
    box('LobbyTransomLight', [8.2, 0.12, 0.14], [0, 5, -front - 0.16], trim);
    box('AwningEdgeLight', [12, 0.08, 0.08], [0, 5.5, -front - 3.2], trim);
    for (const x of [-7.2, 7.2]) {
      box('StorefrontGlass', [4, 3.2, 0.08], [x, 2.4, -front - 0.05], glazing);
      box('StorefrontCanopy', [4.5, 0.12, 1.3], [x, 4.3, -front - 0.55], ceramic);
    }
    // Solar helipad, landing H, and rooftop mechanical fans.
    const roofHalf = Math.max(3, plan.upperHalfWidth - 1), padRadius = Math.min(roofHalf * 0.6, 6.5);
    const helipad = addMesh('HelipadRing', scope.get(`geo:helipad:${padRadius}`, () => new THREE.RingGeometry(padRadius * 0.89, padRadius, 48)), trim,
      new THREE.Vector3(0, plan.height + 0.025, 0)); helipad.rotation.x = -Math.PI / 2;
    const hHeight = padRadius * 0.9, hWidth = padRadius * 0.65;
    box('HelipadHLeft', [0.17, 0.025, hHeight], [-hWidth / 2, plan.height + 0.03, 0], ceramic);
    box('HelipadHRight', [0.17, 0.025, hHeight], [hWidth / 2, plan.height + 0.03, 0], ceramic);
    box('HelipadHBar', [hWidth, 0.025, 0.17], [0, plan.height + 0.03, 0], ceramic);
    const fanRing = scope.get('geo:fan-ring', () => new THREE.TorusGeometry(0.85, 0.07, 6, 24));
    for (const [i, body] of plan.additions.filter(p => p.id.includes('roof_hvac')).entries()) {
      const position = new THREE.Vector3(body.center.x - plan.origin.x, body.center.y + body.halfExtents.y + 0.07, body.center.z - plan.origin.z);
      const grill = addMesh(`HVACFanGrille${i}`, fanRing, ceramic, position); grill.rotation.x = -Math.PI / 2;
      const rotor = new THREE.Group(); rotor.name = `HVACRotor${i}`; rotor.position.copy(position); details.add(rotor); animatedParts.set(rotor.name, rotor);
      for (let blade = 0; blade < 4; blade++) { const m = box('FanBlade', [1.5, 0.06, 0.15], [0, 0, 0], steel, rotor); m.rotation.y = blade * Math.PI / 4; }
      const vents = Array.from({ length: 6 }, (_, n) => transform(position.x, position.y - 0.55, position.z - 1.62, 2.2, 0.06, 0.08).setPosition(position.x, position.y - 0.2 - n * 0.16, position.z - 1.62));
      batchDecoration(`HVACVentLouvers${i}`, vents, ceramic, details);
    }
    const antenna = plan.anchors.Antenna;
    box('AntennaMast', [0.14, 5.5, 0.14], [antenna.x, plan.height + 2.75, antenna.z], ceramic);
    for (const y of [1.5, 3.1, 4.6]) box('AntennaCrossArm', [2.4 - y * 0.2, 0.08, 0.1], [antenna.x, plan.height + y, antenna.z], steel);
    addMesh('AntennaBeacon', scope.get('geo:beacon', () => new THREE.IcosahedronGeometry(0.16, 1)), trim, new THREE.Vector3(antenna.x, plan.height + 5.65, antenna.z));
    this.addDistrictCrown(plan, scope, box, addMesh, steel, ceramic, trim);
    // Vertical signage is attached beside a structural column, not floating in front of windows.
    const sign = plan.anchors.Sign;
    box('NeonSignHousing', [1.1, 12, 0.35], [sign.x, sign.y, sign.z], steel);
    const map = scope.get(`texture:sign:${plan.sign}`, () => signTexture(plan.sign, palette.trim));
    const signMat = scope.get(`mat:sign:${plan.sign}`, () => new THREE.MeshBasicMaterial({ map })); materials.add(signMat);
    const signFace = addMesh('VerticalNeonSign', scope.get('geo:sign-plane', () => new THREE.PlaneGeometry(1, 11.8)), signMat, new THREE.Vector3(sign.x, sign.y, sign.z - 0.19)); signFace.rotation.y = Math.PI;
    let disposed = false, elapsed = 0;
    const update = (dt: number, cameraPosition?: THREE.Vector3) => {
      if (disposed) return; elapsed += Math.max(0, Math.min(dt, 0.25));
      const distance = cameraPosition ? Math.hypot(cameraPosition.x - plan.origin.x, cameraPosition.z - plan.origin.z) : 0;
      details.visible = distance < 320; windows.visible = distance < 650;
      if (details.visible) for (const rotor of animatedParts.values()) rotor.rotation.y = elapsed * 7;
    };
    return { root, anchors, animatedParts, materials, collisions: [...plan.members, ...plan.additions], source: 'procedural', update,
      dispose: () => { if (disposed) return; disposed = true; root.removeFromParent(); root.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); }); scope.dispose(); root.clear(); } };
  }

  private addWindows(scope: BuilderResourceScope, parent: THREE.Group, materials: Set<THREE.Material>, plan: ArchitecturePlan, width: number, depth: number, bottom: number, top: number, tint: number): void {
    const rows = Math.max(1, Math.floor((top - bottom - 1) / 4)), colsX = Math.max(1, Math.floor((width - 1) / 2.7)), colsZ = Math.max(1, Math.floor((depth - 1) / 2.7));
    const material = scope.get(`mat:interior:${plan.district}`, () => createInteriorMaterial(tint)); materials.add(material);
    const mesh = new THREE.InstancedMesh(scope.get('geo:window', () => new THREE.PlaneGeometry(1, 1)), material, rows * (colsX + colsZ) * 2); mesh.name = 'ParallaxOfficeRooms';
    const pose = new THREE.Object3D(); let index = 0;
    for (let row = 0; row < rows; row++) for (let face = 0; face < 4; face++) {
      const cols = face % 2 === 0 ? colsX : colsZ, span = face % 2 === 0 ? width : depth;
      for (let col = 0; col < cols; col++) {
        const across = (col + 0.5) * (span - 1) / cols - (span - 1) / 2, y = bottom + (row + 0.5) * (top - bottom) / rows;
        pose.position.set(face % 2 === 0 ? across : (face === 1 ? 1 : -1) * (width / 2 + 0.015), y,
          face % 2 === 0 ? (face === 0 ? -1 : 1) * (depth / 2 + 0.015) : across);
        pose.rotation.set(0, face === 0 ? Math.PI : face === 1 ? Math.PI / 2 : face === 2 ? 0 : -Math.PI / 2, 0);
        pose.scale.set((span - 1) / cols * 0.82, Math.min(2.8, (top - bottom) / rows * 0.72), 1); pose.updateMatrix(); mesh.setMatrixAt(index++, pose.matrix);
      }
    }
    parent.add(mesh);
  }

  private addDistrictCrown(plan: ArchitecturePlan, scope: BuilderResourceScope,
    box: (name: string, size: [number, number, number], position: [number, number, number], material?: THREE.MeshStandardMaterial) => THREE.Mesh,
    mesh: (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, position: THREE.Vector3) => THREE.Mesh,
    steel: THREE.MeshStandardMaterial, ceramic: THREE.MeshStandardMaterial, trim: THREE.MeshStandardMaterial): void {
    const h = plan.height, hw = plan.upperHalfWidth;
    if (plan.district === DistrictId.NEON_DOCKS || plan.district === DistrictId.FOUNDRY_SLUMS) {
      const boom = plan.members.find(p => p.id.endsWith('_boom')), cargo = plan.members.find(p => p.id.endsWith('_suspended_cargo'));
      if (boom && cargo) {
        const bottom = cargo.center.y + cargo.halfExtents.y, top = boom.center.y - boom.halfExtents.y;
        for (const x of [-1, 1]) for (const z of [-1, 1]) {
          const cable = mesh('CargoSuspensionCable', scope.get('geo:cargo-cable', () => new THREE.CylinderGeometry(0.045, 0.045, 1, 6)), ceramic,
            new THREE.Vector3(cargo.center.x - plan.origin.x + x * 5, (bottom + top) / 2, cargo.center.z - plan.origin.z + z * 2.8)); cable.scale.y = Math.max(0.1, top - bottom);
        }
      }
      const tank = mesh('RooftopWaterTank', scope.get('geo:water-tank', () => new THREE.CylinderGeometry(1.15, 1.15, 2.6, 12)), steel, new THREE.Vector3(hw * 0.72, h + 2.4, hw * 0.72));
      mesh('WaterTankCap', scope.get('geo:tank-cap', () => new THREE.ConeGeometry(1.27, 0.7, 12)), ceramic, new THREE.Vector3(tank.position.x, h + 4.05, tank.position.z));
      for (const side of [-1, 1]) box('WaterTankStilt', [0.12, 1.2, 0.12], [tank.position.x + side * 0.7, h + 0.6, tank.position.z], steel);
      if (plan.district === DistrictId.FOUNDRY_SLUMS) for (const side of [-1, 1]) {
        const pipe = mesh('FoundryExhaustStack', scope.get('geo:foundry-exhaust', () => new THREE.CylinderGeometry(0.7, 1, 6, 12)), steel, new THREE.Vector3(side * hw * 0.8, h + 3, -hw * 0.7));
        mesh('ExhaustHazardRim', scope.get('geo:exhaust-rim', () => new THREE.TorusGeometry(0.72, 0.14, 6, 16)), trim, new THREE.Vector3(pipe.position.x, h + 5.9, pipe.position.z)).rotation.x = Math.PI / 2;
      }
    } else if (plan.district === DistrictId.HELIOS_SPIRE) {
      for (const side of [-1, 1]) { const fin = box('HeliosCrownFin', [0.3, 5, 3], [side * hw * 0.7, h + 2.5, 0], ceramic); fin.rotation.z = -side * 0.18; }
      mesh('HeliosTelemetrySpire', scope.get('geo:helios-spire', () => new THREE.ConeGeometry(0.55, 7, 6)), trim, new THREE.Vector3(0, h + 3.5, -hw * 0.6));
    } else {
      for (const x of [-1, 1]) for (const z of [-1, 1]) {
        box('AegisCrownButtress', [1.2, 3.2, 1.2], [x * hw * 0.8, h + 1.6, z * hw * 0.8], ceramic);
        box('AegisCrownBeacon', [1.25, 0.15, 1.25], [x * hw * 0.8, h + 3.2, z * hw * 0.8], trim);
      }
    }
  }
}
