import assert from 'node:assert/strict';
import { buildMapMarkers, CITY_VIEW, WaypointStore, constrainView, districtObjective, mapToWorld, navigationTo, parseWaypoint, worldToMap, zoomView, type Waypoint } from '../client/map/mapModel.js';
import { DISTRICT_LOOP_SPECS } from '../shared/world/phase5Systems.js';
import { EnemyCombatState } from '../shared/constants.js';
import type { DistrictLoopBinaryState, EnemyBinarySnapshotState } from '../shared/protocol/binaryProtocol.js';
import type { PredictionAndInterpolationManager } from '../client/net/netcodeClient.js';

for (const [width, height] of [[900, 500], [500, 900], [720, 720]]) {
  for (const point of [{ x: -400, z: 250 }, { x: 3200, z: 160 }, { x: -160, z: -3300 }]) {
    const screen = worldToMap(point, CITY_VIEW, width, height), world = mapToWorld(screen, CITY_VIEW, width, height);
    assert.ok(Math.abs(world.x - point.x) < 1e-9 && Math.abs(world.z - point.z) < 1e-9);
  }
  const cursor = { x: width * 0.7, y: height * 0.6 }, before = mapToWorld(cursor, CITY_VIEW, width, height);
  const zoomed = zoomView(CITY_VIEW, 0.5, cursor, width, height), after = mapToWorld(cursor, zoomed, width, height);
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.z - after.z) < 1e-9, 'Zoom stays anchored under cursor');
  assert.ok(worldToMap({ x: 0, z: -100 }, CITY_VIEW, width, height).y < height / 2, 'North is -Z');
}
assert.deepEqual(constrainView({ x: 99999, z: -99999, span: 1 }), { x: 3550, z: -3550, span: 100 });
assert.equal(constrainView({ x: 0, z: 0, span: 99999 }).span, 6500);
const origin = { x: 0, y: 0, z: 0 };
assert.equal(navigationTo(origin, { x: 0, z: -100 }).bearing, 0);
assert.equal(navigationTo(origin, { x: 100, z: 0 }).bearing, 90);
assert.equal(navigationTo(origin, { x: 0, z: 100 }).bearing, 180);
assert.equal(navigationTo(origin, { x: -100, z: 0 }).bearing, 270);
assert.equal(navigationTo(origin, { x: 1, y: 100, z: 1 }).arrived, false, 'Rooftop target does not arrive at ground level');
assert.equal(navigationTo(origin, { x: 1, z: 1 }).arrived, true);
assert.equal(navigationTo(origin, { x: 10, y: -12, z: 0 }).elevation, -12);

const memory = new Map<string, string>();
const store = new WaypointStore({ getItem: key => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); } });
store.useProfile('campaign', 'PLAYER', 'HOST-A');
store.set({ type: 'point', x: 20, z: 50, label: 'Rooftop access' });
store.useProfile('campaign', 'PLAYER', 'HOST-B'); assert.equal(store.waypoint, null, 'Campaign owners have separate pins');
store.set({ type: 'marker', id: 'district:1' });
store.useProfile('solo', 'PLAYER', 'PLAYER'); assert.equal(store.waypoint, null);
store.useProfile('campaign', 'PLAYER', 'HOST-A'); assert.equal((store.waypoint as Waypoint | null)?.type, 'point');
store.set(null); store.useProfile('campaign', 'OTHER', 'HOST-A'); store.useProfile('campaign', 'PLAYER', 'HOST-A'); assert.equal(store.waypoint, null, 'Clear persists');
const blocked = new WaypointStore({ getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('quota'); } });
blocked.useProfile('solo', 'PLAYER', 'PLAYER'); assert.equal(blocked.set({ type: 'marker', id: 'district:0' }), false); assert.ok(blocked.waypoint);
for (const raw of ['bad', '{"type":"point","x":1e999,"z":0,"label":"a"}', '{"type":"point","x":9000,"z":0,"label":"a"}', '{"type":"marker","id":"district:9"}', 'x'.repeat(1024)]) assert.equal(parseWaypoint(raw), null);

const spec = DISTRICT_LOOP_SPECS[0], enemies = new Map<number, EnemyBinarySnapshotState>();
const loop: DistrictLoopBinaryState = { districtIndex: 0, currentStage: 1, terminalsHacked: 1, totalTerminals: 2, activeObjectivePos: { ...spec.stage1Terminals[1] } };
assert.deepEqual(districtObjective(spec, loop, enemies).position, spec.stage1Terminals[1], 'Relay marker follows authoritative remaining target');
loop.currentStage = 2;
enemies.set(spec.lieutenantEnemyId, { position: { x: 20, y: 4, z: 8 }, hp: 100, combatState: EnemyCombatState.IDLE } as EnemyBinarySnapshotState);
assert.equal(districtObjective(spec, loop, enemies).position.x, 20, 'Lieutenant marker follows live replicated actor');
loop.currentStage = 3;
enemies.set(spec.kingpinEnemyId, { position: { x: 30, y: 4, z: 8 }, hp: 0, combatState: EnemyCombatState.DEAD } as EnemyBinarySnapshotState);
assert.deepEqual(districtObjective(spec, loop, enemies).position, spec.coreOverridePos, 'Defeated kingpin leads to actual core rather than corpse');
assert.match(districtObjective(spec, loop, enemies).label, /CORE OVERRIDE/);
loop.currentStage = 4; assert.equal(districtObjective(spec, loop, enemies).complete, true);

const peer = { entityId: 2, callsign: 'TEAM', position: { x: 11, y: 4, z: 9 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
const net = { connected: true, mode: 'solo', localCallsign: 'SELF', playerStatus: { hp: 100 }, soloState: null,
  getLocalAgent: () => ({ position: origin, rotation: peer.rotation }), getInterpolatedRemoteEntities: () => [peer],
  rosterCallsigns: new Map([[2, { callsign: 'TEAM' }]]), remoteBuffers: new Map([[2, [{ receiveTimeMs: 1000 }]]]),
  districtLoopSnapshots: [loop], enemySnapshots: enemies, omegaBountySnapshot: null, phase6Snapshot: null } as unknown as PredictionAndInterpolationManager;
assert.ok(buildMapMarkers(net, 1500).some(m => m.id === 'player:TEAM'));
peer.position.x = 100; assert.equal(buildMapMarkers(net, 1600).find(m => m.id === 'player:TEAM')!.position.x, 100);
assert.ok(!buildMapMarkers(net, 5000).some(m => m.id === 'player:TEAM'), 'Silent peers do not retain misleading live markers');
net.rosterCallsigns.clear(); assert.ok(!buildMapMarkers(net, 1500).some(m => m.id === 'player:TEAM'), 'Removed peers disappear');
net.connected = false; assert.deepEqual(buildMapMarkers(net, 1500), [], 'Disconnected clients expose no stale live map state');
console.log('Map checks passed: projection/zoom, compass/elevation, view limits, scoped persistence, storage failure, objective progression/core location, live player motion, stale/disconnected cleanup.');
