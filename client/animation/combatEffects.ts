import * as THREE from "three";
import {
  EffectKind,
  type EffectEvent,
} from "../../shared/protocol/presentationProtocol.js";
import type { Vec3 } from "../../shared/protocol/binaryProtocol.js";

export const EFFECT_POOL_LIMITS = {
  tracer: 64,
  spark: 384,
  wave: 12,
  mark: 256,
} as const;
type PoolKind = keyof typeof EFFECT_POOL_LIMITS;
interface Particle {
  active: boolean;
  age: number;
  life: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: THREE.Vector3;
  color: THREE.Color;
  radius: number;
}
class Pool {
  public readonly mesh: THREE.InstancedMesh<
    THREE.BufferGeometry,
    THREE.ShaderMaterial
  >;
  public readonly particles: Particle[];
  public overwritten = 0;
  private cursor = 0;
  private readonly matrix = new THREE.Matrix4();
  private readonly alpha: THREE.InstancedBufferAttribute;
  constructor(
    public readonly kind: PoolKind,
    capacity: number,
    geometry: THREE.BufferGeometry,
  ) {
    this.alpha = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity),
      1,
    );
    geometry.setAttribute("effectOpacity", this.alpha);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: kind === "mark" ? THREE.NormalBlending : THREE.AdditiveBlending,
      polygonOffset: kind === "mark",
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
      uniforms: { shell: { value: kind === "wave" ? 1 : 0 } },
      vertexShader: `attribute float effectOpacity; varying float alpha; varying vec3 color; varying vec3 facing; varying vec3 eye;
        void main(){alpha=effectOpacity;color=instanceColor;vec4 p=modelViewMatrix*instanceMatrix*vec4(position,1);eye=-p.xyz;facing=normalize(normalMatrix*mat3(instanceMatrix)*normal);gl_Position=projectionMatrix*p;}`,
      fragmentShader: `varying float alpha;varying vec3 color;varying vec3 facing;varying vec3 eye;uniform float shell;
        void main(){float edge=pow(1.0-abs(dot(normalize(facing),normalize(eye))),2.0);gl_FragColor=vec4(color,alpha*mix(1.0,.12+.88*edge,shell));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.name = `Pooled_${kind}`;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.userData.excludeSurfacePass = true;
    this.particles = Array.from({ length: capacity }, () => ({
      active: false,
      age: 0,
      life: 1,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      rotation: new THREE.Quaternion(),
      scale: new THREE.Vector3(1, 1, 1),
      color: new THREE.Color(),
      radius: 1,
    }));
    // Allocate the attribute once before the first shader compile.
    for (let i = 0; i < capacity; i++)
      this.mesh.setColorAt(i, new THREE.Color());
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
  }
  public take(life: number): Particle {
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % this.particles.length;
    if (p.active) this.overwritten++;
    p.active = true;
    p.age = 0;
    p.life = life;
    p.velocity.set(0, 0, 0);
    p.rotation.identity();
    p.scale.set(1, 1, 1);
    return p;
  }
  public update(dt: number): void {
    let count = 0;
    for (const p of this.particles) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        continue;
      }
      const t = p.age / p.life;
      if (this.kind === "spark") {
        p.velocity.y -= 9.8 * dt;
        p.position.addScaledVector(p.velocity, dt);
      }
      if (this.kind === "wave")
        p.scale.setScalar(Math.max(0.01, p.radius * (0.1 + 0.9 * t)));
      this.matrix.compose(p.position, p.rotation, p.scale);
      this.mesh.setMatrixAt(count, this.matrix);
      this.mesh.setColorAt(count, p.color);
      this.alpha.setX(
        count,
        this.kind === "mark"
          ? 0.65 * (1 - Math.max(0, (t - 0.7) / 0.3))
          : (1 - t) * 0.85,
      );
      count++;
    }
    this.mesh.count = count;
    this.mesh.visible = count > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }
  public clear(): void {
    this.particles.forEach((p) => (p.active = false));
    this.mesh.count = 0;
    this.mesh.visible = false;
  }
  public dispose(): void {
    this.clear();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}
/** Four fixed draw batches; repeated firefights cannot accumulate scene objects. */
export class CombatEffects {
  public readonly root = new THREE.Group();
  private readonly pools: Record<PoolKind, Pool>;
  private readonly direction = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  public played = 0;
  public culled = 0;
  constructor() {
    this.root.name = "CombatEffects";
    this.pools = {
      tracer: new Pool(
        "tracer",
        64,
        new THREE.CylinderGeometry(0.018, 0.018, 1, 5),
      ),
      spark: new Pool("spark", 384, new THREE.TetrahedronGeometry(0.045)),
      wave: new Pool("wave", 12, new THREE.SphereGeometry(1, 16, 10)),
      mark: new Pool("mark", 256, new THREE.PlaneGeometry(1, 1)),
    };
    Object.values(this.pools).forEach((p) => this.root.add(p.mesh));
  }
  public emit(e: EffectEvent, listener?: Vec3, muzzle?: Vec3): void {
    if (
      listener &&
      Math.hypot(
        e.point.x - listener.x,
        e.point.y - listener.y,
        e.point.z - listener.z,
      ) > 180 &&
      Math.hypot(
        e.origin.x - listener.x,
        e.origin.y - listener.y,
        e.origin.z - listener.z,
      ) > 180
    ) {
      this.culled++;
      return;
    }
    this.played++;
    this.normal.set(e.normal.x, e.normal.y, e.normal.z).normalize();
    if (e.kind === EffectKind.SHOT) {
      const origin = muzzle ?? e.origin,
        p = this.pools.tracer.take(0.09);
      this.direction.set(
        e.point.x - origin.x,
        e.point.y - origin.y,
        e.point.z - origin.z,
      );
      const length = this.direction.length();
      p.position
        .set(origin.x, origin.y, origin.z)
        .addScaledVector(this.direction, 0.5);
      p.rotation.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        this.direction.normalize(),
      );
      p.scale.set(1, Math.max(0.01, length), 1);
      p.color.set(0x77eaff);
      if (e.flags & 1) this.sparks(e, 9);
      return;
    }
    if (e.kind === EffectKind.FOOTSTEP) return;
    if (e.kind === EffectKind.SKID) {
      const p = this.pools.mark.take(25);
      this.direction.set(
        e.point.x - e.origin.x,
        e.point.y - e.origin.y,
        e.point.z - e.origin.z,
      );
      const length = this.direction.length();
      this.direction
        .addScaledVector(this.normal, -this.direction.dot(this.normal))
        .normalize();
      const right = new THREE.Vector3()
        .crossVectors(this.direction, this.normal)
        .normalize();
      this.matrix.makeBasis(right, this.direction, this.normal);
      p.rotation.setFromRotationMatrix(this.matrix);
      p.position
        .set(
          (e.origin.x + e.point.x) / 2,
          (e.origin.y + e.point.y) / 2,
          (e.origin.z + e.point.z) / 2,
        )
        .addScaledVector(this.normal, 0.01);
      p.scale.set(0.22, Math.min(4, length), 1);
      p.color.set(0x050b10);
      return;
    }
    this.sparks(
      e,
      e.kind === EffectKind.BLAST || e.kind === EffectKind.DESTRUCTION
        ? 28
        : 14,
    );
    if (
      e.kind === EffectKind.COUNTER ||
      e.kind === EffectKind.BLAST ||
      e.kind === EffectKind.DESTRUCTION
    ) {
      const p = this.pools.wave.take(
        e.kind === EffectKind.COUNTER ? 0.32 : 0.7,
      );
      p.position.set(e.point.x, e.point.y, e.point.z);
      p.radius = e.radius;
      p.color.set(e.kind === EffectKind.COUNTER ? 0x69eaff : 0xff782d);
    }
    if (e.kind === EffectKind.WALL) {
      const p = this.pools.mark.take(10);
      p.position
        .set(e.point.x, e.point.y, e.point.z)
        .addScaledVector(this.normal, 0.025);
      p.rotation.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.normal);
      p.scale.set(0.5, 0.5, 1);
      p.color.set(0x171b22);
    }
  }
  private sparks(e: EffectEvent, count: number): void {
    let seed = (e.id * 1664525 + 1013904223) >>> 0;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      const p = this.pools.spark.take(0.2 + random() * 0.45);
      p.position.set(e.point.x, e.point.y, e.point.z);
      p.velocity
        .set(random() - 0.5, random() - 0.5, random() - 0.5)
        .normalize()
        .multiplyScalar(1.5 + random() * 3)
        .addScaledVector(this.normal, 2.5);
      if (p.velocity.dot(this.normal) < 0) p.velocity.reflect(this.normal);
      p.color.set(e.flags & 2 ? 0xffe6a1 : 0xffa447);
      p.scale.setScalar(0.6 + random());
    }
  }
  public update(dt: number): void {
    for (const pool of Object.values(this.pools))
      pool.update(Math.max(0, Math.min(0.1, dt)));
  }
  public reset(): void {
    Object.values(this.pools).forEach((p) => p.clear());
  }
  public get stats() {
    return Object.fromEntries(
      Object.entries(this.pools).map(([k, p]) => [
        k,
        {
          active: p.particles.filter((p) => p.active).length,
          capacity: p.particles.length,
          overwritten: p.overwritten,
        },
      ]),
    ) as Record<
      PoolKind,
      { active: number; capacity: number; overwritten: number }
    >;
  }
  public dispose(): void {
    Object.values(this.pools).forEach((p) => p.dispose());
    this.root.removeFromParent();
    this.root.clear();
  }
}
