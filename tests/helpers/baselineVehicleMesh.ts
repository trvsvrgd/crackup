import * as THREE from 'three';
import { productionAssets } from '../../client/assets/productionAssets.js';
export function createBaselineVehicleMesh(isInterceptor: boolean) {
    const group = new THREE.Group();
    group.userData.entityKind = 'vehicle';

    // Main lower chassis body
    const bodyGeo = new THREE.BoxGeometry(2.1, 0.65, 4.6);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: isInterceptor ? 0x101828 : 0x2b1d1d,
      metalness: 0.85,
      roughness: 0.25,
    });
    productionAssets.applyMaterial(bodyMat, 'carbon_fiber', [3, 2]);
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
