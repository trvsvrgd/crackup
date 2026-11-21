/** Compatibility facade: authored story data lives in the Tier 1 content registry. */
export * from '../content/storyScript.js';
import { STORY_BEATS, type StoryBeat, type StoryContext, type DialogueNode } from '../content/storyScript.js';

export interface StoryProgress {
  completed: string[];
  active: { beat: string; node: string } | null;
  choices: { beat: string; node: string; index: number }[];
}
/** Serial progression; milestones may arrive early but dialogue never jumps ahead of prerequisites. */
export class StoryDirector {
  public readonly completed = new Set<string>();
  public choices: StoryProgress['choices'] = [];
  public beat: StoryBeat | null = null;
  public node: DialogueNode | null = null;
  public snapshot(): StoryProgress {
    return { completed: [...this.completed], active: this.beat && this.node ? { beat: this.beat.id, node: this.node.id } : null,
      choices: this.choices.map(c => ({ ...c })) };
  }
  public restore(saved: StoryProgress): void {
    this.completed.clear(); saved.completed.forEach(id => this.completed.add(id));
    this.choices = saved.choices.map(c => ({ ...c }));
    this.beat = STORY_BEATS.find(b => b.id === saved.active?.beat) ?? null;
    this.node = this.beat?.nodes.find(n => n.id === saved.active?.node) ?? null;
  }
  public update(context: StoryContext): DialogueNode | null {
    if (this.node) return this.node;
    const currentAct = Math.max(1, ...STORY_BEATS.filter(b => this.completed.has(b.id)).map(b => b.act));
    this.beat = STORY_BEATS.find(b => b.act >= currentAct && !this.completed.has(b.id) && (!b.requires || this.completed.has(b.requires)) && b.trigger(context)) ?? null;
    this.node = this.beat?.nodes.find(n => n.id === this.beat!.entry) ?? null;
    return this.node;
  }
  public advance(choice = 0): void {
    if (!this.node || !this.beat) return;
    if (this.node.choices) {
      if (!this.node.choices[choice]) return;
      this.choices = this.choices.filter(c => c.beat !== this.beat!.id || c.node !== this.node!.id);
      this.choices.push({ beat: this.beat.id, node: this.node.id, index: choice });
    }
    const next = this.node.choices?.[choice]?.next ?? this.node.next;
    if (next) this.node = this.beat.nodes.find(n => n.id === next) ?? null;
    else { this.completed.add(this.beat.id); this.node = null; this.beat = null; }
  }
}
