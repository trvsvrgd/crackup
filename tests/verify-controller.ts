import assert from 'node:assert/strict';
import { XboxController, stick, type ControllerDevice } from '../client/input/xboxController.js';
import { SpringArmCameraController } from '../client/camera/springArmCamera.js';
import { INPUT_FLAG_AIM, INPUT_FLAG_FIRE, INPUT_FLAG_JUMP, INPUT_FLAG_GRAPPLE,
  INPUT_FLAG_VEHICLE_INTERACT, INPUT_FLAG_OBJECTIVE_JETPACK, INPUT_FLAG_PARRY,
  INPUT_FLAG_MELEE, INPUT_FLAG_SPRINT, INPUT_FLAG_DASH, INPUT_FLAG_MANTLE,
  INPUT_FLAG_RELIC_REWIND, INPUT_FLAG_GRAB_THROW, CAMERA_PITCH_MAX_RAD } from '../shared/constants.js';

const pad = (buttons: number[] = [], axes = [0, 0, 0, 0], index = 2): ControllerDevice => ({
  id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', index, connected: true, mapping: 'standard',
  axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), touched: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 })),
});
const input = new XboxController();
const poll = (buttons: number[] = [], axes?: number[], gameplay = true, enabled = true) => input.poll([null, null, pad(buttons, axes)], enabled, gameplay);
assert.deepEqual(stick(0.1, -0.1), [0, 0], 'radial deadzone removes stick drift');
assert.deepEqual(stick(NaN, Infinity), [0, 0]);
assert.ok(Math.abs(Math.hypot(...stick(1, 1)) - 1) < 1e-9, 'diagonals cannot exceed full speed');
poll([7]); assert.equal(input.consume().buttons, 0, 'connecting with trigger held cannot shoot');
poll();
for (const [button, flag] of [[0, INPUT_FLAG_JUMP], [1, INPUT_FLAG_DASH], [2, INPUT_FLAG_OBJECTIVE_JETPACK],
  [5, INPUT_FLAG_PARRY], [6, INPUT_FLAG_AIM], [7, INPUT_FLAG_FIRE], [10, INPUT_FLAG_SPRINT], [11, INPUT_FLAG_MELEE]]) {
  poll([button]); assert.equal(input.consume().buttons, flag); poll(); input.consume();
}
for (const [button, flag] of [[0, INPUT_FLAG_MANTLE], [1, INPUT_FLAG_RELIC_REWIND], [2, INPUT_FLAG_GRAB_THROW],
  [3, INPUT_FLAG_VEHICLE_INTERACT], [6, INPUT_FLAG_OBJECTIVE_JETPACK], [7, INPUT_FLAG_GRAPPLE]]) {
  poll([4, button]); assert.equal(input.consume().buttons, flag); poll(); input.consume();
}
poll([7]); poll(); assert.equal(input.consume().buttons, INPUT_FLAG_FIRE, 'short taps survive until simulation tick');
assert.equal(input.consume().buttons, 0, 'tap consumed exactly once');
poll([7]); input.consume(); poll([7]); assert.equal(input.consume().buttons, INPUT_FLAG_FIRE, 'held trigger continues firing');
poll(); input.consume();
assert.deepEqual(poll([3]).commands, ['reload']); assert.deepEqual(poll([3]).commands, [], 'reload edge only'); poll();
assert.deepEqual(poll([4, 12]).commands, ['wingsuit']); poll();
assert.deepEqual(poll([8]).commands, ['map']); poll();
assert.deepEqual(poll([9]).commands, ['menu']); poll();
poll([], [0.59, -0.59, 0, 0]); const move = input.consume();
assert.ok(move.moveX > 0 && move.moveX < 1 && move.moveZ === move.moveX, 'analog camera-relative movement preserved');
poll([7], undefined, false); assert.equal(input.consume().buttons, 0, 'menu blocks gameplay');
poll([7]); assert.equal(input.consume().buttons, 0, 'closing menu with held trigger remains blocked');
poll(); poll([7]); assert.equal(input.consume().buttons, INPUT_FLAG_FIRE);
poll([7], undefined, true, false); poll([7]); assert.equal(input.consume().buttons, 0, 'alt-tab requires release');
poll(); poll([7]); input.poll([], true, true); assert.equal(input.consume().buttons, 0, 'disconnect clears pending fire');
input.poll([{ ...pad(), mapping: '' }], true, true); assert.equal(input.consume().buttons, 0, 'unmapped devices ignored');
assert.equal(input.poll([pad()], true, true).connected, true, 'sparse nonzero controller slot reconnects');
input.poll([pad([], undefined, 3)], true, true); assert.equal(input.consume().buttons, 0, 'device replacement starts neutral');
const camera30 = new SpringArmCameraController(1), camera120 = new SpringArmCameraController(1);
for (let i = 0; i < 30; i++) camera30.onControllerLook(1, 0, 1 / 30);
for (let i = 0; i < 120; i++) camera120.onControllerLook(1, 0, 1 / 120);
assert.ok(Math.abs(camera30.yaw - camera120.yaw) < 1e-9, 'look speed is frame-rate independent');
camera30.onControllerLook(0, 1, 1 / 30, 1, true);
assert.ok(camera30.pitch > -0.18, 'invert Y reverses look');
for (let i = 0; i < 200; i++) camera30.onControllerLook(0, -1, 1 / 30);
assert.equal(camera30.pitch, CAMERA_PITCH_MAX_RAD, 'pitch stays bounded');
console.log('PASS: Xbox mappings, analog/deadzones, buffering, menus/focus/disconnect safety, and camera timing.');
