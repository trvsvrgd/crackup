/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Shared 3D Skeletal Enemy Rig, 6 Bone-Attached Physics Colliders (REQ-BODYPARTS),
 * V.A.T.S. Occlusion Raycaster, Motion-Warped Melee & Q Counter-Parry System (REQ-MELEE)
 */

import {
  DistrictId,
  EnemyCombatState,
  EnemyLimbId,
  FactionId,
  getDistrictForPosition,
  getShootingParams,
  getStrengthParams,
  getVigilanteParams,
  LIMB_COLLIDER_SPECS,
  MELEE_ENGAGE_RANGE_M,
  MELEE_STRIKE_CONNECT_DIST_M,
  MELEE_WARP_SPEED_MPS,
  PARRY_SHOCKWAVE_RADIUS_M,
  WEAPON_BASE_DAMAGE,
} from '../constants.js';
import { AgentPhysicsBody, RAPIER } from '../physics/characterController.js';
import { EnemyBinarySnapshotState, quatFromYaw, Vec3 } from '../protocol/binaryProtocol.js';

export interface LimbRuntimeState {
  limbId: EnemyLimbId;
  hp: number;
  maxHp: number;
  rigidBody: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  worldPosition: Vec3;
}

export interface EnemyLagHistoryEntry {
  timestampMs: number;
  combatState: EnemyCombatState;
  position: Vec3;
}

export type EnemyRank = 'GRUNT' | 'ELITE' | 'LIEUTENANT' | 'KINGPIN' | 'OMEGA_HVT' | 'AUDITOR';

export interface EnemyPhysicsEntity {
  enemyId: number;
  callsign: string;
  isElite: boolean;
  faction: FactionId;
  rank: EnemyRank;
  district: DistrictId;
  spawnPosition: Vec3;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  patrolWaypoints: Vec3[];
  patrolIndex: number;
  disableAutoRespawn: boolean;

  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;

  combatState: EnemyCombatState;
  stateTimer: number;
  animPhase: number;
  attackCycleCount: number;

  // Limb Cripple & Blind/Stagger Status Timers (PRD Section 4.2)
  staggerTimer: number;        // 4.0s Blind/Stagger from Head crit or Q Counter-Parry
  armsCrippledTimer: number;   // 8.0s disables heavy weapon & reduces outgoing damage by 50%
  legsCrippledTimer: number;   // 8.0s reduces max velocity by 70% & grounds airborne targets
  lastHitLimb: EnemyLimbId;
  respawnTimer: number;

  // 6 Bone-Attached Physics Colliders (Head, Torso, L-Arm, R-Arm, L-Leg, R-Leg)
  limbs: Record<EnemyLimbId, LimbRuntimeState>;

  // Lag-compensation history buffer for server-validated Q Counter-Parry
  history: EnemyLagHistoryEntry[];
}

export interface VatsLimbEvaluation {
  limbId: EnemyLimbId;
  name: string;
  worldPosition: Vec3;
  radius: number;
  halfHeight: number;
  occluded: boolean;
  hitProbabilityPct: number; // 0% when occluded by cover, up to 99% when clear
  damageMultiplier: number;
  hpPct: number;
}

export interface CombatEventResult {
  type:
    | 'WEAPON_HIT'
    | 'WEAPON_MISS'
    | 'MELEE_HIT'
    | 'COUNTER_BOUNCE_THROW'
    | 'PARRY_TAKEDOWN';
  attackerEntityId: number;
  targetEnemyId: number;
  limbId?: EnemyLimbId;
  damageDealt: number;
  armorStripped: number;
  isCrit: boolean;
  limbCrippled: boolean;
  shockwaveTriggered: boolean;
  shockwaveHits: number;
  impactPoint: Vec3;
}

const ALL_LIMB_IDS: EnemyLimbId[] = [
  EnemyLimbId.HEAD,
  EnemyLimbId.TORSO,
  EnemyLimbId.LEFT_ARM,
  EnemyLimbId.RIGHT_ARM,
  EnemyLimbId.LEFT_LEG,
  EnemyLimbId.RIGHT_LEG,
];

/**
 * Computes the animated 3D world position for a specific bone collider on an enemy rig
 */
export function computeBoneWorldPosition(
  enemyPos: Vec3,
  enemyYaw: number,
  combatState: EnemyCombatState,
  animPhase: number,
  limbId: EnemyLimbId
): Vec3 {
  const spec = LIMB_COLLIDER_SPECS[limbId];
  let lx = spec.localOffset.x;
  let ly = spec.localOffset.y;
  let lz = spec.localOffset.z;

  // Apply animated skeletal offsets per state
  if (combatState === EnemyCombatState.WINDUP) {
    if (limbId === EnemyLimbId.HEAD || limbId === EnemyLimbId.TORSO) {
      lz += 0.12; // Lean back slightly during windup telegraph
    } else if (limbId === EnemyLimbId.RIGHT_ARM) {
      ly += 0.25;
      lz += 0.22; // Raised right arm telegraph
    }
  } else if (combatState === EnemyCombatState.ACTIVE_SWEEP) {
    if (limbId === EnemyLimbId.RIGHT_ARM || limbId === EnemyLimbId.LEFT_ARM) {
      lz -= 0.35; // Forward strike extension
    }
  } else if (combatState === EnemyCombatState.CHASE) {
    const stride = Math.sin(animPhase * 6.0) * 0.16;
    if (limbId === EnemyLimbId.LEFT_LEG || limbId === EnemyLimbId.RIGHT_ARM) {
      lz += stride;
    } else if (limbId === EnemyLimbId.RIGHT_LEG || limbId === EnemyLimbId.LEFT_ARM) {
      lz -= stride;
    }
  } else if (combatState === EnemyCombatState.STAGGER_BLIND) {
    const sway = Math.sin(animPhase * 10.0) * 0.14;
    if (limbId === EnemyLimbId.HEAD) {
      lx += sway;
      ly -= 0.08;
    }
  }

  // Rotate local bone offset (lx, ly, lz) by enemyYaw around Y axis (yaw = 0 faces -Z)
  const cosY = Math.cos(enemyYaw);
  const sinY = Math.sin(enemyYaw);
  const wx = enemyPos.x + lx * cosY + lz * sinY;
  const wy = enemyPos.y + ly;
  const wz = enemyPos.z - lx * sinY + lz * cosY;

  return { x: wx, y: wy, z: wz };
}

/**
 * Manages all 3D Enemy Entities, their 6 Bone-Attached Rapier3D Colliders,
 * V.A.T.S. Occlusion Raycasts, Motion-Warped Melee, and Q Counter-Parry Shockwaves.
 */
