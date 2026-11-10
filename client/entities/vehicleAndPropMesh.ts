/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Phase 4 3D Client Visualizers:
 * - Articulated 4-Wheel Suspension Vehicles (with per-wheel suspension travel & steering)
 * - 5-Tier Dynamic 3D Physics Props (85kg Cryo-Barrel -> 3400kg APC Chassis)
 * - 4 Physical 3D Prototype Relics with Sky-Beacons
 * - 3D Grapple-Hook Pendulum Tether Beam
 */

import * as THREE from 'three';
import { DynamicPropType } from '../../shared/constants.js';
import { PROTOTYPE_RELIC_SPECS } from '../../shared/progression/skillTreeSystem.js';
import {
  DynamicPropBinarySnapshotState,
  Vec3,
  VehicleBinarySnapshotState,
} from '../../shared/protocol/binaryProtocol.js';

export class ClientVehiclePropRenderer {
  public readonly rootGroup = new THREE.Group();
  private readonly vehicleGroups: Map<
    number,
    {
      group: THREE.Group;
      wheelMeshes: [THREE.Object3D, THREE.Object3D, THREE.Object3D, THREE.Object3D];
      thrusterPlume: THREE.Mesh;
    }
  > = new Map();

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

  private createVehicleMesh(isInterceptor: boolean) {
    const group = new THREE.Group();

    // Main lower chassis body
    const bodyGeo = new THREE.BoxGeometry(2.1, 0.65, 4.6);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: isInterceptor ? 0x101828 : 0x2b1d1d,
      metalness: 0.85,
      roughness: 0.25,
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    group.add(bodyMesh);

    // Upper cockpit canopy
    const canopyGeo = new THREE.BoxGeometry(1.65, 0.48, 2.3);
    const canopyMat = new THREE.MeshStandardMaterial({
      color: isInterceptor ? 0x00f2ff : 0xff9d00,
      emissive: isInterceptor ? 0x005577 : 0x552200,
      emissiveIntensity: 0.7,
      metalness: 0.9,
      roughness: 0.15,
    });
    const canopyMesh = new THREE.Mesh(canopyGeo, canopyMat);
    canopyMesh.position.set(0, 0.52, 0.15);
    group.add(canopyMesh);

    // Neon trim strips
    const stripGeo = new THREE.BoxGeometry(2.16, 0.08, 4.65);
    const stripMat = new THREE.MeshBasicMaterial({
      color: isInterceptor ? 0x00f2ff : 0xff2a6d,
    });
    const stripMesh = new THREE.Mesh(stripGeo, stripMat);
    stripMesh.position.y = -0.1;
    group.add(stripMesh);

    // 4 Articulated Suspension Wheels (FL, FR, RL, RR)
    const wheelOffsets: Array<[number, number, number]> = [
      [-1.02, -0.45, -1.55],
      [1.02, -0.45, -1.55],
      [-1.02, -0.45, 1.55],
      [1.02, -0.45, 1.55],
    ];
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.5,
      roughness: 0.7,
    });

    const wheelMeshes = wheelOffsets.map(([wx, wy, wz]) => {
      const wPivot = new THREE.Group();
      wPivot.position.set(wx, wy, wz);
      const wMesh = new THREE.Mesh(wheelGeo, wheelMat);
      wPivot.add(wMesh);
      group.add(wPivot);
      return wPivot;
    }) as unknown as [THREE.Object3D, THREE.Object3D, THREE.Object3D, THREE.Object3D];

    // Underbody Wall-Thruster Hop plasma plume
    const plumeGeo = new THREE.ConeGeometry(0.85, 1.8, 12);
    plumeGeo.rotateX(Math.PI);
    const plumeMat = new THREE.MeshBasicMaterial({
      color: 0x00f2ff,
      transparent: true,
      opacity: 0.85,
    });
    const thrusterPlume = new THREE.Mesh(plumeGeo, plumeMat);
    thrusterPlume.position.set(0, -1.0, 0);
    thrusterPlume.visible = false;
    group.add(thrusterPlume);

    return { group, wheelMeshes, thrusterPlume };
  }

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
    return g;
  }

  public updateFromSnapshots(
    vehicles: VehicleBinarySnapshotState[],
    props: DynamicPropBinarySnapshotState[],
    unlockedRelics: Set<string>,
    grappleActive: boolean,
    agentPosition: Vec3,
    grappleAnchor: Vec3,
    timeSec: number
  ): void {
    // 1. Update 4-Wheel Suspension Vehicles
    for (const v of vehicles) {
      let entry = this.vehicleGroups.get(v.vehicleId);
      if (!entry) {
        entry = this.createVehicleMesh(v.isInterceptor);
        this.vehicleGroups.set(v.vehicleId, entry);
        this.rootGroup.add(entry.group);
      }

      entry.group.position.set(v.position.x, v.position.y, v.position.z);
      entry.group.quaternion.set(v.rotation.x, v.rotation.y, v.rotation.z, v.rotation.w);
      entry.thrusterPlume.visible = v.wallThrusterActive;

      // Animate all 4 wheels with real-time suspension compression & front steering angle
      const baseWheelY = -0.48;
      for (let i = 0; i < 4; i++) {
        const wObj = entry.wheelMeshes[i]!;
        const comp = v.wheelCompressionRatio[i] ?? 0.25;
        wObj.position.y = baseWheelY + comp * 0.32;
        if (i < 2) {
          wObj.rotation.y = v.steerAngleRad;
        }
      }
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
}
