import { CHARACTER_REGISTRY } from './characterRegistry.js';
import { immutable, RESONANCE_MEMORY_FRAGMENTS } from './worldLore.js';
/** Section 6 upstream source of truth. Cinematics must consume this script after art approval. */
export type SpeakerId = 'vance' | 'sera' | 'voss';
export type NarrativeFaction = 'aegis' | 'syndicate' | 'resistance';
export interface CharacterProfile {
  name: string; role: string; faction: NarrativeFaction; color: string;
  appearance: string; motivation: string; arc: [string, string, string]; voiceHz: number;
}
export const CHARACTERS: Record<SpeakerId, CharacterProfile> = {
  vance: { name: CHARACTER_REGISTRY.find(c => c.id === 'CHAR_VANCE')!.name, role: 'Aegis Directorate', faction: 'aegis', color: '#42caff',
    appearance: 'Silver swept hair, narrow jaw, white ceramic collar, cobalt neural temple implants.',
    motivation: 'Convert citizens into a distributed neural processor while presenting control as public safety.',
    arc: ['Paternal mission commander', 'Conceals the relay harvest', 'Activates the kill-switch and retreats to the Dreadnought'], voiceHz: 108 },
  sera: { name: CHARACTER_REGISTRY.find(c => c.id === 'CHAR_SERA')!.name, role: 'Squad Comms Officer', faction: 'aegis', color: '#86dcff',
    appearance: 'Asymmetric dark fringe, angular comms headset, cobalt uniform, copper emergency patch lead.',
    motivation: 'Protect her squad; loyalty shifts from the Directorate to the people it exploits.',
    arc: ['Trusts Aegis dispatch', 'Confirms the cover-up and forges telemetry', 'Risks her life transmitting the override'], voiceHz: 218 },
  voss: { name: CHARACTER_REGISTRY.find(c => c.id === 'CHAR_VOSS')!.name, role: 'Resistance Architect', faction: 'resistance', color: '#50efad',
    appearance: 'Shaved scalp, round optic lenses, carbon field coat, exposed copper implant wiring.',
    motivation: 'Destroy the lease system even if Protocol Eclipse kills citizens at 50% or greater Hollowing.',
    arc: ['Branded a terrorist', 'Reveals the minds inside Agility Orbs', 'Builds the Protocol Eclipse Override'], voiceHz: 152 },
};
export interface DialogueNode {
  id: string; speaker: SpeakerId; text: string; next?: string;
  choices?: { label: string; next: string }[];
}
/** Short timed cues share the narrative source with live comms. The opening also uses deployment/mandate verbatim. */
export const CINEMATIC_LINES: Record<'arrival' | 'lieutenant' | 'kingpin' | 'dreadnought', DialogueNode> = {
  arrival: { id: 'cinema-arrival', speaker: 'sera', text: 'Squad link stable. Neon Docks is ahead. Follow the relay signal.' },
  lieutenant: { id: 'cinema-lieutenant', speaker: 'sera', text: 'Lieutenant on the field. Watch for the counter window.' },
  kingpin: { id: 'cinema-kingpin', speaker: 'sera', text: 'The kingpin holds the core. Break their guard.' },
  dreadnought: { id: 'cinema-dreadnought', speaker: 'sera', text: 'Break the engines. Expose the core. End the Dreadnought.' },
};
export interface StoryContext {
  deployed: boolean; districtIndex: number; vigilanteLevel: number; whisperOrbs: number;
  nonLethalBounties: number; relaySabotage: boolean; citadelLoopStage: number; bossDefeated: boolean;
}
export interface StoryBeat {
  id: string; act: 1 | 2 | 3; title: string; requires?: string; entry: string;
  trigger: (context: StoryContext) => boolean; nodes: DialogueNode[];
}
export const STORY_ACTS = [
  { act: 1, title: 'The Safety Mandate', districts: [0, 1], objective: 'Disrupt the relays Vance calls terrorist infrastructure.' },
  { act: 2, title: 'Voices Beneath the Signal', districts: [1, 2], objective: 'Expose the neural dampeners and protect the decrypted evidence.' },
  { act: 3, title: 'Protocol Eclipse', districts: [3], objective: 'Survive the kill-switch, free the squad, and bring down the Dreadnought.' },
] as const;
export const STORY_BEATS: StoryBeat[] = [
  { id: 'deployment', act: 1, title: 'Welcome to Neo-Veridia', entry: 'mandate', trigger: c => c.deployed, nodes: [
    { id: 'mandate', speaker: 'vance', text: 'Agents. Neo-Veridia is a city under siege. Voss has poisoned its relays. You are the cure.', next: 'dispatch' },
    { id: 'dispatch', speaker: 'sera', text: 'Squad link stable. Start in the Docks and Foundry. Hack both terminals, remove the lieutenant, then reach the core.',
      choices: [{ label: 'Who is Voss?', next: 'target' }, { label: 'Understood. Moving.', next: 'move' }] },
    { id: 'target', speaker: 'vance', text: 'A gifted architect who mistook doubt for conscience. Do not give his broadcasts an audience.', next: 'move' },
    { id: 'move', speaker: 'sera', text: 'Keep moving. Comms stay live while you work. Amber windup means a counter opportunity: press Q.' },
  ] },
  { id: 'mandate', act: 1, title: 'Restoring Order', requires: 'deployment', entry: 'order',
    trigger: c => c.districtIndex <= 1 && c.vigilanteLevel <= 2 && c.relaySabotage, nodes: [
      { id: 'order', speaker: 'vance', text: 'Every relay you disable returns a district to lawful service. Precision is compassion, Agent.', next: 'anomaly' },
      { id: 'anomaly', speaker: 'sera', text: 'Odd. The outage report is listing patient identifiers instead of power loss. I will check it.' },
    ] },
  { id: 'evidence', act: 2, title: 'A Human Signal', requires: 'deployment', entry: 'breach',
    trigger: c => c.whisperOrbs >= 3 || c.nonLethalBounties >= 2, nodes: [
      { id: 'breach', speaker: 'voss', text: 'You spared witnesses. Or perhaps you listened to the whispers. Either way, you have heard what Aegis deletes.', next: 'choice' },
      { id: 'choice', speaker: 'sera', text: 'Unauthorized signal. Wait... those signatures match the missing citizens.', choices: [
        { label: 'Show us the source.', next: 'source' }, { label: 'Why trust you?', next: 'guilt' }] },
      { id: 'guilt', speaker: 'voss', text: 'I designed your implants. My guilt is not evidence. The relay telemetry is. Read it yourself.', next: 'source' },
      { id: 'source', speaker: 'voss', text: 'Reach a relay core. I can expose its live feed there. Keep this channel beneath your mission carrier.' },
    ] },
  { id: 'revelation', act: 2, title: 'The Dampeners', requires: 'evidence', entry: 'truth',
    trigger: c => c.relaySabotage, nodes: [
      { id: 'truth', speaker: 'voss', text: 'There. Not a terrorist transmitter: an Aegis neural dampener. Those spikes are people. Your Agility Orbs are harvested dissident minds.', next: 'confirm' },
      { id: 'confirm', speaker: 'sera', text: 'I checked the raw telemetry against hospital records. He is right. Vance signed the harvest orders.', next: 'fake' },
      { id: 'fake', speaker: 'sera', text: 'I will forge your mission returns. Vance sees loyal Agents; we see the route into the Citadel.', next: 'rescue' },
      { id: 'rescue', speaker: 'voss', text: 'Then help me turn the prison into a door. Save the source nodes. We will need them for Eclipse.' },
    ] },
  { id: 'killswitch', act: 3, title: 'Revocation', requires: 'revelation', entry: 'revoke',
    trigger: c => c.citadelLoopStage >= 3, nodes: [
      { id: 'revoke', speaker: 'vance', text: 'Sera. I read the silence between your reports. Agents, your autonomy was a revocable privilege. Neural termination authorized.', next: 'hold' },
      { id: 'hold', speaker: 'sera', text: 'Stay with me! I have severed dispatch. Kaelen, send it now.', next: 'override' },
      { id: 'override', speaker: 'voss', text: 'Local override uploading. Full Eclipse is different: every citizen half Hollowed or more would die.', next: 'free' },
      { id: 'free', speaker: 'sera', text: 'Kill-switch neutralized. Storm the Plaza. Break the engines, expose the core, and end Vance\'s Dreadnought.' },
    ] },
  { id: 'dawn', act: 3, title: 'A City Unbound', requires: 'killswitch', entry: 'silence',
    trigger: c => c.bossDefeated, nodes: [
      { id: 'silence', speaker: 'sera', text: 'Dreadnought down. The city channels are opening. Our choices will decide who survives the transition.', next: 'after' },
      { id: 'after', speaker: 'voss', text: 'Vance will preserve the leases. My purge will destroy them. Your record may yet offer another way.' },
    ] },
];
export const WHISPER_TRANSCRIPTS = RESONANCE_MEMORY_FRAGMENTS.slice(0, 12).map(m => m.transcript);


for (const content of [CHARACTERS, CINEMATIC_LINES, STORY_ACTS, STORY_BEATS, WHISPER_TRANSCRIPTS]) immutable(content);