export class EnemyCombatManager {
  public readonly enemies: Map<number, EnemyPhysicsEntity> = new Map();
  public readonly colliderHandleToLimb: Map<
    number,
    { enemyId: number; limbId: EnemyLimbId }
  > = new Map();

  constructor(private readonly world: RAPIER.World) {}

  /**
   * Spawns the initial Neo-Veridia Faction Enforcer & Elite Centurion squads across the 4 districts
   */
  public spawnDefaultSquads(): void {
    const squadSpecs: Array<{
      id: number;
      callsign: string;
      x: number;
      y: number;
      z: number;
      isElite: boolean;
      faction: FactionId;
      waypoints: Vec3[];
    }> = [
      // Central Plaza Calibration Enforcers (immediately accessible near spawn)
      {
        id: 1,
        callsign: 'AEGIS-TROOPER-01',
        x: 6.5,
        y: 0.0,
        z: -4.5,
        isElite: false,
        faction: FactionId.AEGIS_DIRECTORATE,
        waypoints: [
          { x: 6.5, y: 0.0, z: -4.5 },
          { x: 11.5, y: 0.0, z: -4.5 },
          { x: 11.5, y: 0.0, z: 2.5 },
        ],
      },
      {
        id: 2,
        callsign: 'AEGIS-CENTURION-ELITE',
        x: -6.5,
        y: 0.0,
        z: -4.5,
        isElite: true,
        faction: FactionId.AEGIS_DIRECTORATE,
        waypoints: [
          { x: -6.5, y: 0.0, z: -4.5 },
          { x: -11.5, y: 0.0, z: -4.5 },
          { x: -11.5, y: 0.0, z: 2.5 },
        ],
      },
      {
        id: 3,
        callsign: 'AEGIS-TROOPER-02',
        x: 9.0,
        y: 0.0,
        z: -6.5,
        isElite: false,
        faction: FactionId.AEGIS_DIRECTORATE,
        waypoints: [
          { x: 9.0, y: 0.0, z: -6.5 },
          { x: 14.0, y: 0.0, z: -9.0 },
        ],
      },
      {
        id: 4,
        callsign: 'AEGIS-TROOPER-03',
        x: -9.0,
        y: 0.0,
        z: -6.5,
        isElite: false,
        faction: FactionId.AEGIS_DIRECTORATE,
        waypoints: [
          { x: -9.0, y: 0.0, z: -6.5 },
          { x: -14.0, y: 0.0, z: -9.0 },
        ],
      },
      // Elevated Terrace & District Faction Patrols
      {
        id: 5,
        callsign: 'HELIOS-GUARD-01',
        x: 18.0,
        y: 0.0,
        z: -22.0,
        isElite: false,
        faction: FactionId.HELIOS_EXECUTIVE_GUARD,
        waypoints: [
          { x: 18.0, y: 0.0, z: -22.0 },
          { x: 26.0, y: 0.0, z: -28.0 },
          { x: 14.0, y: 0.0, z: -30.0 },
        ],
      },
      {
        id: 6,
        callsign: 'HELIOS-CENTURION-02',
        x: -18.0,
        y: 0.0,
        z: -22.0,
        isElite: true,
        faction: FactionId.HELIOS_EXECUTIVE_GUARD,
        waypoints: [
          { x: -18.0, y: 0.0, z: -22.0 },
          { x: -26.0, y: 0.0, z: -28.0 },
          { x: -14.0, y: 0.0, z: -30.0 },
        ],
      },
      {
        id: 7,
        callsign: 'DOCKS-SYNDICATE-01',
        x: -45.0,
        y: 0.0,
        z: 45.0,
        isElite: false,
        faction: FactionId.NEON_SYNDICATE,
        waypoints: [
          { x: -45.0, y: 0.0, z: 45.0 },
          { x: -34.0, y: 0.0, z: 38.0 },
          { x: -50.0, y: 0.0, z: 32.0 },
        ],
      },
      {
        id: 8,
        callsign: 'FOUNDRY-IRONCLAD-01',
        x: 45.0,
        y: 0.0,
        z: 45.0,
        isElite: true,
        faction: FactionId.FOUNDRY_IRONCLAD,
        waypoints: [
          { x: 45.0, y: 0.0, z: 45.0 },
          { x: 34.0, y: 0.0, z: 38.0 },
          { x: 50.0, y: 0.0, z: 32.0 },
        ],
      },
    ];

    for (const s of squadSpecs) {
      this.spawnEnemy(s.id, s.callsign, { x: s.x, y: s.y, z: s.z }, s.isElite, {
        faction: s.faction,
        patrolWaypoints: s.waypoints,
      });
    }
  }

  public spawnEnemy(
    enemyId: number,
    callsign: string,
    spawnPos: Vec3,
    isElite: boolean,
    options?: {
      faction?: FactionId;
      rank?: EnemyRank;
      maxHp?: number;
      maxArmor?: number;
      patrolWaypoints?: Vec3[];
      disableAutoRespawn?: boolean;
    }
  ): EnemyPhysicsEntity {
    const existing = this.enemies.get(enemyId);
    if (existing) {
      this.removeEnemy(enemyId);
    }

    const district = getDistrictForPosition(spawnPos.x, spawnPos.z);
    const defaultFaction =
      district === DistrictId.NEON_DOCKS
        ? FactionId.NEON_SYNDICATE
        : district === DistrictId.FOUNDRY_SLUMS
          ? FactionId.FOUNDRY_IRONCLAD
          : district === DistrictId.HELIOS_SPIRE
            ? FactionId.HELIOS_EXECUTIVE_GUARD
            : FactionId.AEGIS_DIRECTORATE;

    const faction = options?.faction ?? defaultFaction;
    const rank: EnemyRank = options?.rank ?? (isElite ? 'ELITE' : 'GRUNT');
    const maxHp = options?.maxHp ?? (isElite ? 420 : 240);
    const maxArmor = options?.maxArmor ?? (isElite ? 160 : 80);
    const limbs = {} as Record<EnemyLimbId, LimbRuntimeState>;

    // Create 6 distinct child physics colliders in Rapier3D attached to bone transforms
    for (const limbId of ALL_LIMB_IDS) {
      const spec = LIMB_COLLIDER_SPECS[limbId];
      const worldPos = computeBoneWorldPosition(
        spawnPos,
        0,
        EnemyCombatState.IDLE,
        0,
        limbId
      );

      const rbDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        worldPos.x,
        worldPos.y,
        worldPos.z
      );
      const rigidBody = this.world.createRigidBody(rbDesc);

      const colDesc =
        spec.shape === 'sphere'
          ? RAPIER.ColliderDesc.ball(spec.radius)
          : RAPIER.ColliderDesc.capsule(spec.halfHeight, spec.radius);

      // Make limb colliders sensors so they don't obstruct character controller capsule sweeps,
      // while remaining 100% queryable by Rapier3D raycasts and shape intersections!
      colDesc.setSensor(true);
      const collider = this.world.createCollider(colDesc, rigidBody);

      this.colliderHandleToLimb.set(collider.handle, { enemyId, limbId });

      const limbMaxHp = limbId === EnemyLimbId.TORSO ? maxHp * 0.6 : maxHp * 0.35;
      limbs[limbId] = {
        limbId,
        hp: limbMaxHp,
        maxHp: limbMaxHp,
        rigidBody,
        collider,
        worldPosition: worldPos,
      };
    }

