import * as THREE from 'three';
import type { Vec3 } from '../../shared/protocol/binaryProtocol.js';
export function createBaselineRelayMesh(pos: Vec3, hexColor: number): THREE.Group {
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
