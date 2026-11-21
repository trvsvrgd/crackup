import { characterNameForCallsign } from '../../shared/content/characterRegistry.js';
import { AGENT_RESPAWN_POSITION, DreadnoughtPhase, EnemyCombatState } from '../../shared/constants.js';
import { SOLO_RESUME_POSITION } from '../../shared/campaign/soloCampaign.js';
import type { DistrictLoopBinaryState, EnemyBinarySnapshotState, Vec3 } from '../../shared/protocol/binaryProtocol.js';
import { DISTRICT_LOOP_SPECS, type DistrictLoopSpec } from '../../shared/world/phase5Systems.js';
import { BRIDGES, BRIDGE_LENGTH, bridgePoint } from '../../shared/world/bayVista.js';
import { CLASH_BALCONY_CENTER, DERBY_SPECTATOR_DECK_CENTER } from '../../shared/world/cyberPetArena.js';
import type { PredictionAndInterpolationManager } from '../net/netcodeClient.js';

export type MarkerKind = 'player' | 'objective' | 'event' | 'landmark';
export interface MapMarker {
  id: string; kind: MarkerKind; label: string; detail: string; position: Vec3;
  complete?: boolean; local?: boolean; yaw?: number; districtIndex?: number;
}
export type Waypoint = { type: 'point'; x: number; z: number; label: string } | { type: 'marker'; id: string };
export interface MapView { x: number; z: number; span: number }
export const MAP_BOUNDS = { minX: -750, maxX: 3550, minZ: -3550, maxZ: 750 };
export const CITY_VIEW: MapView = { x: 0, z: 0, span: 1400 };
export const WORLD_VIEW: MapView = { x: 1400, z: -1400, span: 4500 };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const mapScale = (view: MapView, width: number, height: number) => Math.min(width, height) / view.span;
export function worldToMap(point: { x: number; z: number }, view: MapView, width: number, height: number) {
  const scale = mapScale(view, width, height);
  return { x: width / 2 + (point.x - view.x) * scale, y: height / 2 + (point.z - view.z) * scale };
}
export function mapToWorld(point: { x: number; y: number }, view: MapView, width: number, height: number) {
  const scale = mapScale(view, width, height);
  return { x: view.x + (point.x - width / 2) / scale, z: view.z + (point.y - height / 2) / scale };
}
export function constrainView(view: MapView): MapView {
  return { x: clamp(view.x, MAP_BOUNDS.minX, MAP_BOUNDS.maxX), z: clamp(view.z, MAP_BOUNDS.minZ, MAP_BOUNDS.maxZ), span: clamp(view.span, 100, 6500) };
}
export function zoomView(view: MapView, factor: number, anchor: { x: number; y: number }, width: number, height: number): MapView {
  const before = mapToWorld(anchor, view, width, height);
  const next = { ...view, span: clamp(view.span * factor, 100, 6500) };
  const after = mapToWorld(anchor, next, width, height);
  return constrainView({ ...next, x: next.x + before.x - after.x, z: next.z + before.z - after.z });
}
export function validMapPoint(x: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(z) && x >= MAP_BOUNDS.minX && x <= MAP_BOUNDS.maxX && z >= MAP_BOUNDS.minZ && z <= MAP_BOUNDS.maxZ;
}
export function parseWaypoint(raw: string | null): Waypoint | null {
  if (!raw || raw.length > 512) return null;
  try {
    const p = JSON.parse(raw);
    if (p?.type === 'marker' && typeof p.id === 'string' && /^(district:[0-3]|player:.{1,32}|event:(omega|dreadnought)|landmark:[a-z-]+)$/.test(p.id)) return { type: 'marker', id: p.id };
    if (p?.type === 'point' && validMapPoint(p.x, p.z) && typeof p.label === 'string' && p.label.length <= 48) return { type: 'point', x: p.x, z: p.z, label: p.label || 'My waypoint' };
  } catch { /* Corrupt optional browser preferences never block deployment. */ }
  return null;
}
export function navigationTo(from: Vec3, to: { x: number; z: number; y?: number }) {
  const dx = to.x - from.x, dz = to.z - from.z, distance = Math.hypot(dx, dz);
  const elevation = to.y === undefined ? null : to.y - from.y;
  return { distance, elevation, bearing: (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360,
    arrived: distance <= 8 && (elevation === null || Math.abs(elevation) <= 5) };
}
export function districtObjective(spec: DistrictLoopSpec, loop: DistrictLoopBinaryState | undefined, enemies: ReadonlyMap<number, EnemyBinarySnapshotState>): MapMarker {
  const stage = loop?.currentStage ?? 1;
  const enemy = enemies.get(stage === 2 ? spec.lieutenantEnemyId : spec.kingpinEnemyId);
  const defeated = enemy && (enemy.hp <= 0 || enemy.combatState === EnemyCombatState.DEAD);
  const core = stage === 3 && defeated;
  const label = stage === 4 ? 'LIBERATED' : stage === 1 ? 'RELAY' : stage === 2 ? 'LIEUTENANT' : core ? 'CORE OVERRIDE' : 'KINGPIN';
  const position = stage === 4 || core ? spec.coreOverridePos
    : stage >= 2 && enemy && !defeated ? enemy.position : loop?.activeObjectivePos ?? spec.stage1Terminals[0];
  return { id: `district:${spec.districtIndex}`, kind: 'objective', districtIndex: spec.districtIndex,
    label: `${spec.district.replaceAll('_', ' ')} · ${label}`, position: { ...position }, complete: stage === 4,
    detail: stage === 4 ? 'District liberated. Reward earned.' : stage === 1
      ? `Sabotage relays: ${loop?.terminalsHacked ?? 0}/${loop?.totalTerminals ?? 2}. Press H near the active relay.`
      : stage === 2 ? `Defeat ${characterNameForCallsign(spec.lieutenantCallsign)}.` : core ? 'Press H at the core to liberate this district.' : `Defeat ${characterNameForCallsign(spec.kingpinCallsign)}, then override the core.` };
}

/** Only server-replicated objectives and players are exposed; this never reads hidden enemy simulation. */
export function buildMapMarkers(net: PredictionAndInterpolationManager, now: number): MapMarker[] {
  if (!net.connected) return [];
  const markers: MapMarker[] = [], local = net.getLocalAgent();
  if (local) markers.push({ id: `player:${net.localCallsign}`, kind: 'player', local: true, label: `${net.localCallsign} (you)`,
    position: { ...local.position }, detail: net.playerStatus?.hp === 0 ? 'Downed · recover or await revival.' : 'Your live position and facing.',
    yaw: Math.atan2(2 * (local.rotation.w * local.rotation.y + local.rotation.x * local.rotation.z), 1 - 2 * (local.rotation.y ** 2 + local.rotation.z ** 2)) });
  for (const peer of net.getInterpolatedRemoteEntities(now)) {
    const latest = net.remoteBuffers.get(peer.entityId)?.at(-1);
    if (!net.rosterCallsigns.has(peer.entityId) || (!net.soloState?.paused && (!latest || now - latest.receiveTimeMs > 3000))) continue;
    markers.push({ id: `player:${peer.callsign}`, kind: 'player', label: peer.callsign, detail: 'Squadmate · live position and facing.', position: { ...peer.position },
      yaw: Math.atan2(2 * (peer.rotation.w * peer.rotation.y + peer.rotation.x * peer.rotation.z), 1 - 2 * (peer.rotation.y ** 2 + peer.rotation.z ** 2)) });
  }
  for (const loop of net.districtLoopSnapshots) {
    const spec = DISTRICT_LOOP_SPECS.find(s => s.districtIndex === loop.districtIndex);
    if (spec) markers.push(districtObjective(spec, loop, net.enemySnapshots));
  }
  const omega = net.omegaBountySnapshot;
  if (omega?.active && !omega.completed && !omega.escaped) markers.push({ id: 'event:omega', kind: 'event', label: 'Omega bounty',
    detail: `${Math.ceil(omega.timeRemainingSec)} seconds remaining. Moving target.`, position: { ...omega.position } });
  const boss = net.phase6Snapshot?.dreadnought;
  if (boss && boss.phase !== DreadnoughtPhase.DORMANT && boss.phase !== DreadnoughtPhase.DEFEATED) markers.push({ id: 'event:dreadnought', kind: 'event', label: 'Apex Dreadnought', detail: 'Active raid encounter.', position: { ...boss.position } });
  markers.push({ id: 'landmark:drop', kind: 'landmark', label: 'Agency drop point', detail: 'Campaign resume point. Recovery may use the central agency spawn.', position: { ...(net.mode === 'shared' ? AGENT_RESPAWN_POSITION : SOLO_RESUME_POSITION) } },
    { id: 'landmark:derby', kind: 'landmark', label: 'Sky arena · Derby', detail: 'Elevated spectator deck. Enter through the Companion arena menu.', position: { ...DERBY_SPECTATOR_DECK_CENTER } },
    { id: 'landmark:clash', kind: 'landmark', label: 'Sky arena · Clash', detail: 'Elevated balcony. Enter through the Companion arena menu.', position: { ...CLASH_BALCONY_CENTER } });
  for (const bridge of BRIDGES) markers.push({ id: `landmark:${bridge.id}`, kind: 'landmark', label: `${bridge.id === 'vermilion' ? 'Vermilion' : 'Eclipse'} bridge overlook`, detail: 'Bridge viewing barrier; distant terrain is scenery.', position: bridgePoint(bridge, BRIDGE_LENGTH - 5) });
  return markers;
}

export class WaypointStore {
  public waypoint: Waypoint | null = null;
  private key = '';
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null) {}
  public useProfile(mode: string, callsign: string, owner: string): boolean {
    const key = `crackup.map.v1:${JSON.stringify([mode, callsign, owner])}`;
    if (key === this.key) return false;
    this.key = key;
    try { this.waypoint = parseWaypoint(this.storage?.getItem(key) ?? null); } catch { this.waypoint = null; }
    return true;
  }
  public set(value: Waypoint | null): boolean {
    this.waypoint = value;
    try { if (!this.storage || !this.key) return false; this.storage.setItem(this.key, JSON.stringify(value)); return true; } catch { return false; }
  }
}
