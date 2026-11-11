/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Shared Deterministic 3D Physics Core (@dimforge/rapier3d-compat)
 * Runs identically at 60Hz (16.66ms) on both Authoritative Node.js Server and Browser Client.
 */

import RAPIER from '@dimforge/rapier3d-compat';
import {
  AgentAnimState,
  AgentAttributes,
  AgentTelemetry,
  AIR_DASH_DURATION_SEC,
  AIR_DASH_SPEED,
  AugmentChassisId,
  CAMERA_WHISKER_MARGIN,
  CAMERA_WHISKER_SPHERE_RADIUS,
  CAPSULE_CENTER_OFFSET_Y,
  CAPSULE_HALF_HEIGHT,
  CAPSULE_RADIUS,
  CHRONO_REWIND_TICKS,
  CONTROLLER_AUTOSLIDE_OFFSET,
  CONTROLLER_MAX_SLOPE_CLIMB_ANGLE,
  CONTROLLER_MAX_STEP_HEIGHT,
  CONTROLLER_MIN_SLOPE_SLIDE_ANGLE,
  CONTROLLER_MIN_STEP_WIDTH,
  CONTROLLER_SNAP_TO_GROUND_DIST,
  DEFAULT_ATTRIBUTES,
  DEFAULT_TELEMETRY,
  FactionId,
  FIXED_TIMESTEP,
  getAgilityParams,
  getFlyingParams,
  getStrengthParams,
  getVigilanteParams,
  GRAPPLE_MAX_RANGE_M,
  GRAPPLE_MIN_LENGTH_M,
  GRAPPLE_REEL_SPEED_MPS,
  GRAPPLE_TENSION_ACCEL_MPS2,
  INPUT_FLAG_DASH,
  INPUT_FLAG_FIRE,
  INPUT_FLAG_GRAB_THROW,
  INPUT_FLAG_GRAPPLE,
  INPUT_FLAG_JUMP,
  INPUT_FLAG_MANTLE,
  INPUT_FLAG_MELEE,
  INPUT_FLAG_OBJECTIVE_JETPACK,
  INPUT_FLAG_PARRY,
  INPUT_FLAG_RELIC_REWIND,
  INPUT_FLAG_SPRINT,
  INPUT_FLAG_VEHICLE_INTERACT,
  MANTLE_CHEST_RAY_Y,
  MANTLE_DURATION_SEC,
  MANTLE_HEAD_RAY_Y,
  TERMINAL_VELOCITY,
  unpackTargetLimbFromButtons,
  WORLD_GRAVITY,
} from '../constants.js';
import { CombatEventResult, EnemyCombatManager } from '../combat/enemyRigSystem.js';
import {
  ActiveBuildModifiers,
  ChronoHistoryFrame,
  computeAgentBuildModifiers,
} from '../progression/skillTreeSystem.js';
import { ClientInputPacket, EntitySnapshotState, Quat4, quatFromYaw, Vec3 } from '../protocol/binaryProtocol.js';
import {
  buildNeoVeridiaSector01,
  findActiveThermalUpdraft,
  WorldBoxStructure,
} from '../world/neoVeridiaBlock.js';
import {
  computeNeuralDriftRatios,
  NeuralDriftRatios,
  Phase5WorldDirector,
} from '../world/phase5Systems.js';
import { VehicleAndPropManager } from './vehicleAndPropSystem.js';
import { buildSkyboxPetArenaStructures, CyberPetArenaManager, type Phase6EventNotification } from '../world/cyberPetArena.js';
import { ApexDreadnoughtDirector } from '../world/dreadnoughtBoss.js';
import { getRelayPlans } from '../world/relayDefinition.js';
import { RelaySystem } from '../world/relaySystem.js';

let rapierInitialized = false;
let rapierInitPromise: Promise<void> | null = null;

/**
 * Initializes the deterministic @dimforge/rapier3d-compat WASM runtime once per process/tab.
 */
export async function initRapierPhysics(): Promise<typeof RAPIER> {
  if (rapierInitialized) {
    return RAPIER;
  }
  if (!rapierInitPromise) {
    rapierInitPromise = RAPIER.init().then(() => {
      rapierInitialized = true;
    });
  }
  await rapierInitPromise;
  return RAPIER;
}

export { RAPIER };

/**
 * Converts Euler angles (XYZ radians) to a Quaternion
 */
export function eulerToQuat(rx: number, ry: number, rz: number): Quat4 {
  const cx = Math.cos(rx * 0.5);
  const sx = Math.sin(rx * 0.5);
  const cy = Math.cos(ry * 0.5);
  const sy = Math.sin(ry * 0.5);
  const cz = Math.cos(rz * 0.5);
  const sz = Math.sin(rz * 0.5);

  return {
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz,
  };
}

export interface AgentPhysicsBody {
  entityId: number;
  callsign: string;
  rigidBody: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  controller: RAPIER.KinematicCharacterController;

  // Deterministic 3D state (position = foot origin in meters, Y-up)
  position: Vec3;
  rotation: Quat4;
  velocity: Vec3;
  facingYaw: number;

  grounded: boolean;
  animState: AgentAnimState;

  // Health & Build Modifiers (Phase 4 & 5: 5 Augment Chassis + 20 Skill Nodes + 4 Relics + District Rewards + Neural Drifts)
  hp: number;
  maxHp: number;
  spawnProtectionSec: number;
  augmentChassis: AugmentChassisId;
  unlockedSkills: Set<string>;
  unlockedRelics: Set<string>;
  unlockedDistrictRewards: Set<string>;
  activeNeuralDrifts: Set<string>;
  neuralDriftRatios: NeuralDriftRatios;
  buildModifiers: ActiveBuildModifiers;

  // Phase 5: Vector-Thrust Jetpack & Wingsuit Flight (PRD 4.1 #6 Flying) + Vigilante Co-op Buff Sphere (PRD 4.1 #7)
  jetpackFuelSec: number;
  maxJetpackFuelSec: number;
  jetpackActive: boolean;
  vigilanteBuffActive: boolean;

  // Jump & Air-Dash state
  airDashesRemaining: number;
  dashTimer: number;
  dashDirection: Vec3;
  prevButtons: number;

  // Ledge Mantling state (PRD 2.2.3)
  mantling: boolean;
  mantleTimer: number;
  mantleStartPos: Vec3;
  mantleTargetPos: Vec3;

  // Phase 4: 3D Grapple-Hook Pendulum Tether (PRD 4.5 - G key up to 45m)
  grappleActive: boolean;
  grappleAnchor: Vec3;
  grappleLength: number;

