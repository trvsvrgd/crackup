/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Phase 5 3D World Renderer:
 *   1. 4 District 3-Stage Operational Loop 3D Terminals & Core Override Beacons (REQ-LOOPS)
 *   2. 90-Second Omega Bounty 3D Waypoint Extraction Corridor & HVT Beacon (REQ-BOUNTIES)
 *   3. 3D Aegis Auditor Airships & Searchlight Cones triggered by Secret Neural Drift (REQ-SECRET)
 *   4. 3D Vigilante Co-op Spherical Buff Aura Ring (REQ-SKILLS #7)
 */

import * as THREE from 'three';
import { DistrictId } from '../../shared/constants.js';
import {
  AuditorAirshipBinaryState,
  DistrictLoopBinaryState,
  OmegaBountyBinaryState,
  Vec3,
} from '../../shared/protocol/binaryProtocol.js';
import {
  DISTRICT_LOOP_SPECS,
  OMEGA_EXTRACTION_WAYPOINTS,
} from '../../shared/world/phase5Systems.js';

interface DistrictLoopVisualGroup {
  districtIndex: number;
  district: DistrictId;
  terminalAMesh: THREE.Group;
  terminalARing: THREE.Mesh;
  terminalBMesh: THREE.Group;
  terminalBRing: THREE.Mesh;
  coreOverrideGroup: THREE.Group;
  coreRingOuter: THREE.Mesh;
  coreRingInner: THREE.Mesh;
  coreBeam: THREE.Mesh;
}

export class ClientPhase5WorldRenderer {
  public readonly root: THREE.Group;
  private readonly districtGroups: Map<number, DistrictLoopVisualGroup> = new Map();
  private readonly omegaWaypointsLine: THREE.Line;
  private readonly omegaBeaconGroup: THREE.Group;
  private readonly omegaPulseRing: THREE.Mesh;
  private readonly airshipMeshes: Map<number, THREE.Group> = new Map();
  private readonly vigilanteAuraMesh: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    this.root = new THREE.Group();
    this.root.name = 'Phase5WorldRoot';
    scene.add(this.root);

    // 1. Build 4 District Loop 3D Terminal & Core Override Meshes
    for (const spec of DISTRICT_LOOP_SPECS) {
      const terminalAMesh = this.createTerminalMesh(spec.stage1Terminals[0], 0x00f0ff);
      const terminalARing = terminalAMesh.getObjectByName('TerminalRing') as THREE.Mesh;
      this.root.add(terminalAMesh);

      const terminalBMesh = this.createTerminalMesh(spec.stage1Terminals[1], 0x00f0ff);
      const terminalBRing = terminalBMesh.getObjectByName('TerminalRing') as THREE.Mesh;
      this.root.add(terminalBMesh);

      const coreOverrideGroup = this.createCoreOverrideMesh(spec.coreOverridePos);
      const coreRingOuter = coreOverrideGroup.getObjectByName('CoreRingOuter') as THREE.Mesh;
      const coreRingInner = coreOverrideGroup.getObjectByName('CoreRingInner') as THREE.Mesh;
      const coreBeam = coreOverrideGroup.getObjectByName('CoreBeam') as THREE.Mesh;
      this.root.add(coreOverrideGroup);

      this.districtGroups.set(spec.districtIndex, {
        districtIndex: spec.districtIndex,
        district: spec.district,
        terminalAMesh,
        terminalARing,
        terminalBMesh,
        terminalBRing,
        coreOverrideGroup,
        coreRingOuter,
        coreRingInner,
        coreBeam,
      });
    }

    // 2. Build 90-Second Omega Bounty 3D Waypoint Extraction Corridor Line
    const wpPoints = OMEGA_EXTRACTION_WAYPOINTS.map(
      (wp) => new THREE.Vector3(wp.x, wp.y + 0.35, wp.z)
    );
    const wpGeom = new THREE.BufferGeometry().setFromPoints(wpPoints);
    const wpMat = new THREE.LineBasicMaterial({
      color: 0xff3b30,
      transparent: true,
      opacity: 0.55,
    });
    this.omegaWaypointsLine = new THREE.Line(wpGeom, wpMat);
    this.root.add(this.omegaWaypointsLine);

    // Omega HVT 3D Overhead Beacon & Ground Ring
    this.omegaBeaconGroup = new THREE.Group();
    const ringGeom = new THREE.RingGeometry(2.2, 2.8, 32);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff2d55,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    this.omegaPulseRing = new THREE.Mesh(ringGeom, ringMat);
    this.omegaPulseRing.position.y = 0.15;
    this.omegaBeaconGroup.add(this.omegaPulseRing);

    const pillarGeom = new THREE.CylinderGeometry(0.18, 0.18, 18.0, 12, 1, true);
    const pillarMat = new THREE.MeshBasicMaterial({
      color: 0xff2d55,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
    });
    const pillarMesh = new THREE.Mesh(pillarGeom, pillarMat);
    pillarMesh.position.y = 9.0;
    this.omegaBeaconGroup.add(pillarMesh);
    this.root.add(this.omegaBeaconGroup);

    // 3. Build 3D Vigilante Co-op Spherical Buff Aura Ring (REQ-SKILLS #7)
    const auraGeom = new THREE.RingGeometry(0.96, 1.0, 48);
    auraGeom.rotateX(-Math.PI / 2);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.26,
    });
    this.vigilanteAuraMesh = new THREE.Mesh(auraGeom, auraMat);
    this.vigilanteAuraMesh.position.y = 0.12;
    this.root.add(this.vigilanteAuraMesh);
  }

  private createTerminalMesh(pos: Vec3, hexColor: number): THREE.Group {
    const group = new THREE.Group();
    group.position.set(pos.x, pos.y, pos.z);

    const baseGeom = new THREE.BoxGeometry(1.1, 2.2, 0.8);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.75,
      roughness: 0.25,
      emissive: hexColor,
      emissiveIntensity: 0.35,
    });
    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
    baseMesh.position.y = 1.1;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    const screenGeom = new THREE.BoxGeometry(0.9, 0.65, 0.1);
    const screenMat = new THREE.MeshBasicMaterial({
      color: hexColor,
    });
    const screenMesh = new THREE.Mesh(screenGeom, screenMat);
    screenMesh.position.set(0, 1.55, 0.42);
    screenMesh.name = 'TerminalScreen';
    group.add(screenMesh);

    const ringGeom = new THREE.RingGeometry(1.6, 1.95, 28);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: hexColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });
    const ringMesh = new THREE.Mesh(ringGeom, ringMat);
    ringMesh.position.y = 0.08;
    ringMesh.name = 'TerminalRing';
    group.add(ringMesh);

    return group;
  }

  private createCoreOverrideMesh(pos: Vec3): THREE.Group {
    const group = new THREE.Group();
    group.position.set(pos.x, pos.y, pos.z);

    const pedestalGeom = new THREE.CylinderGeometry(1.4, 1.8, 1.2, 16);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.85,
      roughness: 0.2,
    });
    const pedestal = new THREE.Mesh(pedestalGeom, pedestalMat);
    pedestal.position.y = 0.6;
    group.add(pedestal);

    const outerRingGeom = new THREE.TorusGeometry(1.8, 0.12, 12, 32);
    const outerRingMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
    });
    const outerRing = new THREE.Mesh(outerRingGeom, outerRingMat);
    outerRing.position.y = 2.6;
    outerRing.name = 'CoreRingOuter';
    group.add(outerRing);

    const innerRingGeom = new THREE.TorusGeometry(1.15, 0.1, 12, 28);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
    });
    const innerRing = new THREE.Mesh(innerRingGeom, innerRingMat);
    innerRing.position.y = 2.6;
    innerRing.name = 'CoreRingInner';
    group.add(innerRing);

    const beamGeom = new THREE.CylinderGeometry(0.35, 0.35, 22.0, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeom, beamMat);
    beam.position.y = 11.0;
    beam.name = 'CoreBeam';
    group.add(beam);

    return group;
  }

  private createAuditorAirshipMesh(): THREE.Group {
    const group = new THREE.Group();

    // Armored fuselage
    const hullGeom = new THREE.BoxGeometry(5.5, 2.2, 9.5);
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      metalness: 0.85,
      roughness: 0.25,
      emissive: 0x991b1b,
      emissiveIntensity: 0.45,
    });
    const hull = new THREE.Mesh(hullGeom, hullMat);
    hull.castShadow = true;
    group.add(hull);

    // Twin VTOL vector-thrust nacelles
    const nacelleGeom = new THREE.CylinderGeometry(1.3, 1.3, 0.55, 18);
    const nacelleMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
    });
    const leftNacelle = new THREE.Mesh(nacelleGeom, nacelleMat);
    leftNacelle.position.set(-3.8, 0.2, 0);
    group.add(leftNacelle);

    const rightNacelle = new THREE.Mesh(nacelleGeom, nacelleMat);
    rightNacelle.position.set(3.8, 0.2, 0);
    group.add(rightNacelle);

    // Downward crimson tactical searchlight cone
    const coneGeom = new THREE.ConeGeometry(7.5, 32.0, 20, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xdc2626,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
    });
    const searchlight = new THREE.Mesh(coneGeom, coneMat);
    searchlight.position.y = -16.0;
    group.add(searchlight);

    return group;
  }

  public updateFromSnapshot(
    omegaBounty: OmegaBountyBinaryState | null,
    districtLoops: DistrictLoopBinaryState[],
    auditorAirships: AuditorAirshipBinaryState[],
    localAgentPos: Vec3,
    vigilanteAuraRadiusM: number,
    timeSec: number
  ): void {
    // Update Vigilante 3D Spherical Aura Ring around local Agent
    this.vigilanteAuraMesh.position.set(localAgentPos.x, localAgentPos.y + 0.12, localAgentPos.z);
    this.vigilanteAuraMesh.scale.setScalar(Math.max(8, vigilanteAuraRadiusM));

    // Update 4 District Loops
    for (const loop of districtLoops) {
      const visuals = this.districtGroups.get(loop.districtIndex);
      if (!visuals) continue;

      const termAColor = loop.terminalsHacked >= 1 || loop.currentStage >= 2 ? 0x22c55e : 0x00f0ff;
      (visuals.terminalARing.material as THREE.MeshBasicMaterial).color.setHex(termAColor);

      const termBColor = loop.terminalsHacked >= 2 || loop.currentStage >= 2 ? 0x22c55e : 0x00f0ff;
      (visuals.terminalBRing.material as THREE.MeshBasicMaterial).color.setHex(termBColor);

      visuals.coreRingOuter.rotation.y = timeSec * 1.4;
      visuals.coreRingOuter.rotation.x = Math.sin(timeSec * 0.9) * 0.4;
      visuals.coreRingInner.rotation.x = -timeSec * 1.9;

      const beamMat = visuals.coreBeam.material as THREE.MeshBasicMaterial;
      if (loop.currentStage >= 4) {
        beamMat.color.setHex(0x22c55e);
        beamMat.opacity = 0.5;
      } else if (loop.currentStage === 3) {
        beamMat.color.setHex(0xef4444);
        beamMat.opacity = 0.45 + Math.sin(timeSec * 6.0) * 0.15;
      } else {
        beamMat.color.setHex(0xf59e0b);
        beamMat.opacity = 0.2;
      }
    }

    // Update 90-second Omega Bounty HVT Beacon
    if (omegaBounty && omegaBounty.active) {
      this.omegaBeaconGroup.visible = true;
      this.omegaBeaconGroup.position.set(
        omegaBounty.position.x,
        omegaBounty.position.y,
        omegaBounty.position.z
      );
      const pulse = 1.0 + Math.sin(timeSec * 5.0) * 0.18;
      this.omegaPulseRing.scale.setScalar(pulse);
    } else {
      this.omegaBeaconGroup.visible = false;
    }

    // Update 3D Aegis Auditor Airships
    const activeIds = new Set<number>();
    for (const ship of auditorAirships) {
      if (!ship.active) continue;
      activeIds.add(ship.airshipId);
      let mesh = this.airshipMeshes.get(ship.airshipId);
      if (!mesh) {
        mesh = this.createAuditorAirshipMesh();
        this.root.add(mesh);
        this.airshipMeshes.set(ship.airshipId, mesh);
      }
      mesh.position.set(ship.position.x, ship.position.y, ship.position.z);
      mesh.rotation.y = timeSec * 0.35 + ship.airshipId;
    }

    for (const [id, mesh] of this.airshipMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.root.remove(mesh);
        this.airshipMeshes.delete(id);
      }
    }
  }
}
