import { STORY_BEATS, type StoryProgress } from '../narrative/storyBible.js';
import { DISTRICT_LOOP_SPECS } from '../world/phase5Systems.js';

export const CINEMATIC_IDS = new Set(['opening-v1', 'dreadnought-v1',
  ...DISTRICT_LOOP_SPECS.flatMap(s => [`enemy-${s.lieutenantEnemyId}`, `enemy-${s.kingpinEnemyId}`])]);
export const CINEMATIC_ENDS = ['completed', 'skipped', 'damage', 'death', 'disconnected', 'hidden', 'interrupted'] as const;
export type CinematicEnd = typeof CINEMATIC_ENDS[number];
export interface CampaignSettings {
  sensitivity: number;
  quality: 'standard' | 'performance';
  bloom: boolean;
  cinematicIntros: boolean;
  audioMuted: boolean;
  commsMuted: boolean;
}
export interface CampaignPresentation {
  story: StoryProgress & { heard: number[] };
  cinematics: Record<string, CinematicEnd>;
  settings: CampaignSettings;
}
export function newCampaignPresentation(): CampaignPresentation {
  return { story: { completed: [], active: null, choices: [], heard: [] }, cinematics: {},
    settings: { sensitivity: 4, quality: 'standard', bloom: true, cinematicIntros: true, audioMuted: false, commsMuted: false } };
}
function check(ok: unknown): asserts ok { if (!ok) throw new Error('Invalid campaign presentation data'); }
function keys(value: any, allowed: string[]): void {
  check(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => allowed.includes(k)));
}
/** Presentation has no inventory, XP, mission objectives or world authority. Reject unknown/bounded data. */
export function parseCampaignPresentation(value: unknown): CampaignPresentation {
  const p = value as CampaignPresentation;
  keys(p, ['story', 'cinematics', 'settings']);
  const s = p.story;
  keys(s, ['completed', 'active', 'choices', 'heard']);
  check(Array.isArray(s.completed) && s.completed.length <= STORY_BEATS.length && new Set(s.completed).size === s.completed.length);
  check(s.completed.every(id => STORY_BEATS.some(b => b.id === id && (!b.requires || s.completed.includes(b.requires)))));
  const activeBeat = s.active && STORY_BEATS.find(b => b.id === s.active!.beat);
  if (s.active !== null) {
    keys(s.active, ['beat', 'node']);
    check(activeBeat && !s.completed.includes(activeBeat.id) && (!activeBeat.requires || s.completed.includes(activeBeat.requires)) && activeBeat.nodes.some(n => n.id === s.active!.node));
  }
  check(Array.isArray(s.choices) && s.choices.length <= 2);
  const seen = new Set<string>();
  for (const c of s.choices) {
    keys(c, ['beat', 'node', 'index']);
    const beat = STORY_BEATS.find(b => b.id === c.beat), node = beat?.nodes.find(n => n.id === c.node);
    check(beat && (s.completed.includes(beat.id) || activeBeat?.id === beat.id) && Number.isInteger(c.index) && c.index >= 0 && node?.choices?.[c.index]);
    check(!seen.has(`${c.beat}:${c.node}`)); seen.add(`${c.beat}:${c.node}`);
  }
  // Stable source-orb indices: several sources can share one transcript.
  check(Array.isArray(s.heard) && s.heard.length <= 4096 && new Set(s.heard).size === s.heard.length && s.heard.every(n => Number.isInteger(n) && n >= 0 && n < 65536));
  keys(p.cinematics, [...CINEMATIC_IDS]);
  check(Object.values(p.cinematics).every(v => CINEMATIC_ENDS.includes(v)));
  const settings = p.settings;
  keys(settings, ['sensitivity', 'quality', 'bloom', 'cinematicIntros', 'audioMuted', 'commsMuted']);
  check(Number.isFinite(settings.sensitivity) && settings.sensitivity >= 1 && settings.sensitivity <= 10);
  check(['standard', 'performance'].includes(settings.quality));
  check([settings.bloom, settings.cinematicIntros, settings.audioMuted, settings.commsMuted].every(v => typeof v === 'boolean'));
  return structuredClone(p);
}
/** Recap derives only from encountered beats/choices; no future plot summaries. */
export function campaignRecap(p: CampaignPresentation): string {
  const story = p.story, last = STORY_BEATS.filter(b => story.completed.includes(b.id)).at(-1);
  const active = STORY_BEATS.find(b => b.id === story.active?.beat);
  const choice = story.choices.at(-1);
  const label = choice && STORY_BEATS.find(b => b.id === choice.beat)?.nodes.find(n => n.id === choice.node)?.choices?.[choice.index]?.label;
  return [last ? `Last briefing: ${last.title}.` : 'Your deployment briefing is in progress.',
    active ? `Continue: ${active.title}.` : '', label ? `Last response: ${label}` : '',
    story.heard.length ? `Recovered memories: ${story.heard.length}.` : ''].filter(Boolean).join(' ');
}
