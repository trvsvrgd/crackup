import assert from 'node:assert/strict';
import { CHARACTERS, STORY_BEATS, STORY_ACTS, WHISPER_TRANSCRIPTS, StoryDirector, type StoryContext } from '../shared/narrative/storyBible.js';
import { createFactionMaterials } from '../client/shaders/factionPalette.js';
import { InkOutlinePass, INK_FRAGMENT_SHADER } from '../client/shaders/inkOutlinePass.js';
import * as THREE from 'three';

assert.equal(STORY_ACTS.length, 3); assert.equal(Object.keys(CHARACTERS).length, 3); assert.equal(WHISPER_TRANSCRIPTS.length, 12);
for (const beat of STORY_BEATS) {
  const ids = new Set(beat.nodes.map(n => n.id)); assert.equal(ids.size, beat.nodes.length); assert.ok(ids.has(beat.entry));
  const visited = new Set<string>();
  function visit(id: string, path = new Set<string>()) {
    assert.ok(!path.has(id), `${beat.id}: dialogue cycle`); path.add(id); visited.add(id);
    const node = beat.nodes.find(n => n.id === id)!; assert.ok(node && node.text.length > 30 && CHARACTERS[node.speaker]);
    for (const target of [node.next, ...(node.choices?.map(c => c.next) ?? [])].filter(Boolean) as string[]) {
      assert.ok(ids.has(target), `${beat.id}: dangling link ${target}`); visit(target, new Set(path));
    }
  }
  visit(beat.entry); assert.equal(visited.size, beat.nodes.length, `${beat.id}: unreachable dialogue`);
}
const context: StoryContext = { deployed: false, districtIndex: 0, vigilanteLevel: 1, whisperOrbs: 0, nonLethalBounties: 0, relaySabotage: false, citadelLoopStage: 1, bossDefeated: false };
const director = new StoryDirector(); assert.equal(director.update(context), null);
context.deployed = true; assert.equal(director.update(context)?.speaker, 'vance');
const finish = () => { let safety = 0; while (director.node && safety++ < 30) director.advance(0); assert.ok(safety < 30); };
finish(); assert.ok(director.completed.has('deployment')); assert.equal(director.update(context), null);
context.whisperOrbs = 3; assert.equal(director.update(context)?.id, 'breach'); finish();
assert.equal(director.update(context), null, 'Revelation needs relay telemetry');
context.relaySabotage = true; director.update(context); finish(); director.update(context); finish();
assert.ok(director.completed.has('revelation')); context.citadelLoopStage = 3; director.update(context); finish();
assert.ok(director.completed.has('killswitch')); context.bossDefeated = true; director.update(context); finish();
assert.ok(director.completed.has('dawn')); assert.equal(director.update(context), null, 'No repeat transmissions');
const spare = new StoryDirector(); spare.completed.add('deployment');
assert.equal(spare.update({ ...context, whisperOrbs: 0, nonLethalBounties: 2, relaySabotage: false })?.id, 'breach');
for (const faction of ['aegis', 'syndicate', 'resistance'] as const) {
  const materials = createFactionMaterials(faction);
  assert.ok(materials.armor.userData.eclipsePBR); assert.ok(materials.trim.emissiveIntensity > 0);
  Object.values(materials).forEach(m => m.dispose());
}
const pass = new InkOutlinePass(new THREE.Scene(), new THREE.PerspectiveCamera());
pass.setSize(800, 600); assert.equal(pass.target.width, 800); assert.ok(pass.target.depthTexture);
assert.ok(INK_FRAGMENT_SHADER.includes('tNormal') && INK_FRAGMENT_SHADER.includes('linearDepth')); pass.dispose();
console.log('Stage 1 passed: dialogue graph/branches, ordered milestones, transcript catalog, faction PBR, depth+normal ink resources.');
