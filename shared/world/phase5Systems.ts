/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Phase 5 Shared World Systems:
 * 1. 4 District 3-Stage Operational Loops (REQ-LOOPS) unlocking 3D Grapple Overdrive, Plasma Railgun, Grav-Flight Overdrive & Protocol Eclipse Override
 * 2. Server-Wide 90s Omega Bounty 3D Waypoint Extraction Convoy/Boss (REQ-BOUNTIES)
 * 3. Secret Neural Drift Engine (REQ-SECRET) tracking 4 SQLite telemetry ratios & spawning 3D Aegis Auditor Airship Hit-Squads
 */

import { EnemyCombatManager, EnemyPhysicsEntity } from '../combat/enemyRigSystem.js';
import {
  AgentTelemetry,
  DISTRICT_OBJECTIVE_INTERACT_RADIUS_M,
  DistrictId,
  DistrictLoopRewardId,
  EnemyCombatState,
  FactionId,
  NeuralDriftMutationId,
  OMEGA_BOUNTY_DURATION_SEC,
} from '../constants.js';
import { AgentPhysicsBody } from '../physics/characterController.js';
import { computeAgentBuildModifiers } from '../progression/skillTreeSystem.js';
import {
  AuditorAirshipBinaryState,
  DistrictLoopBinaryState,
  OmegaBountyBinaryState,
  Vec3,
} from '../protocol/binaryProtocol.js';

export interface DistrictLoopSpec {
  district: DistrictId;
  districtIndex: number;
  name: string;
  faction: FactionId;
  rewardId: DistrictLoopRewardId;
  rewardName: string;
  stage1Terminals: [Vec3, Vec3];
  lieutenantEnemyId: number;
  lieutenantCallsign: string;
  lieutenantSpawnPos: Vec3;
  kingpinEnemyId: number;
  kingpinCallsign: string;
  kingpinSpawnPos: Vec3;
  coreOverridePos: Vec3;
}

export interface DistrictLoopRuntimeState {
  spec: DistrictLoopSpec;
  currentStage: 1 | 2 | 3 | 4; // 1=Terminals, 2=Lieutenant, 3=Kingpin/CoreOverride, 4=Completed
  terminal1Hacked: boolean;
  terminal2Hacked: boolean;
  lieutenantDefeated: boolean;
  kingpinDefeated: boolean;
}

export interface OmegaBountyRuntimeState {
  active: boolean;
  escaped: boolean;
  completed: boolean;
  enemyId: number;
  waypointIndex: number;
  waypoints: Vec3[];
  timeRemainingSec: number;
  cooldownBeforeNextSec: number;
  position: Vec3;
  hp: number;
  maxHp: number;
}

export interface NeuralDriftRatios {
  collateral_blast_damage_ratio: number;
  limb_cripple_to_kill_ratio: number;
  airborne_time_ratio: number;
  squad_revive_and_nonlethal_ratio: number;
}

export interface AuditorAirshipEntity {
  airshipId: number;
  targetEntityId: number;
  mutationId: NeuralDriftMutationId;
  mutationIndex: number;
  active: boolean;
  position: Vec3;
  yaw: number;
  orbitAngle: number;
  auditorEnemyIds: number[];
}

export interface Phase5EventNotification {
  type:
    | 'DISTRICT_STAGE_ADVANCED'
    | 'DISTRICT_LOOP_COMPLETED'
    | 'OMEGA_BOUNTY_STARTED'
    | 'OMEGA_BOUNTY_COMPLETED'
    | 'OMEGA_BOUNTY_ESCAPED'
    | 'NEURAL_DRIFT_ACTIVATED';
  district?: DistrictId;
  stage?: number;
  rewardId?: DistrictLoopRewardId;
  rewardName?: string;
  mutationId?: NeuralDriftMutationId;
  mutationName?: string;
  agentCallsign?: string;
  message: string;
}

