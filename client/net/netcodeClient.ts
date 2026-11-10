/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Client-Side Prediction (128-Tick Ring Buffer + Rapier3D Replay)
 * & Remote Entity Interpolation (100ms Buffered Quaternion SLERP + Position LERP)
 */

import {
  AgentAnimState,
  AgentAttributes,
  AugmentChassisId,
  DEFAULT_ATTRIBUTES,
  FIXED_TIMESTEP,
  INTERPOLATION_DELAY_MS,
  OrbType,
  PREDICTION_BUFFER_SIZE,
} from '../../shared/constants.js';
import { CombatEventResult } from '../../shared/combat/enemyRigSystem.js';
import { AgentPhysicsBody, SharedPhysicsWorld } from '../../shared/physics/characterController.js';
import {
  AuditorAirshipBinaryState,
  ClientInputPacket,
  decodeEnemySnapshot,
  decodeRenegadeOrbSnapshot,
  decodeVehiclePropSnapshot,
  decodeWorldEventsSnapshot,
  decodeWorldSnapshot,
  DistrictLoopBinaryState,
  DynamicPropBinarySnapshotState,
  encodeClientInput,
  EnemyBinarySnapshotState,
  EntitySnapshotState,
  OmegaBountyBinaryState,
  Quat4,
  slerpQuat,
  Vec3,
  VehicleBinarySnapshotState,
  WorldSnapshotPacket,
} from '../../shared/protocol/binaryProtocol.js';
import { generateNeoVeridiaOrbs, WorldOrbInstance } from '../../shared/world/orbSystem.js';
import { Phase5EventNotification } from '../../shared/world/phase5Systems.js';

export interface PredictionRingSlot {
  seq: number;
  input: ClientInputPacket;
  predictedPosition: Vec3;
  predictedVelocity: Vec3;
  predictedRotation: Quat4;
  grounded: boolean;
  mantling: boolean;
}

export interface RemoteBufferedSnapshot {
  receiveTimeMs: number;
  serverTimeSec: number;
  state: EntitySnapshotState;
}

export interface InterpolatedRemoteEntity {
  entityId: number;
  callsign: string;
  position: Vec3;
  rotation: Quat4;
  velocity: Vec3;
  animState: AgentAnimState;
  mantleProgress: number;
  agilityLevel: number;
}

export class PredictionAndInterpolationManager {
  public readonly ringBuffer: (PredictionRingSlot | null)[] = new Array(PREDICTION_BUFFER_SIZE).fill(null);
  public readonly remoteBuffers: Map<number, RemoteBufferedSnapshot[]> = new Map();
  public readonly rosterCallsigns: Map<number, { callsign: string; attributes: AgentAttributes }> = new Map();
  public readonly orbs: WorldOrbInstance[] = generateNeoVeridiaOrbs();
  public readonly orbsById: Map<number, WorldOrbInstance> = new Map();
  public readonly collectedOrbIds: Set<number> = new Set();
  public readonly enemySnapshots: Map<number, EnemyBinarySnapshotState> = new Map();
  public vehicleSnapshots: VehicleBinarySnapshotState[] = [];
  public propSnapshots: DynamicPropBinarySnapshotState[] = [];
  public omegaBountySnapshot: OmegaBountyBinaryState | null = null;
  public districtLoopSnapshots: DistrictLoopBinaryState[] = [];
  public auditorAirshipSnapshots: AuditorAirshipBinaryState[] = [];
  public onOrbCollectedCallback: ((orbId: number, orbType: OrbType) => void) | null = null;
  public onCombatEventCallback: ((event: CombatEventResult) => void) | null = null;
  public onRelicCollectedCallback: ((relicId: string, name: string) => void) | null = null;
  public onPhase5EventCallback: ((notification: Phase5EventNotification) => void) | null = null;

  public localEntityId = 0;
  public localCallsign = '';
  public currentSeq = 0;
  public lastReconciledSeq = 0;
  public lastServerTick = 0;
  public reconciliationCount = 0;
  public lastPositionErrorMeters = 0;

  private ws: WebSocket | null = null;
  public connected = false;

