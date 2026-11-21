import { characterNameForCallsign } from '../../shared/content/characterRegistry.js';
import { DreadnoughtPhase, EnemyCombatState } from "../../shared/constants.js";
import type {
  Vec3,
  DistrictLoopBinaryState,
  EnemyBinarySnapshotState,
  Phase6SnapshotPacket,
} from "../../shared/protocol/binaryProtocol.js";
import {
  STORY_BEATS,
  CINEMATIC_LINES,
  type DialogueNode,
} from "../../shared/narrative/storyBible.js";
import { BRIDGES, bridgePoint } from "../../shared/world/bayVista.js";
import { DISTRICT_LOOP_SPECS } from "../../shared/world/phase5Systems.js";

export interface CameraPose {
  position: Vec3;
  target: Vec3;
  fov: number;
}
export interface CinematicShot {
  start: number;
  end: number;
  from: CameraPose;
  to: CameraPose;
}
export interface CinematicTrack {
  id: string;
  title: string;
  eyebrow: string;
  duration: number;
  shots: CinematicShot[];
  cues: Array<{ start: number; end: number; line: DialogueNode }>;
  targetEnemyId?: number;
}
export const OPENING_ID = "opening-v1";
export { CINEMATIC_IDS } from '../../shared/campaign/presentation.js';
const add = (p: Vec3, x: number, y: number, z: number): Vec3 => ({
  x: p.x + x,
  y: p.y + y,
  z: p.z + z,
});
const facingOffset = (
  p: Vec3,
  yaw: number,
  side: number,
  height: number,
  forward: number,
): Vec3 =>
  add(
    p,
    Math.cos(yaw) * side - Math.sin(yaw) * forward,
    height,
    -Math.sin(yaw) * side - Math.cos(yaw) * forward,
  );
const pose = (position: Vec3, target: Vec3, fov: number): CameraPose => ({
  position,
  target,
  fov,
});
const shot = (
  start: number,
  end: number,
  from: CameraPose,
  to: CameraPose,
): CinematicShot => ({ start, end, from, to });

/** Actual bridge/world coordinates and actual live vehicle/agent positions. No alternate scene. */
export function openingTrack(
  player: Vec3,
  vehicle?: Vec3,
  playerYaw = 0,
): CinematicTrack {
  const bridge = BRIDGES[0],
    deployment = STORY_BEATS.find((b) => b.id === "deployment")!;
  const car = vehicle ?? player;
  return {
    id: OPENING_ID,
    title: "NEO-VERIDIA",
    eyebrow: "ACT I / THE SAFETY MANDATE",
    duration: 11.5,
    shots: [
      shot(
        0,
        4,
        pose(
          bridgePoint(bridge, 1500, -190, 170),
          bridgePoint(bridge, 900, 0, 100),
          54,
        ),
        pose(
          bridgePoint(bridge, 1120, -145, 145),
          bridgePoint(bridge, 700, 0, 100),
          50,
        ),
      ),
      shot(
        4,
        7,
        pose({ x: -300, y: 195, z: -650 }, { x: -40, y: 30, z: -20 }, 58),
        pose({ x: -210, y: 160, z: -500 }, { x: -25, y: 24, z: 10 }, 55),
      ),
      shot(
        7,
        9,
        pose(add(car, -9, 4, 10), add(car, 0, 0.5, 0), 50),
        pose(add(car, -7, 3, 9), add(car, 0, 0.5, 0), 48),
      ),
      shot(
        9,
        11.5,
        pose(
          facingOffset(player, playerYaw, 3, 2.5, 5),
          add(player, 0, 1.4, 0),
          48,
        ),
        pose(
          facingOffset(player, playerYaw, 2.5, 2.2, 4.5),
          add(player, 0, 1.4, 0),
          46,
        ),
      ),
    ],
    cues: [
      {
        start: 0.3,
        end: 6.7,
        line: deployment.nodes.find((n) => n.id === "mandate")!,
      },
      { start: 7, end: 11.5, line: CINEMATIC_LINES.arrival },
    ],
  };
}