export const DISTRICT_LOOP_SPECS: DistrictLoopSpec[] = [
  {
    district: DistrictId.NEON_DOCKS,
    districtIndex: 0,
    name: 'Neon Docks Smuggler Grid',
    faction: FactionId.NEON_SYNDICATE,
    rewardId: DistrictLoopRewardId.UNLOCK_GRAPPLE_OVERDRIVE,
    rewardName: '3D Grapple-Hook Overdrive (+20m Range & +35% Winch Speed)',
    stage1Terminals: [
      { x: -24.0, y: 0.0, z: 20.0 },
      { x: -34.0, y: 0.0, z: 26.0 },
    ],
    lieutenantEnemyId: 501,
    lieutenantCallsign: 'SYNDICATE-LT-VEX',
    lieutenantSpawnPos: { x: -30.0, y: 0.0, z: 24.0 },
    kingpinEnemyId: 511,
    kingpinCallsign: 'KINGPIN-KRAKEN',
    kingpinSpawnPos: { x: -38.0, y: 0.0, z: 32.0 },
    coreOverridePos: { x: -38.0, y: 0.0, z: 32.0 },
  },
  {
    district: DistrictId.FOUNDRY_SLUMS,
    districtIndex: 1,
    name: 'Foundry Slums Thermobaric Core',
    faction: FactionId.FOUNDRY_IRONCLAD,
    rewardId: DistrictLoopRewardId.UNLOCK_PLASMA_RAILGUN,
    rewardName: 'Hyperion Plasma Railgun (1.65x Weapon DMG & +50% Armor Strip)',
    stage1Terminals: [
      { x: 24.0, y: 0.0, z: 20.0 },
      { x: 34.0, y: 0.0, z: 26.0 },
    ],
    lieutenantEnemyId: 502,
    lieutenantCallsign: 'IRONCLAD-LT-VULCAN',
    lieutenantSpawnPos: { x: 30.0, y: 0.0, z: 24.0 },
    kingpinEnemyId: 512,
    kingpinCallsign: 'KINGPIN-SLAG',
    kingpinSpawnPos: { x: 38.0, y: 0.0, z: 32.0 },
    coreOverridePos: { x: 38.0, y: 0.0, z: 32.0 },
  },
  {
    district: DistrictId.HELIOS_SPIRE,
    districtIndex: 2,
    name: 'Helios Spire Orbital Telemetry',
    faction: FactionId.HELIOS_EXECUTIVE_GUARD,
    rewardId: DistrictLoopRewardId.UNLOCK_GRAV_FLIGHT_OVERDRIVE,
    rewardName: 'Grav-Flight Overdrive (+6s Jetpack Fuel & +40% Vector Thrust)',
    stage1Terminals: [
      { x: 24.0, y: 0.0, z: -20.0 },
      { x: 34.0, y: 0.0, z: -26.0 },
    ],
    lieutenantEnemyId: 503,
    lieutenantCallsign: 'HELIOS-LT-SOLARIS',
    lieutenantSpawnPos: { x: 30.0, y: 0.0, z: -24.0 },
    kingpinEnemyId: 513,
    kingpinCallsign: 'KINGPIN-HELIO',
    kingpinSpawnPos: { x: 38.0, y: 0.0, z: -32.0 },
    coreOverridePos: { x: 38.0, y: 0.0, z: -32.0 },
  },
  {
    district: DistrictId.AEGIS_CITADEL,
    districtIndex: 3,
    name: 'Aegis Citadel Eclipse Bastion',
    faction: FactionId.AEGIS_DIRECTORATE,
    rewardId: DistrictLoopRewardId.UNLOCK_PROTOCOL_ECLIPSE_OVERRIDE,
    rewardName: 'Protocol Eclipse Override (+30% Max HP, +15m Vigilante Sphere & Shield Pierce)',
    stage1Terminals: [
      { x: -24.0, y: 0.0, z: -20.0 },
      { x: -34.0, y: 0.0, z: -26.0 },
    ],
    lieutenantEnemyId: 504,
    lieutenantCallsign: 'AEGIS-LT-PRAETOR',
    lieutenantSpawnPos: { x: -30.0, y: 0.0, z: -24.0 },
    kingpinEnemyId: 514,
    kingpinCallsign: 'COMMANDER-KRONOS',
    kingpinSpawnPos: { x: -38.0, y: 0.0, z: -32.0 },
    coreOverridePos: { x: -38.0, y: 0.0, z: -32.0 },
  },
];

