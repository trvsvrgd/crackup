/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Neo-Veridia 4-District 3D Metropolis Builder, 182 Rotating Icosahedron Orbs,
 * Thermal Updraft Columns, Cascaded Shadow Maps (CSM), Sky/Fog & PostProcessing
 */

import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbType } from '../../shared/constants.js';
import {
  buildNeoVeridiaSector01,
  getNeoVeridiaThermalUpdrafts,
  StructureMaterialType,
  WorldBoxStructure,
} from '../../shared/world/neoVeridiaBlock.js';
import { WorldOrbInstance } from '../../shared/world/orbSystem.js';

function createProceduralGridTexture(
  bgColor: string,
  lineColor: string,
  emissiveWindows: boolean
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    for (let i = 0; i <= 256; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }

    if (emissiveWindows) {
      for (let gx = 4; gx < 256; gx += 32) {
        for (let gy = 6; gy < 256; gy += 32) {
          const lit = (gx * 13 + gy * 7) % 5 !== 0;
          ctx.fillStyle = lit ? 'rgba(0, 230, 255, 0.42)' : 'rgba(12, 24, 38, 0.85)';
          ctx.fillRect(gx, gy, 24, 20);
        }
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export class NeoVeridiaSceneEnvironment {
  public readonly scene: THREE.Scene;
  public readonly csm: CSM;
  public readonly composer: EffectComposer;
  public readonly bloomPass: UnrealBloomPass;
  public readonly ssaoPass: SSAOPass;

  private readonly orbMeshes: Map<number, THREE.Group> = new Map();
  private readonly updraftRings: THREE.Mesh[] = [];
  private animClock = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    orbs: WorldOrbInstance[] = []
  ) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050811);
    this.scene.fog = new THREE.FogExp2(0x060b16, 0.0018);

    // 1. Physical Sky Dome & Ambient Hemisphere Illumination
    const hemiLight = new THREE.HemisphereLight(0x4a78b8, 0x101420, 0.9);
    hemiLight.position.set(0, 320, 0);
    this.scene.add(hemiLight);

    // 2. Cascaded Shadow Maps (CSM) across 3 shadow frustum cascades
    this.csm = new CSM({
      maxFar: 260,
      cascades: 3,
      mode: 'practical',
      parent: this.scene,
      shadowMapSize: 2048,
      lightDirection: new THREE.Vector3(-0.45, -0.82, -0.35).normalize(),
      camera,
      lightIntensity: 1.65,
    });

    // 3. Build 3D Neo-Veridia 4-District Metropolis Structures (1:1 with SharedPhysicsWorld)
    const structures = buildNeoVeridiaSector01();
    this.buildCityMeshes(structures);
    this.buildThermalUpdraftColumns();
    if (orbs.length > 0) {
      this.buildOrbMeshes(orbs);
    }

    // 4. PostProcessing Pipeline: RenderPass -> SSAOPass -> UnrealBloomPass -> OutputPass
    const width = window.innerWidth || 1280;
    const height = window.innerHeight || 720;
    this.composer = new EffectComposer(renderer);

    const renderPass = new RenderPass(this.scene, camera);
    this.composer.addPass(renderPass);

    this.ssaoPass = new SSAOPass(this.scene, camera, width, height);
    this.ssaoPass.kernelRadius = 6;
    this.ssaoPass.minDistance = 0.002;
    this.ssaoPass.maxDistance = 0.08;
    this.composer.addPass(this.ssaoPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.58, // strength
      0.35, // radius
      0.76 // threshold
    );
    this.composer.addPass(this.bloomPass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  private buildCityMeshes(structures: WorldBoxStructure[]): void {
    const plazaTex = createProceduralGridTexture('#0d121c', '#182438', false);
    plazaTex.repeat.set(240, 240);

    const skyscraperTex = createProceduralGridTexture('#0b1322', '#1b314e', true);
    skyscraperTex.repeat.set(6, 24);

    const materials: Record<StructureMaterialType, THREE.MeshStandardMaterial> = {
      plaza_asphalt: new THREE.MeshStandardMaterial({
        map: plazaTex,
        roughness: 0.78,
        metalness: 0.22,
      }),
      brutalist_concrete: new THREE.MeshStandardMaterial({
        color: 0x222938,
        roughness: 0.72,
        metalness: 0.25,
      }),
      obsidian_steel: new THREE.MeshStandardMaterial({
        color: 0x151d2c,
        roughness: 0.35,
        metalness: 0.78,
      }),
      helios_glass: new THREE.MeshStandardMaterial({
        map: skyscraperTex,
        color: 0x1a304d,
        roughness: 0.18,
        metalness: 0.88,
      }),
      ledge_trim: new THREE.MeshStandardMaterial({
        color: 0x2d384d,
        roughness: 0.42,
        metalness: 0.65,
      }),
      neon_cyan: new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00f0ff,
        emissiveIntensity: 2.2,
      }),
      neon_magenta: new THREE.MeshStandardMaterial({
        color: 0xff2a85,
        emissive: 0xff2a85,
        emissiveIntensity: 2.2,
      }),
      neon_amber: new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        emissive: 0xffaa00,
        emissiveIntensity: 2.2,
      }),
      shipping_container: new THREE.MeshStandardMaterial({
        color: 0x1f3b5c,
        roughness: 0.55,
        metalness: 0.6,
      }),
      industrial_grate: new THREE.MeshStandardMaterial({
        color: 0x2b3240,
        roughness: 0.48,
        metalness: 0.72,
      }),
      harbor_water: new THREE.MeshStandardMaterial({
        color: 0x07263d,
        emissive: 0x031829,
        roughness: 0.12,
        metalness: 0.9,
      }),
      forcefield_energy: new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00b8ff,
        emissiveIntensity: 1.8,
        transparent: true,
        opacity: 0.45,
      }),
    };

    for (const mat of Object.values(materials)) {
      this.csm.setupMaterial(mat);
    }

    const trimColors = {
      cyan: materials.neon_cyan,
      magenta: materials.neon_magenta,
      amber: materials.neon_amber,
    };

    const cityGroup = new THREE.Group();
    cityGroup.name = 'NeoVeridia_4Districts';

    for (const s of structures) {
      const width = s.halfExtents.x * 2;
      const height = s.halfExtents.y * 2;
      const depth = s.halfExtents.z * 2;

      const geo = new THREE.BoxGeometry(width, height, depth);
      const mat = materials[s.material] || materials.brutalist_concrete;
      const mesh = new THREE.Mesh(geo, mat);

      mesh.position.set(s.center.x, s.center.y, s.center.z);
      if (s.rotation) {
        mesh.rotation.set(s.rotation.x, s.rotation.y, s.rotation.z, 'XYZ');
      }
      mesh.castShadow = s.id !== 'ground_plaza_main' && s.material !== 'harbor_water';
      mesh.receiveShadow = true;
      cityGroup.add(mesh);

      if (s.emissiveTrim) {
        const trimMat = trimColors[s.emissiveTrim];
        const trimGeo = new THREE.BoxGeometry(width + 0.08, 0.1, depth + 0.08);
        const trimMesh = new THREE.Mesh(trimGeo, trimMat);
        trimMesh.position.set(0, s.halfExtents.y - 0.05, 0);
        mesh.add(trimMesh);
      }
    }

    this.scene.add(cityGroup);
  }

  private buildThermalUpdraftColumns(): void {
    const updrafts = getNeoVeridiaThermalUpdrafts();
    const ringGeo = new THREE.TorusGeometry(1.0, 0.06, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.55,
    });

    for (const u of updrafts) {
      for (let r = 0; r < 6; r++) {
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI * 0.5;
        ring.scale.set(u.radius, u.radius, 1);
        ring.position.set(
          u.center.x,
          u.baseY + ((r / 6) * (u.topY - u.baseY)),
          u.center.z
        );
        ring.userData = { baseY: u.baseY, topY: u.topY };
        this.updraftRings.push(ring);
        this.scene.add(ring);
      }
    }
  }

  /**
   * Builds rotating 3D Icosahedron Energy Cores + Outer Gyroscope Rings for all 182 Orbs
   */
  public buildOrbMeshes(orbs: WorldOrbInstance[]): void {
    const coreGeo = new THREE.IcosahedronGeometry(0.52, 1);
    const ringGeo = new THREE.TorusGeometry(0.78, 0.04, 8, 24);

    const agilityMat = new THREE.MeshStandardMaterial({
      color: 0x00ffaa,
      emissive: 0x00ff88,
      emissiveIntensity: 2.6,
      roughness: 0.15,
      metalness: 0.8,
      wireframe: false,
    });
    const renegadeMat = new THREE.MeshStandardMaterial({
      color: 0xff2a85,
      emissive: 0xff1166,
      emissiveIntensity: 3.0,
      roughness: 0.1,
      metalness: 0.85,
    });
    const whisperMat = new THREE.MeshStandardMaterial({
      color: 0xc87cff,
      emissive: 0x9d4edd,
      emissiveIntensity: 2.8,
      roughness: 0.15,
      metalness: 0.85,
    });

    const orbsGroup = new THREE.Group();
    orbsGroup.name = 'NeoVeridia_Orbs_182';

    for (const orb of orbs) {
      const group = new THREE.Group();
      group.position.set(orb.position.x, orb.position.y, orb.position.z);

      const mat =
        orb.type === OrbType.RENEGADE
          ? renegadeMat
          : orb.type === OrbType.WHISPER
            ? whisperMat
            : agilityMat;

      const coreMesh = new THREE.Mesh(coreGeo, mat);
      const ringMesh = new THREE.Mesh(ringGeo, mat);
      group.add(coreMesh, ringMesh);

      // Attach point light to Renegade, Whisper, and hub Agility orbs for glowing ledge reflections
      if (orb.type !== OrbType.AGILITY || orb.orbId <= 12) {
        const lightColor =
          orb.type === OrbType.RENEGADE
            ? 0xff2a85
            : orb.type === OrbType.WHISPER
              ? 0xc87cff
              : 0x00ffaa;
        const ptLight = new THREE.PointLight(lightColor, 2.2, 14.0);
        group.add(ptLight);
      }

      this.orbMeshes.set(orb.orbId, group);
      orbsGroup.add(group);
    }

    this.scene.add(orbsGroup);
  }

  /**
   * Animates the 182 3D Icosahedron Orbs and updates fleeing Renegade Orb transforms
   */
  public updateOrbsAndUpdrafts(
    orbs: WorldOrbInstance[],
    collectedOrbIds: Set<number>,
    dt: number
  ): void {
    this.animClock += dt;

    for (const orb of orbs) {
      const group = this.orbMeshes.get(orb.orbId);
      if (!group) continue;

      if (collectedOrbIds.has(orb.orbId)) {
        group.visible = false;
        continue;
      }

      group.visible = true;
      const bobOffset = Math.sin(this.animClock * 3.0 + orb.orbId * 0.7) * 0.18;
      group.position.set(orb.position.x, orb.position.y + bobOffset, orb.position.z);

      const spinSpeed = orb.isFleeing ? 6.5 : 2.2;
      group.rotation.y += dt * spinSpeed;
      const ring = group.children[1];
      if (ring) {
        ring.rotation.x += dt * spinSpeed * 1.4;
      }
    }

    for (const ring of this.updraftRings) {
      const { baseY, topY } = ring.userData as { baseY: number; topY: number };
      ring.position.y += dt * 16.0;
      if (ring.position.y > topY) {
        ring.position.y = baseY;
      }
    }
  }

  public resize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.ssaoPass.setSize(width, height);
  }

  public render(): void {
    this.csm.update();
    this.composer.render();
  }
}
