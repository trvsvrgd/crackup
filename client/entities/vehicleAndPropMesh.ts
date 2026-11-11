/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Phase 4 3D Client Visualizers:
 * - Articulated 4-Wheel Suspension Vehicles (with per-wheel suspension travel & steering)
 * - 5-Tier Dynamic 3D Physics Props (85kg Cryo-Barrel -> 3400kg APC Chassis)
 * - 4 Physical 3D Prototype Relics with Sky-Beacons
 * - 3D Grapple-Hook Pendulum Tether Beam
 */

import * as THREE from 'three';
import { VehicleBuilder, type VehicleBuildResult } from '../builders/VehicleBuilder.js';
import type { BuilderResult } from '../builders/builderContract.js';
import type { VehicleDamagePacket } from '../../shared/protocol/vehicleDamageProtocol.js';
import { productionAssets } from '../assets/productionAssets.js';
import { DynamicPropType } from '../../shared/constants.js';
import { PROTOTYPE_RELIC_SPECS } from '../../shared/progression/skillTreeSystem.js';
import {
  DynamicPropBinarySnapshotState,
  Vec3,
  VehicleBinarySnapshotState,
} from '../../shared/protocol/binaryProtocol.js';

export class ClientVehiclePropRenderer {
  public readonly rootGroup = new THREE.Group();
  private readonly vehicleBuilder = new VehicleBuilder();
  private readonly vehicleGroups = new Map<number, VehicleBuildResult>();
  private readonly debrisGroups = new Map<number, BuilderResult>();
  private lastVehicleTime = 0;

  private readonly propGroups: Map<number, THREE.Group> = new Map();
  private readonly relicGroups: Map<string, THREE.Group> = new Map();

  private readonly grappleLine: THREE.Line;
  private readonly grappleAnchorSphere: THREE.Mesh;

