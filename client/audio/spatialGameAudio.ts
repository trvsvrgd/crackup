import * as THREE from "three";
import { OrbType } from "../../shared/constants.js";
import type {
  Vec3,
  VehicleBinarySnapshotState,
} from "../../shared/protocol/binaryProtocol.js";
import type { WorldOrbInstance } from "../../shared/world/orbSystem.js";
import {
  EffectKind,
  type EffectEvent,
} from "../../shared/protocol/presentationProtocol.js";

export const AUDIO_LIMITS = { oneShots: 16, orbs: 6, engines: 4 };
export type AudioCue =
  | "shot"
  | "hit"
  | "critical"
  | "hurt"
  | "defeat"
  | "counter"
  | "blast"
  | "step"
  | "skid"
  | "orb";
interface Voice {
  panner: PannerNode;
  gain: GainNode;
  source: AudioBufferSourceNode | null;
  ends: number;
  priority: number;
}
interface LoopVoice {
  panner: PannerNode;
  gain: GainNode;
  osc: OscillatorNode;
  harmonic: OscillatorNode;
  filter: BiquadFilterNode;
  id: number;
}

/** Synthesized game audio, explicitly procedural. No empty files or pretend recordings. */
export function createCueBuffer(
  ctx: BaseAudioContext,
  kind: AudioCue,
): AudioBuffer {
  const duration = {
    shot: 0.16,
    hit: 0.13,
    critical: 0.18,
    hurt: 0.2,
    defeat: 0.3,
    counter: 0.42,
    blast: 0.9,
    step: 0.1,
    skid: 0.18,
    orb: 0.55,
  }[kind];
  const buffer = ctx.createBuffer(
      1,
      Math.ceil(ctx.sampleRate * duration),
      ctx.sampleRate,
    ),
    data = buffer.getChannelData(0);
  let seed = 74123,
    low = 0,
    phase = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / ctx.sampleRate,
      u = t / duration;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    low = low * 0.92 + noise * 0.08;
    let value = 0;
    if (kind === "shot")
      value = (noise * 0.65 + Math.sin(t * 440) * 0.35) * Math.exp(-u * 10);
    else if (kind === "blast")
      value = (low * 2 + Math.sin(t * 230) * 0.2) * Math.exp(-u * 5);
    else if (kind === "step")
      value = (low * 2 + noise * 0.15) * Math.exp(-u * 9);
    else if (kind === "skid") value = noise * 0.22 * Math.sin(Math.PI * u);
    else if (kind === "counter") {
      phase += (2 * Math.PI * (180 * (1 - u) + 45)) / ctx.sampleRate;
      value = (Math.sin(phase) * 0.65 + noise * 0.2) * Math.exp(-u * 5);
    } else if (kind === "orb") {
      const notes = [432, 540, 648, 864],
        note = notes[Math.min(3, Math.floor(t / 0.1))];
      phase += (2 * Math.PI * note) / ctx.sampleRate;
      value =
        Math.sin(phase) *
        Math.sin(Math.PI * Math.min(1, u * 2)) *
        Math.exp(-u * 3);
    } else {
      const frequency =
        kind === "hurt"
          ? 100
          : kind === "critical"
            ? 980
            : kind === "defeat"
              ? 660
              : 350;
      phase += (2 * Math.PI * frequency * (1 - u * 0.5)) / ctx.sampleRate;
      value = (Math.sin(phase) * 0.6 + noise * 0.15) * Math.exp(-u * 7);
    }
    const fade = Math.min(1, t / 0.002, (duration - t) / 0.008);
    data[i] = Math.max(-0.85, Math.min(0.85, value * 0.65 * fade));
  }
  return buffer;
}
export class SpatialOrbAudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private readonly shots: Voice[] = [];
  private readonly orbVoices: LoopVoice[] = [];
  private readonly engines: LoopVoice[] = [];
  private readonly buffers = new Map<AudioCue, AudioBuffer>();
  private readonly cooldowns = new Map<string, number>();
  private muted = false;
  private active = true;
  private resumePending = false;
  private disposed = false;
  private readonly position = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  public isInitialized = false;
  public played = 0;
  public stolen = 0;
  public dropped = 0;
  public unlockAndInit(): void {
    if (this.disposed || typeof window === "undefined") return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      const ctx = this.ctx!;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.35;
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -18;
      this.compressor.ratio.value = 5;
      this.master.connect(this.compressor);
      this.compressor.connect(ctx.destination);
      for (const kind of [
        "shot",
        "hit",
        "critical",
        "hurt",
        "defeat",
        "counter",
        "blast",
        "step",
        "skid",
        "orb",
      ] as AudioCue[])
        this.buffers.set(kind, createCueBuffer(ctx, kind));
      for (let i = 0; i < AUDIO_LIMITS.oneShots; i++) {
        const { panner, gain } = this.channel();
        this.shots.push({ panner, gain, source: null, ends: 0, priority: 0 });
      }
      for (let i = 0; i < AUDIO_LIMITS.orbs; i++)
        this.orbVoices.push(this.loop());
      for (let i = 0; i < AUDIO_LIMITS.engines; i++)
        this.engines.push(this.loop());
      this.isInitialized = true;
    }
    // Resume only from a user gesture, never once per animation frame.
    if (this.ctx?.state === "suspended" && !this.resumePending) {
      this.resumePending = true;
      void this.ctx
        .resume()
        .catch(() => {})
        .finally(() => (this.resumePending = false));
    }
  }
  private channel() {
    const ctx = this.ctx!,
      panner = ctx.createPanner(),
      gain = ctx.createGain();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 3;
    panner.maxDistance = 120;
    panner.rolloffFactor = 1.5;
    gain.gain.value = 0;
    gain.connect(panner);
    panner.connect(this.master!);
    return { panner, gain };
  }
  private loop(): LoopVoice {
    const ctx = this.ctx!,
      { panner, gain } = this.channel(),
      osc = ctx.createOscillator(),
      harmonic = ctx.createOscillator(),
      filter = ctx.createBiquadFilter();
    osc.type = "sine";
    harmonic.type = "triangle";
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    osc.connect(filter);
    harmonic.connect(filter);
    filter.connect(gain);
    osc.start();
    harmonic.start();
    return { panner, gain, osc, harmonic, filter, id: -1 };
  }
  private move(panner: PannerNode, p: Vec3) {
    const now = this.ctx!.currentTime;
    if (panner.positionX) {
      panner.positionX.setValueAtTime(p.x, now);
      panner.positionY.setValueAtTime(p.y, now);
      panner.positionZ.setValueAtTime(p.z, now);
    } else panner.setPosition(p.x, p.y, p.z);
  }
  private stop(voice: Voice) {
    const source = voice.source;
    if (!source) return;
    voice.source = null;
    source.onended = null;
    try {
      source.stop();
    } catch {}
    source.disconnect();
    voice.gain.gain.cancelScheduledValues(0);
    voice.gain.gain.value = 0;
  }
  public play(
    kind: AudioCue,
    position: Vec3 = this.position,
    volume = 1,
  ): boolean {
    const ctx = this.ctx;
    if (
      !ctx ||
      ctx.state !== "running" ||
      this.muted ||
      !this.active ||
      this.disposed ||
      Math.hypot(
        position.x - this.position.x,
        position.y - this.position.y,
        position.z - this.position.z,
      ) > 120
    ) {
      this.dropped++;
      return false;
    }
    const priority =
      kind === "step" || kind === "skid"
        ? 1
        : kind === "counter" || kind === "blast"
          ? 3
          : 2;
    let voice = this.shots.find((v) => !v.source);
    if (!voice) {
      const candidates = this.shots.filter((v) => v.priority <= priority);
      if (!candidates.length) {
        this.dropped++;
        return false;
      }
      voice = candidates.reduce((a, b) =>
        a.priority < b.priority ||
        (a.priority === b.priority && a.ends < b.ends)
          ? a
          : b,
      );
      this.stolen++;
      this.stop(voice);
    }
    voice.priority = priority;
    const source = ctx.createBufferSource();
    source.buffer = this.buffers.get(kind)!;
    source.connect(voice.gain);
    this.move(voice.panner, position);
    voice.gain.gain.value = 0.25 * Math.max(0, Math.min(1, volume));
    voice.source = source;
    voice.ends = ctx.currentTime + source.buffer.duration;
    const owned = voice;
    source.onended = () => {
      source.disconnect();
      if (owned.source === source) {
        owned.source = null;
        owned.gain.gain.value = 0;
      }
    };
    source.start();
    this.played++;
    return true;
  }
  public playEffect(e: EffectEvent): void {
    const kind: AudioCue = (
      {
        [EffectKind.SHOT]: "shot",
        [EffectKind.HIT]: e.flags & 2 ? "critical" : "hit",
        [EffectKind.COUNTER]: "counter",
        [EffectKind.BLAST]: "blast",
        [EffectKind.WALL]: "hit",
        [EffectKind.FOOTSTEP]: "step",
        [EffectKind.SKID]: "skid",
        [EffectKind.DESTRUCTION]: "blast",
      } as Record<EffectKind, AudioCue>
    )[e.kind];
    if (e.kind === EffectKind.SKID) {
      const key = `skid:${e.target}`,
        now = this.ctx?.currentTime ?? 0;
      if (now < (this.cooldowns.get(key) ?? 0)) return;
      this.cooldowns.set(key, now + 0.18);
      while (this.cooldowns.size > 64)
        this.cooldowns.delete(this.cooldowns.keys().next().value!);
    }
    this.play(
      kind,
      e.kind === EffectKind.SHOT ? e.origin : e.point,
      e.kind === EffectKind.FOOTSTEP ? 0.45 : 1,
    );
  }
  public playCombatCue(kind: "hit" | "critical" | "hurt" | "defeat"): void {
    this.play(kind);
  }
  public playOrbCollectedChime(_orbType: OrbType): void {
    this.play("orb");
  }
  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGain();
    if (muted) this.stopWorld();
  }
  public setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.applyGain();
    if (!active) this.stopWorld();
  }
  private applyGain() {
    if (this.ctx && this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(
        this.muted || !this.active ? 0 : 0.35,
        this.ctx.currentTime,
        0.02,
      );
    }
  }
  public stopWorld(): void {
    this.shots.forEach((v) => this.stop(v));
    for (const v of [...this.orbVoices, ...this.engines]) {
      v.id = -1;
      v.gain.gain.cancelScheduledValues(0);
      v.gain.gain.value = 0;
    }
    this.cooldowns.clear();
  }
  public update(
    camera: THREE.PerspectiveCamera,
    playerPos: Vec3,
    orbs: WorldOrbInstance[],
    collected: Set<number>,
    vehicles: VehicleBinarySnapshotState[] = [],
  ): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running" || !this.active || this.muted) return;
    const now = ctx.currentTime;
    camera.getWorldPosition(this.position);
    camera.getWorldDirection(this.forward);
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    const l = ctx.listener;
    if (l.positionX) {
      for (const [param, value] of [
        [l.positionX, this.position.x],
        [l.positionY, this.position.y],
        [l.positionZ, this.position.z],
        [l.forwardX, this.forward.x],
        [l.forwardY, this.forward.y],
        [l.forwardZ, this.forward.z],
        [l.upX, this.up.x],
        [l.upY, this.up.y],
        [l.upZ, this.up.z],
      ] as [AudioParam, number][])
        param.setValueAtTime(value, now);
    } else {
      l.setPosition(this.position.x, this.position.y, this.position.z);
      l.setOrientation(
        this.forward.x,
        this.forward.y,
        this.forward.z,
        this.up.x,
        this.up.y,
        this.up.z,
      );
    }
    const distance = (p: Vec3) =>
      Math.hypot(p.x - playerPos.x, p.y - playerPos.y, p.z - playerPos.z);
    const nearby = orbs
      .filter((o) => !collected.has(o.orbId) && distance(o.position) < 65)
      .sort((a, b) => distance(a.position) - distance(b.position));
    this.orbVoices.forEach((v, i) => {
      const orb = nearby[i];
      v.id = orb?.orbId ?? -1;
      if (!orb) {
        v.gain.gain.setTargetAtTime(0, now, 0.05);
        return;
      }
      this.move(v.panner, orb.position);
      const base = orb.harmonicFreqHz * (orb.isFleeing ? 1.25 : 1);
      v.osc.type = orb.type === OrbType.RENEGADE ? "sawtooth" : "sine";
      v.osc.frequency.setTargetAtTime(base + Math.sin(now * 3) * 5, now, 0.04);
      v.harmonic.frequency.setTargetAtTime(
        base * (orb.type === OrbType.WHISPER ? 2 : 1.498),
        now,
        0.04,
      );
      v.gain.gain.setTargetAtTime(0.07, now, 0.05);
    });
    const cars = vehicles
      .filter(
        (v) =>
          (v.driverEntityId || Math.abs(v.speedMps) > 0.5) &&
          distance(v.position) < 100,
      )
      .sort((a, b) => distance(a.position) - distance(b.position));
    this.engines.forEach((v, i) => {
      const car = cars[i];
      v.id = car?.vehicleId ?? -1;
      if (!car) {
        v.gain.gain.setTargetAtTime(0, now, 0.05);
        return;
      }
      this.move(v.panner, car.position);
      const speed = Math.min(1, Math.abs(car.speedMps) / 40);
      v.osc.type = "sawtooth";
      v.osc.frequency.setTargetAtTime(38 + speed * 110, now, 0.08);
      v.harmonic.frequency.setTargetAtTime(76 + speed * 220, now, 0.08);
      v.filter.frequency.setTargetAtTime(240 + speed * 1000, now, 0.08);
      v.gain.gain.setTargetAtTime(0.035 + speed * 0.065, now, 0.05);
    });
  }
  public get diagnostics() {
    return {
      initialized: this.isInitialized,
      state: this.ctx?.state ?? "closed",
      muted: this.muted,
      active: this.active,
      oneShots: this.shots.filter((v) => v.source).length,
      orbVoices: this.orbVoices.filter((v) => v.id >= 0).length,
      engines: this.engines.filter((v) => v.id >= 0).length,
      channels: this.shots.length + this.orbVoices.length + this.engines.length,
      played: this.played,
      stolen: this.stolen,
      dropped: this.dropped,
    };
  }
  public async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.stopWorld();
    for (const v of [...this.orbVoices, ...this.engines]) {
      v.osc.stop();
      v.harmonic.stop();
      v.osc.disconnect();
      v.harmonic.disconnect();
      v.filter.disconnect();
      v.gain.disconnect();
      v.panner.disconnect();
    }
    for (const v of this.shots) {
      v.gain.disconnect();
      v.panner.disconnect();
    }
    this.master?.disconnect();
    this.compressor?.disconnect();
    this.buffers.clear();
    this.shots.length = this.orbVoices.length = this.engines.length = 0;
    await this.ctx?.close();
    this.ctx = null;
    this.isInitialized = false;
  }
}
