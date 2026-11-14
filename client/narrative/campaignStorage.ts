import { newCampaignPresentation, parseCampaignPresentation, CINEMATIC_IDS, CINEMATIC_ENDS,
  type CampaignPresentation } from '../../shared/campaign/presentation.js';
import { STORY_BEATS } from '../../shared/narrative/storyBible.js';

export interface PresentationStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
/** Shared games keep browser preferences. Solo reads the campaign DB after its first legacy import. */
export class CampaignStorage implements PresentationStorage {
  private state: CampaignPresentation | null = null;
  private callsign = '';
  private publishing = true;
  constructor(private readonly browser: PresentationStorage | null,
    private readonly publish: (value: CampaignPresentation) => void) {}
  /** Ending the old camera during reauthentication must not overwrite the newly loaded save. */
  public suspend(): void { this.publishing = false; }
  public useCampaign(callsign: string, solo: boolean, saved: CampaignPresentation | null): void {
    this.callsign = callsign;
    this.state = solo ? (saved ? parseCampaignPresentation(saved) : this.importLegacy(callsign)) : null;
    this.publishing = true;
    if (solo && saved === null) this.publish(structuredClone(this.state!));
  }
  public getItem(key: string): string | null {
    if (!this.state) { try { return this.browser?.getItem(key) ?? null; } catch { return null; } }
    if (key === `crackup:story:v1:${this.callsign}`) return JSON.stringify(this.state.story);
    if (key === `crackup:cinematics:v1:${this.callsign}`) return JSON.stringify(this.state.cinematics);
    if (key === 'crackup.settings') return JSON.stringify(this.state.settings);
    if (key === 'crackup.cinematicIntros') return String(this.state.settings.cinematicIntros);
    if (key === 'crackup.audioMuted') return String(this.state.settings.audioMuted);
    if (key === 'crackup.commsMuted') return String(this.state.settings.commsMuted);
    return null;
  }
  public setItem(key: string, value: string): void {
    if (!this.state) { try { this.browser?.setItem(key, value); } catch {} return; }
    const next = structuredClone(this.state);
    if (key === `crackup:story:v1:${this.callsign}`) next.story = JSON.parse(value);
    else if (key === `crackup:cinematics:v1:${this.callsign}`) next.cinematics = JSON.parse(value);
    else if (key === 'crackup.settings') {
      const raw = JSON.parse(value);
      Object.assign(next.settings, { sensitivity: Number(raw.sensitivity), quality: raw.quality, bloom: raw.bloom });
    } else if (key === 'crackup.cinematicIntros') next.settings.cinematicIntros = value === 'true';
    else if (key === 'crackup.audioMuted') next.settings.audioMuted = value === 'true';
    else if (key === 'crackup.commsMuted') next.settings.commsMuted = value === 'true';
    else return;
    const validated = parseCampaignPresentation(next);
    if (JSON.stringify(validated) === JSON.stringify(this.state)) return;
    this.state = validated;
    // WebSocket order ensures each update precedes subsequent Save / Leave controls.
    if (this.publishing) this.publish(structuredClone(validated));
  }
  private importLegacy(callsign: string): CampaignPresentation {
    const result = newCampaignPresentation();
    const read = (key: string): any => { try { return JSON.parse(this.browser?.getItem(key) ?? 'null'); } catch { return null; } };
    const story = read(`crackup:story:v1:${callsign}`);
    if (story) {
      // Old builds saved completed/heard only. Never invent previously unrecorded decisions.
      for (const beat of STORY_BEATS) if (Array.isArray(story.completed) && story.completed.includes(beat.id) &&
        (!beat.requires || result.story.completed.includes(beat.requires))) result.story.completed.push(beat.id);
      if (Array.isArray(story.heard)) result.story.heard = [...new Set<number>(story.heard.filter((n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) < 65536))].slice(0, 4096);
      if (story.active !== undefined && story.choices !== undefined) {
        try { result.story = parseCampaignPresentation({ ...result, story }).story; } catch { /* Keep known legacy fields. */ }
      }
    }
    const movies = read(`crackup:cinematics:v1:${callsign}`);
    for (const [id, reason] of Object.entries(movies ?? {})) if (CINEMATIC_IDS.has(id) && CINEMATIC_ENDS.includes(reason as any)) result.cinematics[id] = reason as any;
    const settings = read('crackup.settings');
    if (settings) {
      result.settings.sensitivity = Math.max(1, Math.min(10, Number(settings.sensitivity) || 4));
      result.settings.quality = settings.quality === 'performance' ? 'performance' : 'standard';
      result.settings.bloom = settings.bloom !== false;
    }
    result.settings.cinematicIntros = read('crackup.cinematicIntros') !== false;
    result.settings.audioMuted = read('crackup.audioMuted') === true;
    result.settings.commsMuted = read('crackup.commsMuted') === true;
    return parseCampaignPresentation(result);
  }
}