  constructor() {
    this.rootGroup.name = 'Phase4VehiclesPropsRelics';

    // Initialize 3D Grapple-Hook Tether Line & Anchor Point
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1, 0),
    ]);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00f2ff,
      linewidth: 2,
    });
    this.grappleLine = new THREE.Line(lineGeo, lineMat);
    this.grappleLine.visible = false;
    this.rootGroup.add(this.grappleLine);

    const anchorGeo = new THREE.OctahedronGeometry(0.28, 1);
    const anchorMat = new THREE.MeshBasicMaterial({
      color: 0x00f2ff,
      wireframe: true,
    });
    this.grappleAnchorSphere = new THREE.Mesh(anchorGeo, anchorMat);
    this.grappleAnchorSphere.visible = false;
    this.rootGroup.add(this.grappleAnchorSphere);

    this.buildPrototypeRelicMeshes();
  }

  private buildPrototypeRelicMeshes(): void {
    for (const spec of PROTOTYPE_RELIC_SPECS) {
      const g = new THREE.Group();
      g.position.set(spec.position.x, spec.position.y, spec.position.z);

      const coreGeo = new THREE.OctahedronGeometry(0.65, 1);
      const coreMat = new THREE.MeshStandardMaterial({
        color: spec.colorHex,
        emissive: spec.colorHex,
        emissiveIntensity: 1.8,
        metalness: 0.8,
        roughness: 0.2,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.name = 'relicCore';
      g.add(coreMesh);

      const ringGeo = new THREE.TorusGeometry(0.95, 0.06, 8, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.name = 'relicRing';
      g.add(ringMesh);

      // Vertical sky-beacon beam so players can spot Relics across the 3D skyline
      const beamGeo = new THREE.CylinderGeometry(0.12, 0.35, 36.0, 8, 1, true);
      const beamMat = new THREE.MeshBasicMaterial({
        color: spec.colorHex,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
      });
      const beamMesh = new THREE.Mesh(beamGeo, beamMat);
      beamMesh.position.y = 18.0;
      g.add(beamMesh);

      this.relicGroups.set(spec.id, g);
      this.rootGroup.add(g);
    }
  }

  private createVehicleMesh(isInterceptor: boolean): VehicleBuildResult { return this.vehicleBuilder.build(isInterceptor); }

  private createPropMesh(propType: DynamicPropType): THREE.Group {
    const g = new THREE.Group();
    let mesh: THREE.Mesh;

    if (propType === DynamicPropType.CRYO_BARREL) {
      const geo = new THREE.CylinderGeometry(0.38, 0.38, 1.1, 14);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xff2a6d,
        emissive: 0x880022,
        emissiveIntensity: 0.9,
        metalness: 0.6,
        roughness: 0.3,
      });
      mesh = new THREE.Mesh(geo, mat);
    } else if (propType === DynamicPropType.STEEL_DUMPSTER) {
      const geo = new THREE.BoxGeometry(1.7, 1.2, 1.3);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x2d4a3e,
        metalness: 0.7,
        roughness: 0.45,
      });
      mesh = new THREE.Mesh(geo, mat);
    } else if (propType === DynamicPropType.CONCRETE_BARRIER) {
      const geo = new THREE.BoxGeometry(2.5, 1.04, 0.84);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x7a8288,
        metalness: 0.2,
        roughness: 0.85,
      });
      mesh = new THREE.Mesh(geo, mat);
    } else if (propType === DynamicPropType.CARGO_CONTAINER) {
      const geo = new THREE.BoxGeometry(2.9, 1.9, 3.7);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xd97706,
        metalness: 0.65,
        roughness: 0.4,
      });
      mesh = new THREE.Mesh(geo, mat);
    } else {
      const geo = new THREE.BoxGeometry(2.7, 1.7, 4.8);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x4a1d1d,
        emissive: 0x330808,
        metalness: 0.8,
        roughness: 0.35,
      });
      mesh = new THREE.Mesh(geo, mat);
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    // Props share the entity fidelity floor: load-bearing body, functional hardware and powered trim.
    const bounds = new THREE.Box3().setFromObject(mesh), size = bounds.getSize(new THREE.Vector3());
    const hardware = new THREE.MeshStandardMaterial({ color: 0x273641, roughness: 0.6, metalness: 0.75 });
    const power = new THREE.MeshStandardMaterial({ color: 0x64e7f2, emissive: 0x32afc3, emissiveIntensity: 0.8 });
    for (const x of [-1, 1]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.06, size.y * 0.9, size.z * 0.95), hardware); rib.position.x = x * size.x * 0.35; g.add(rib);
    }
    const lid = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.94, 0.08, size.z * 0.94), hardware); lid.position.y = size.y / 2; g.add(lid);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.35, 0.08, 0.03), power); panel.position.set(0, size.y * 0.15, -size.z / 2 - 0.02); g.add(panel);
    g.userData.entityKind = 'prop';
    return g;
  }

  public updateFromSnapshots(
    vehicles: VehicleBinarySnapshotState[],
    props: DynamicPropBinarySnapshotState[],
    unlockedRelics: Set<string>,
    grappleActive: boolean,
    agentPosition: Vec3,
    grappleAnchor: Vec3,
    timeSec: number,
    damage?: VehicleDamagePacket
  ): void {
    const dt = this.lastVehicleTime ? Math.min(0.1, Math.max(0, timeSec - this.lastVehicleTime)) : 0;
    this.lastVehicleTime = timeSec;
    const activeVehicles = new Set(vehicles.map(v => v.vehicleId));
    for (const [id, entry] of this.vehicleGroups) if (!activeVehicles.has(id)) { entry.dispose(); this.vehicleGroups.delete(id); }
    // 1. Update 4-Wheel Suspension Vehicles
    for (const v of vehicles) {
      let entry = this.vehicleGroups.get(v.vehicleId);
      if (!entry) {
        entry = this.createVehicleMesh(v.isInterceptor);
        this.vehicleGroups.set(v.vehicleId, entry);
        this.rootGroup.add(entry.root);
      }

      const state = damage?.vehicles.find(d => d.vehicleId === v.vehicleId);
      entry.root.visible = !damage || !!state;
      this.vehicleBuilder.attachModel(entry, v.isInterceptor);
      entry.updateVehicle(v, state, dt);
    }
    const activeDebris = new Set(damage?.debris.map(d => d.id) ?? []);
    for (const [id, entry] of this.debrisGroups) if (!activeDebris.has(id)) { entry.dispose(); this.debrisGroups.delete(id); }
    for (const state of damage?.debris ?? []) {
      let entry = this.debrisGroups.get(state.id);
      if (!entry) { entry = this.vehicleBuilder.buildDetachedPanel(state.panelId, state.isInterceptor, this.vehicleGroups.get(state.vehicleId)); this.debrisGroups.set(state.id, entry); this.rootGroup.add(entry.root); }
      entry.root.position.set(state.position.x, state.position.y, state.position.z);
      entry.root.quaternion.set(state.rotation.x, state.rotation.y, state.rotation.z, state.rotation.w);
    }

    // 2. Update Dynamic 3D Physics Props
    for (const p of props) {
      let pGroup = this.propGroups.get(p.propId);
      if (!pGroup) {
        pGroup = this.createPropMesh(p.propType);
        this.propGroups.set(p.propId, pGroup);
        this.rootGroup.add(pGroup);
      }

      pGroup.visible = !p.isDetonated;
      if (!p.isDetonated) {
        pGroup.position.set(p.position.x, p.position.y, p.position.z);
        pGroup.quaternion.set(p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w);
      }
    }

    // 3. Animate 4 Prototype Relics (hide collected ones)
    for (const [relicId, rGroup] of this.relicGroups.entries()) {
      rGroup.visible = !unlockedRelics.has(relicId);
      if (rGroup.visible) {
        const core = rGroup.getObjectByName('relicCore');
        const ring = rGroup.getObjectByName('relicRing');
        if (core) {
          core.rotation.y = timeSec * 2.2;
          core.position.y = Math.sin(timeSec * 3.0) * 0.22;
        }
        if (ring) {
          ring.rotation.x = timeSec * 1.5;
          ring.rotation.z = timeSec * 1.8;
        }
      }
    }

    // 4. Update 3D Grapple-Hook Tether Beam
    if (grappleActive) {
      this.grappleLine.visible = true;
      this.grappleAnchorSphere.visible = true;
      this.grappleAnchorSphere.position.set(grappleAnchor.x, grappleAnchor.y, grappleAnchor.z);
      this.grappleAnchorSphere.rotation.y = timeSec * 6.0;

      const posAttr = this.grappleLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      posAttr.setXYZ(0, agentPosition.x, agentPosition.y + 1.35, agentPosition.z);
      posAttr.setXYZ(1, grappleAnchor.x, grappleAnchor.y, grappleAnchor.z);
      posAttr.needsUpdate = true;
    } else {
      this.grappleLine.visible = false;
      this.grappleAnchorSphere.visible = false;
    }
  }
  public dispose(): void {
    for (const entry of [...this.vehicleGroups.values(), ...this.debrisGroups.values()]) entry.dispose();
    this.vehicleGroups.clear(); this.debrisGroups.clear();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.rootGroup.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Line) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); } });
    geometries.forEach(g => g.dispose()); materials.forEach(m => { if (m instanceof THREE.MeshStandardMaterial) productionAssets.releaseMaterial(m); m.dispose(); });
    this.propGroups.clear(); this.relicGroups.clear(); this.rootGroup.removeFromParent(); this.rootGroup.clear();
  }
}