  // Phase 4: 4-Wheel Raycast Suspension Vehicle Mounting (PRD 4.1 - E key)
  mountedVehicleId: number;
  lastDriveThrottle: number;
  lastDriveSteer: number;
  lastDriveButtons: number;

  // Phase 4: Strength-Based 3D Dynamic Prop Carry & Throw (PRD 4.1 - F key)
  heldPropId: number;

  // Phase 4: Prototype Relic Chrono-Shift Anchor 3.0s History Buffer (180 ticks at 60Hz)
  chronoHistory: ChronoHistoryFrame[];

  // Agent RPG Attributes & Telemetry
  attributes: AgentAttributes;
  telemetry: AgentTelemetry;
  lastProcessedInputSeq: number;
  groundSlamPending?: boolean;
}

export interface MantleDetectionResult {
  detected: boolean;
  ledgeTopY: number;
  targetPosition: Vec3;
  wallNormal: Vec3;
}

/**
 * Shared 3D Physics World managing static city colliders and Swept Capsule Character Controllers
 */
export class SharedPhysicsWorld {
  public readonly world: RAPIER.World;
  public readonly structures: WorldBoxStructure[];
  public readonly agents: Map<number, AgentPhysicsBody> = new Map();
  public readonly combatManager: EnemyCombatManager;
  public readonly vehiclePropManager: VehicleAndPropManager;
  public readonly phase5Director: Phase5WorldDirector;
  public readonly relaySystem: RelaySystem;
  public readonly cyberPetArenaManager: CyberPetArenaManager;
  public readonly dreadnoughtDirector: ApexDreadnoughtDirector;
  public readonly pendingPhase6Events: Phase6EventNotification[] = [];
  public readonly pendingCombatEvents: CombatEventResult[] = [];
  public tickCount = 0;

  constructor() {
    if (!rapierInitialized) {
      throw new Error('initRapierPhysics() must be awaited before constructing SharedPhysicsWorld');
    }
    this.world = new RAPIER.World(WORLD_GRAVITY);
    this.world.timestep = FIXED_TIMESTEP;
    this.structures = [...buildNeoVeridiaSector01(), ...buildSkyboxPetArenaStructures()];
    this.buildStaticCityColliders();
    this.combatManager = new EnemyCombatManager(this.world);
    this.combatManager.spawnDefaultSquads();
    this.vehiclePropManager = new VehicleAndPropManager(this.world, this.combatManager);
    this.vehiclePropManager.spawnDefaultVehiclesAndProps();
    this.phase5Director = new Phase5WorldDirector(this.combatManager);
    this.relaySystem = new RelaySystem(this.world, this.combatManager, getRelayPlans(this.structures), plan => {
      const loop = [...this.phase5Director.districtLoops.values()].find(l => l.spec.districtIndex === plan.districtIndex);
      return !!loop && (plan.terminalIndex === 0 ? loop.terminal1Hacked : loop.terminal2Hacked);
    });
    this.vehiclePropManager.extraExplosionHandlers.push((agent, origin, scale) => this.relaySystem.applyBlast(agent, origin, scale));
    this.cyberPetArenaManager = new CyberPetArenaManager(this.world, this.pendingPhase6Events, (agent, pos) => {
      agent.position = { ...pos };
      agent.velocity = { x: 0, y: 0, z: 0 };
      agent.grappleActive = false;
      agent.mantling = false;
      agent.dashTimer = 0;
      agent.grounded = false;
      agent.chronoHistory.length = 0;
      this.syncAgentKinematicTransform(agent);
    });
    this.dreadnoughtDirector = new ApexDreadnoughtDirector(this.world, this.pendingPhase6Events, (pos) => {
      for (let i = 0; i < 2; i++) {
        this.combatManager.spawnEnemy(60000 + i, `VANCE-AUDITOR-${i + 1}`,
          { x: pos.x + (i === 0 ? -8 : 8), y: 0, z: pos.z }, true,
          { faction: FactionId.AEGIS_AUDITOR_HIT_SQUAD, rank: 'AUDITOR', maxHp: 380, maxArmor: 150, disableAutoRespawn: true });
      }
    });
    this.world.step();
  }