export const OMEGA_EXTRACTION_WAYPOINTS: Vec3[] = [
  { x: -16.0, y: 0.0, z: 22.0 },
  { x: 16.0, y: 0.0, z: 22.0 },
  { x: 30.0, y: 0.0, z: 10.0 },
  { x: 30.0, y: 0.0, z: -12.0 },
  { x: 16.0, y: 0.0, z: -26.0 },
  { x: -16.0, y: 0.0, z: -26.0 },
  { x: -32.0, y: 0.0, z: -14.0 },
  { x: -46.0, y: 0.0, z: -40.0 },
];

export const NEURAL_DRIFT_CATALOG: Record<
  NeuralDriftMutationId,
  { id: NeuralDriftMutationId; index: number; name: string; description: string; consequenceDesc: string }
> = {
  [NeuralDriftMutationId.PYRO_NEUROSIS]: {
    id: NeuralDriftMutationId.PYRO_NEUROSIS,
    index: 0,
    name: 'Pyro-Neurosis',
    description: '+30% Explosive Blast Radius & +35% Radial Blast Impulse (N*s).',
    consequenceDesc: 'Aegis Firebreak Auditor Airship & Suppression Hit-Squad deployed!',
  },
  [NeuralDriftMutationId.SURGICAL_COLDNESS]: {
    id: NeuralDriftMutationId.SURGICAL_COLDNESS,
    index: 1,
    name: 'Surgical Coldness',
    description: '+0.5x Headshot Crit Multiplier, +25% Limb Damage & -25% Spread Cone.',
    consequenceDesc: 'Aegis Neural-Hunter Auditor Airship & Precision Hit-Squad deployed!',
  },
  [NeuralDriftMutationId.HOLLOW_FRAME_ADAPTATION]: {
    id: NeuralDriftMutationId.HOLLOW_FRAME_ADAPTATION,
    index: 2,
    name: 'Hollow-Frame Adaptation',
    description: '-25% Airborne Gravity, +3.0s Jetpack Fuel & +15% Air-Dash Speed.',
    consequenceDesc: 'Aegis Sky-Interceptor Auditor Airship & Aerial Hit-Squad deployed!',
  },
  [NeuralDriftMutationId.GHOST_CONSCIENCE]: {
    id: NeuralDriftMutationId.GHOST_CONSCIENCE,
    index: 3,
    name: 'Ghost Conscience',
    description: '+15m Vigilante Co-op Buff Sphere, +20 HP/s Triage Aura & +100ms Parry Window.',
    consequenceDesc: 'Aegis Directorate marks Agent Rogue — Inquisitor Airship deployed!',
  },
};

/**
 * Computes the 4 rolling telemetry ratios for the Secret Neural Drift Engine (PRD Section 4.4)
 */
export function computeNeuralDriftRatios(telemetry: AgentTelemetry): NeuralDriftRatios {
  const totalDmg = Math.max(1.0, telemetry.totalDamageDealt || 0);
  const blastDmg = telemetry.collateralBlastDamageDealt || 0;
  const kills = Math.max(1.0, telemetry.enemiesDefeated || 0);
  const cripples = telemetry.limbsCrippled || 0;
  const playSec = Math.max(1.0, telemetry.playTimeSeconds || 0);
  const airSec = telemetry.airborneTimeSeconds || 0;
  const revivesAndNonLethal = telemetry.squadRevivesAndNonLethalCount || 0;
  const totalEncounters = Math.max(1.0, (telemetry.enemiesDefeated || 0) + revivesAndNonLethal);

  return {
    collateral_blast_damage_ratio: Math.min(1.0, blastDmg / totalDmg),
    limb_cripple_to_kill_ratio: Math.min(2.0, cripples / kills),
    airborne_time_ratio: Math.min(1.0, airSec / playSec),
    squad_revive_and_nonlethal_ratio: Math.min(1.0, revivesAndNonLethal / totalEncounters),
  };
}

export class Phase5WorldDirector {
  public readonly districtLoops: Map<DistrictId, DistrictLoopRuntimeState> = new Map();
  public readonly unlockedDistrictRewards: Set<DistrictLoopRewardId> = new Set();
  public readonly omegaBounty: OmegaBountyRuntimeState;
  public readonly auditorAirships: Map<number, AuditorAirshipEntity> = new Map();
  public readonly pendingNotifications: Phase5EventNotification[] = [];

  private nextAirshipId = 1;
  private nextAuditorEnemyId = 700;

