import * as THREE from "three";
import {
  CINEMATIC_IDS,
  sampleTrack,
  type CinematicTrack,
} from "./cinematicTracks.js";

import type { CinematicEnd } from '../../shared/campaign/presentation.js';
export type { CinematicEnd } from '../../shared/campaign/presentation.js';
export interface CinematicStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface CinematicHooks {
  start?(track: CinematicTrack): void;
  frame?(track: CinematicTrack, sample: ReturnType<typeof sampleTrack>): void;
  finish?(track: CinematicTrack, reason: CinematicEnd): void;
  resolvePosition?(
    track: CinematicTrack,
    sample: ReturnType<typeof sampleTrack>,
  ): THREE.Vector3 | undefined;
}

/** Camera-only ownership. Never pauses a simulation, changes authority or awards progress. */
export class CinematicDirector {
  private track: CinematicTrack | null = null;
  private started = 0;
  private profile = "";
  private readonly history = new Map<string, CinematicEnd>();
  private readonly gameplayPosition = new THREE.Vector3();
  private readonly gameplayRotation = new THREE.Quaternion();
  private gameplayFov = 68;
  public reducedMotion = false;
  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly storage: CinematicStorage | null = null,
    private readonly hooks: CinematicHooks = {},
  ) {}
  public get active(): boolean {
    return this.track !== null;
  }
  public get activeId(): string | null {
    return this.track?.id ?? null;
  }
  public get targetEnemyId(): number | undefined {
    return this.track?.targetEnemyId;
  }
  public follow(track: CinematicTrack): void {
    if (track.id === this.track?.id) this.track = track;
  }
  public seen(id: string): boolean {
    return this.history.has(id);
  }
  public useProfile(callsign: string, force = false): void {
    if (!force && this.profile === callsign) return;
    this.end("interrupted");
    this.profile = callsign;
    this.history.clear();
    try {
      const saved = JSON.parse(this.storage?.getItem(this.key) ?? "{}");
      for (const [id, value] of Object.entries(saved)) {
        if (
          CINEMATIC_IDS.has(id) &&
          [
            "completed",
            "skipped",
            "damage",
            "death",
            "disconnected",
            "hidden",
            "interrupted",
          ].includes(String(value))
        )
          this.history.set(id, value as CinematicEnd);
      }
    } catch {
      /* Storage failure cannot prevent gameplay or skip. */
    }
  }
  private get key(): string {
    return `crackup:cinematics:v1:${this.profile}`;
  }
  private capture(): void {
    this.gameplayPosition.copy(this.camera.position);
    this.gameplayRotation.copy(this.camera.quaternion);
    this.gameplayFov = this.camera.fov;
  }
  /** Call before the ordinary spring-arm update so cinematic FOV never leaks into it. */
  public restoreGameplayCamera(): void {
    if (!this.active) return;
    this.camera.position.copy(this.gameplayPosition);
    this.camera.quaternion.copy(this.gameplayRotation);
    this.camera.fov = this.gameplayFov;
    this.camera.updateProjectionMatrix();
  }
  public start(track: CinematicTrack, now: number): boolean {
    if (
      this.active ||
      this.seen(track.id) ||
      !CINEMATIC_IDS.has(track.id) ||
      !Number.isFinite(now)
    )
      return false;
    this.capture();
    this.track = track;
    this.started = now;
    this.hooks.start?.(track);
    return true;
  }
  /** Call after the normal gameplay camera updates, using monotonic wall-clock seconds. */
  public update(now: number): void {
    if (!this.track) return;
    this.capture();
    const elapsed = Math.max(0, now - this.started);
    if (elapsed >= this.track.duration) {
      this.end("completed");
      return;
    }
    const sample = sampleTrack(this.track, elapsed, this.reducedMotion);
    const resolved = this.hooks.resolvePosition?.(this.track, sample);
    if (resolved) this.camera.position.copy(resolved);
    else
      this.camera.position.set(
        sample.position.x,
        sample.position.y,
        sample.position.z,
      );
    this.camera.lookAt(sample.target.x, sample.target.y, sample.target.z);
    this.camera.fov = sample.fov;
    this.camera.updateProjectionMatrix();
    this.hooks.frame?.(this.track, sample);
  }
  public end(reason: CinematicEnd = "skipped"): void {
    const track = this.track;
    if (!track) return;
    this.restoreGameplayCamera();
    this.track = null;
    this.history.set(track.id, reason);
    try {
      if (this.profile)
        this.storage?.setItem(
          this.key,
          JSON.stringify(Object.fromEntries(this.history)),
        );
    } catch {
      /* Optional local preference. */
    }
    this.hooks.finish?.(track, reason);
  }
  public dispose(): void {
    this.end("interrupted");
  }
}