export interface EncounterSource {
  player: Vec3;
  districts: DistrictLoopBinaryState[];
  enemies: ReadonlyMap<number, EnemyBinarySnapshotState>;
  phase6: Phase6SnapshotPacket | null;
}
/** Both mission stage and living server entity must agree before an introduction exists. */
export function encounterTracks(source: EncounterSource): CinematicTrack[] {
  const out: CinematicTrack[] = [];
  const boss = source.phase6?.dreadnought;
  if (
    boss &&
    boss.phase !== DreadnoughtPhase.DORMANT &&
    boss.phase !== DreadnoughtPhase.DEFEATED &&
    Math.hypot(
      source.player.x - boss.position.x,
      source.player.z - boss.position.z,
    ) < 140
  ) {
    out.push({
      id: "dreadnought-v1",
      title: "APEX DREADNOUGHT",
      eyebrow: "AEGIS / FINAL ENCOUNTER",
      duration: 4.5,
      shots: [
        shot(
          0,
          4.5,
          pose(add(boss.position, 65, 25, 80), boss.position, 52),
          pose(add(boss.position, 58, 18, 74), boss.position, 48),
        ),
      ],
      cues: [{ start: 0.15, end: 4.5, line: CINEMATIC_LINES.dreadnought }],
    });
  }
  for (const district of source.districts) {
    if (district.currentStage !== 2 && district.currentStage !== 3) continue;
    const spec = DISTRICT_LOOP_SPECS[district.districtIndex];
    if (!spec) continue;
    const lieutenant = district.currentStage === 2,
      id = lieutenant ? spec.lieutenantEnemyId : spec.kingpinEnemyId;
    const enemy = source.enemies.get(id);
    if (
      !enemy ||
      enemy.hp <= 0 ||
      enemy.combatState === EnemyCombatState.DEAD ||
      Math.hypot(
        source.player.x - enemy.position.x,
        source.player.y - enemy.position.y,
        source.player.z - enemy.position.z,
      ) > 60
    )
      continue;
    const target = add(enemy.position, 0, 1.3, 0);
    out.push({
      id: `enemy-${id}`,
      targetEnemyId: id,
      title: (lieutenant
        ? characterNameForCallsign(spec.lieutenantCallsign)
        : characterNameForCallsign(spec.kingpinCallsign)
      ).replaceAll("-", " "),
      eyebrow: `${spec.district.replaceAll("_", " ")} / ${lieutenant ? "LIEUTENANT" : "KINGPIN"}`,
      duration: 3.6,
      shots: [
        shot(
          0,
          3.6,
          pose(facingOffset(enemy.position, enemy.yaw, 6, 3.2, 8), target, 42),
          pose(facingOffset(enemy.position, enemy.yaw, 5, 2.7, 7), target, 40),
        ),
      ],
      cues: [
        {
          start: 0.15,
          end: 3.6,
          line: lieutenant
            ? CINEMATIC_LINES.lieutenant
            : CINEMATIC_LINES.kingpin,
        },
      ],
    });
  }
  return out;
}

export function sampleTrack(
  track: CinematicTrack,
  time: number,
  reducedMotion = false,
) {
  const current = track.shots.find((s) => time < s.end) ?? track.shots.at(-1)!;
  const t = Math.max(
    0,
    Math.min(1, (time - current.start) / (current.end - current.start)),
  );
  const alpha = reducedMotion ? 0.5 : t * t * (3 - 2 * t);
  const mix = (a: number, b: number) => a + (b - a) * alpha;
  const vector = (a: Vec3, b: Vec3): Vec3 => ({
    x: mix(a.x, b.x),
    y: mix(a.y, b.y),
    z: mix(a.z, b.z),
  });
  const fade = Math.max(
    0,
    1 - Math.min(time - current.start, current.end - time) / 0.18,
  );
  return {
    shotIndex: track.shots.indexOf(current),
    position: vector(current.from.position, current.to.position),
    target: vector(current.from.target, current.to.target),
    fov: mix(current.from.fov, current.to.fov),
    fade: Math.min(1, fade),
    cue: track.cues.find((c) => time >= c.start && time < c.end)?.line ?? null,
  };
}