  constructor(private readonly combatManager: EnemyCombatManager) {
    for (const spec of DISTRICT_LOOP_SPECS) {
      this.districtLoops.set(spec.district, {
        spec,
        currentStage: 1,
        terminal1Hacked: false,
        terminal2Hacked: false,
        lieutenantDefeated: false,
        kingpinDefeated: false,
      });
    }

    this.omegaBounty = {
      active: false,
      escaped: false,
      completed: false,
      enemyId: 800,
      waypointIndex: 0,
      waypoints: OMEGA_EXTRACTION_WAYPOINTS.map((w) => ({ ...w })),
      timeRemainingSec: OMEGA_BOUNTY_DURATION_SEC,
      cooldownBeforeNextSec: 2.0,
      position: { ...OMEGA_EXTRACTION_WAYPOINTS[0]! },
      hp: 900,
      maxHp: 900,
    };

    // Start the initial Omega Bounty Convoy immediately so players & tests can intercept it
    this.startOmegaBounty();
  }

  /**
   * Spawns or restarts the 90-second Omega Bounty HVT Convoy across the 3D city waypoint path (REQ-BOUNTIES)
   */
  public startOmegaBounty(): EnemyPhysicsEntity {
    const startPos = { ...OMEGA_EXTRACTION_WAYPOINTS[0]! };
    const hvt = this.combatManager.spawnEnemy(
      800,
      'OMEGA-CONVOY-VALKYRIE',
      startPos,
      true,
      {
        faction: FactionId.AEGIS_DIRECTORATE,
        rank: 'OMEGA_HVT',
        maxHp: 900,
        maxArmor: 220,
        disableAutoRespawn: true,
      }
    );

    this.omegaBounty.active = true;
    this.omegaBounty.escaped = false;
    this.omegaBounty.completed = false;
    this.omegaBounty.enemyId = hvt.enemyId;
    this.omegaBounty.waypointIndex = 1;
    this.omegaBounty.timeRemainingSec = OMEGA_BOUNTY_DURATION_SEC;
    this.omegaBounty.position = { ...startPos };
    this.omegaBounty.hp = hvt.hp;
    this.omegaBounty.maxHp = hvt.maxHp;

    this.pendingNotifications.push({
      type: 'OMEGA_BOUNTY_STARTED',
      message: `OMEGA BOUNTY DEPLOYED: Intercept HVT #800 along 3D extraction route (${OMEGA_BOUNTY_DURATION_SEC}s remaining)!`,
    });

    return hvt;
  }

  /**
   * Interacts with the nearest District Operational Loop 3D Terminal or Core Override Beacon (REQ-LOOPS)
   * Also supports Co-op Squad Triage/Revive when near an injured co-op Agent!
   */
  public tryInteractObjectiveOrRevive(
    agent: AgentPhysicsBody,
    allAgents: Map<number, AgentPhysicsBody>
  ): boolean {
    let interacted = false;

    // 1. Check Co-op Squad Revive / Triage within 4.5m
    for (const ally of allAgents.values()) {
      if (ally.entityId === agent.entityId) continue;
      const d = Math.hypot(
        ally.position.x - agent.position.x,
        ally.position.y - agent.position.y,
        ally.position.z - agent.position.z
      );
      if (d <= 4.5 && ally.hp < ally.maxHp) {
        ally.hp = Math.min(ally.maxHp, ally.hp + 75);
        agent.telemetry.squadRevivesAndNonLethalCount =
          (agent.telemetry.squadRevivesAndNonLethalCount || 0) + 1;
        interacted = true;
      }
    }

    // 2. Check all 4 District Operational Loops for 3D Terminal / Core Override interaction
    for (const loop of this.districtLoops.values()) {
      const { spec } = loop;

      if (loop.currentStage === 1) {
        const d1 = Math.hypot(
          spec.stage1Terminals[0].x - agent.position.x,
          spec.stage1Terminals[0].y - agent.position.y,
          spec.stage1Terminals[0].z - agent.position.z
        );
        const d2 = Math.hypot(
          spec.stage1Terminals[1].x - agent.position.x,
          spec.stage1Terminals[1].y - agent.position.y,
          spec.stage1Terminals[1].z - agent.position.z
        );

        if (!loop.terminal1Hacked && d1 <= DISTRICT_OBJECTIVE_INTERACT_RADIUS_M) {
          loop.terminal1Hacked = true;
          interacted = true;
        }
        if (!loop.terminal2Hacked && d2 <= DISTRICT_OBJECTIVE_INTERACT_RADIUS_M) {
          loop.terminal2Hacked = true;
          interacted = true;
        }

        if (loop.terminal1Hacked && loop.terminal2Hacked) {
          this.advanceDistrictLoopToStage2(loop);
        }
      } else if (loop.currentStage === 3) {
        const dCore = Math.hypot(
          spec.coreOverridePos.x - agent.position.x,
          spec.coreOverridePos.y - agent.position.y,
          spec.coreOverridePos.z - agent.position.z
        );
        if (dCore <= DISTRICT_OBJECTIVE_INTERACT_RADIUS_M) {
          this.completeDistrictLoop(loop, agent, allAgents);
          interacted = true;
        }
      }
    }

    return interacted;
  }

