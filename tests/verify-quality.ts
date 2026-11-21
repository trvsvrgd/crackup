import assert from 'node:assert/strict';
import { BugReportRecorder } from '../client/diagnostics/bugReport.js';
import { SkeletalAnimator } from '../client/animation/skeletalAnimator.js';
import { HumanoidRig } from '../client/animation/humanoidRig.js';

const recorder = new BugReportRecorder();
const error = new TypeError('PIN=secret-pin session-code=secret-invite callsign=secret-profile');
error.stack = 'TypeError: secret-pin\n at connect (https://secret-host/game.js:123:45)\n at local (C:\\Users\\secret-user\\source.ts:5:6)';
for (let i = 0; i < 75; i++) recorder.record('runtime-error', error);
for (let i = 0; i < 240; i++) recorder.frame(10 + i / 10);
recorder.frame(NaN); recorder.frame(Infinity); recorder.frame(-1); recorder.frame(10001);
const context = { mode: 'solo' as const, connected: true, paused: true, saveError: false, saveRevision: 9,
  district: 'NEON_DOCKS', position: { x: 1.234, y: NaN, z: 4 }, callsign: 'secret-profile', pin: 'secret-pin', inviteCode: 'secret-invite' };
const report = recorder.report('client-test', 'repeat steps', context);
assert.equal(report.events.length, 40);
assert.equal(report.rendering.frameSamples, 120);
assert.equal(report.rendering.medianFrameMs, 28.1);
assert.equal(report.rendering.p95FrameMs, 33.4);
assert.equal(report.rendering.maxFrameMs, 10001, 'Long intervals are retained, not silently discarded');
assert.equal(report.session.district, 'NEON_DOCKS');
assert.deepEqual(report.session.position, { x: 1.23, y: null, z: 4 });
assert.deepEqual(report.events[0].frames, ['game.js:123:45']);
assert.equal(report.events[0].category, 'TypeError');
assert.ok(!JSON.stringify(report).includes('secret-'), 'Automatic fields exclude all credential, host, path and profile sentinels');
report.events[0].frames.push('modified');
assert.equal(recorder.report('client-test', '').events[0].frames.length, 1, 'Exports cannot mutate the ring');
assert.equal(recorder.report('client-test', 'a'.repeat(9000)).notes.length, 4000);
assert.equal(new BugReportRecorder().report('client-test', '').rendering.p95FrameMs, null);
recorder.record('unhandled-rejection', { pin: 'secret-pin' });
assert.equal(recorder.report('client-test', '').events.at(-1)!.category, 'Unknown');

const rig = new HumanoidRig(0, true), animator = new SkeletalAnimator(rig);
for (let i = 0; i < 600; i++) animator.update(1 / 60, { speed: 2, verticalSpeed: 0 });
const before = rig.bones.LeftThigh.rotation.x;
animator.update(1 / 60, { speed: 5, verticalSpeed: 0 });
animator.update(1 / 60, { speed: 5, verticalSpeed: 0 });
assert.ok(Math.abs(before - rig.bones.LeftThigh.rotation.x) < 0.2, 'Changing walking speed preserves foot-cycle continuity even late in a session');
const ticks = animator.ticks;
animator.update(NaN, { speed: 5, verticalSpeed: 0 });
animator.update(Infinity, { speed: 5, verticalSpeed: 0 });
animator.update(1 / 60, { speed: 5, verticalSpeed: 0 });
assert.equal(animator.ticks, ticks + 1, 'Bad frame deltas do not poison future animation');
assert.ok(rig.skeleton.bones.every(bone => bone.quaternion.toArray().every(Number.isFinite)));
rig.dispose();

function sample(hz: number) {
  const rig = new HumanoidRig(0, true), animator = new SkeletalAnimator(rig);
  for (let second = 0; second < 4; second++) {
    for (let frame = 0; frame < hz; frame++) animator.update(1 / hz, { speed: [2, 5, 9, 0][second], verticalSpeed: 0 });
  }
  const result = { ticks: animator.ticks, rotations: rig.skeleton.bones.map(bone => bone.quaternion.toArray()) };
  rig.dispose(); return result;
}
assert.deepEqual(sample(60), sample(120), 'Acceleration, sprint and idle transitions remain fixed-step deterministic');
console.log('Quality checks passed: bounded reports, credential exclusion, safe stack locations, frame metrics, export isolation, gait continuity, invalid-time recovery and 60/120 Hz animation equivalence.');
