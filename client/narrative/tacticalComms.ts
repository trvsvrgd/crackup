import * as THREE from 'three';
import { CHARACTERS, StoryDirector, WHISPER_TRANSCRIPTS, type DialogueNode, type StoryContext } from '../../shared/narrative/storyBible.js';

/** One shared WebGL context: portraits render into the game's canvas through a scissored viewport. */
export class TacticalCommsOverlay {
  public readonly director = new StoryDirector();
  public readonly element = document.createElement('aside');
  private readonly text = document.createElement('p');
  private readonly name = document.createElement('strong');
  private readonly choices = document.createElement('div');
  private readonly portrait = new THREE.Group();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 10);
  private readonly material = new THREE.MeshBasicMaterial({ color: 0x42caff, wireframe: true, transparent: true, opacity: 0.8 });
  private node: DialogueNode | null = null;
  private elapsed = 0;
  private visibleCharacters = 0;
  private ctx: AudioContext | null = null;
  private muted = false;
  private readonly whispers: DialogueNode[] = [];
  private heard = new Set<number>();
  private storageKey = '';

  constructor() {
    this.element.id = 'tactical-comms';
    this.element.setAttribute('aria-label', 'Tactical communications');
    this.element.style.cssText = 'position:fixed;left:22px;bottom:170px;width:min(460px,calc(100vw - 44px));box-sizing:border-box;padding:16px 16px 14px 112px;border:1px solid var(--comms-color,#42caff);border-left-width:3px;background:linear-gradient(90deg,transparent 104px,rgba(4,13,22,.91) 104px);color:#e8f3f9;font:13px/1.5 Consolas,monospace;z-index:12;pointer-events:auto;min-height:120px;display:none';
    this.text.style.cssText = 'margin:8px 0;min-height:42px';
    this.text.setAttribute('aria-live', 'polite');
    const mute = document.createElement('button'); mute.textContent = 'Comms audio on';
    mute.onclick = () => { this.muted = !this.muted; mute.textContent = `Comms audio ${this.muted ? 'off' : 'on'}`; };
    mute.style.cssText = 'background:none;border:0;color:#b6c8d3;font:10px monospace;cursor:pointer;padding:3px 0';
    this.element.append(this.name, this.text, this.choices, mute); document.body.append(this.element);
    const mesh = (geometry: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
      const part = new THREE.Mesh(geometry, this.material); part.position.set(x, y, z); part.scale.set(sx, sy, sz); this.portrait.add(part); return part;
    };
    mesh(new THREE.IcosahedronGeometry(0.42, 2), 0, 0.3, 0, 0.8, 1.15, 0.8);
    mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.24, 8), 0, -0.17, 0);
    mesh(new THREE.IcosahedronGeometry(0.5, 1), 0, -0.52, 0, 1.3, 0.65, 0.6);
    mesh(new THREE.TorusGeometry(0.12, 0.018, 4, 16), -0.18, 0.38, 0.31);
    mesh(new THREE.TorusGeometry(0.12, 0.018, 4, 16), 0.18, 0.38, 0.31);
    this.scene.add(this.portrait); this.camera.position.set(0, 0, 2.8);
    window.addEventListener('pointerdown', this.unlockAudio, { once: true });
    window.addEventListener('keydown', this.unlockAudio, { once: true });
  }
  private unlockAudio = () => {
    if (!this.ctx && window.AudioContext) this.ctx = new AudioContext();
    void this.ctx?.resume();
  };
  public useProfile(callsign: string): void {
    if (this.storageKey === `crackup:story:v1:${callsign}`) return;
    this.storageKey = `crackup:story:v1:${callsign}`;
    this.director.completed.clear(); this.director.beat = null; this.director.node = null; this.heard.clear(); this.whispers.length = 0; this.node = null;
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey) ?? '{}');
      for (const id of saved.completed ?? []) this.director.completed.add(id);
      this.heard = new Set(saved.heard ?? []);
    } catch { /* Private mode/storage loss only resets local presentation progress. */ }
  }
  private save(): void {
    if (!this.storageKey) return;
    try { localStorage.setItem(this.storageKey, JSON.stringify({ completed: [...this.director.completed], heard: [...this.heard] })); } catch { /* Optional local storage. */ }
  }
  public whisper(index: number): void {
    if (this.heard.has(index)) return;
    this.heard.add(index); this.save();
    this.whispers.push({ id: `whisper-${index}`, speaker: 'voss', text: `RECOVERED MEMORY // ${WHISPER_TRANSCRIPTS[index % WHISPER_TRANSCRIPTS.length]}` });
  }
  private cadence(character: string): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running' || !this.node || !/[\w]/.test(character)) return;
    const oscillator = this.ctx.createOscillator(), gain = this.ctx.createGain(), t = this.ctx.currentTime;
    oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(CHARACTERS[this.node.speaker].voiceHz + (character.charCodeAt(0) % 7) * 13, t);
    gain.gain.setValueAtTime(0.025, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    oscillator.connect(gain); gain.connect(this.ctx.destination); oscillator.start(t); oscillator.stop(t + 0.05);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  private advance(choice = 0): void {
    if (this.node === this.director.node) this.director.advance(choice);
    this.node = null; this.save();
  }
  public update(context: StoryContext, dt: number): void {
    if (!context.deployed) { this.element.style.display = 'none'; return; }
    if (!this.node) {
      const next = this.whispers.shift() ?? this.director.update(context);
      if (!next) { this.element.style.display = 'none'; return; }
      this.node = next; this.elapsed = 0; this.visibleCharacters = 0;
      const profile = CHARACTERS[next.speaker];
      this.element.style.display = 'block'; this.element.style.setProperty('--comms-color', profile.color);
      this.material.color.set(profile.color); this.name.textContent = `${profile.name} // ${profile.role}`;
      this.text.textContent = ''; this.choices.replaceChildren();
      // Character design variations are stable, not randomized between lines.
      this.portrait.scale.set(next.speaker === 'vance' ? 0.9 : 1, next.speaker === 'vance' ? 1.12 : 1, 1);
      this.portrait.children[3].visible = this.portrait.children[4].visible = next.speaker === 'voss';
    }
    this.elapsed += dt;
    const count = Math.min(this.node.text.length, Math.floor(this.elapsed * 32));
    if (count > this.visibleCharacters) {
      this.cadence(this.node.text[count - 1]); this.visibleCharacters = count;
      this.text.textContent = this.node.text.slice(0, count);
    }
    this.portrait.rotation.y = Math.sin(this.elapsed * 1.6) * 0.16;
    this.portrait.rotation.x = Math.sin(this.elapsed * 5) * 0.025;
    if (count === this.node.text.length && !this.choices.childElementCount) {
      for (const [i, choice] of (this.node.choices ?? [{ label: 'Continue', next: '' }]).entries()) {
        const button = document.createElement('button'); button.textContent = choice.label;
        button.style.cssText = 'border:1px solid #375366;background:#0b2232;color:#d9eef8;padding:5px 8px;margin:2px;font:11px monospace;cursor:pointer';
        button.onclick = () => this.advance(i); this.choices.append(button);
      }
    }
    // Branches default to their first response after a reading interval, keeping gameplay uninterrupted.
    if (this.elapsed > this.node.text.length / 32 + (this.node.choices ? 10 : 3.5)) this.advance();
  }
  public renderPortrait(renderer: THREE.WebGLRenderer): void {
    if (this.element.style.display === 'none') return;
    const rect = this.element.getBoundingClientRect();
    const viewport = renderer.getViewport(new THREE.Vector4()), scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest(), autoClear = renderer.autoClear;
    const clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
    try {
      const canvas = renderer.domElement.getBoundingClientRect(), size = renderer.getSize(new THREE.Vector2());
      const sx = size.x / canvas.width, sy = size.y / canvas.height;
      const x = (rect.left - canvas.left + 8) * sx, y = (canvas.bottom - rect.top - 108) * sy;
      renderer.setViewport(x, y, 96 * sx, 96 * sy); renderer.setScissor(x, y, 96 * sx, 96 * sy); renderer.setScissorTest(true);
      renderer.autoClear = false; renderer.setClearColor(0x061421, 1); renderer.clear(true, true, false);
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
      renderer.autoClear = autoClear; renderer.setClearColor(clear, alpha);
    }
  }
  public dispose(): void {
    window.removeEventListener('pointerdown', this.unlockAudio); window.removeEventListener('keydown', this.unlockAudio);
    this.portrait.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    this.material.dispose(); void this.ctx?.close(); this.element.remove();
  }
}