  public advanceDistrictLoopToStage2(loop: DistrictLoopRuntimeState): void {
    if (loop.currentStage !== 1) return;
    loop.currentStage = 2;
    const { spec } = loop;

    // Spawn Stage 2 District Faction Lieutenant in 3D space
    this.combatManager.spawnEnemy(
      spec.lieutenantEnemyId,
      spec.lieutenantCallsign,
      spec.lieutenantSpawnPos,
      true,
      {
        faction: spec.faction,
        rank: 'LIEUTENANT',
        maxHp: 480,
        maxArmor: 180,
        disableAutoRespawn: true,
      }
    );

    this.pendingNotifications.push({
      type: 'DISTRICT_STAGE_ADVANCED',
      district: spec.district,
      stage: 2,
      message: `[${spec.district}] STAGE 2: Faction Lieutenant ${spec.lieutenantCallsign} deployed!`,
    });
  }

  public advanceDistrictLoopToStage3(loop: DistrictLoopRuntimeState): void {
    if (loop.currentStage !== 2) return;
    loop.currentStage = 3;
    loop.lieutenantDefeated = true;
    const { spec } = loop;

    // Spawn Stage 3 District Kingpin Boss guarding the Core Override Beacon
    this.combatManager.spawnEnemy(
      spec.kingpinEnemyId,
      spec.kingpinCallsign,
      spec.kingpinSpawnPos,
      true,
      {
        faction: spec.faction,
        rank: 'KINGPIN',
        maxHp: 750,
        maxArmor: 260,
        disableAutoRespawn: true,
      }
    );

    this.pendingNotifications.push({
      type: 'DISTRICT_STAGE_ADVANCED',
      district: spec.district,
      stage: 3,
      message: `[${spec.district}] STAGE 3: District Kingpin ${spec.kingpinCallsign} & Core Override exposed!`,
    });
  }

  public completeDistrictLoop(
    loop: DistrictLoopRuntimeState,
    triggeringAgent: AgentPhysicsBody | undefined,
    allAgents: Map<number, AgentPhysicsBody>
  ): void {
    if (loop.currentStage === 4) return;
    loop.currentStage = 4;
    loop.kingpinDefeated = true;
    const { spec } = loop;

    this.unlockedDistrictRewards.add(spec.rewardId);
    if (triggeringAgent) {
      triggeringAgent.telemetry.districtLoopsCompleted =
        (triggeringAgent.telemetry.districtLoopsCompleted || 0) + 1;
    }

    // Apply the unlocked District Loop technology to all active Agents immediately
    for (const a of allAgents.values()) {
      a.unlockedDistrictRewards.add(spec.rewardId);
      a.buildModifiers = computeAgentBuildModifiers(
        a.augmentChassis,
        a.unlockedSkills,
        a.unlockedRelics,
        a.unlockedDistrictRewards,
        a.activeNeuralDrifts
      );
    }

    this.pendingNotifications.push({
      type: 'DISTRICT_LOOP_COMPLETED',
      district: spec.district,
      stage: 4,
      rewardId: spec.rewardId,
      rewardName: spec.rewardName,
      message: `[${spec.district}] OPERATIONAL LOOP COMPLETE! Unlocked ${spec.rewardName}!`,
    });
  }