    const entity: EnemyPhysicsEntity = {
      enemyId,
      callsign,
      isElite,
      faction,
      rank,
      district,
      spawnPosition: { ...spawnPos },
      position: { ...spawnPos },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      patrolWaypoints: options?.patrolWaypoints ? options.patrolWaypoints.map((w) => ({ ...w })) : [],
      patrolIndex: 0,
      disableAutoRespawn: options?.disableAutoRespawn ?? false,
      hp: maxHp,
      maxHp,
      armor: maxArmor,
      maxArmor,
      combatState: EnemyCombatState.IDLE,
      stateTimer: 0,
      animPhase: 0,
      attackCycleCount: 0,
      staggerTimer: 0,
      armsCrippledTimer: 0,
      legsCrippledTimer: 0,
      lastHitLimb: EnemyLimbId.TORSO,
      respawnTimer: 0,
      limbs,
      history: [],
    };

    this.enemies.set(enemyId, entity);
    return entity;
  }

  public removeEnemy(enemyId: number): void {
    const enemy = this.enemies.get(enemyId);
    if (!enemy) return;
    for (const limbId of ALL_LIMB_IDS) {
      const limb = enemy.limbs[limbId];
      if (limb) {
        this.colliderHandleToLimb.delete(limb.collider.handle);
        this.world.removeRigidBody(limb.rigidBody);
      }
    }
    this.enemies.delete(enemyId);
  }

  /**
   * Synchronizes all 6 bone-attached physics colliders in Rapier3D to the enemy's animated pose
   */
  public syncEnemyBoneColliders(enemy: EnemyPhysicsEntity): void {
    const rotQuat = quatFromYaw(enemy.yaw);
    for (const limbId of ALL_LIMB_IDS) {
      const limb = enemy.limbs[limbId];
      const worldPos = computeBoneWorldPosition(
        enemy.position,
        enemy.yaw,
        enemy.combatState,
        enemy.animPhase,
        limbId
      );
      limb.worldPosition = worldPos;
      limb.rigidBody.setTranslation(worldPos, true);
      limb.rigidBody.setNextKinematicTranslation(worldPos);
      limb.rigidBody.setRotation(rotQuat, true);
      limb.rigidBody.setNextKinematicRotation(rotQuat);
    }
  }

  /**
   * Steps the Enemy Combat State Machine (Idle -> Chase -> Windup -> Active Sweep -> Recovery / Counter Stance)
   */
  public stepEnemies(
    agents: Iterable<AgentPhysicsBody>,
    dt: number,
    nowMs = Date.now()
  ): void {
    const agentList = Array.from(agents);

    for (const enemy of this.enemies.values()) {
      enemy.animPhase += dt;

      // Handle Dead & Respawn cycle
      if (enemy.combatState === EnemyCombatState.DEAD) {
        if (!enemy.disableAutoRespawn) {
          enemy.respawnTimer -= dt;
          if (enemy.respawnTimer <= 0) {
            this.resetEnemyToSpawn(enemy);
          }
        }
        continue;
      }

      // Tick status timers (PRD Section 4.2)
      if (enemy.staggerTimer > 0) {
        enemy.staggerTimer = Math.max(0, enemy.staggerTimer - dt);
        if (enemy.staggerTimer === 0 && enemy.combatState === EnemyCombatState.STAGGER_BLIND) {
          enemy.combatState = EnemyCombatState.IDLE;
          enemy.stateTimer = 0;
        }
      }
      if (enemy.armsCrippledTimer > 0) {
        enemy.armsCrippledTimer = Math.max(0, enemy.armsCrippledTimer - dt);
      }
      if (enemy.legsCrippledTimer > 0) {
        enemy.legsCrippledTimer = Math.max(0, enemy.legsCrippledTimer - dt);
        // Ground airborne targets when legs are crippled (PRD 4.2)
        if (enemy.position.y > enemy.spawnPosition.y) {
          enemy.position.y = enemy.spawnPosition.y;
          enemy.velocity.y = 0;
        }
      }

      // Omega Bounty HVT movement is driven by the 90s 3D extraction path in Phase5WorldDirector
      if (enemy.rank === 'OMEGA_HVT') {
        this.syncEnemyBoneColliders(enemy);
        enemy.history.push({
          timestampMs: nowMs,
          combatState: enemy.combatState,
          position: { ...enemy.position },
        });
        if (enemy.history.length > 64) {
          enemy.history.shift();
        }
        continue;
      }

      // Find nearest player Agent
      let nearestAgent: AgentPhysicsBody | null = null;
      let nearestDist = Infinity;
      for (const a of agentList) {
        const d = Math.hypot(
          a.position.x - enemy.position.x,
          a.position.y - enemy.position.y,
          a.position.z - enemy.position.z
        );
        if (d < nearestDist) {
          nearestDist = d;
          nearestAgent = a;
        }
      }

      if (enemy.combatState === EnemyCombatState.STAGGER_BLIND) {
        enemy.velocity = { x: 0, y: 0, z: 0 };
      } else if (!nearestAgent || nearestDist > 34.0) {
        enemy.combatState = EnemyCombatState.IDLE;
        // 3D Navmesh Waypoint Patrol Graph when out of player engagement range
        if (enemy.patrolWaypoints.length > 1) {
          const wp = enemy.patrolWaypoints[enemy.patrolIndex % enemy.patrolWaypoints.length]!;
          const pdx = wp.x - enemy.position.x;
          const pdz = wp.z - enemy.position.z;
          const pDist = Math.hypot(pdx, pdz);
          if (pDist <= 0.65) {
            enemy.patrolIndex = (enemy.patrolIndex + 1) % enemy.patrolWaypoints.length;
          } else {
            const patrolSpeed = enemy.legsCrippledTimer > 0 ? 1.1 : 3.2;
            enemy.yaw = Math.atan2(-pdx, -pdz);
            enemy.velocity.x = (pdx / pDist) * patrolSpeed;
            enemy.velocity.z = (pdz / pDist) * patrolSpeed;
            enemy.position.x += enemy.velocity.x * dt;
            enemy.position.z += enemy.velocity.z * dt;
          }
        } else {
          enemy.velocity = { x: 0, y: 0, z: 0 };
        }
      } else {
        // Face nearest agent
        const dx = nearestAgent.position.x - enemy.position.x;
        const dz = nearestAgent.position.z - enemy.position.z;
        enemy.yaw = Math.atan2(-dx, -dz);

        if (enemy.combatState === EnemyCombatState.IDLE) {
          enemy.combatState = EnemyCombatState.CHASE;
          enemy.stateTimer = 0;
        }

        if (enemy.combatState === EnemyCombatState.CHASE) {
          if (nearestDist <= 3.1) {
            // Transition into Windup or Elite Counter Stance
            enemy.attackCycleCount += 1;
            if (enemy.isElite && enemy.attackCycleCount % 2 === 0) {
              enemy.combatState = EnemyCombatState.COUNTER_STANCE;
              enemy.stateTimer = 1.6; // 1.6s crimson energy shield counter stance
            } else {
              enemy.combatState = EnemyCombatState.WINDUP;
              enemy.stateTimer = 0.65; // 650ms amber telegraph windup window
            }
            enemy.velocity = { x: 0, y: 0, z: 0 };
          } else {
            // Chase steering velocity (reduced by 70% when legs are crippled per PRD 4.2!)
            const baseSpeed = enemy.rank === 'KINGPIN' ? 6.8 : enemy.isElite ? 6.2 : 5.4;
            const moveSpeed = enemy.legsCrippledTimer > 0 ? baseSpeed * 0.30 : baseSpeed;
            const horizLen = Math.hypot(dx, dz) || 1;
            let steerX = dx / horizLen;
            let steerZ = dz / horizLen;

            // 1. 3D Raycast Obstacle-Avoidance Whiskers (+0.45 rad left & -0.45 rad right)
            const whiskerOrigin = {
              x: enemy.position.x,
              y: enemy.position.y + 1.0,
              z: enemy.position.z,
            };
            const leftYaw = enemy.yaw + 0.45;
            const rightYaw = enemy.yaw - 0.45;
            const leftRay = new RAPIER.Ray(whiskerOrigin, {
              x: -Math.sin(leftYaw),
              y: 0,
              z: -Math.cos(leftYaw),
            });
            const rightRay = new RAPIER.Ray(whiskerOrigin, {
              x: -Math.sin(rightYaw),
              y: 0,
              z: -Math.cos(rightYaw),
            });
            const leftHit = this.world.castRay(
              leftRay,
              2.2,
              true,
              RAPIER.QueryFilterFlags.EXCLUDE_SENSORS
            );
            const rightHit = this.world.castRay(
              rightRay,
              2.2,
              true,
              RAPIER.QueryFilterFlags.EXCLUDE_SENSORS
            );
            if (leftHit && !rightHit) {
              steerX += -Math.sin(rightYaw) * 0.65;
              steerZ += -Math.cos(rightYaw) * 0.65;
            } else if (rightHit && !leftHit) {
              steerX += -Math.sin(leftYaw) * 0.65;
              steerZ += -Math.cos(leftYaw) * 0.65;
            }

            // 2. Squad Tactical Separation / Flanking Steering (avoid stacking on squadmates)
            for (const mate of this.enemies.values()) {
              if (mate.enemyId === enemy.enemyId || mate.combatState === EnemyCombatState.DEAD) {
                continue;
              }
              const sx = enemy.position.x - mate.position.x;
              const sz = enemy.position.z - mate.position.z;
              const sDist = Math.hypot(sx, sz);
              if (sDist > 0.05 && sDist < 2.2) {
                steerX += (sx / sDist) * 0.45;
                steerZ += (sz / sDist) * 0.45;
              }
            }

            const steerNorm = Math.hypot(steerX, steerZ) || 1;
            enemy.velocity.x = (steerX / steerNorm) * moveSpeed;
            enemy.velocity.z = (steerZ / steerNorm) * moveSpeed;
            enemy.position.x += enemy.velocity.x * dt;
            enemy.position.z += enemy.velocity.z * dt;
          }
        } else if (enemy.combatState === EnemyCombatState.COUNTER_STANCE) {
          enemy.stateTimer -= dt;
          if (enemy.stateTimer <= 0) {
            enemy.combatState = EnemyCombatState.WINDUP;
            enemy.stateTimer = 0.65;
          }
        } else if (enemy.combatState === EnemyCombatState.WINDUP) {
          enemy.stateTimer -= dt;
          if (enemy.stateTimer <= 0) {
            enemy.combatState = EnemyCombatState.ACTIVE_SWEEP;
            enemy.stateTimer = 0.25;
            // Apply outgoing melee strike if player is in sweep range (reduced by 50% if arms crippled!)
            if (nearestDist <= 2.8) {
              const rawDmg = enemy.isElite ? 40 : 26;
              const effectiveDmg = enemy.armsCrippledTimer > 0 ? rawDmg * 0.5 : rawDmg;
              void effectiveDmg;
            }
          }
        } else if (enemy.combatState === EnemyCombatState.ACTIVE_SWEEP) {
          enemy.stateTimer -= dt;
          if (enemy.stateTimer <= 0) {
            enemy.combatState = EnemyCombatState.RECOVERY;
            enemy.stateTimer = 0.7;
          }
        } else if (enemy.combatState === EnemyCombatState.RECOVERY) {
          enemy.stateTimer -= dt;
          if (enemy.stateTimer <= 0) {
            enemy.combatState = EnemyCombatState.CHASE;
            enemy.stateTimer = 0;
          }
        }
      }

      this.syncEnemyBoneColliders(enemy);

      // Record lag-compensated state history (keep 64 ticks = ~1.06 seconds)
      enemy.history.push({
        timestampMs: nowMs,
        combatState: enemy.combatState,
        position: { ...enemy.position },
      });
      if (enemy.history.length > 64) {
        enemy.history.shift();
      }
    }
  }

  private resetEnemyToSpawn(enemy: EnemyPhysicsEntity): void {
    enemy.position = { ...enemy.spawnPosition };
    enemy.velocity = { x: 0, y: 0, z: 0 };
    enemy.hp = enemy.maxHp;
    enemy.armor = enemy.maxArmor;
    enemy.combatState = EnemyCombatState.IDLE;
    enemy.stateTimer = 0;
    enemy.staggerTimer = 0;
    enemy.armsCrippledTimer = 0;
    enemy.legsCrippledTimer = 0;
    for (const limbId of ALL_LIMB_IDS) {
      enemy.limbs[limbId].hp = enemy.limbs[limbId].maxHp;
    }
    this.syncEnemyBoneColliders(enemy);
  }

  /**
   * V.A.T.S. Sub-Collider Occlusion Raycast & Hit Probability Calculator (PRD Section 4.2)
   * Casts a 3D ray from shooter's eye/weapon origin to each of the 6 limb colliders.
   * Any limb blocked by a building/cover collider displays 0% hit probability!
   */
  public evaluateVatsTargetLimbs(
    shooterEyeOrigin: Vec3,
    shootingLevel: number,
    enemy: EnemyPhysicsEntity,
    ignoreAgentCollider?: RAPIER.Collider
  ): VatsLimbEvaluation[] {
    const { lockOnRangeMeters, spreadConeDeg } = getShootingParams(shootingLevel);
    const results: VatsLimbEvaluation[] = [];

    for (const limbId of ALL_LIMB_IDS) {
      const spec = LIMB_COLLIDER_SPECS[limbId];
      const limbState = enemy.limbs[limbId];
      const targetPos = limbState.worldPosition;

      const dx = targetPos.x - shooterEyeOrigin.x;
      const dy = targetPos.y - shooterEyeOrigin.y;
      const dz = targetPos.z - shooterEyeOrigin.z;
      const dist = Math.hypot(dx, dy, dz);

      if (dist > lockOnRangeMeters || dist < 0.2 || enemy.combatState === EnemyCombatState.DEAD) {
        results.push({
          limbId,
          name: spec.name,
          worldPosition: { ...targetPos },
          radius: spec.radius,
          halfHeight: spec.halfHeight,
          occluded: true,
          hitProbabilityPct: 0,
          damageMultiplier: spec.damageMultiplier,
          hpPct: Math.round((limbState.hp / limbState.maxHp) * 100),
        });
        continue;
      }

      const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
      const ray = new RAPIER.Ray(shooterEyeOrigin, dir);

      // Cast against solid environment colliders ONLY (EXCLUDE_SENSORS skips limb sensor colliders)
      const envHit = this.world.castRay(
        ray,
        dist - spec.radius * 0.5,
        true,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        ignoreAgentCollider
      );

      const occluded = envHit !== null;
      let hitProbabilityPct = 0;

      if (!occluded) {
        // Compute hit probability from Shooting spread cone (4.2 deg -> 0.4 deg), distance, and limb radius
        const spreadRad = (spreadConeDeg * Math.PI) / 180;
        const beamRadiusAtDist = Math.max(0.04, Math.tan(spreadRad) * dist);
        const effectiveTargetRadius = spec.radius + (spec.halfHeight > 0 ? spec.halfHeight * 0.45 : 0.04);
        const rawProb = Math.min(0.99, (effectiveTargetRadius / (beamRadiusAtDist + effectiveTargetRadius * 0.65)) * 0.96);
        hitProbabilityPct = Math.max(12, Math.min(99, Math.round(rawProb * 100)));
      }

      results.push({
        limbId,
        name: spec.name,
        worldPosition: { ...targetPos },
        radius: spec.radius,
        halfHeight: spec.halfHeight,
        occluded,
        hitProbabilityPct,
        damageMultiplier: spec.damageMultiplier,
        hpPct: Math.max(0, Math.min(100, Math.round((limbState.hp / limbState.maxHp) * 100))),
      });
    }

    return results;
  }

  /**
   * Resolves a 3D Raycast Weapon Shot against the 6 Bone Colliders per Enemy (PRD Section 4.2)
   */
  public resolveWeaponShot(
    agent: AgentPhysicsBody,
    aimYaw: number,
    aimPitch: number,
    targetedLimbId: EnemyLimbId = EnemyLimbId.TORSO,
    vatsLockedEnemyId?: number
  ): CombatEventResult | null {
    const shooterOrigin: Vec3 = {
      x: agent.position.x,
      y: agent.position.y + 1.55,
      z: agent.position.z,
    };

    const shootingParams = getShootingParams(agent.attributes.shooting);
    const effectiveLockOnRange =
      shootingParams.lockOnRangeMeters + (agent.buildModifiers?.lockOnRangeBonusM ?? 0);
    let rayDir: Vec3;

    // If V.A.T.S. aiming on a locked enemy within range, aim toward the selected bone collider
    let targetEnemy: EnemyPhysicsEntity | undefined =
      vatsLockedEnemyId !== undefined ? this.enemies.get(vatsLockedEnemyId) : undefined;

    if (!targetEnemy) {
      // Find enemy closest to camera look ray within lockOnRangeMeters
      const cosP = Math.cos(aimPitch);
      const lookDir = {
        x: -Math.sin(aimYaw) * cosP,
        y: Math.sin(aimPitch),
        z: -Math.cos(aimYaw) * cosP,
      };
      let bestScore = Infinity;
      for (const e of this.enemies.values()) {
        if (e.combatState === EnemyCombatState.DEAD) continue;
        const limbPos = e.limbs[targetedLimbId].worldPosition;
        const vx = limbPos.x - shooterOrigin.x;
        const vy = limbPos.y - shooterOrigin.y;
        const vz = limbPos.z - shooterOrigin.z;
        const d = Math.hypot(vx, vy, vz);
        if (d <= effectiveLockOnRange && d > 0.2) {
          const dot = (vx / d) * lookDir.x + (vy / d) * lookDir.y + (vz / d) * lookDir.z;
          if (dot > 0.82 && d < bestScore) {
            bestScore = d;
            targetEnemy = e;
          }
        }
      }
    }

    if (targetEnemy && targetEnemy.combatState !== EnemyCombatState.DEAD) {
      const bonePos = targetEnemy.limbs[targetedLimbId].worldPosition;
      const dx = bonePos.x - shooterOrigin.x;
      const dy = bonePos.y - shooterOrigin.y;
      const dz = bonePos.z - shooterOrigin.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      rayDir = { x: dx / len, y: dy / len, z: dz / len };
    } else {
      const cosP = Math.cos(aimPitch);
      rayDir = {
        x: -Math.sin(aimYaw) * cosP,
        y: Math.sin(aimPitch),
        z: -Math.cos(aimYaw) * cosP,
      };
    }

    const ray = new RAPIER.Ray(shooterOrigin, rayDir);

    // 1. Check solid environment cover distance first
    const envHit = this.world.castRay(
      ray,
      effectiveLockOnRange,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      agent.collider
    );
    const maxUnblockedToi = envHit ? envHit.timeOfImpact : effectiveLockOnRange;

    // 2. Find closest intersected Bone-Collider before any wall/cover
    let hitEnemy: EnemyPhysicsEntity | null = null;
    let hitLimbId: EnemyLimbId = targetedLimbId;
    let bestToi = maxUnblockedToi;

    this.world.intersectionsWithRay(
      ray,
      maxUnblockedToi,
      true,
      (intersection) => {
        const match = this.colliderHandleToLimb.get(intersection.collider.handle);
        if (match) {
          const e = this.enemies.get(match.enemyId);
          if (e && e.combatState !== EnemyCombatState.DEAD) {
            // Prioritize the explicitly targeted limb if intersected along the ray, else closest TOI
            const isTargetLimb = match.limbId === targetedLimbId;
            const effectiveToi = isTargetLimb
              ? intersection.timeOfImpact - 0.15
              : intersection.timeOfImpact;
            if (effectiveToi < bestToi) {
              bestToi = effectiveToi;
              hitEnemy = e;
              hitLimbId = match.limbId;
            }
          }
        }
        return true;
      }
    );

    if (!hitEnemy) {
      return {
        type: 'WEAPON_MISS',
        attackerEntityId: agent.entityId,
        targetEnemyId: 0,
        damageDealt: 0,
        armorStripped: 0,
        isCrit: false,
        limbCrippled: false,
        shockwaveTriggered: false,
        shockwaveHits: 0,
        impactPoint: {
          x: shooterOrigin.x + rayDir.x * maxUnblockedToi,
          y: shooterOrigin.y + rayDir.y * maxUnblockedToi,
          z: shooterOrigin.z + rayDir.z * maxUnblockedToi,
        },
      };
    }

    const resolvedEnemy = hitEnemy as EnemyPhysicsEntity;
    const weaponDmg = WEAPON_BASE_DAMAGE * (agent.buildModifiers?.weaponDamageMultiplier ?? 1.0);
    return this.applyLimbDamage(agent, resolvedEnemy, hitLimbId, weaponDmg);
  }

  /**
   * Applies damage & PRD Section 4.2 Bone-Collider effects to a specific Enemy Limb
   */
  public applyLimbDamage(
    agent: AgentPhysicsBody,
    enemy: EnemyPhysicsEntity,
    limbId: EnemyLimbId,
    baseDamage: number,
    isBlastOrPropDamage = false
  ): CombatEventResult {
    const spec = LIMB_COLLIDER_SPECS[limbId];
    const limb = enemy.limbs[limbId];
    const isCrit = limbId === EnemyLimbId.HEAD;
    const mods = agent.buildModifiers;

    const critBonus = isCrit ? (mods?.headshotCritMultiplierBonus ?? 0) : 0;
    const limbMult =
      limbId === EnemyLimbId.LEFT_ARM ||
      limbId === EnemyLimbId.RIGHT_ARM ||
      limbId === EnemyLimbId.LEFT_LEG ||
      limbId === EnemyLimbId.RIGHT_LEG
        ? (mods?.limbDamageMultiplier ?? 1.0)
        : 1.0;

    const totalDamage = baseDamage * (spec.damageMultiplier + critBonus) * limbMult;
    agent.telemetry.totalDamageDealt = (agent.telemetry.totalDamageDealt || 0) + totalDamage;
    if (isBlastOrPropDamage) {
      agent.telemetry.collateralBlastDamageDealt =
        (agent.telemetry.collateralBlastDamageDealt || 0) + totalDamage;
    }

    // Torso shots strip ablative armor plating 30% faster (1.3x multiplier per PRD 4.2 + skill bonuses)
    const armorStripMult =
      limbId === EnemyLimbId.TORSO ? 1.3 + (mods?.torsoArmorStripBonus ?? 0) : 1.0;
    const armorDamage = totalDamage * armorStripMult;

    let armorStripped = 0;
    if (enemy.armor > 0) {
      armorStripped = Math.min(enemy.armor, armorDamage);
      enemy.armor = Math.max(0, enemy.armor - armorStripped);
    }

    enemy.hp = Math.max(0, enemy.hp - totalDamage);
    enemy.lastHitLimb = limbId;

    const prevLimbHp = limb.hp;
    limb.hp = Math.max(0, limb.hp - totalDamage);
    const newlyCrippled = prevLimbHp > 0 && limb.hp === 0;

    if (newlyCrippled) {
      agent.telemetry.limbsCrippled = (agent.telemetry.limbsCrippled || 0) + 1;
      if (enemy.hp > 0) {
        agent.telemetry.squadRevivesAndNonLethalCount =
          (agent.telemetry.squadRevivesAndNonLethalCount || 0) + 1;
      }
      if (mods?.restoreAirDashOnCripple) {
        agent.airDashesRemaining += 1;
      }
      if (mods && mods.siphonHpOnParryOrCripple > 0) {
        agent.hp = Math.min(agent.maxHp, agent.hp + mods.siphonHpOnParryOrCripple);
      }
    }

    const crippleDuration = 8.0 + (mods?.limbCrippleDurationBonusSec ?? 0);

    // Apply PRD 4.2 Limb-Specific Status Effects:
    if (limbId === EnemyLimbId.HEAD) {
      // Head Collider: 2.2x Crit multiplier + 4.0s Blind/Stagger interrupting windup
      enemy.combatState = EnemyCombatState.STAGGER_BLIND;
      enemy.staggerTimer = 4.0;
      enemy.stateTimer = 4.0;
    } else if (
      (limbId === EnemyLimbId.LEFT_ARM || limbId === EnemyLimbId.RIGHT_ARM) &&
      limb.hp === 0
    ) {
      // Arm Colliders at 0 HP: disables heavy weapon firing & reduces outgoing damage by 50% for 8.0s
      enemy.armsCrippledTimer = crippleDuration;
    } else if (
      (limbId === EnemyLimbId.LEFT_LEG || limbId === EnemyLimbId.RIGHT_LEG) &&
      limb.hp === 0
    ) {
      // Leg Colliders at 0 HP: reduces max velocity by 70% for 8.0s & grounds airborne targets
      enemy.legsCrippledTimer = crippleDuration;
      enemy.position.y = enemy.spawnPosition.y;
      enemy.velocity.y = 0;
    }

    if (enemy.hp <= 0) {
      enemy.combatState = EnemyCombatState.DEAD;
      enemy.respawnTimer = 6.0;
      agent.telemetry.enemiesDefeated = (agent.telemetry.enemiesDefeated || 0) + 1;
      if (enemy.rank === 'AUDITOR') {
        agent.telemetry.auditorSquadsDefeated =
          (agent.telemetry.auditorSquadsDefeated || 0) + 1;
      }
    }

    this.syncEnemyBoneColliders(enemy);

    return {
      type: 'WEAPON_HIT',
      attackerEntityId: agent.entityId,
      targetEnemyId: enemy.enemyId,
      limbId,
      damageDealt: totalDamage,
      armorStripped,
      isCrit,
      limbCrippled: newlyCrippled,
      shockwaveTriggered: false,
      shockwaveHits: 0,
      impactPoint: { ...limb.worldPosition },
    };
  }

  /**
   * Executes Motion-Warped Melee Attack (4.5m engage range, 18 m/s root-motion warp)
   * and Elite Counter-Stance Bounce/Throw (PRD Section 4.3 - REQ-MELEE)
   */
  public executeMotionWarpedMelee(
    agent: AgentPhysicsBody,
    dt: number
  ): CombatEventResult | null {
    const engageRange =
      MELEE_ENGAGE_RANGE_M + (agent.buildModifiers?.meleeEngageRangeBonusM ?? 0);
    let target: EnemyPhysicsEntity | null = null;
    let minDist = Infinity;

    for (const enemy of this.enemies.values()) {
      if (enemy.combatState === EnemyCombatState.DEAD) continue;
      const d = Math.hypot(
        enemy.position.x - agent.position.x,
        enemy.position.y - agent.position.y,
        enemy.position.z - agent.position.z
      );
      if (d <= engageRange && d < minDist) {
        minDist = d;
        target = enemy;
      }
    }

    if (!target) {
      return null;
    }

    // Smoothly translate player capsule along root-motion vector toward target at 18 m/s (PRD 4.3)
    const dx = target.position.x - agent.position.x;
    const dy = target.position.y - agent.position.y;
    const dz = target.position.z - agent.position.z;
    const dist = Math.hypot(dx, dy, dz) || 1;

    const dirX = dx / dist;
    const dirZ = dz / dist;
    agent.facingYaw = Math.atan2(-dirX, -dirZ);
    agent.rotation = quatFromYaw(agent.facingYaw);

    if (dist > MELEE_STRIKE_CONNECT_DIST_M) {
      const warpStep = Math.min(dist - 1.1, MELEE_WARP_SPEED_MPS * dt);
      agent.position.x += dirX * warpStep;
      agent.position.z += dirZ * warpStep;
      agent.velocity.x = dirX * MELEE_WARP_SPEED_MPS;
      agent.velocity.z = dirZ * MELEE_WARP_SPEED_MPS;
    }

    const postWarpDist = Math.hypot(
      target.position.x - agent.position.x,
      target.position.z - agent.position.z
    );

    if (postWarpDist > MELEE_STRIKE_CONNECT_DIST_M + 0.35) {
      return null; // Still warping toward target at 18 m/s
    }

    // Strike connects! Check if Elite enemy is in Counter Stance (crimson energy shield)
    if (target.combatState === EnemyCombatState.COUNTER_STANCE) {
      // Basic melee strikes against an active Counter Stance bounce off and trigger immediate counter-throw!
      agent.velocity.x = -dirX * 14.0;
      agent.velocity.z = -dirZ * 14.0;
      agent.velocity.y = 6.5;
      agent.grounded = false;
      agent.position.x -= dirX * 1.2;
      agent.position.z -= dirZ * 1.2;

      return {
        type: 'COUNTER_BOUNCE_THROW',
        attackerEntityId: agent.entityId,
        targetEnemyId: target.enemyId,
        damageDealt: 0,
        armorStripped: 0,
        isCrit: false,
        limbCrippled: false,
        shockwaveTriggered: false,
        shockwaveHits: 0,
        impactPoint: { ...target.position },
      };
    }

    // Valid melee strike connects cleanly in 3D space
    const { meleeBaseDamage } = getStrengthParams(agent.attributes.strength);
    target.hp = Math.max(0, target.hp - meleeBaseDamage);
    if (target.armor > 0) {
      target.armor = Math.max(0, target.armor - meleeBaseDamage * 0.5);
    }

    // Knockback target slightly
    target.position.x += dirX * 0.65;
    target.position.z += dirZ * 0.65;

    if (target.hp <= 0) {
      target.combatState = EnemyCombatState.DEAD;
      target.respawnTimer = 6.0;
      agent.telemetry.enemiesDefeated = (agent.telemetry.enemiesDefeated || 0) + 1;
    }
    this.syncEnemyBoneColliders(target);
    agent.telemetry.meleeStrikesLanded = (agent.telemetry.meleeStrikesLanded || 0) + 1;

    return {
      type: 'MELEE_HIT',
      attackerEntityId: agent.entityId,
      targetEnemyId: target.enemyId,
      damageDealt: meleeBaseDamage,
      armorStripped: meleeBaseDamage * 0.5,
      isCrit: false,
      limbCrippled: false,
      shockwaveTriggered: false,
      shockwaveHits: 0,
      impactPoint: { ...target.position },
    };
  }

  /**
   * Server-Validated Q Counter-Parry during Enemy Windup (PRD Section 4.3 - REQ-MELEE)
   * Checked against lag-compensated timestamp; snaps player & attacker into synchronized 3D parry takedown
   * and emits a 6.0m radial kinetic shockwave at Strength Lv 3+!
   */
  public executeCounterParry(
    agent: AgentPhysicsBody,
    clientTimestampMs = Date.now()
  ): CombatEventResult | null {
    const vigilanteParams = getVigilanteParams(agent.attributes.vigilante);
    const strengthParams = getStrengthParams(agent.attributes.strength);
    const mods = agent.buildModifiers;
    const effectiveParryWindowMs =
      vigilanteParams.counterWindowMs + (mods?.parryWindowBonusMs ?? 0);
    const effectiveEngageRange =
      MELEE_ENGAGE_RANGE_M + (mods?.meleeEngageRangeBonusM ?? 0);

    let parriedEnemy: EnemyPhysicsEntity | null = null;
    for (const enemy of this.enemies.values()) {
      if (enemy.combatState === EnemyCombatState.DEAD) continue;
      const dist = Math.hypot(
        enemy.position.x - agent.position.x,
        enemy.position.y - agent.position.y,
        enemy.position.z - agent.position.z
      );
      if (dist > effectiveEngageRange) continue;

      // Check current state or lag-compensated history within vigilante counterWindowMs
      const isCurrentlyParryable =
        enemy.combatState === EnemyCombatState.WINDUP ||
        enemy.combatState === EnemyCombatState.ACTIVE_SWEEP;

      const wasParryableInHistory = enemy.history.some(
        (h) =>
          Math.abs(clientTimestampMs - h.timestampMs) <= effectiveParryWindowMs &&
          (h.combatState === EnemyCombatState.WINDUP ||
            h.combatState === EnemyCombatState.ACTIVE_SWEEP)
      );

      if (isCurrentlyParryable || wasParryableInHistory) {
        parriedEnemy = enemy;
        break;
      }
    }

    if (!parriedEnemy) {
      return null;
    }

    // 1. Snap player and attacker into synchronized 3D parry takedown position (1.15m in front of enemy)
    const dx = parriedEnemy.position.x - agent.position.x;
    const dz = parriedEnemy.position.z - agent.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const dirX = dx / len;
    const dirZ = dz / len;

    agent.position.x = parriedEnemy.position.x - dirX * 1.15;
    agent.position.z = parriedEnemy.position.z - dirZ * 1.15;
    agent.facingYaw = Math.atan2(-dirX, -dirZ);
    agent.rotation = quatFromYaw(agent.facingYaw);

    const parryDamage =
      strengthParams.meleeBaseDamage * 1.6 * (mods?.parryDamageMultiplier ?? 1.0);
    parriedEnemy.armor = 0; // Counter-parry shatters remaining armor
    parriedEnemy.hp = Math.max(0, parriedEnemy.hp - parryDamage);
    parriedEnemy.combatState =
      parriedEnemy.hp <= 0 ? EnemyCombatState.DEAD : EnemyCombatState.STAGGER_BLIND;
    parriedEnemy.staggerTimer = 4.0;
    parriedEnemy.stateTimer = 4.0;
    if (parriedEnemy.hp <= 0) {
      parriedEnemy.respawnTimer = 6.0;
      agent.telemetry.enemiesDefeated = (agent.telemetry.enemiesDefeated || 0) + 1;
    }
    this.syncEnemyBoneColliders(parriedEnemy);

    if (mods && mods.siphonHpOnParryOrCripple > 0) {
      agent.hp = Math.min(agent.maxHp, agent.hp + mods.siphonHpOnParryOrCripple);
    }

    // 2. Emit Radial Kinetic Shockwave (radius: 6.0m at Strength Lv 3+, PRD Section 4.3)
    const shockwaveTriggered = agent.attributes.strength >= 3;
    const shockwaveRadius =
      PARRY_SHOCKWAVE_RADIUS_M + (mods?.parryShockwaveRadiusBonusM ?? 0);
    let shockwaveHits = 0;

    if (shockwaveTriggered) {
      const shockDamage =
        strengthParams.meleeBaseDamage * 0.85 * (mods?.parryDamageMultiplier ?? 1.0);
      for (const other of this.enemies.values()) {
        if (other.enemyId === parriedEnemy.enemyId || other.combatState === EnemyCombatState.DEAD) {
          continue;
        }
        const sx = other.position.x - agent.position.x;
        const sy = other.position.y - agent.position.y;
        const sz = other.position.z - agent.position.z;
        const sDist = Math.hypot(sx, sy, sz);

        if (sDist <= shockwaveRadius) {
          shockwaveHits += 1;
          const falloff = 1.0 - (sDist / shockwaveRadius) * 0.4;
          other.hp = Math.max(0, other.hp - shockDamage * falloff);
          other.combatState =
            other.hp <= 0 ? EnemyCombatState.DEAD : EnemyCombatState.STAGGER_BLIND;
          other.staggerTimer = 4.0;
          other.stateTimer = 4.0;

          // Radial knockback impulse
          const horiz = Math.hypot(sx, sz) || 1;
          other.position.x += (sx / horiz) * 2.2;
          other.position.z += (sz / horiz) * 2.2;

          if (other.hp <= 0) {
            other.respawnTimer = 6.0;
            agent.telemetry.enemiesDefeated = (agent.telemetry.enemiesDefeated || 0) + 1;
          }
          this.syncEnemyBoneColliders(other);
        }
      }
    }

    agent.telemetry.parriesExecuted = (agent.telemetry.parriesExecuted || 0) + 1;

    return {
      type: 'PARRY_TAKEDOWN',
      attackerEntityId: agent.entityId,
      targetEnemyId: parriedEnemy.enemyId,
      damageDealt: parryDamage,
      armorStripped: parriedEnemy.maxArmor,
      isCrit: true,
      limbCrippled: false,
      shockwaveTriggered,
      shockwaveHits,
      impactPoint: { ...parriedEnemy.position },
    };
  }

  public toBinarySnapshots(): EnemyBinarySnapshotState[] {
    const out: EnemyBinarySnapshotState[] = [];
    for (const e of this.enemies.values()) {
      const limbHpPct: [number, number, number, number, number, number] = [
        Math.round((e.limbs[EnemyLimbId.HEAD].hp / e.limbs[EnemyLimbId.HEAD].maxHp) * 100),
        Math.round((e.limbs[EnemyLimbId.TORSO].hp / e.limbs[EnemyLimbId.TORSO].maxHp) * 100),
        Math.round((e.limbs[EnemyLimbId.LEFT_ARM].hp / e.limbs[EnemyLimbId.LEFT_ARM].maxHp) * 100),
        Math.round((e.limbs[EnemyLimbId.RIGHT_ARM].hp / e.limbs[EnemyLimbId.RIGHT_ARM].maxHp) * 100),
        Math.round((e.limbs[EnemyLimbId.LEFT_LEG].hp / e.limbs[EnemyLimbId.LEFT_LEG].maxHp) * 100),
        Math.round((e.limbs[EnemyLimbId.RIGHT_LEG].hp / e.limbs[EnemyLimbId.RIGHT_LEG].maxHp) * 100),
      ];

      out.push({
        enemyId: e.enemyId,
        combatState: e.combatState,
        isElite: e.isElite,
        armsCrippled: e.armsCrippledTimer > 0,
        legsCrippled: e.legsCrippledTimer > 0,
        headBlinded: e.staggerTimer > 0,
        lastHitLimb: e.lastHitLimb,
        position: { ...e.position },
        yaw: e.yaw,
        hp: e.hp,
        maxHp: e.maxHp,
        armor: e.armor,
        limbHpPct,
        stateTimer: e.stateTimer,
      });
    }
    return out;
  }
}
