/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * 3D Spatialized WebAudio HRTF Harmonic Orb Engine (PRD Section 4.5 - REQ-ORBS)
 * Uses PannerNode (panningModel = 'HRTF', distanceModel = 'inverse') so players hunt orbs by 3D sound.
 */

import * as THREE from 'three';
import { OrbType } from '../../shared/constants.js';
import { Vec3 } from '../../shared/protocol/binaryProtocol.js';
import { WorldOrbInstance } from '../../shared/world/orbSystem.js';

interface SpatialVoiceChannel {
  panner: PannerNode;
  gain: GainNode;
  oscPrimary: OscillatorNode;
  oscHarmonic: OscillatorNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  boundOrbId: number;
}

const MAX_ACTIVE_HRTF_VOICES = 6;
const MAX_AUDIBLE_DISTANCE_M = 65.0;

export class SpatialOrbAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private readonly voices: SpatialVoiceChannel[] = [];
  private readonly camWorldPos = new THREE.Vector3();
  private readonly camForward = new THREE.Vector3();
  private readonly camUp = new THREE.Vector3();
  public isInitialized = false;

  public playCombatCue(kind: 'hit' | 'critical' | 'hurt' | 'defeat'): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    oscillator.type = kind === 'hurt' ? 'triangle' : 'sine';
    const frequency = kind === 'hurt' ? 120 : kind === 'critical' ? 980 : kind === 'defeat' ? 660 : 620;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'hurt' ? 60 : frequency * 0.65, now + 0.09);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    oscillator.connect(gain); gain.connect(this.masterGain);
    oscillator.start(now); oscillator.stop(now + 0.13);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }

  public unlockAndInit(): void {
    if (this.isInitialized || typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.35;
    this.masterGain.connect(this.ctx.destination);

    // Pre-allocate 6 HRTF PannerNode harmonic voice channels for the closest 6 orbs
    for (let i = 0; i < MAX_ACTIVE_HRTF_VOICES; i++) {
      const panner = this.ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 3.5;
      panner.maxDistance = MAX_AUDIBLE_DISTANCE_M;
      panner.rolloffFactor = 1.65;
      panner.coneInnerAngle = 360;
      panner.coneOuterAngle = 360;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.0;

      const oscPrimary = this.ctx.createOscillator();
      const oscHarmonic = this.ctx.createOscillator();
      oscPrimary.type = 'sine';
      oscHarmonic.type = 'triangle';
      oscPrimary.frequency.value = 432;
      oscHarmonic.frequency.value = 648;

      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 3.0;
      lfoGain.gain.value = 8.0;

      lfo.connect(lfoGain);
      lfoGain.connect(oscPrimary.frequency);

      oscPrimary.connect(gain);
      oscHarmonic.connect(gain);
      gain.connect(panner);
      panner.connect(this.masterGain);

      oscPrimary.start();
      oscHarmonic.start();
      lfo.start();

      this.voices.push({
        panner,
        gain,
        oscPrimary,
        oscHarmonic,
        lfo,
        lfoGain,
        boundOrbId: -1,
      });
    }

    this.isInitialized = true;
  }

  /**
   * Updates the 3D AudioListener transform and binds HRTF PannerNode voices to the nearest uncollected Orbs
   */
  public update(
    camera: THREE.PerspectiveCamera,
    playerPos: Vec3,
    orbs: WorldOrbInstance[],
    collectedOrbIds: Set<number>
  ): void {
    if (!this.ctx || !this.isInitialized) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const now = this.ctx.currentTime;

    // 1. Update 3D WebAudio Listener from Camera World Position & Orientation
    camera.getWorldPosition(this.camWorldPos);
    camera.getWorldDirection(this.camForward);
    this.camUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();

    const listener = this.ctx.listener;
    if (listener.positionX) {
      listener.positionX.setValueAtTime(this.camWorldPos.x, now);
      listener.positionY.setValueAtTime(this.camWorldPos.y, now);
      listener.positionZ.setValueAtTime(this.camWorldPos.z, now);
      listener.forwardX.setValueAtTime(this.camForward.x, now);
      listener.forwardY.setValueAtTime(this.camForward.y, now);
      listener.forwardZ.setValueAtTime(this.camForward.z, now);
      listener.upX.setValueAtTime(this.camUp.x, now);
      listener.upY.setValueAtTime(this.camUp.y, now);
      listener.upZ.setValueAtTime(this.camUp.z, now);
    } else {
      listener.setPosition(this.camWorldPos.x, this.camWorldPos.y, this.camWorldPos.z);
      listener.setOrientation(
        this.camForward.x,
        this.camForward.y,
        this.camForward.z,
        this.camUp.x,
        this.camUp.y,
        this.camUp.z
      );
    }

    // 2. Find the nearest uncollected Orbs within MAX_AUDIBLE_DISTANCE_M (65m)
    const nearby: { orb: WorldOrbInstance; dist: number }[] = [];
    for (const orb of orbs) {
      if (collectedOrbIds.has(orb.orbId)) continue;
      const d = Math.hypot(
        orb.position.x - playerPos.x,
        orb.position.y - playerPos.y,
        orb.position.z - playerPos.z
      );
      if (d <= MAX_AUDIBLE_DISTANCE_M) {
        nearby.push({ orb, dist: d });
      }
    }
    nearby.sort((a, b) => a.dist - b.dist);

    // 3. Update HRTF PannerNode coordinates and harmonic frequencies
    for (let i = 0; i < this.voices.length; i++) {
      const voice = this.voices[i];
      const entry = nearby[i];

      if (!entry) {
        voice.boundOrbId = -1;
        voice.gain.gain.setTargetAtTime(0.0, now, 0.05);
        continue;
      }

      const { orb } = entry;
      voice.boundOrbId = orb.orbId;

      if (voice.panner.positionX) {
        voice.panner.positionX.setValueAtTime(orb.position.x, now);
        voice.panner.positionY.setValueAtTime(orb.position.y, now);
        voice.panner.positionZ.setValueAtTime(orb.position.z, now);
      } else {
        voice.panner.setPosition(orb.position.x, orb.position.y, orb.position.z);
      }

      const baseFreq = orb.harmonicFreqHz;
      if (orb.type === OrbType.RENEGADE) {
        voice.oscPrimary.type = 'sawtooth';
        voice.oscPrimary.frequency.setTargetAtTime(orb.isFleeing ? baseFreq * 1.25 : baseFreq, now, 0.04);
        voice.oscHarmonic.frequency.setTargetAtTime(baseFreq * 1.5, now, 0.04);
        voice.lfo.frequency.setTargetAtTime(orb.isFleeing ? 11.0 : 4.5, now, 0.04);
        voice.lfoGain.gain.setTargetAtTime(orb.isFleeing ? 28.0 : 12.0, now, 0.04);
        voice.gain.gain.setTargetAtTime(0.22, now, 0.05);
      } else if (orb.type === OrbType.WHISPER) {
        voice.oscPrimary.type = 'sine';
        voice.oscPrimary.frequency.setTargetAtTime(baseFreq, now, 0.06);
        voice.oscHarmonic.frequency.setTargetAtTime(baseFreq * 2.0, now, 0.06);
        voice.lfo.frequency.setTargetAtTime(1.8, now, 0.06);
        voice.lfoGain.gain.setTargetAtTime(6.0, now, 0.06);
        voice.gain.gain.setTargetAtTime(0.24, now, 0.05);
      } else {
        // Agility Orb crystalline fifth
        voice.oscPrimary.type = 'sine';
        voice.oscPrimary.frequency.setTargetAtTime(baseFreq, now, 0.06);
        voice.oscHarmonic.frequency.setTargetAtTime(baseFreq * 1.498, now, 0.06);
        voice.lfo.frequency.setTargetAtTime(3.2, now, 0.06);
        voice.lfoGain.gain.setTargetAtTime(5.0, now, 0.06);
        voice.gain.gain.setTargetAtTime(0.18, now, 0.05);
      }
    }
  }

  /**
   * Plays a celebratory harmonic arpeggio when an Orb is collected
   */
  public playOrbCollectedChime(orbType: OrbType): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const notes =
      orbType === OrbType.RENEGADE
        ? [528, 660, 792, 1056]
        : orbType === OrbType.WHISPER
          ? [396, 528, 792, 990]
          : [432, 540, 648, 864];

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.065);

      g.gain.setValueAtTime(0.001, now + idx * 0.065);
      g.gain.exponentialRampToValueAtTime(0.28, now + idx * 0.065 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.065 + 0.38);

      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now + idx * 0.065);
      osc.stop(now + idx * 0.065 + 0.4);
    });
  }
}