  /**
   * Evaluates the 4 rolling telemetry ratios for an Agent and organically triggers
   * Secret Neural Drift mutations + 3D Aegis Auditor Airship Hit-Squads (PRD Section 4.4 REQ-SECRET)
   */
  public evaluateAgentNeuralDrift(agent: AgentPhysicsBody): NeuralDriftMutationId[] {
    const ratios = computeNeuralDriftRatios(agent.telemetry);
    agent.neuralDriftRatios = ratios;

    const newlyActivated: NeuralDriftMutationId[] = [];

    const checkAndActivate = (id: NeuralDriftMutationId, condition: boolean) => {
      if (condition && !agent.activeNeuralDrifts.has(id)) {
        agent.activeNeuralDrifts.add(id);
        newlyActivated.push(id);

        agent.buildModifiers = computeAgentBuildModifiers(
          agent.augmentChassis,
          agent.unlockedSkills,
          agent.unlockedRelics,
          agent.unlockedDistrictRewards,
          agent.activeNeuralDrifts
        );

        // World Consequence: Spawn a 3D Aegis Auditor Airship & Hit-Squad targeting this Agent!
        this.spawnAegisAuditorAirshipAndSquad(agent, id);

        const info = NEURAL_DRIFT_CATALOG[id];
        this.pendingNotifications.push({
          type: 'NEURAL_DRIFT_ACTIVATED',
          mutationId: id,
          mutationName: info.name,
          agentCallsign: agent.callsign,
          message: `SECRET NEURAL DRIFT [${info.name}] ACTIVATED ON ${agent.callsign}! ${info.consequenceDesc}`,
        });
      }
    };

    checkAndActivate(
      NeuralDriftMutationId.PYRO_NEUROSIS,
      ratios.collateral_blast_damage_ratio >= 0.38 &&
        (agent.telemetry.collateralBlastDamageDealt || 0) >= 200
    );

    checkAndActivate(
      NeuralDriftMutationId.SURGICAL_COLDNESS,
      ratios.limb_cripple_to_kill_ratio >= 0.75 &&
        (agent.telemetry.limbsCrippled || 0) >= 2
    );

    checkAndActivate(
      NeuralDriftMutationId.HOLLOW_FRAME_ADAPTATION,
      ratios.airborne_time_ratio >= 0.35 &&
        (agent.telemetry.airborneTimeSeconds || 0) >= 3.0
    );

    checkAndActivate(
      NeuralDriftMutationId.GHOST_CONSCIENCE,
      ratios.squad_revive_and_nonlethal_ratio >= 0.40 &&
        (agent.telemetry.squadRevivesAndNonLethalCount || 0) >= 2
    );

    return newlyActivated;
  }

  public spawnAegisAuditorAirshipAndSquad(
    targetAgent: AgentPhysicsBody,
    mutationId: NeuralDriftMutationId
  ): AuditorAirshipEntity {
    const airshipId = this.nextAirshipId++;
    const info = NEURAL_DRIFT_CATALOG[mutationId];
    const airshipPos: Vec3 = {
      x: targetAgent.position.x + 8.0,
      y: Math.max(24.0, targetAgent.position.y + 22.0),
      z: targetAgent.position.z - 10.0,
    };

    // Deploy 2 Elite Aegis Auditors on the ground/terrace beneath the airship
    const auditorIds: number[] = [];
    for (let i = 0; i < 2; i++) {
      const enemyId = this.nextAuditorEnemyId++;
      const offsetX = i === 0 ? -3.5 : 3.5;
      this.combatManager.spawnEnemy(
        enemyId,
        `AEGIS-AUDITOR-${airshipId}-${i + 1}`,
        {
          x: targetAgent.position.x + offsetX,
          y: targetAgent.position.y,
          z: targetAgent.position.z - 5.5,
        },
        true,
        {
          faction: FactionId.AEGIS_AUDITOR_HIT_SQUAD,
          rank: 'AUDITOR',
          maxHp: 380,
          maxArmor: 150,
          disableAutoRespawn: true,
        }
      );
      auditorIds.push(enemyId);
    }

    const airship: AuditorAirshipEntity = {
      airshipId,
      targetEntityId: targetAgent.entityId,
      mutationId,
      mutationIndex: info.index,
      active: true,
      position: airshipPos,
      yaw: 0,
      orbitAngle: 0,
      auditorEnemyIds: auditorIds,
    };

    this.auditorAirships.set(airshipId, airship);
    return airship;
  }

