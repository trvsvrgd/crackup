import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { JOINT_LAYOUT, type JointName } from './humanoidRig.js';

export const MIXAMO_JOINTS: Record<JointName, string> = {
  Pelvis: 'Hips', Spine: 'Spine', Chest: 'Spine2', Neck: 'Neck', Head: 'Head',
  LeftClavicle: 'LeftShoulder', LeftUpperArm: 'LeftArm', LeftForearm: 'LeftForeArm', LeftHand: 'LeftHand',
  RightClavicle: 'RightShoulder', RightUpperArm: 'RightArm', RightForearm: 'RightForeArm', RightHand: 'RightHand',
  LeftThigh: 'LeftUpLeg', LeftCalf: 'LeftLeg', LeftFoot: 'LeftFoot', RightThigh: 'RightUpLeg', RightCalf: 'RightLeg', RightFoot: 'RightFoot',
};
const joints = Object.keys(JOINT_LAYOUT) as JointName[];
export interface MotionSample { rotations: Record<JointName, THREE.Quaternion>; pelvisY: number }
export const createMotionSample = (): MotionSample => ({ rotations: Object.fromEntries(joints.map(n => [n, new THREE.Quaternion()])) as MotionSample['rotations'], pelvisY: 0.94 });

/** Bake the source bind axes into the game's 19-joint rig once, then sample shared immutable arrays.
 * Source +Z becomes game -Z. T-pose shoulder offsets are explicit; root X/Z stays server owned.
 * Spine1 is collapsed into Chest through world-space rotation deltas, rather than dropped.
 */
export class MixamoMotion {
  public readonly duration: number;
  public readonly frames: number;
  private readonly values: Float32Array;
  private readonly heights: Float32Array;
  private readonly qa = new THREE.Quaternion();
  private readonly qb = new THREE.Quaternion();
  constructor(template: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }, public readonly name: string) {
    const clip = template.animations.find(a => a.name === name);
    if (!clip || !(clip.duration > 0)) throw new Error(`Missing Mixamo motion: ${name}`);
    this.duration = clip.duration; this.frames = Math.ceil(clip.duration * 30) + 1;
    this.values = new Float32Array(this.frames * joints.length * 4); this.heights = new Float32Array(this.frames);
    const source = clone(template.scene), sourceBones = new Map<string, THREE.Object3D>(), skeletons = new Set<THREE.Skeleton>();
    source.traverse(o => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skeletons.add((o as THREE.SkinnedMesh).skeleton);
      if ((o as THREE.Bone).isBone) sourceBones.set(o.name.replace(/^mixamorig\d*[:_]?/i, ''), o);
    });
    const mixer = new THREE.AnimationMixer(source);
    try {
      skeletons.forEach(s => s.pose()); source.updateMatrixWorld(true);
      const rest = {} as Record<JointName, THREE.Quaternion>, targetRest = {} as Record<JointName, THREE.Quaternion>;
      const target = new THREE.Group(), bones = {} as Record<JointName, THREE.Bone>;
      for (const name of joints) {
        const original = sourceBones.get(MIXAMO_JOINTS[name]);
        if (!original) throw new Error(`Missing source joint: ${MIXAMO_JOINTS[name]}`);
        rest[name] = original.getWorldQuaternion(new THREE.Quaternion()).invert();
        const [parent, x, y, z] = JOINT_LAYOUT[name], bone = new THREE.Bone(); bone.position.set(x, y, z);
        if (name === 'LeftUpperArm') bone.rotation.z = -Math.PI / 2;
        if (name === 'RightUpperArm') bone.rotation.z = Math.PI / 2;
        bones[name] = bone; (parent ? bones[parent] : target).add(bone);
      }
      target.updateMatrixWorld(true);
      for (const name of joints) targetRest[name] = bones[name].getWorldQuaternion(new THREE.Quaternion());
      const hips = sourceBones.get('Hips')!, hipRestY = hips.getWorldPosition(new THREE.Vector3()).y;
      if (!(hipRestY > 0.5 && hipRestY < 1.5)) throw new Error(`Mixamo base must use metres: hips=${hipRestY}`);
      const forward = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), inverseForward = forward.clone().invert();
      const desired = {} as Record<JointName, THREE.Quaternion>, local = new THREE.Quaternion(), position = new THREE.Vector3();
      joints.forEach(n => desired[n] = new THREE.Quaternion());
      const action = mixer.clipAction(clip); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
      for (let frame = 0; frame < this.frames; frame++) {
        mixer.setTime(frame / (this.frames - 1) * this.duration); source.updateMatrixWorld(true);
        this.heights[frame] = hips.getWorldPosition(position).y / hipRestY * JOINT_LAYOUT.Pelvis[2];
        for (const [index, name] of joints.entries()) {
          const original = sourceBones.get(MIXAMO_JOINTS[name])!;
          original.getWorldQuaternion(desired[name]);
          desired[name].premultiply(forward).multiply(rest[name]).multiply(inverseForward).multiply(targetRest[name]).normalize();
          const parent = JOINT_LAYOUT[name][0];
          local.copy(parent ? desired[parent] : new THREE.Quaternion()).invert().multiply(desired[name]).normalize();
          local.toArray(this.values, (frame * joints.length + index) * 4);
        }
      }
      if (![...this.values, ...this.heights].every(Number.isFinite)) throw new Error('Nonfinite retargeted motion');
    } finally { mixer.stopAllAction(); mixer.uncacheRoot(source); skeletons.forEach(s => s.dispose()); }
  }
  public sample(seconds: number, result: MotionSample): void {
    const f = THREE.MathUtils.clamp(seconds / this.duration, 0, 1) * (this.frames - 1), a = Math.floor(f), b = Math.min(a + 1, this.frames - 1), t = f - a;
    for (const [i, name] of joints.entries()) {
      this.qa.fromArray(this.values, (a * joints.length + i) * 4); this.qb.fromArray(this.values, (b * joints.length + i) * 4);
      result.rotations[name].copy(this.qa).slerp(this.qb, t);
    }
    result.pelvisY = THREE.MathUtils.lerp(this.heights[a], this.heights[b], t);
  }
}
const cache = new WeakMap<object, Map<string, MixamoMotion | null>>();
export function getMixamoMotion(template: { scene: THREE.Object3D; animations: THREE.AnimationClip[] } | undefined, name: string): MixamoMotion | null {
  if (!template) return null;
  let clips = cache.get(template); if (!clips) { clips = new Map(); cache.set(template, clips); }
  if (!clips.has(name)) {
    try { clips.set(name, new MixamoMotion(template, name)); }
    catch (error) { console.info('[Mixamo fallback]', String(error)); clips.set(name, null); }
  }
  return clips.get(name) ?? null;
}
