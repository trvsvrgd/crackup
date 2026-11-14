import * as THREE from "three";
import { CyberPetSpecies, DreadnoughtPhase } from "../../shared/constants.js";
import type { Phase6SnapshotPacket } from "../../shared/protocol/binaryProtocol.js";
import { buildSkyboxPetArenaStructures } from "../../shared/world/cyberPetArena.js";
import { DREADNOUGHT_PART_SPECS } from "../../shared/world/dreadnoughtBoss.js";

/** All visible positions, arena results and boss damage come from server snapshots. */
export class Phase6WorldRenderer {
  private readonly pets = new Map<number, THREE.Group>();
  private readonly arena = new THREE.Group();
  private readonly ship = new THREE.Group();
  private readonly shipParts = new Map<number, THREE.Mesh>();
  private readonly shield: THREE.Mesh;
  private readonly lanceTarget: THREE.Mesh;
  private readonly beam: THREE.Line;
  private clock = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.arena.name = "CompanionArena";
    const deck = new THREE.MeshStandardMaterial({
      color: 0x223947,
      roughness: 0.7,
      metalness: 0.3,
    });
    const rail = new THREE.MeshStandardMaterial({
      color: 0x76efcf,
      emissive: 0x26785d,
      emissiveIntensity: 0.5,
    });
    for (const structure of buildSkyboxPetArenaStructures()) {
      const h = structure.halfExtents;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2),
        structure.id.includes("rail") || structure.id.includes("gate")
          ? rail
          : deck,
      );
      mesh.position.set(
        structure.center.x,
        structure.center.y,
        structure.center.z,
      );
      if (structure.rotation)
        mesh.rotation.set(
          structure.rotation.x,
          structure.rotation.y,
          structure.rotation.z,
        );
      mesh.receiveShadow = true;
      this.arena.add(mesh);
    }
    this.scene.add(this.arena, this.ship);
    const hullMaterial = new THREE.MeshStandardMaterial({
      color: 0x586475,
      metalness: 0.6,
      roughness: 0.4,
    });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(20, 5, 35), hullMaterial);
    this.ship.add(hull);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 9), hullMaterial);
    bridge.position.set(0, 4, 5);
    this.ship.add(bridge);
    for (const spec of DREADNOUGHT_PART_SPECS) {
      const material = new THREE.MeshStandardMaterial({
        color: spec.id === 0 ? 0xffcc77 : 0xa16852,
        emissive: spec.id === 0 ? 0x885122 : 0x9b381b,
        emissiveIntensity: 0.55,
        roughness: 0.5,
      });
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          spec.size.x * 2,
          spec.size.y * 2,
          spec.size.z * 2,
        ),
        material,
      );
      mesh.position.set(spec.offset.x, spec.offset.y, spec.offset.z);
      this.shipParts.set(spec.id, mesh);
      this.ship.add(mesh);
    }
    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(29, 20, 12),
      new THREE.MeshBasicMaterial({
        color: 0x6cc8df,
        wireframe: true,
        transparent: true,
        opacity: 0.12,
      }),
    );
    this.ship.add(this.shield);
    this.lanceTarget = new THREE.Mesh(
      new THREE.RingGeometry(3.5, 4, 48),
      new THREE.MeshBasicMaterial({
        color: 0xff6868,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.lanceTarget.rotation.x = -Math.PI / 2;
    this.beam = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]),
      new THREE.LineBasicMaterial({ color: 0xff385c }),
    );
    this.scene.add(this.lanceTarget, this.beam);
    this.ship.visible = this.lanceTarget.visible = this.beam.visible = false;
  }

  public update(snapshot: Phase6SnapshotPacket | null, dt: number): void {
    if (!snapshot) return;
    this.clock += dt;
    const active = new Set<number>();
    for (const pet of snapshot.pets) {
      active.add(pet.petId);
      let rig = this.pets.get(pet.petId);
      if (!rig) {
        rig = this.createPet(pet.species);
        this.pets.set(pet.petId, rig);
        this.scene.add(rig);
        rig.position.set(pet.position.x, pet.position.y, pet.position.z);
      }
      rig.visible = !pet.eliminated;
      const alpha = Math.min(1, dt * 16);
      // Arena joins/returns are teleports; don't interpolate a pet through 400m of empty sky.
      const position = new THREE.Vector3(
        pet.position.x,
        pet.position.y,
        pet.position.z,
      );
      if (rig.position.distanceTo(position) > 20) rig.position.copy(position);
      else rig.position.lerp(position, alpha);
      rig.rotation.y = pet.yaw;
      const body = rig.children[0];
      body.position.y =
        0.5 +
        Math.sin(this.clock * 7 + pet.petId) * (pet.grounded ? 0.035 : 0.12);
    }
    for (const [id, rig] of this.pets) {
      if (active.has(id)) continue;
      this.scene.remove(rig);
      rig.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          (object.material as THREE.Material).dispose();
        }
      });
      this.pets.delete(id);
    }
    const boss = snapshot.dreadnought;
    this.ship.visible =
      boss.phase !== DreadnoughtPhase.DORMANT &&
      boss.phase !== DreadnoughtPhase.DEFEATED;
    this.ship.position.set(boss.position.x, boss.position.y, boss.position.z);
    this.ship.rotation.y = boss.yaw;
    this.shield.visible = boss.shielded;
    for (const part of boss.parts) {
      const mesh = this.shipParts.get(part.partId);
      if (mesh) mesh.visible = !part.destroyed;
    }
    this.lanceTarget.visible =
      this.ship.visible && (boss.lanceChargeSec > 0 || boss.lanceActiveSec > 0);
    this.lanceTarget.position.set(
      boss.lanceTarget.x,
      boss.lanceTarget.y + 0.12,
      boss.lanceTarget.z,
    );
    this.lanceTarget.scale.setScalar(1 + Math.sin(this.clock * 12) * 0.12);
    this.beam.visible = this.ship.visible && boss.lanceActiveSec > 0;
    const points = this.beam.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    points.setXYZ(0, boss.position.x, boss.position.y - 2, boss.position.z);
    points.setXYZ(
      1,
      boss.lanceTarget.x,
      boss.lanceTarget.y,
      boss.lanceTarget.z,
    );
    points.needsUpdate = true;
    this.beam.geometry.computeBoundingSphere();
  }

  private createPet(species: CyberPetSpecies): THREE.Group {
    const root = new THREE.Group(),
      body = new THREE.Group();
    root.add(body);
    const colors = [0xe9ad6a, 0x72b6c7, 0xa8a2ed, 0x90ba7c];
    const material = new THREE.MeshStandardMaterial({
      color: colors[species],
      roughness: 0.45,
      metalness: 0.35,
    });
    const detail = new THREE.MeshStandardMaterial({
      color: 0x88ffdb,
      emissive: 0x216d55,
      emissiveIntensity: 0.6,
    });
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(species === 3 ? 0.8 : 0.45, 0.4, 0.8),
      material,
    );
    body.add(torso);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.3, 0.34),
      material,
    );
    head.position.set(0, 0.19, -0.5);
    body.add(head);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.06, 0.03),
      detail,
    );
    visor.position.set(0, 0.22, -0.68);
    body.add(visor);
    if (species === CyberPetSpecies.AERO_RAVEN_DRONE) {
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(
          new THREE.BoxGeometry(0.65, 0.05, 0.4),
          material,
        );
        wing.position.set(side * 0.48, 0.1, 0);
        wing.rotation.z = side * 0.2;
        body.add(wing);
      }
    } else {
      for (const x of [-0.18, 0.18])
        for (const z of [-0.25, 0.25]) {
          const leg = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.3, 0.12),
            material,
          );
          leg.position.set(x, -0.3, z);
          body.add(leg);
        }
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(
          new THREE.ConeGeometry(0.09, 0.22, 3),
          material,
        );
        ear.position.set(side * 0.11, 0.41, -0.5);
        body.add(ear);
      }
    }
    return root;
  }
}