  private buildStaticCityColliders(): void {
    for (const s of this.structures) {
      const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
        s.center.x,
        s.center.y,
        s.center.z
      );
      if (s.rotation) {
        const q = eulerToQuat(s.rotation.x, s.rotation.y, s.rotation.z);
        bodyDesc.setRotation(q);
      }
      const body = this.world.createRigidBody(bodyDesc);
      const colliderDesc = RAPIER.ColliderDesc.cuboid(
        s.halfExtents.x,
        s.halfExtents.y,
        s.halfExtents.z
      ).setFriction(0.8);
      this.world.createCollider(colliderDesc, body);
    }
  }

  /**
   * Spawns or registers an Agent's Swept Capsule KinematicCharacterController in 3D space
   */
  public createAgent(
    entityId: number,
    callsign: string,
    spawnPos: Vec3,
    spawnQuat: Quat4 = { x: 0, y: 0, z: 0, w: 1 },
    attributes: AgentAttributes = { ...DEFAULT_ATTRIBUTES },
    telemetry: AgentTelemetry = { ...DEFAULT_TELEMETRY },
    augmentChassis: AugmentChassisId = AugmentChassisId.TITAN_JUGGERNAUT,
    unlockedSkills: Iterable<string> = [],
    unlockedRelics: Iterable<string> = [],
    unlockedDistrictRewards: Iterable<string> = [],
    activeNeuralDrifts: Iterable<string> = []
  ): AgentPhysicsBody {
    const existing = this.agents.get(entityId);
    if (existing) {
      this.removeAgent(entityId);
    }

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(spawnPos.x, spawnPos.y + CAPSULE_CENTER_OFFSET_Y, spawnPos.z)
      .setRotation(spawnQuat);
    const rigidBody = this.world.createRigidBody(bodyDesc);

    // Swept Capsule Collider (radius 0.4m, halfHeight 0.55m -> total height 1.90m)
    const colliderDesc = RAPIER.ColliderDesc.capsule(CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS)
      .setFriction(0.0)
      .setRestitution(0.0);
    const collider = this.world.createCollider(colliderDesc, rigidBody);

    // Rapier3D KinematicCharacterController configured to PRD 2.2.2 spec
    const controller = this.world.createCharacterController(CONTROLLER_AUTOSLIDE_OFFSET);
    controller.setUp({ x: 0.0, y: 1.0, z: 0.0 });
    controller.setMaxSlopeClimbAngle(CONTROLLER_MAX_SLOPE_CLIMB_ANGLE);
    controller.setMinSlopeSlideAngle(CONTROLLER_MIN_SLOPE_SLIDE_ANGLE);
    controller.enableAutostep(CONTROLLER_MAX_STEP_HEIGHT, CONTROLLER_MIN_STEP_WIDTH, true);
    controller.enableSnapToGround(CONTROLLER_SNAP_TO_GROUND_DIST);
    controller.setApplyImpulsesToDynamicBodies(true);

    const agilityParams = getAgilityParams(attributes.agility);
    const strengthParams = getStrengthParams(attributes.strength);
    const flyingParams = getFlyingParams(attributes.flying);
    const skillSet = new Set(unlockedSkills);
    const relicSet = new Set(unlockedRelics);
    const rewardSet = new Set([
      ...unlockedDistrictRewards,
      ...this.phase5Director.unlockedDistrictRewards,
    ]);
    const driftSet = new Set(activeNeuralDrifts);
    const buildModifiers = computeAgentBuildModifiers(
      augmentChassis,
      skillSet,
      relicSet,
      rewardSet,
      driftSet
    );
    const maxHp = Math.round(strengthParams.maxHp * buildModifiers.maxHpMultiplier);
    const maxJetpackFuelSec = flyingParams.jetpackFuelSeconds + buildModifiers.jetpackFuelBonusSec;

    const agent: AgentPhysicsBody = {
      entityId,
      callsign,
      rigidBody,
      collider,
      controller,
      position: { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z },
      rotation: { ...spawnQuat },
      velocity: { x: 0, y: 0, z: 0 },
      facingYaw: 0,
      grounded: true,
      animState: AgentAnimState.IDLE,
      hp: maxHp,
      spawnProtectionSec: 0,
      maxHp,
      augmentChassis,
      unlockedSkills: skillSet,
      unlockedRelics: relicSet,
      unlockedDistrictRewards: rewardSet,
      activeNeuralDrifts: driftSet,
      neuralDriftRatios: computeNeuralDriftRatios(telemetry),
      buildModifiers,
      jetpackFuelSec: maxJetpackFuelSec,
      maxJetpackFuelSec,
      jetpackActive: false,
      vigilanteBuffActive: false,
      airDashesRemaining: agilityParams.maxAirDashes + buildModifiers.bonusAirDashes,
      dashTimer: 0,
      dashDirection: { x: 0, y: 0, z: -1 },
      prevButtons: 0,
      mantling: false,
      mantleTimer: 0,
      mantleStartPos: { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z },
      mantleTargetPos: { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z },
      grappleActive: false,
      grappleAnchor: { x: 0, y: 0, z: 0 },
      grappleLength: 0,
      mountedVehicleId: 0,
      lastDriveThrottle: 0,
      lastDriveSteer: 0,
      lastDriveButtons: 0,
      heldPropId: 0,
      chronoHistory: [],
      attributes: { ...attributes },
      telemetry: { ...telemetry },
      lastProcessedInputSeq: 0,
    };

    this.agents.set(entityId, agent);
    return agent;
  }

  public recomputeAgentBuild(agent: AgentPhysicsBody): void {
    agent.buildModifiers = computeAgentBuildModifiers(
      agent.augmentChassis,
      agent.unlockedSkills,
      agent.unlockedRelics,
      agent.unlockedDistrictRewards,
      agent.activeNeuralDrifts
    );
    const strengthParams = getStrengthParams(agent.attributes.strength);
    const flyingParams = getFlyingParams(agent.attributes.flying);
    agent.maxHp = Math.round(strengthParams.maxHp * agent.buildModifiers.maxHpMultiplier);
    agent.hp = Math.min(agent.hp, agent.maxHp);
    agent.maxJetpackFuelSec =
      flyingParams.jetpackFuelSeconds + agent.buildModifiers.jetpackFuelBonusSec;
    agent.jetpackFuelSec = Math.min(agent.jetpackFuelSec, agent.maxJetpackFuelSec);
  }

  /**
   * Fires a 3D Grapple-Hook physical tether raycast up to 45m (+ skill bonus) along (yaw, pitch)
   * against solid Neo-Veridia architecture (PRD Section 4.5 - REQ-LOOPS).
   */
  public fireGrappleTether(agent: AgentPhysicsBody, yaw: number, pitch: number): boolean {
    const maxRange = GRAPPLE_MAX_RANGE_M + agent.buildModifiers.grappleRangeBonusM;
    const cosP = Math.cos(pitch);
    const dirX = -Math.sin(yaw) * cosP;
    const dirY = Math.sin(pitch);
    const dirZ = -Math.cos(yaw) * cosP;
    const len = Math.hypot(dirX, dirY, dirZ) || 1;
    const dir = { x: dirX / len, y: dirY / len, z: dirZ / len };

    const origin = {
      x: agent.position.x,
      y: agent.position.y + 1.45,
      z: agent.position.z,
    };
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRay(
      ray,
      maxRange,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      agent.collider,
      agent.rigidBody
    );

    if (!hit || hit.timeOfImpact < GRAPPLE_MIN_LENGTH_M) {
      agent.grappleActive = false;
      return false;
    }

    agent.grappleActive = true;
    agent.grappleLength = hit.timeOfImpact;
    agent.grappleAnchor = {
      x: origin.x + dir.x * hit.timeOfImpact,
      y: origin.y + dir.y * hit.timeOfImpact,
      z: origin.z + dir.z * hit.timeOfImpact,
    };
    agent.controller.disableSnapToGround();
    agent.grounded = false;
    if (agent.grappleAnchor.y > origin.y) {
      agent.velocity.y = Math.max(agent.velocity.y, 6.5);
    }
    agent.telemetry.grappleSwingsExecuted = (agent.telemetry.grappleSwingsExecuted || 0) + 1;
    return true;
  }

  /**
   * Executes Prototype Relic Chrono-Shift Anchor 3.0s Rewind (R Key - PRD Section 4.5 REQ-RELICS)
   * Rewinds the Agent's 3D transform, velocity, rotation, and HP history buffer by up to 3.0 seconds (180 ticks).
   */
  public executeChronoShiftRewind(agent: AgentPhysicsBody): ChronoHistoryFrame | null {
    if (agent.chronoHistory.length === 0) {
      return null;
    }

    const rewindFrame = agent.chronoHistory[0]!;
    agent.position = { ...rewindFrame.position };
    agent.velocity = { ...rewindFrame.velocity };
    agent.rotation = { ...rewindFrame.rotation };
    agent.facingYaw = rewindFrame.facingYaw;
    agent.hp = Math.max(agent.hp, rewindFrame.hp);
    agent.mantling = false;
    agent.grappleActive = false;
    agent.animState = AgentAnimState.CHRONO_REWIND;
    agent.chronoHistory.length = 0;

    this.syncAgentKinematicTransform(agent);
    agent.telemetry.chronoRewindsExecuted = (agent.telemetry.chronoRewindsExecuted || 0) + 1;
    return rewindFrame;
  }

  public removeAgent(entityId: number): void {
    this.combatManager.releaseAgent(entityId);
    this.vehiclePropManager.releaseAgent(entityId);
    const agent = this.agents.get(entityId);
    if (!agent) return;
    this.cyberPetArenaManager.removePetForOwner(entityId);
    this.dreadnoughtDirector.removeAgent(entityId);
    if (agent.mountedVehicleId > 0) {
      const veh = this.vehiclePropManager.vehicles.get(agent.mountedVehicleId);
      if (veh) veh.driverEntityId = 0;
    }
    if (agent.heldPropId > 0) {
      const prop = this.vehiclePropManager.props.get(agent.heldPropId);
      if (prop) prop.holderEntityId = 0;
    }
    this.world.removeCharacterController(agent.controller);
    this.world.removeRigidBody(agent.rigidBody);
    this.agents.delete(entityId);
  }

  /**
   * Dual-Raycast 3D Ledge Mantling Detector (PRD Section 2.2.3)
   * Casts forward rays from chest (+1.3m) and head (+2.1m), then downward ray onto the ledge surface.
   */
  public detectLedgeMantle(
    agent: AgentPhysicsBody,
    forwardDir: Vec3,
    agilityLevel: number
  ): MantleDetectionResult {
    const noHit: MantleDetectionResult = {
      detected: false,
      ledgeTopY: 0,
      targetPosition: { x: 0, y: 0, z: 0 },
      wallNormal: { x: 0, y: 0, z: 0 },
    };

    const horizontalLen = Math.hypot(forwardDir.x, forwardDir.z);
    if (horizontalLen < 1e-4) {
      return noHit;
    }
    const dirX = forwardDir.x / horizontalLen;
    const dirZ = forwardDir.z / horizontalLen;

    const { ledgeGrabReach } = getAgilityParams(agilityLevel);
    const totalReach = ledgeGrabReach + agent.buildModifiers.mantleReachBonusM;
    // Cast from agent's horizontal center out to capsule radius + reach
    const rayMaxToi = CAPSULE_RADIUS + totalReach;

    // 1. Chest Ray at +1.3m from foot origin
    const chestOrigin = {
      x: agent.position.x,
      y: agent.position.y + MANTLE_CHEST_RAY_Y,
      z: agent.position.z,
    };
    const rayDir = { x: dirX, y: 0, z: dirZ };
    const chestRay = new RAPIER.Ray(chestOrigin, rayDir);

    const chestHit = this.world.castRayAndGetNormal(
      chestRay,
      rayMaxToi,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      agent.collider,
      agent.rigidBody
    );

    if (!chestHit) {
      return noHit;
    }

    // Must hit a vertical or near-vertical wall face
    if (Math.abs(chestHit.normal.y) > 0.35) {
      return noHit;
    }

    // 2. Head Ray at +2.1m from foot origin — must clear open space above the ledge
    const headOrigin = {
      x: agent.position.x,
      y: agent.position.y + MANTLE_HEAD_RAY_Y,
      z: agent.position.z,
    };
    const headRay = new RAPIER.Ray(headOrigin, rayDir);
    const headHit = this.world.castRay(
      headRay,
       chestHit.timeOfImpact + CAPSULE_RADIUS + 0.15,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      agent.collider,
      agent.rigidBody
    );

    if (headHit !== null) {
      return noHit;
    }

    // 3. Downward Surface Snap Ray from (hitPoint.x + inset, headRay.y, hitPoint.z + inset)
    const wallHitX = chestOrigin.x + dirX * chestHit.timeOfImpact;
    const wallHitZ = chestOrigin.z + dirZ * chestHit.timeOfImpact;
    const ledgeInset = CAPSULE_RADIUS + 0.08;
    const downOrigin = {
      x: wallHitX + dirX * ledgeInset,
      y: headOrigin.y,
      z: wallHitZ + dirZ * ledgeInset,
    };
    const downRay = new RAPIER.Ray(downOrigin, { x: 0, y: -1, z: 0 });
    const maxDownDist = MANTLE_HEAD_RAY_Y - 0.35; // Ledge must be at least +0.35m above current feet
    const downHit = this.world.castRayAndGetNormal(
      downRay,
      maxDownDist,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      agent.collider,
      agent.rigidBody
    );

    if (!downHit || downHit.normal.y < 0.7) {
      return noHit;
    }

    const ledgeTopY = downOrigin.y - downHit.timeOfImpact;
    const ledgeHeightDelta = ledgeTopY - agent.position.y;
    if (ledgeHeightDelta < 0.35 || ledgeHeightDelta > MANTLE_HEAD_RAY_Y + 0.1) {
      return noHit;
    }

    return {
      detected: true,
      ledgeTopY,
      targetPosition: {
        x: downOrigin.x,
        y: ledgeTopY,
        z: downOrigin.z,
      },
      wallNormal: {
        x: chestHit.normal.x,
        y: chestHit.normal.y,
        z: chestHit.normal.z,
      },
    };
  }

  /**
   * Executes one deterministic physics step for a specific Agent given a ClientInputPacket.
   * Used both by the Authoritative Server at 60Hz and by Client-Side Prediction & Replay.
   */
  public applyAgentInput(agent: AgentPhysicsBody, input: ClientInputPacket): void {
    if (agent.hp <= 0) {
      agent.velocity = { x: 0, y: 0, z: 0 };
      agent.jetpackActive = false;
      agent.grappleActive = false;
      agent.lastDriveThrottle = agent.lastDriveSteer = 0;
      agent.lastProcessedInputSeq = input.seq;
      return;
    }
    const dt = FIXED_TIMESTEP; // Enforce deterministic 60Hz step duration
    if (this.combatManager.lockPairedAgent(agent)) {
      this.syncAgentKinematicTransform(agent); agent.prevButtons = input.buttons; agent.lastProcessedInputSeq = input.seq; return;
    }
    const agility = getAgilityParams(agent.attributes.agility);
    const mods = agent.buildModifiers;

    // 0. Record 3.0s Chrono-Shift Anchor History Buffer (180 ticks at 60Hz, PRD Section 4.5)
    agent.chronoHistory.push({
      tick: this.tickCount,
      position: { ...agent.position },
      velocity: { ...agent.velocity },
      rotation: { ...agent.rotation },
      facingYaw: agent.facingYaw,
      hp: agent.hp,
    });
    if (agent.chronoHistory.length > CHRONO_REWIND_TICKS) {
      agent.chronoHistory.shift();
    }

    // Check R Key: Prototype Relic Chrono-Shift Anchor Rewind (3.0s transform/velocity/HP rewind)
    const rewindJustPressed =
      (input.buttons & INPUT_FLAG_RELIC_REWIND) !== 0 &&
      (agent.prevButtons & INPUT_FLAG_RELIC_REWIND) === 0;
    if (rewindJustPressed && mods.chronoRewindUnlocked) {
      this.executeChronoShiftRewind(agent);
      this.updateTelemetry(agent, dt);
      agent.prevButtons = input.buttons;
      agent.lastProcessedInputSeq = input.seq;
      return;
    }

    // Check E Key: Enter / Exit 4-Wheel Raycast Suspension Vehicle
    const vehicleInteractJustPressed =
      (input.buttons & INPUT_FLAG_VEHICLE_INTERACT) !== 0 &&
      (agent.prevButtons & INPUT_FLAG_VEHICLE_INTERACT) === 0;
    if (vehicleInteractJustPressed) {
      this.vehiclePropManager.toggleVehicleMount(agent);
    }

    // Check H Key: District Operational Loop Terminal / Core Override / Co-op Revive Interaction
    const objectiveJetpackHeld = (input.buttons & INPUT_FLAG_OBJECTIVE_JETPACK) !== 0;
    const objectiveJustPressed =
      objectiveJetpackHeld && (agent.prevButtons & INPUT_FLAG_OBJECTIVE_JETPACK) === 0;
    if (objectiveJustPressed) {
      this.phase5Director.tryInteractObjectiveOrRevive(agent, this.agents);
    }

    // If currently seated in a 4-Wheel Raycast Suspension Vehicle, route inputs to vehicle chassis
    if (agent.mountedVehicleId > 0) {
      agent.lastDriveThrottle = input.moveZ;
      agent.lastDriveSteer = input.moveX;
      agent.lastDriveButtons = input.buttons;
      agent.animState = AgentAnimState.DRIVING_VEHICLE;
      this.updateTelemetry(agent, dt);
      agent.prevButtons = input.buttons;
      agent.lastProcessedInputSeq = input.seq;
      return;
    }

    // 1. Handle active Ledge Mantle Vault interpolation trajectory (0.35s)
    if (agent.mantling) {
      agent.mantleTimer += dt;
      const t = Math.min(1.0, agent.mantleTimer / MANTLE_DURATION_SEC);

      // Vertical fast climb in first 65%, horizontal vault onto ledge surface in latter half
      const verticalEase = 1 - Math.pow(1 - t, 2.2);
      const horizontalEase = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      const prevPos = { ...agent.position };
      agent.position.x =
        agent.mantleStartPos.x + (agent.mantleTargetPos.x - agent.mantleStartPos.x) * horizontalEase;
      agent.position.y =
        agent.mantleStartPos.y + (agent.mantleTargetPos.y - agent.mantleStartPos.y) * verticalEase;
      agent.position.z =
        agent.mantleStartPos.z + (agent.mantleTargetPos.z - agent.mantleStartPos.z) * horizontalEase;

      agent.velocity.x = (agent.position.x - prevPos.x) / dt;
      agent.velocity.y = (agent.position.y - prevPos.y) / dt;
      agent.velocity.z = (agent.position.z - prevPos.z) / dt;
      agent.animState = AgentAnimState.MANTLE_VAULT;

      if (t >= 1.0) {
        agent.position = { ...agent.mantleTargetPos };
        agent.velocity = { x: 0, y: 0, z: 0 };
        agent.mantling = false;
        agent.mantleTimer = 0;
        agent.grounded = true;
        agent.airDashesRemaining = agility.maxAirDashes + mods.bonusAirDashes;
        agent.animState = AgentAnimState.IDLE;
        agent.telemetry.mantlesCompleted += 1;
      }

      this.syncAgentKinematicTransform(agent);
      this.updateTelemetry(agent, dt);
      agent.prevButtons = input.buttons;
      agent.lastProcessedInputSeq = input.seq;
      return;
    }

    // 2. Compute Camera-Relative Horizontal Movement Vector in 3D World Space
    // Convention: yaw = 0 faces -Z (North); +X is Right (East)
    const sinYaw = Math.sin(input.yaw);
    const cosYaw = Math.cos(input.yaw);
    const forwardX = -sinYaw;
    const forwardZ = -cosYaw;
    const rightX = cosYaw;
    const rightZ = -sinYaw;

    let rawDirX = rightX * input.moveX + forwardX * input.moveZ;
    let rawDirZ = rightZ * input.moveX + forwardZ * input.moveZ;
    const rawLen = Math.hypot(rawDirX, rawDirZ);
    const isMovingInput = rawLen > 0.01;
    if (rawLen > 1.0) {
      rawDirX /= rawLen;
      rawDirZ /= rawLen;
    }

    if (isMovingInput) {
      agent.facingYaw = Math.atan2(-rawDirX, -rawDirZ);
      agent.rotation = quatFromYaw(agent.facingYaw);
    }

    // 2B. Handle 3D Grapple-Hook Pendulum Tether & Reel-In Tension (G Key - PRD Section 4.5)
    const grappleHeld = (input.buttons & INPUT_FLAG_GRAPPLE) !== 0;
    const grappleJustPressed =
      grappleHeld && (agent.prevButtons & INPUT_FLAG_GRAPPLE) === 0;

    if (grappleJustPressed && !agent.grappleActive) {
      this.fireGrappleTether(agent, input.yaw, input.pitch);
    } else if (!grappleHeld && agent.grappleActive) {
      agent.grappleActive = false;
      // Release boost at top of swing arc
      agent.velocity.y = Math.max(agent.velocity.y, 6.5);
    }

    // 3. Check for Jump Impulse (edge-triggered or held on ground)
    const jumpPressed = (input.buttons & INPUT_FLAG_JUMP) !== 0;
    const dashJustPressed =
      (input.buttons & INPUT_FLAG_DASH) !== 0 && (agent.prevButtons & INPUT_FLAG_DASH) === 0;
    const mantleRequested = (input.buttons & INPUT_FLAG_MANTLE) !== 0 || jumpPressed;
    const isSprinting = (input.buttons & INPUT_FLAG_SPRINT) !== 0;

    if (jumpPressed && agent.grounded) {
      agent.controller.disableSnapToGround();
      agent.velocity.y = agility.jumpImpulseVelocity;
      agent.grounded = false;
      agent.telemetry.jumpsExecuted += 1;
    }

    // 4. Check for Air-Dash Velocity Burst
    const effectiveDashSpeed = AIR_DASH_SPEED * mods.airDashSpeedMultiplier;
    if (dashJustPressed && !agent.grounded && agent.airDashesRemaining > 0) {
      agent.airDashesRemaining -= 1;
      agent.dashTimer = AIR_DASH_DURATION_SEC;
      const dashDirX = isMovingInput ? rawDirX / rawLen : forwardX;
      const dashDirZ = isMovingInput ? rawDirZ / rawLen : forwardZ;
      agent.dashDirection = { x: dashDirX, y: 0, z: dashDirZ };
      agent.velocity.x = dashDirX * effectiveDashSpeed;
      agent.velocity.z = dashDirZ * effectiveDashSpeed;
      agent.velocity.y = Math.max(0, agent.velocity.y * 0.25);
      agent.telemetry.airDashesExecuted += 1;
    }

    // 5. Integrate Horizontal Velocity, Grapple Pendulum Tether & Gravity
    if (agent.grappleActive) {
      // Vector from Anchor to Agent Chest (+1.2m)
      const chestY = agent.position.y + 1.2;
      const rx = agent.position.x - agent.grappleAnchor.x;
      const ry = chestY - agent.grappleAnchor.y;
      const rz = agent.position.z - agent.grappleAnchor.z;
      const currentDist = Math.hypot(rx, ry, rz) || 0.001;
      const nx = rx / currentDist;
      const ny = ry / currentDist;
      const nz = rz / currentDist;

      // Apply reduced pendulum gravity while high-tension winch is reeling in
      agent.velocity.y += WORLD_GRAVITY.y * 0.45 * mods.gravityScaleMultiplier * dt;

      // Tangential swing steering from WASD input
      const swingImpulse = 16.0 * mods.grappleSwingImpulseMultiplier;
      agent.velocity.x += rawDirX * swingImpulse * dt;
      agent.velocity.z += rawDirZ * swingImpulse * dt;

      // Pendulum Swing Constraint: remove outward radial velocity when taut
      if (currentDist >= agent.grappleLength * 0.96) {
        const radialVel =
          agent.velocity.x * nx + agent.velocity.y * ny + agent.velocity.z * nz;
        if (radialVel > 0) {
          agent.velocity.x -= radialVel * nx;
          agent.velocity.y -= radialVel * ny;
          agent.velocity.z -= radialVel * nz;
        }
      }

      // Reel-In Tension Force toward 3D Anchor
      const reelSpeed = GRAPPLE_REEL_SPEED_MPS * mods.grappleReelSpeedMultiplier;
      agent.grappleLength = Math.max(GRAPPLE_MIN_LENGTH_M, agent.grappleLength - reelSpeed * dt);
      const tensionAccel = GRAPPLE_TENSION_ACCEL_MPS2 * mods.grappleReelSpeedMultiplier;
      agent.velocity.x += -nx * tensionAccel * dt;
      const upwardWinchAccel =
        ry < 0 ? Math.max(14.5, -ny * tensionAccel * 1.45) : -ny * tensionAccel;
      agent.velocity.y += upwardWinchAccel * dt;
      agent.velocity.z += -nz * tensionAccel * dt;

      if (currentDist <= GRAPPLE_MIN_LENGTH_M + 0.35) {
        // Reached anchor -> vault upward onto ledge!
        agent.grappleActive = false;
        agent.velocity.y = Math.max(agent.velocity.y, 8.5);
      }
    } else if (agent.dashTimer > 0) {
      agent.dashTimer = Math.max(0, agent.dashTimer - dt);
      agent.velocity.x = agent.dashDirection.x * effectiveDashSpeed;
      agent.velocity.z = agent.dashDirection.z * effectiveDashSpeed;
      agent.velocity.y = 0;
    } else {
      const targetSpeed = isSprinting ? agility.sprintSpeed : agility.runSpeed;
      const targetVelX = rawDirX * targetSpeed;
      const targetVelZ = rawDirZ * targetSpeed;
      const accelRate = agent.grounded ? 18.0 : 10.0;
      const blend = Math.min(1.0, accelRate * dt);

      agent.velocity.x += (targetVelX - agent.velocity.x) * blend;
      agent.velocity.z += (targetVelZ - agent.velocity.z) * blend;

      // Apply Thermal Updraft Lift (Foundry Slums), Vector-Thrust Jetpack/Wingsuit (PRD 4.1 #6), or Gravity
      const updraft = findActiveThermalUpdraft(agent.position);
      const flying = getFlyingParams(agent.attributes.flying);
      agent.maxJetpackFuelSec = flying.jetpackFuelSeconds + mods.jetpackFuelBonusSec;

      if (updraft) {
        agent.controller.disableSnapToGround();
        agent.grounded = false;
        agent.jetpackActive = false;
        agent.jetpackFuelSec = Math.min(agent.maxJetpackFuelSec, agent.jetpackFuelSec + dt * 2.5);
        agent.velocity.y = Math.min(
          updraft.maxVerticalSpeedMps,
          Math.max(4.0, agent.velocity.y) + updraft.upwardAccelMps2 * dt
        );
      } else if (!agent.grounded && objectiveJetpackHeld && agent.jetpackFuelSec > 0) {
        // Vector-thrust Jetpack & Pitch-based Wingsuit physics (PRD Section 4.1 #6)
        agent.controller.disableSnapToGround();
        agent.jetpackActive = true;
        agent.jetpackFuelSec = Math.max(0, agent.jetpackFuelSec - dt);
        const upwardAccel = flying.maxUpwardAccelMps2 * mods.jetpackAccelMultiplier;
        const pitchLift = Math.sin(input.pitch) * 6.0;
        agent.velocity.y = Math.min(
          22.0,
          Math.max(-4.0, agent.velocity.y) + (upwardAccel + pitchLift) * dt
        );
        // Pitch-based forward glide boost
        const glideBoost = Math.cos(input.pitch) * 5.5;
        agent.velocity.x += forwardX * glideBoost * dt;
        agent.velocity.z += forwardZ * glideBoost * dt;
      } else if (!agent.grounded) {
        agent.jetpackActive = false;
        const baseGravMult =
          agent.velocity.y > 0 ? agility.ascentGravityMultiplier : mods.glideGravityMultiplier;
        const gravMult = baseGravMult * mods.gravityScaleMultiplier;
        agent.velocity.y = Math.max(
          TERMINAL_VELOCITY,
          agent.velocity.y + WORLD_GRAVITY.y * gravMult * dt
        );
      } else {
        agent.jetpackActive = false;
        agent.jetpackFuelSec = Math.min(agent.maxJetpackFuelSec, agent.jetpackFuelSec + dt * 2.2);
        agent.velocity.y = -1.5; // Light downward ground-contact pressure
      }
    }

    // Re-enable snap to ground when descending or grounded (unless grappling or jetpacking)
    if (agent.velocity.y <= 0 && !agent.grappleActive && !agent.jetpackActive) {
      agent.controller.enableSnapToGround(CONTROLLER_SNAP_TO_GROUND_DIST);
    }

    const preStepImpactVelY = agent.velocity.y;
    const wasGroundedBefore = agent.grounded;

    // 6. Swept Capsule KinematicCharacterController Movement Calculation
    const desiredTranslation = {
      x: agent.velocity.x * dt,
      y: agent.velocity.y * dt,
      z: agent.velocity.z * dt,
    };

    agent.controller.computeColliderMovement(
      agent.collider,
      desiredTranslation,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      (collider) => collider.handle !== agent.collider.handle
    );

    const corrected = agent.controller.computedMovement();
    const isNowGrounded = agent.controller.computedGrounded();

    const prevX = agent.position.x;
    const prevZ = agent.position.z;

    agent.position.x += corrected.x;
    agent.position.y += corrected.y;
    agent.position.z += corrected.z;

    // Safety floor clamp so an agent can never fall to -Infinity if forced out of bounds
    if (agent.position.y < -10.0 || !Number.isFinite(agent.position.y)) {
      agent.position = { x: 0, y: 0, z: 0 };
      agent.velocity = { x: 0, y: 0, z: 0 };
    }

    const horizDist = Math.hypot(agent.position.x - prevX, agent.position.z - prevZ);
    agent.telemetry.totalDistanceMeters += horizDist;

    if (isNowGrounded && agent.velocity.y <= 0 && !agent.grappleActive) {
      agent.grounded = true;
      agent.velocity.y = 0;
      agent.airDashesRemaining = agility.maxAirDashes + mods.bonusAirDashes;

      // Supersonic Dive-Bomb Shockwave on high-velocity ground impact (15m radius, PRD 4.1 #6)
      if (!wasGroundedBefore && preStepImpactVelY <= -26.0 && mods.unlockDiveBombShockwave) {
        const diveEvents = this.vehiclePropManager.triggerSphericalExplosion(
          agent,
          agent.position,
          1.25
        );
        this.pendingCombatEvents.push(...diveEvents);
      }
    } else {
      agent.grounded = isNowGrounded && !agent.grappleActive;
    }

    this.syncAgentKinematicTransform(agent);

    // 7. Dual-Raycast Ledge Mantling Check (while airborne & moving toward structure, or mantle requested)
    if (agent.groundSlamPending && agent.grounded) {
      this.pendingCombatEvents.push(...this.vehiclePropManager.triggerSphericalExplosion(agent, agent.position, 0.55));
      agent.groundSlamPending = false;
    }
    if ((!agent.grounded || mantleRequested) && !agent.grappleActive) {
      const probeDir = isMovingInput
        ? { x: rawDirX / rawLen, y: 0, z: rawDirZ / rawLen }
        : { x: -Math.sin(agent.facingYaw), y: 0, z: -Math.cos(agent.facingYaw) };

      if (isMovingInput || mantleRequested) {
        const mantleCheck = this.detectLedgeMantle(agent, probeDir, agent.attributes.agility);
        if (mantleCheck.detected) {
          agent.mantling = true;
          agent.mantleTimer = 0;
          agent.mantleStartPos = { ...agent.position };
          agent.mantleTargetPos = { ...mantleCheck.targetPosition };
          agent.dashTimer = 0;
          agent.animState = AgentAnimState.MANTLE_VAULT;
        }
      }
    }

    // 8. Execute 3D Combat & Prop Throw Actions (V.A.T.S. Shot, Melee, Parry, Strength Prop Throw)
    const grabThrowJustPressed =
      (input.buttons & INPUT_FLAG_GRAB_THROW) !== 0 &&
      (agent.prevButtons & INPUT_FLAG_GRAB_THROW) === 0;
    const fireJustPressed =
      (input.buttons & INPUT_FLAG_FIRE) !== 0 && (agent.prevButtons & INPUT_FLAG_FIRE) === 0;
    const meleePressed = (input.buttons & INPUT_FLAG_MELEE) !== 0;
    const meleeJustPressed =
      meleePressed && (agent.prevButtons & INPUT_FLAG_MELEE) === 0;
    const parryJustPressed =
      (input.buttons & INPUT_FLAG_PARRY) !== 0 && (agent.prevButtons & INPUT_FLAG_PARRY) === 0;

    let combatAnimOverride: AgentAnimState | null = null;

    if (grabThrowJustPressed || (fireJustPressed && agent.heldPropId > 0)) {
      this.vehiclePropManager.tryPickupOrThrowProp(agent, input.yaw, input.pitch);
    } else if (parryJustPressed) {
      const parryEvent = this.combatManager.executeCounterParry(agent);
      if (parryEvent) {
        this.pendingCombatEvents.push(parryEvent);
        this.syncAgentKinematicTransform(agent);
        combatAnimOverride = AgentAnimState.PARRY_TAKEDOWN;
      }
    } else if (meleeJustPressed || meleePressed) {
      if (!agent.grounded) { agent.groundSlamPending = true; agent.velocity.y = -24; }
      if (agent.groundSlamPending && agent.grounded) {
        this.pendingCombatEvents.push(...this.vehiclePropManager.triggerSphericalExplosion(agent, agent.position, 0.55));
        agent.groundSlamPending = false;
      }
      const meleeEvent = agent.groundSlamPending ? null : this.combatManager.executeMotionWarpedMelee(agent, dt);
      this.syncAgentKinematicTransform(agent);
      if (meleeEvent) {
        this.pendingCombatEvents.push(meleeEvent);
        combatAnimOverride = AgentAnimState.MELEE_STRIKE;
      }
    } else if (fireJustPressed && !this.dreadnoughtDirector.resolveWeaponShot(agent, input.yaw, input.pitch)) {
      const targetLimb = unpackTargetLimbFromButtons(input.buttons);
      const shotEvent = this.combatManager.resolveWeaponShot(
        agent,
        input.yaw,
        input.pitch,
        targetLimb
      );
      if (shotEvent) {
        this.pendingCombatEvents.push(shotEvent);
      }
    }

    // 9. Update Animation State Machine
    if (agent.groundSlamPending) {
      agent.animState = AgentAnimState.GROUND_SLAM;
    } else if (combatAnimOverride !== null) {
      agent.animState = combatAnimOverride;
    } else if (agent.grappleActive) {
      agent.animState = AgentAnimState.GRAPPLE_SWING;
    } else if (agent.jetpackActive) {
      agent.animState = AgentAnimState.JETPACK_FLIGHT;
    } else if (agent.heldPropId > 0) {
      agent.animState = AgentAnimState.CARRYING_PROP;
    } else if (!agent.mantling) {
      if (agent.dashTimer > 0) {
        agent.animState = AgentAnimState.AIR_DASH;
      } else if (!agent.grounded) {
        agent.animState = agent.velocity.y > 0.2 ? AgentAnimState.JUMP_ASCEND : AgentAnimState.FALL;
      } else {
        const speedSq = agent.velocity.x * agent.velocity.x + agent.velocity.z * agent.velocity.z;
        if (speedSq < 0.25) {
          agent.animState = AgentAnimState.IDLE;
        } else if (isSprinting && speedSq > agility.runSpeed * agility.runSpeed * 0.85) {
          agent.animState = AgentAnimState.SPRINT;
        } else {
          agent.animState = AgentAnimState.RUN;
        }
      }
    }

    this.updateTelemetry(agent, dt);
    agent.prevButtons = input.buttons;
    agent.lastProcessedInputSeq = input.seq;
  }

  /**
   * Synchronizes the Rapier3D RigidBody & Collider transform immediately
   */
  public syncAgentKinematicTransform(agent: AgentPhysicsBody): void {
    const centerTranslation = {
      x: agent.position.x,
      y: agent.position.y + CAPSULE_CENTER_OFFSET_Y,
      z: agent.position.z,
    };
    agent.rigidBody.setTranslation(centerTranslation, true);
    agent.rigidBody.setNextKinematicTranslation(centerTranslation);
    agent.rigidBody.setRotation(agent.rotation, true);
    agent.rigidBody.setNextKinematicRotation(agent.rotation);
  }

  private updateTelemetry(agent: AgentPhysicsBody, dt: number): void {
    agent.telemetry.playTimeSeconds += dt;
    if (!agent.grounded) {
      agent.telemetry.airborneTimeSeconds = (agent.telemetry.airborneTimeSeconds || 0) + dt;
    }
    if (agent.position.y > agent.telemetry.peakElevationMeters) {
      agent.telemetry.peakElevationMeters = agent.position.y;
    }
  }

  /**
   * Advances the global Rapier3D physics pipeline, 4-Wheel Vehicles, Dynamic Props, Phase 5 World Director, and 3D Enemy Combat State Machine by one fixed 60Hz tick
   */
  public stepWorld(): void {
    for (const agent of this.agents.values()) {
      agent.spawnProtectionSec = Math.max(0, agent.spawnProtectionSec - FIXED_TIMESTEP);
    }
    // Evaluate 3D Spherical Vigilante Co-op Buff Volume (PRD Section 4.1 #7)
    const agentArr = Array.from(this.agents.values());
    for (const a of agentArr) {
      a.vigilanteBuffActive = false;
    }
    for (const a of agentArr) {
      const vigParams = getVigilanteParams(a.attributes.vigilante);
      const auraRadius =
        vigParams.auraRadiusMeters * a.buildModifiers.vigilanteAuraMultiplier +
        a.buildModifiers.vigilanteAuraRadiusBonusM;
      const regenRate =
        vigParams.level * 1.8 + a.buildModifiers.vigilanteTriageRegenHpPerSec;

      for (const b of agentArr) {
        if (b.entityId === a.entityId) continue;
        const d = Math.hypot(
          b.position.x - a.position.x,
          b.position.y - a.position.y,
          b.position.z - a.position.z
        );
        if (d <= auraRadius && a.hp > 0 && b.hp > 0) {
          a.vigilanteBuffActive = true;
          b.vigilanteBuffActive = true;
          b.hp = Math.min(b.maxHp, b.hp + regenRate * FIXED_TIMESTEP);
        }
      }
    }

    this.vehiclePropManager.stepVehicles(this.agents, FIXED_TIMESTEP, this.pendingCombatEvents);
    this.vehiclePropManager.stepDynamicProps(this.agents, FIXED_TIMESTEP, this.pendingCombatEvents);
    this.phase5Director.stepPhase5Systems(this.agents, FIXED_TIMESTEP);
    this.relaySystem.step(FIXED_TIMESTEP);
    this.combatManager.stepEnemies(this.agents.values(), FIXED_TIMESTEP);
    this.cyberPetArenaManager.step(this.agents, FIXED_TIMESTEP);
    this.dreadnoughtDirector.step(this.agents, FIXED_TIMESTEP,
      [...this.phase5Director.districtLoops.values()].every((loop) => loop.currentStage === 4));
    this.world.step();
    this.tickCount += 1;
  }

  /**
   * Camera Occlusion Whisker Sphere/Raycast (PRD Section 2.2.1):
   * Casts from shoulder pivot to desired camera position against environment geometry.
   * If obstructed at distance `d`, returns `Math.max(0.4, d - 0.2m)`.
   */
  public computeCameraSafeDistance(
    pivotWorld: Vec3,
    cameraDirUnit: Vec3,
    desiredDistance: number,
    ignoreAgent?: AgentPhysicsBody
  ): number {
    const ray = new RAPIER.Ray(pivotWorld, cameraDirUnit);
    const hit = this.world.castRay(
      ray,
      desiredDistance,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      ignoreAgent?.collider,
      ignoreAgent?.rigidBody
    );

    let safeDist = desiredDistance;
    if (hit !== null && hit.timeOfImpact < desiredDistance) {
      safeDist = Math.max(0.45, hit.timeOfImpact - CAMERA_WHISKER_MARGIN);
    }

    // Secondary sphere-cast (shape cast) to prevent camera near-plane clipping into corners
    const sphere = new RAPIER.Ball(CAMERA_WHISKER_SPHERE_RADIUS);
    const shapeHit = this.world.castShape(
      pivotWorld,
      { x: 0, y: 0, z: 0, w: 1 },
      cameraDirUnit,
      sphere,
      0.0,
      safeDist,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      ignoreAgent?.collider,
      ignoreAgent?.rigidBody
    );

    if (shapeHit !== null && shapeHit.time_of_impact < safeDist) {
      safeDist = Math.max(0.45, shapeHit.time_of_impact - CAMERA_WHISKER_MARGIN);
    }

    return safeDist;
  }

  /**
   * Exports an AgentPhysicsBody into a binary-serializable EntitySnapshotState
   */
  public toEntitySnapshot(agent: AgentPhysicsBody): EntitySnapshotState {
    const mantleProgress = agent.mantling
      ? Math.min(1.0, agent.mantleTimer / MANTLE_DURATION_SEC)
      : 0.0;
    return {
      entityId: agent.entityId,
      animState: agent.animState,
      grounded: agent.grounded,
      mantling: agent.mantling,
      dashing: agent.dashTimer > 0,
      agilityLevel: agent.attributes.agility,
      position: { ...agent.position },
      rotation: { ...agent.rotation },
      velocity: { ...agent.velocity },
      mantleProgress,
    };
  }
}

