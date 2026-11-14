import {
  COUNTER_CONTACT_SEC,
  EffectKind,
  effectSpec,
  MAX_EFFECT_EVENTS,
  type EffectEvent,
  type EffectSpec,
} from "../protocol/presentationProtocol.js";
import type { CombatEventResult } from "./enemyRigSystem.js";
import type { AgentPhysicsBody } from "../physics/characterController.js";
import type { Vec3 } from "../protocol/binaryProtocol.js";

/** Cosmetic events have no authority to change health, collision, rewards or input. */
export class PresentationEventBus {
  public enabled = true;
  public dropped = 0;
  private sequence = 0;
  private events: EffectEvent[] = [];
  private readonly strides = new Map<
    number,
    { position: Vec3; distance: number; side: number }
  >();
  constructor(private readonly tick: () => number) {}
  public emit(spec: EffectSpec): void {
    if (!this.enabled) return;
    const magnitude = Math.hypot(spec.normal.x, spec.normal.y, spec.normal.z);
    spec = {
      ...spec,
      normal:
        magnitude > 0.001
          ? {
              x: spec.normal.x / magnitude,
              y: spec.normal.y / magnitude,
              z: spec.normal.z / magnitude,
            }
          : { x: 0, y: 1, z: 0 },
    };
    if (this.events.length === MAX_EFFECT_EVENTS) {
      this.events.shift();
      this.dropped++;
    }
    this.sequence = (this.sequence + 1) >>> 0 || 1;
    this.events.push({
      ...spec,
      id: this.sequence,
      tick: this.tick() >>> 0,
      origin: { ...spec.origin },
      point: { ...spec.point },
      normal: { ...spec.normal },
    });
  }
  public fromCombat(e: CombatEventResult): void {
    const point = { ...e.impactPoint };
    const common = {
      actor: e.attackerEntityId,
      target: e.targetEnemyId,
      limb: e.limbId ?? 6,
      normal: e.impactNormal ?? { x: 0, y: 1, z: 0 },
      flags: e.isCrit ? 2 : 0,
    };
    if (e.shotOrigin) {
      this.emit(
        effectSpec(EffectKind.SHOT, point, {
          ...common,
          origin: e.shotOrigin,
          flags: common.flags | (e.surfaceHit ? 1 : 0),
        }),
      );
      return;
    }
    if (e.type === "PARRY_TAKEDOWN") {
      point.y += 0.9;
      this.emit(
        effectSpec(EffectKind.COUNTER, point, {
          ...common,
          delay: COUNTER_CONTACT_SEC,
          radius: e.shockwaveTriggered ? 6 : 1,
          flags: common.flags | (e.shockwaveTriggered ? 4 : 0),
        }),
      );
    } else if (e.type !== "WEAPON_MISS")
      this.emit(effectSpec(EffectKind.HIT, point, common));
  }
  public footsteps(agents: Iterable<AgentPhysicsBody>): void {
    if (!this.enabled) return;
    const active = new Set<number>();
    for (const a of agents) {
      active.add(a.entityId);
      const previous = this.strides.get(a.entityId),
        d = previous
          ? Math.hypot(
              a.position.x - previous.position.x,
              a.position.z - previous.position.z,
            )
          : 0;
      const state = previous ?? {
        position: { ...a.position },
        distance: 0,
        side: 1,
      };
      state.position = { ...a.position };
      this.strides.set(a.entityId, state);
      if (
        !a.grounded ||
        a.hp <= 0 ||
        a.mantling ||
        a.mountedVehicleId ||
        d > 2 ||
        d < 0.005
      ) {
        state.distance = 0;
        continue;
      }
      state.distance += d;
      if (state.distance < 1.6) continue;
      state.distance %= 1.6;
      state.side *= -1;
      this.emit(
        effectSpec(
          EffectKind.FOOTSTEP,
          {
            x: a.position.x + state.side * 0.17,
            y: a.position.y + 0.025,
            z: a.position.z,
          },
          { actor: a.entityId },
        ),
      );
    }
    for (const id of this.strides.keys())
      if (!active.has(id)) this.strides.delete(id);
  }
  public drain(): EffectEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }
}