  constructor(private readonly physicsWorld: SharedPhysicsWorld) {
    for (const o of this.orbs) {
      this.orbsById.set(o.orbId, o);
    }
  }

  public connect(
    wsUrl: string,
    callsign: string,
    pin: string,
    onAuthenticated: (entityId: number, callsign: string, attributes: AgentAttributes) => void,
    onAuthError: (err: string) => void
  ): void {
    if (this.ws) {
      this.ws.close();
    }

    const socket = new WebSocket(wsUrl);
    socket.binaryType = 'arraybuffer';
    this.ws = socket;

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: 'AUTH',
          callsign,
          pin,
        })
      );
    };

    socket.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        const snapshot = decodeWorldSnapshot(event.data);
        if (snapshot) {
          this.onWorldSnapshot(snapshot);
          return;
        }
        const orbSnap = decodeRenegadeOrbSnapshot(event.data);
        if (orbSnap) {
          for (const state of orbSnap.orbs) {
            const targetOrb = this.orbsById.get(state.orbId);
            if (targetOrb) {
              targetOrb.position = { ...state.position };
              targetOrb.isFleeing = state.isFleeing;
            }
          }
          return;
        }
        const enemySnap = decodeEnemySnapshot(event.data);
        if (enemySnap) {
          for (const eState of enemySnap.enemies) {
            this.enemySnapshots.set(eState.enemyId, eState);
            const localEnemy = this.physicsWorld.combatManager.enemies.get(eState.enemyId);
            if (localEnemy) {
              localEnemy.position = { ...eState.position };
              localEnemy.yaw = eState.yaw;
              localEnemy.combatState = eState.combatState;
              localEnemy.hp = eState.hp;
              localEnemy.armor = eState.armor;
              localEnemy.stateTimer = eState.stateTimer;
              this.physicsWorld.combatManager.syncEnemyBoneColliders(localEnemy);
            }
          }
          return;
        }
        const vehPropSnap = decodeVehiclePropSnapshot(event.data);
        if (vehPropSnap) {
          this.vehicleSnapshots = vehPropSnap.vehicles;
          this.propSnapshots = vehPropSnap.props;
          return;
        }
        const worldEventsSnap = decodeWorldEventsSnapshot(event.data);
        if (worldEventsSnap) {
          this.omegaBountySnapshot = worldEventsSnap.omega;
          this.districtLoopSnapshots = worldEventsSnap.districts;
          this.auditorAirshipSnapshots = worldEventsSnap.airships;
          return;
        }
        return;
      }

      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'AUTH_OK') {
            this.localEntityId = msg.entityId;
            this.localCallsign = msg.callsign;
            this.connected = true;

            const record = msg.record;
            this.collectedOrbIds.clear();
            if (Array.isArray(record?.collectedOrbs)) {
              for (const id of record.collectedOrbs) {
                this.collectedOrbIds.add(Number(id));
              }
            }
            const attributes: AgentAttributes = record?.attributes || { ...DEFAULT_ATTRIBUTES };
            this.physicsWorld.createAgent(
              this.localEntityId,
              this.localCallsign,
              record?.position || { x: 0, y: 0, z: 0 },
              record?.rotation || { x: 0, y: 0, z: 0, w: 1 },
              attributes,
              record?.telemetry,
              record?.augmentChassis || AugmentChassisId.TITAN_JUGGERNAUT,
              record?.unlockedSkills || [],
              record?.unlockedRelics || [],
              record?.unlockedDistrictRewards || [],
              record?.activeNeuralDrifts || []
            );
            onAuthenticated(this.localEntityId, this.localCallsign, attributes);
          } else if (msg.type === 'PHASE5_EVENT' && msg.notification) {
            const note = msg.notification as Phase5EventNotification;
            const localAgent = this.getLocalAgent();
            if (localAgent) {
              if (note.rewardId) {
                localAgent.unlockedDistrictRewards.add(note.rewardId);
                this.physicsWorld.recomputeAgentBuild(localAgent);
              }
              if (note.mutationId) {
                localAgent.activeNeuralDrifts.add(note.mutationId);
                this.physicsWorld.recomputeAgentBuild(localAgent);
              }
            }
            if (this.onPhase5EventCallback) {
              this.onPhase5EventCallback(note);
            }
          } else if (msg.type === 'ORB_COLLECTED') {
            const orbId = Number(msg.orbId);
            const orbType = Number(msg.orbType) as OrbType;
            this.collectedOrbIds.add(orbId);
            const localAgent = this.getLocalAgent();
            if (localAgent && msg.attributes) {
              localAgent.attributes = { ...msg.attributes };
            }
            if (this.onOrbCollectedCallback) {
              this.onOrbCollectedCallback(orbId, orbType);
            }
          } else if (msg.type === 'RELIC_COLLECTED') {
            const localAgent = this.getLocalAgent();
            if (localAgent && Array.isArray(msg.unlockedRelics)) {
              for (const rId of msg.unlockedRelics) {
                localAgent.unlockedRelics.add(String(rId));
              }
              this.physicsWorld.recomputeAgentBuild(localAgent);
            }
            if (this.onRelicCollectedCallback) {
              this.onRelicCollectedCallback(String(msg.relicId), String(msg.name));
            }
          } else if (msg.type === 'BUILD_UPDATED') {
            const localAgent = this.getLocalAgent();
            if (localAgent) {
              if (msg.augmentChassis) {
                localAgent.augmentChassis = msg.augmentChassis as AugmentChassisId;
              }
              if (Array.isArray(msg.unlockedSkills)) {
                localAgent.unlockedSkills = new Set(msg.unlockedSkills.map(String));
              }
              if (Array.isArray(msg.unlockedRelics)) {
                localAgent.unlockedRelics = new Set(msg.unlockedRelics.map(String));
              }
              this.physicsWorld.recomputeAgentBuild(localAgent);
            }
          } else if (msg.type === 'COMBAT_EVENT' && msg.event) {
            if (this.onCombatEventCallback) {
              this.onCombatEventCallback(msg.event as CombatEventResult);
            }
          } else if (msg.type === 'AUTH_ERROR') {
            onAuthError(String(msg.error || 'Authentication failed'));
          } else if (msg.type === 'ROSTER_UPDATE' && Array.isArray(msg.roster)) {
            this.rosterCallsigns.clear();
            for (const entry of msg.roster) {
              this.rosterCallsigns.set(Number(entry.entityId), {
                callsign: String(entry.callsign),
                attributes: entry.attributes || { ...DEFAULT_ATTRIBUTES },
              });
            }
            const localRoster = this.rosterCallsigns.get(this.localEntityId);
            const localAgent = this.getLocalAgent();
            if (localRoster && localAgent) {
              localAgent.attributes = { ...localRoster.attributes };
            }
          }
        } catch {
          // Ignore malformed JSON control frames
        }
      }
    };

    socket.onclose = () => {
      this.connected = false;
    };
  }

  public getLocalAgent(): AgentPhysicsBody | undefined {
    return this.physicsWorld.agents.get(this.localEntityId);
  }

  public sendAttributeUpdate(attributes: Partial<AgentAttributes>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'SET_ATTRIBUTES', attributes }));
  }

  public sendBuildUpdate(
    augmentChassis: AugmentChassisId,
    unlockedSkills: string[],
    unlockedRelics?: string[]
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: 'SET_BUILD',
        augmentChassis,
        unlockedSkills,
        unlockedRelics,
      })
    );
  }

  /**
   * Steps local prediction at 60Hz, writes into the 128-tick ring buffer, and sends binary packet
   */
  public recordAndSendInput(
    moveX: number,
    moveZ: number,
    yaw: number,
    pitch: number,
    buttons: number
  ): void {
    const localAgent = this.getLocalAgent();
    if (!localAgent) return;

    this.currentSeq += 1;
    const input: ClientInputPacket = {
      seq: this.currentSeq,
      moveX,
      moveZ,
      yaw,
      pitch,
      buttons,
      dt: FIXED_TIMESTEP,
    };

    // 1. Immediately apply input to local Rapier3D world (Client-Side Prediction)
    this.physicsWorld.applyAgentInput(localAgent, input);
    this.physicsWorld.stepWorld();

    // 2. Store in 128-tick Ring Buffer
    const slotIndex = input.seq % PREDICTION_BUFFER_SIZE;
    this.ringBuffer[slotIndex] = {
      seq: input.seq,
      input,
      predictedPosition: { ...localAgent.position },
      predictedVelocity: { ...localAgent.velocity },
      predictedRotation: { ...localAgent.rotation },
      grounded: localAgent.grounded,
      mantling: localAgent.mantling,
    };

    // 3. Transmit binary 29-byte ClientInputPacket over WebSocket
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const binaryPacket = encodeClientInput(input);
      this.ws.send(binaryPacket);
    }
  }

  /**
   * Processes incoming 30Hz binary WorldSnapshotPacket:
   * - Reconciles local player state against 128-tick ring buffer + replays unacknowledged inputs
   * - Pushes remote player states into 100ms interpolation buffers
   */
  private onWorldSnapshot(snapshot: WorldSnapshotPacket): void {
    this.lastServerTick = snapshot.serverTick;
    const nowMs = performance.now();

    const activeIds = new Set<number>();

    for (const entityState of snapshot.entities) {
      activeIds.add(entityState.entityId);

      if (entityState.entityId === this.localEntityId) {
        this.reconcileLocalPlayer(entityState, snapshot.lastProcessedInputSeq);
      } else {
        let buf = this.remoteBuffers.get(entityState.entityId);
        if (!buf) {
          buf = [];
          this.remoteBuffers.set(entityState.entityId, buf);
        }
        buf.push({
          receiveTimeMs: nowMs,
          serverTimeSec: snapshot.serverTimeSec,
          state: entityState,
        });
        // Keep last ~30 snapshots (1 second history)
        if (buf.length > 32) {
          buf.splice(0, buf.length - 32);
        }
      }
    }

    // Prune disconnected remote entities
    for (const remoteId of this.remoteBuffers.keys()) {
      if (!activeIds.has(remoteId)) {
        this.remoteBuffers.delete(remoteId);
      }
    }
  }

  /**
   * Server Reconciliation + Deterministic Rapier3D Input Replay
   */
  private reconcileLocalPlayer(
    authoritative: EntitySnapshotState,
    lastProcessedSeq: number
  ): void {
    const localAgent = this.getLocalAgent();
    if (!localAgent) return;

    this.lastReconciledSeq = lastProcessedSeq;
    localAgent.attributes.agility = authoritative.agilityLevel;

    if (lastProcessedSeq === 0) {
      return;
    }

    const slot = this.ringBuffer[lastProcessedSeq % PREDICTION_BUFFER_SIZE];
    if (!slot || slot.seq !== lastProcessedSeq) {
      // If sequence fell outside the 128-tick window, snap directly to authoritative state
      localAgent.position = { ...authoritative.position };
      localAgent.rotation = { ...authoritative.rotation };
      localAgent.velocity = { ...authoritative.velocity };
      localAgent.grounded = authoritative.grounded;
      localAgent.mantling = authoritative.mantling;
      this.physicsWorld.syncAgentKinematicTransform(localAgent);
      return;
    }

    const dx = authoritative.position.x - slot.predictedPosition.x;
    const dy = authoritative.position.y - slot.predictedPosition.y;
    const dz = authoritative.position.z - slot.predictedPosition.z;
    const errorDist = Math.hypot(dx, dy, dz);
    this.lastPositionErrorMeters = errorDist;

    // Reconcile and replay if prediction diverged by > 0.05m
    if (errorDist > 0.05 || authoritative.mantling !== slot.mantling) {
      this.reconciliationCount += 1;

      // 1. Rewind local agent to authoritative server state at lastProcessedSeq
      localAgent.position = { ...authoritative.position };
      localAgent.rotation = { ...authoritative.rotation };
      localAgent.velocity = { ...authoritative.velocity };
      localAgent.grounded = authoritative.grounded;
      localAgent.mantling = authoritative.mantling;
      this.physicsWorld.syncAgentKinematicTransform(localAgent);

      // 2. Deterministically replay all subsequent unacknowledged inputs from the ring buffer
      for (let seq = lastProcessedSeq + 1; seq <= this.currentSeq; seq++) {
        const replaySlot = this.ringBuffer[seq % PREDICTION_BUFFER_SIZE];
        if (replaySlot && replaySlot.seq === seq) {
          this.physicsWorld.applyAgentInput(localAgent, replaySlot.input);
          this.physicsWorld.stepWorld();

          replaySlot.predictedPosition = { ...localAgent.position };
          replaySlot.predictedVelocity = { ...localAgent.velocity };
          replaySlot.predictedRotation = { ...localAgent.rotation };
          replaySlot.grounded = localAgent.grounded;
          replaySlot.mantling = localAgent.mantling;
        }
      }
    }
  }

  /**
   * Computes 100ms buffered remote entity transforms using Position LERP + Quaternion SLERP
   */
  public getInterpolatedRemoteEntities(nowMs = performance.now()): InterpolatedRemoteEntity[] {
    const renderTimestamp = nowMs - INTERPOLATION_DELAY_MS;
    const result: InterpolatedRemoteEntity[] = [];

    for (const [entityId, buffer] of this.remoteBuffers.entries()) {
      if (buffer.length === 0) continue;

      const meta = this.rosterCallsigns.get(entityId);
      const callsign = meta ? meta.callsign : `AGENT-${entityId}`;

      if (buffer.length === 1 || renderTimestamp <= buffer[0].receiveTimeMs) {
        const s = buffer[0].state;
        result.push({
          entityId,
          callsign,
          position: { ...s.position },
          rotation: { ...s.rotation },
          velocity: { ...s.velocity },
          animState: s.animState,
          mantleProgress: s.mantleProgress,
          agilityLevel: s.agilityLevel,
        });
        continue;
      }

      const last = buffer[buffer.length - 1];
      if (renderTimestamp >= last.receiveTimeMs) {
        const s = last.state;
        result.push({
          entityId,
          callsign,
          position: { ...s.position },
          rotation: { ...s.rotation },
          velocity: { ...s.velocity },
          animState: s.animState,
          mantleProgress: s.mantleProgress,
          agilityLevel: s.agilityLevel,
        });
        continue;
      }

      // Find surrounding snapshots [snapA, snapB] for renderTimestamp
      let snapA = buffer[0];
      let snapB = buffer[1];
      for (let i = 0; i < buffer.length - 1; i++) {
        if (
          buffer[i].receiveTimeMs <= renderTimestamp &&
          buffer[i + 1].receiveTimeMs >= renderTimestamp
        ) {
          snapA = buffer[i];
          snapB = buffer[i + 1];
          break;
        }
      }

      const span = Math.max(1, snapB.receiveTimeMs - snapA.receiveTimeMs);
      const alpha = Math.max(0, Math.min(1, (renderTimestamp - snapA.receiveTimeMs) / span));

      const pos: Vec3 = {
        x: snapA.state.position.x + (snapB.state.position.x - snapA.state.position.x) * alpha,
        y: snapA.state.position.y + (snapB.state.position.y - snapA.state.position.y) * alpha,
        z: snapA.state.position.z + (snapB.state.position.z - snapA.state.position.z) * alpha,
      };
      const vel: Vec3 = {
        x: snapA.state.velocity.x + (snapB.state.velocity.x - snapA.state.velocity.x) * alpha,
        y: snapA.state.velocity.y + (snapB.state.velocity.y - snapA.state.velocity.y) * alpha,
        z: snapA.state.velocity.z + (snapB.state.velocity.z - snapA.state.velocity.z) * alpha,
      };
      const rot = slerpQuat(snapA.state.rotation, snapB.state.rotation, alpha);

      result.push({
        entityId,
        callsign,
        position: pos,
        rotation: rot,
        velocity: vel,
        animState: alpha < 0.5 ? snapA.state.animState : snapB.state.animState,
        mantleProgress:
          snapA.state.mantleProgress +
          (snapB.state.mantleProgress - snapA.state.mantleProgress) * alpha,
        agilityLevel: snapB.state.agilityLevel,
      });
    }

    return result;
  }
}