  /**
   * Steps all Phase 5 World Systems at 60Hz:
   * - 4 District 3-Stage Operational Loops
   * - 90s Omega Bounty 3D Waypoint Extraction Convoy
   * - 3D Aegis Auditor Airships & Secret Neural Drift evaluations
   */
  public stepPhase5Systems(agents: Map<number, AgentPhysicsBody>, dt: number): void {
    // 1. Step District Operational Loops (check Stage 2 Lieutenant & Stage 3 Kingpin defeats)
    for (const loop of this.districtLoops.values()) {
      if (loop.currentStage === 2) {
        const lt = this.combatManager.enemies.get(loop.spec.lieutenantEnemyId);
        if (lt && lt.combatState === EnemyCombatState.DEAD) {
          this.advanceDistrictLoopToStage3(loop);
        }
      } else if (loop.currentStage === 3) {
        const kp = this.combatManager.enemies.get(loop.spec.kingpinEnemyId);
        if (kp && kp.combatState === EnemyCombatState.DEAD) {
          const firstAgent = agents.values().next().value as AgentPhysicsBody | undefined;
          this.completeDistrictLoop(loop, firstAgent, agents);
        }
      }
    }

    // 2. Step 90-second Omega Bounty 3D Waypoint Extraction Convoy
    if (this.omegaBounty.active) {
      const hvt = this.combatManager.enemies.get(this.omegaBounty.enemyId);
      this.omegaBounty.timeRemainingSec = Math.max(0, this.omegaBounty.timeRemainingSec - dt);

      if (!hvt || hvt.combatState === EnemyCombatState.DEAD || hvt.hp <= 0) {
        this.omegaBounty.active = false;
        this.omegaBounty.completed = true;
        this.omegaBounty.hp = 0;
        this.omegaBounty.cooldownBeforeNextSec = 25.0;

        for (const a of agents.values()) {
          a.telemetry.omegaBountiesCompleted = (a.telemetry.omegaBountiesCompleted || 0) + 1;
        }
        this.pendingNotifications.push({
          type: 'OMEGA_BOUNTY_COMPLETED',
          message: 'OMEGA BOUNTY ELIMINATED! Extraction Convoy destroyed in 3D space!',
        });
      } else if (this.omegaBounty.timeRemainingSec <= 0) {
        this.omegaBounty.active = false;
        this.omegaBounty.escaped = true;
        this.omegaBounty.cooldownBeforeNextSec = 20.0;
        this.combatManager.removeEnemy(this.omegaBounty.enemyId);
        this.pendingNotifications.push({
          type: 'OMEGA_BOUNTY_ESCAPED',
          message: 'OMEGA BOUNTY ESCAPED! 90s extraction window expired.',
        });
      } else {
        // Steer Omega HVT along its 3D extraction waypoint route (slowed by 70% if legs crippled!)
        this.omegaBounty.hp = hvt.hp;
        this.omegaBounty.maxHp = hvt.maxHp;
        const targetWp =
          this.omegaBounty.waypoints[
            Math.min(this.omegaBounty.waypointIndex, this.omegaBounty.waypoints.length - 1)
          ]!;
        const dx = targetWp.x - hvt.position.x;
        const dy = targetWp.y - hvt.position.y;
        const dz = targetWp.z - hvt.position.z;
        const dist = Math.hypot(dx, dy, dz);

        if (dist <= 1.2) {
          this.omegaBounty.waypointIndex += 1;
          if (this.omegaBounty.waypointIndex >= this.omegaBounty.waypoints.length) {
            this.omegaBounty.active = false;
            this.omegaBounty.escaped = true;
            this.omegaBounty.cooldownBeforeNextSec = 20.0;
            this.combatManager.removeEnemy(this.omegaBounty.enemyId);
            this.pendingNotifications.push({
              type: 'OMEGA_BOUNTY_ESCAPED',
              message: 'OMEGA BOUNTY ESCAPED! Reached final Aegis Extraction Pad.',
            });
          }
        } else if (hvt.staggerTimer <= 0) {
          const baseConvoySpeed = 7.2;
          const speed = hvt.legsCrippledTimer > 0 ? baseConvoySpeed * 0.30 : baseConvoySpeed;
          hvt.yaw = Math.atan2(-dx, -dz);
          hvt.velocity.x = (dx / dist) * speed;
          hvt.velocity.y = (dy / dist) * speed;
          hvt.velocity.z = (dz / dist) * speed;
          hvt.position.x += hvt.velocity.x * dt;
          hvt.position.y += hvt.velocity.y * dt;
          hvt.position.z += hvt.velocity.z * dt;
          this.omegaBounty.position = { ...hvt.position };
          this.combatManager.syncEnemyBoneColliders(hvt);
        }
      }
    }

    // 3. Step 3D Aegis Auditor Airships & evaluate Secret Neural Drift ratios for all Agents
    for (const a of agents.values()) {
      this.evaluateAgentNeuralDrift(a);
    }

    for (const airship of this.auditorAirships.values()) {
      if (!airship.active) continue;
      // Check if all deployed Auditors for this airship have been defeated
      const anyAlive = airship.auditorEnemyIds.some((id) => {
        const e = this.combatManager.enemies.get(id);
        return e && e.combatState !== EnemyCombatState.DEAD;
      });
      if (!anyAlive) {
        airship.active = false;
        continue;
      }

      const target = agents.get(airship.targetEntityId);
      airship.orbitAngle += 0.55 * dt;
      const centerX = target ? target.position.x : airship.position.x;
      const centerZ = target ? target.position.z : airship.position.z;
      const desiredY = target ? Math.max(24.0, target.position.y + 22.0) : 24.0;

      airship.position.x = centerX + Math.cos(airship.orbitAngle) * 14.0;
      airship.position.z = centerZ + Math.sin(airship.orbitAngle) * 14.0;
      airship.position.y += (desiredY - airship.position.y) * Math.min(1.0, 2.0 * dt);
      airship.yaw = airship.orbitAngle + Math.PI * 0.5;
    }
  }

  public toBinaryOmegaBountySnapshot(): OmegaBountyBinaryState {
    const targetWp =
      this.omegaBounty.waypoints[
        Math.min(this.omegaBounty.waypointIndex, this.omegaBounty.waypoints.length - 1)
      ] || this.omegaBounty.position;

    return {
      active: this.omegaBounty.active,
      escaped: this.omegaBounty.escaped,
      completed: this.omegaBounty.completed,
      enemyId: this.omegaBounty.enemyId,
      waypointIndex: this.omegaBounty.waypointIndex,
      totalWaypoints: this.omegaBounty.waypoints.length,
      timeRemainingSec: this.omegaBounty.timeRemainingSec,
      position: { ...this.omegaBounty.position },
      targetWaypoint: { ...targetWp },
      hp: this.omegaBounty.hp,
      maxHp: this.omegaBounty.maxHp,
    };
  }

  public toBinaryDistrictLoopSnapshots(): DistrictLoopBinaryState[] {
    const out: DistrictLoopBinaryState[] = [];
    for (const spec of DISTRICT_LOOP_SPECS) {
      const loop = this.districtLoops.get(spec.district)!;
      const terminalsHacked = (loop.terminal1Hacked ? 1 : 0) + (loop.terminal2Hacked ? 1 : 0);

      let activeObjectivePos = spec.coreOverridePos;
      if (loop.currentStage === 1) {
        activeObjectivePos = !loop.terminal1Hacked
          ? spec.stage1Terminals[0]
          : spec.stage1Terminals[1];
      } else if (loop.currentStage === 2) {
        const lt = this.combatManager.enemies.get(spec.lieutenantEnemyId);
        activeObjectivePos = lt ? lt.position : spec.lieutenantSpawnPos;
      } else if (loop.currentStage === 3) {
        const kp = this.combatManager.enemies.get(spec.kingpinEnemyId);
        activeObjectivePos = kp ? kp.position : spec.coreOverridePos;
      }

      out.push({
        districtIndex: spec.districtIndex,
        currentStage: loop.currentStage,
        terminalsHacked,
        totalTerminals: 2,
        activeObjectivePos: { ...activeObjectivePos },
      });
    }
    return out;
  }

  public toBinaryAuditorAirshipSnapshots(): AuditorAirshipBinaryState[] {
    const out: AuditorAirshipBinaryState[] = [];
    for (const a of this.auditorAirships.values()) {
      if (!a.active) continue;
      out.push({
        airshipId: a.airshipId,
        targetEntityId: a.targetEntityId,
        mutationIndex: a.mutationIndex,
        active: a.active,
        position: { ...a.position },
        yaw: a.yaw,
      });
    }
    return out;
  }
}

