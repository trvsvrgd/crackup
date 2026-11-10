/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Browser 3D Client Entrypoint — Three.js + Rapier3D + V.A.T.S. 6-Limb Targeting + Motion-Warped Melee
 */

import * as THREE from 'three';
import {
  AgentAnimState,
  AgentAttributes,
  AugmentChassisId,
  EnemyCombatState,
  EnemyLimbId,
  FIXED_TIMESTEP,
  getDistrictForPosition,
  INPUT_FLAG_AIM,
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
  LIMB_COLLIDER_SPECS,
  MANTLE_DURATION_SEC,
  packTargetLimbIntoButtons,
  TOTAL_ORBS,
  getVigilanteParams,
} from '../shared/constants.js';
import { initRapierPhysics, SharedPhysicsWorld } from '../shared/physics/characterController.js';
import {
  AUGMENT_CHASSIS_CATALOG,
  computeNearestRelicRadarPing,
  SKILL_TREE_NODES,
} from '../shared/progression/skillTreeSystem.js';
import { computeNeuralDriftRatios, DISTRICT_LOOP_SPECS } from '../shared/world/phase5Systems.js';
import { SpatialOrbAudioEngine } from './audio/spatialOrbAudio.js';
import { SpringArmCameraController } from './camera/springArmCamera.js';
import { ArticulatedAgentRig } from './entities/agentMesh.js';
import {
  ArticulatedEnemyRigMesh,
  KineticShockwaveEffect,
} from './entities/enemyRigMesh.js';
import { ClientPhase5WorldRenderer } from './entities/phase5WorldMesh.js';
import { ClientVehiclePropRenderer } from './entities/vehicleAndPropMesh.js';
import { PredictionAndInterpolationManager } from './net/netcodeClient.js';
import { NeoVeridiaSceneEnvironment } from './world/cityBuilder.js';

class Crackup3DClientApp {
  private renderer!: THREE.WebGLRenderer;
  private environment!: NeoVeridiaSceneEnvironment;
  private cameraController!: SpringArmCameraController;
  private physicsWorld!: SharedPhysicsWorld;
  private netcode!: PredictionAndInterpolationManager;
  private spatialAudio!: SpatialOrbAudioEngine;
  private shockwaveEffect!: KineticShockwaveEffect;
  private vehiclePropRenderer!: ClientVehiclePropRenderer;
  private phase5Renderer!: ClientPhase5WorldRenderer;

  private localRig: ArticulatedAgentRig | null = null;
  private readonly remoteRigs: Map<number, ArticulatedAgentRig> = new Map();
  private readonly enemyRigs: Map<number, ArticulatedEnemyRigMesh> = new Map();

  private readonly keysDown: Set<string> = new Set();
  private mouseButtons = 0;
  private selectedVatsLimb: EnemyLimbId = EnemyLimbId.HEAD;
  private lastCombatLog = 'READY // HOLD [RMB] FOR V.A.T.S. 6-LIMB TARGETING';
  private physicsAccumulator = 0;
  private lastFrameTimeMs = performance.now();

  public async bootstrap(): Promise<void> {
    await initRapierPhysics();
    this.physicsWorld = new SharedPhysicsWorld();
    this.netcode = new PredictionAndInterpolationManager(this.physicsWorld);
    this.spatialAudio = new SpatialOrbAudioEngine();

    this.netcode.onOrbCollectedCallback = (_orbId, orbType) => {
      this.spatialAudio.playOrbCollectedChime(orbType);
    };

    this.netcode.onCombatEventCallback = (ev) => {
      if (ev.type === 'PARRY_TAKEDOWN') {
        this.lastCombatLog = `Q COUNTER-PARRY TAKEDOWN! (${ev.damageDealt.toFixed(0)} DMG${ev.shockwaveTriggered ? ` + 6.0m SHOCKWAVE [${ev.shockwaveHits} HIT]` : ''})`;
        if (ev.shockwaveTriggered) {
          this.shockwaveEffect.trigger(ev.impactPoint);
        }
      } else if (ev.type === 'COUNTER_BOUNCE_THROW') {
        this.lastCombatLog = `STRIKE BOUNCED OFF ELITE CRIMSON COUNTER-SHIELD!`;
      } else if (ev.type === 'MELEE_HIT') {
        this.lastCombatLog = `MOTION-WARP MELEE STRIKE CONNECTED (${ev.damageDealt.toFixed(0)} DMG)`;
      } else if (ev.type === 'WEAPON_HIT') {
        const limbName = ev.limbId !== undefined ? LIMB_COLLIDER_SPECS[ev.limbId].name : 'TORSO';
        this.lastCombatLog = `V.A.T.S. [${limbName}] HIT: ${ev.damageDealt.toFixed(0)} DMG${ev.isCrit ? ' [2.2x CRIT STAGGER]' : ''}${ev.limbCrippled ? ' [LIMB CRIPPLED!]' : ''}`;
      }
    };

    this.netcode.onRelicCollectedCallback = (relicId, name) => {
      this.lastCombatLog = `PROTOTYPE RELIC ACQUIRED: ${name} [${relicId}]!`;
      this.spatialAudio.playOrbCollectedChime(1);
    };

    this.netcode.onPhase5EventCallback = (note) => {
      this.lastCombatLog = note.message;
      this.spatialAudio.playOrbCollectedChime(2);
    };

    const container = document.getElementById('viewport-3d') || document.body;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    container.appendChild(this.renderer.domElement);

    this.cameraController = new SpringArmCameraController(
      window.innerWidth / Math.max(1, window.innerHeight)
    );
    this.environment = new NeoVeridiaSceneEnvironment(
      this.renderer,
      this.cameraController.camera,
      this.netcode.orbs
    );
    this.shockwaveEffect = new KineticShockwaveEffect(this.environment.scene);
    this.vehiclePropRenderer = new ClientVehiclePropRenderer();
    this.environment.scene.add(this.vehiclePropRenderer.rootGroup);
    this.phase5Renderer = new ClientPhase5WorldRenderer(this.environment.scene);

    this.bindControls();
    this.bindAuthUI();

    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.renderer.setSize(w, h);
      this.cameraController.resize(w, h);
      this.environment.resize(w, h);
    });

    requestAnimationFrame((t) => this.renderLoop(t));
  }

  private bindControls(): void {
    window.addEventListener('keydown', (e) => {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') {
        return;
      }
      this.keysDown.add(e.code);

      if (e.code === 'Tab') {
        e.preventDefault();
        this.selectedVatsLimb = ((this.selectedVatsLimb + 1) % 6) as EnemyLimbId;
      }

      // Hotkeys 1..5 to test Attribute Level 1..5 physics/combat/vehicle/prop curves in real time
      if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(e.code)) {
        const lv = Number(e.code.replace('Digit', ''));
        const localAgent = this.netcode.getLocalAgent();
        if (localAgent) {
          localAgent.attributes.agility = lv;
          localAgent.attributes.strength = lv;
          localAgent.attributes.driving = lv;
          localAgent.attributes.shooting = lv;
          localAgent.attributes.explosives = lv;
          localAgent.attributes.flying = lv;
          localAgent.attributes.vigilante = lv;
          this.netcode.sendAttributeUpdate({
            agility: lv,
            strength: lv,
            driving: lv,
            shooting: lv,
            explosives: lv,
            flying: lv,
            vigilante: lv,
          });
        }
      }

      // Hotkey [B] cycles through the 5 Augment Chassis classes & unlocks their Skill Tree nodes
      if (e.code === 'KeyB') {
        const localAgent = this.netcode.getLocalAgent();
        if (localAgent) {
          const chassisIds = Object.keys(AUGMENT_CHASSIS_CATALOG) as AugmentChassisId[];
          const curIdx = chassisIds.indexOf(localAgent.augmentChassis);
          const nextChassis = chassisIds[(curIdx + 1) % chassisIds.length]!;
          const branchNodes = SKILL_TREE_NODES.filter((n) => n.branch === nextChassis).map(
            (n) => n.id
          );
          const mergedSkills = new Set<string>([...localAgent.unlockedSkills, ...branchNodes]);
          this.netcode.sendBuildUpdate(nextChassis, Array.from(mergedSkills));
          this.lastCombatLog = `AUGMENT CHASSIS -> ${AUGMENT_CHASSIS_CATALOG[nextChassis].name} (${mergedSkills.size}/20 SKILLS ACTIVE)`;
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });

    window.addEventListener('wheel', (e) => {
      if (this.cameraController.isAiming) {
        const delta = e.deltaY > 0 ? 1 : 5;
        this.selectedVatsLimb = ((this.selectedVatsLimb + delta) % 6) as EnemyLimbId;
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') {
        return;
      }
      const authOverlay = document.getElementById('auth-overlay');
      if (authOverlay && !authOverlay.classList.contains('hidden')) {
        return;
      }
      this.spatialAudio.unlockAndInit();
      if (document.pointerLockElement !== this.renderer.domElement) {
        this.renderer.domElement.requestPointerLock?.();
      }
      this.mouseButtons |= 1 << e.button;
      if (e.button === 2) {
        this.cameraController.isAiming = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      this.mouseButtons &= ~(1 << e.button);
      if (e.button === 2) {
        this.cameraController.isAiming = false;
      }
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.renderer.domElement) {
        this.cameraController.onMouseMove(e.movementX, e.movementY);
      }
    });
  }

  private bindAuthUI(): void {
    const form = document.getElementById('auth-form') as HTMLFormElement | null;
    const callsignInput = document.getElementById('callsign-input') as HTMLInputElement | null;
    const pinInput = document.getElementById('pin-input') as HTMLInputElement | null;
    const errorEl = document.getElementById('auth-error');
    const overlay = document.getElementById('auth-overlay');

    if (!form || !callsignInput || !pinInput) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.spatialAudio.unlockAndInit();
      const callsign = callsignInput.value.trim().toUpperCase();
      const pin = pinInput.value.trim();
      if (errorEl) errorEl.textContent = 'Connecting to Authoritative 3D Rapier Server...';

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws`;

      this.netcode.connect(
        wsUrl,
        callsign,
        pin,
        (_entityId, authedCallsign, attributes) => {
          if (overlay) overlay.classList.add('hidden');
          this.spawnOrUpdateLocalRig(authedCallsign, attributes);
          this.renderer.domElement.requestPointerLock?.();
        },
        (errMsg) => {
          if (errorEl) errorEl.textContent = errMsg;
        }
      );
    });
  }

  private spawnOrUpdateLocalRig(callsign: string, _attributes: AgentAttributes): void {
    if (this.localRig) {
      this.environment.scene.remove(this.localRig.root);
      this.localRig.dispose();
    }
    this.localRig = new ArticulatedAgentRig(callsign, true);
    this.environment.scene.add(this.localRig.root);
  }

  private sampleMovementAxesAndButtons(): { moveX: number; moveZ: number; buttons: number } {
    let moveX = 0;
    let moveZ = 0;
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) moveX += 1;
    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) moveX -= 1;
    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) moveZ += 1;
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) moveZ -= 1;

    let buttons = 0;
    if (this.keysDown.has('Space')) buttons |= INPUT_FLAG_JUMP;
    if (this.keysDown.has('ControlLeft') || this.keysDown.has('KeyX')) buttons |= INPUT_FLAG_DASH;
    if (this.keysDown.has('KeyM')) buttons |= INPUT_FLAG_MANTLE;
    if (this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight'))
      buttons |= INPUT_FLAG_SPRINT;
    if ((this.mouseButtons & 4) !== 0) buttons |= INPUT_FLAG_AIM;
    if ((this.mouseButtons & 1) !== 0) buttons |= INPUT_FLAG_FIRE;
    if (this.keysDown.has('KeyV') || this.keysDown.has('KeyC')) buttons |= INPUT_FLAG_MELEE;
    if (this.keysDown.has('KeyQ')) buttons |= INPUT_FLAG_PARRY;
    if (this.keysDown.has('KeyG')) buttons |= INPUT_FLAG_GRAPPLE;
    if (this.keysDown.has('KeyF')) buttons |= INPUT_FLAG_GRAB_THROW;
    if (this.keysDown.has('KeyE')) buttons |= INPUT_FLAG_VEHICLE_INTERACT;
    if (this.keysDown.has('KeyR')) buttons |= INPUT_FLAG_RELIC_REWIND;
    if (this.keysDown.has('KeyH') || this.keysDown.has('KeyJ'))
      buttons |= INPUT_FLAG_OBJECTIVE_JETPACK;

    buttons = packTargetLimbIntoButtons(buttons, this.selectedVatsLimb);
    return { moveX, moveZ, buttons };
  }

  private renderLoop(nowMs: number): void {
    requestAnimationFrame((t) => this.renderLoop(t));

    const dt = Math.min(0.1, Math.max(0.001, (nowMs - this.lastFrameTimeMs) / 1000));
    this.lastFrameTimeMs = nowMs;

    this.environment.updateOrbsAndUpdrafts(
      this.netcode.orbs,
      this.netcode.collectedOrbIds,
      dt
    );
    this.shockwaveEffect.update(dt);

    const localAgent = this.netcode.getLocalAgent();
    this.vehiclePropRenderer.updateFromSnapshots(
      Array.from(this.netcode.vehicleSnapshots.values()),
      Array.from(this.netcode.propSnapshots.values()),
      localAgent ? localAgent.unlockedRelics : new Set(),
      Boolean(localAgent?.grappleActive),
      localAgent ? localAgent.position : { x: 0, y: 0, z: 0 },
      localAgent ? localAgent.grappleAnchor : { x: 0, y: 0, z: 0 },
      nowMs / 1000
    );

    const vigParams = getVigilanteParams(localAgent ? localAgent.attributes.vigilante : 1);
    const vigAuraRadius =
      vigParams.auraRadiusMeters +
      (localAgent ? localAgent.buildModifiers.vigilanteAuraRadiusBonusM : 0);
    this.phase5Renderer.updateFromSnapshot(
      this.netcode.omegaBountySnapshot,
      this.netcode.districtLoopSnapshots,
      this.netcode.auditorAirshipSnapshots,
      localAgent ? localAgent.position : { x: 0, y: 0, z: 0 },
      vigAuraRadius,
      nowMs / 1000
    );

    if (this.netcode.connected && localAgent) {
      this.physicsAccumulator += dt;
      while (this.physicsAccumulator >= FIXED_TIMESTEP) {
        this.physicsAccumulator -= FIXED_TIMESTEP;
        const { moveX, moveZ, buttons } = this.sampleMovementAxesAndButtons();
        this.netcode.recordAndSendInput(
          moveX,
          moveZ,
          this.cameraController.yaw,
          this.cameraController.pitch,
          buttons
        );
      }

      const mantleProgress = localAgent.mantling
        ? Math.min(1.0, localAgent.mantleTimer / MANTLE_DURATION_SEC)
        : 0;

      this.localRig?.update(
        localAgent.position,
        localAgent.rotation,
        localAgent.velocity,
        localAgent.animState,
        mantleProgress,
        dt,
        localAgent.attributes.agility
      );

      this.cameraController.update(
        localAgent.position,
        localAgent.velocity,
        this.physicsWorld,
        localAgent,
        dt
      );

      this.spatialAudio.update(
        this.cameraController.camera,
        localAgent.position,
        this.netcode.orbs,
        this.netcode.collectedOrbIds
      );

      this.updateEnemiesAndVats(localAgent, dt);
      this.updateHUD(localAgent);
    } else {
      const orbitAngle = nowMs * 0.00022;
      this.cameraController.camera.position.set(
        Math.sin(orbitAngle) * 52,
        24 + Math.sin(orbitAngle * 2) * 5,
        Math.cos(orbitAngle) * 52
      );
      this.cameraController.camera.lookAt(0, 12, -24);
    }

    // Update Remote Entities via 100ms Buffered Quaternion SLERP & Position LERP
    const remotes = this.netcode.getInterpolatedRemoteEntities(nowMs);
    const activeRemoteIds = new Set<number>();

    for (const rem of remotes) {
      activeRemoteIds.add(rem.entityId);
      let rig = this.remoteRigs.get(rem.entityId);
      if (!rig) {
        rig = new ArticulatedAgentRig(rem.callsign, false);
        this.remoteRigs.set(rem.entityId, rig);
        this.environment.scene.add(rig.root);
      } else {
        rig.setCallsign(rem.callsign, false);
      }

      rig.update(
        rem.position,
        rem.rotation,
        rem.velocity,
        rem.animState,
        rem.mantleProgress,
        dt,
        rem.agilityLevel
      );
    }

    for (const [id, rig] of this.remoteRigs.entries()) {
      if (!activeRemoteIds.has(id)) {
        this.environment.scene.remove(rig.root);
        rig.dispose();
        this.remoteRigs.delete(id);
      }
    }

    this.environment.render();
  }

  private updateEnemiesAndVats(
    localAgent: NonNullable<ReturnType<PredictionAndInterpolationManager['getLocalAgent']>>,
    dt: number
  ): void {
    const vatsEl = document.getElementById('hud-vats');
    const shooterEye = {
      x: localAgent.position.x,
      y: localAgent.position.y + 1.55,
      z: localAgent.position.z,
    };

    let closestEnemyId = 0;
    let closestDist = Infinity;

    for (const [enemyId, state] of this.netcode.enemySnapshots.entries()) {
      let rig = this.enemyRigs.get(enemyId);
      if (!rig) {
        rig = new ArticulatedEnemyRigMesh(enemyId, state.isElite);
        this.enemyRigs.set(enemyId, rig);
        this.environment.scene.add(rig.root);
      }

      const d = Math.hypot(
        state.position.x - localAgent.position.x,
        state.position.y - localAgent.position.y,
        state.position.z - localAgent.position.z
      );
      if (state.combatState !== EnemyCombatState.DEAD && d < closestDist) {
        closestDist = d;
        closestEnemyId = enemyId;
      }

      const localEnemyEntity = this.physicsWorld.combatManager.enemies.get(enemyId);
      const evals =
        this.cameraController.isAiming && localEnemyEntity
          ? this.physicsWorld.combatManager.evaluateVatsTargetLimbs(
              shooterEye,
              localAgent.attributes.shooting,
              localEnemyEntity,
              localAgent.collider
            )
          : null;

      rig.update(
        state,
        this.cameraController.isAiming,
        this.selectedVatsLimb,
        evals,
        dt
      );

      if (enemyId === closestEnemyId && vatsEl) {
        if (this.cameraController.isAiming && evals) {
          const sel = evals.find((e) => e.limbId === this.selectedVatsLimb) || evals[0];
          const statusStr = sel.occluded
            ? '0% [COVER OCCLUDED]'
            : `${sel.hitProbabilityPct}% HIT (${sel.damageMultiplier}x DMG)`;
          vatsEl.textContent = `LOCKED ENEMY #${enemyId} [${sel.name}] -> ${statusStr} | [TAB/WHEEL] Cycle Limb`;
        } else {
          const stateLabel = EnemyCombatState[state.combatState] || 'IDLE';
          vatsEl.textContent = `Nearest Enemy #${enemyId} (${closestDist.toFixed(1)}m, ${stateLabel}) | Target Limb: ${LIMB_COLLIDER_SPECS[this.selectedVatsLimb].name}`;
        }
      }
    }
  }

  private updateHUD(
    agent: NonNullable<ReturnType<PredictionAndInterpolationManager['getLocalAgent']>>
  ): void {
    const posEl = document.getElementById('hud-pos');
    const velEl = document.getElementById('hud-vel');
    const stateEl = document.getElementById('hud-state');
    const netEl = document.getElementById('hud-net');
    const agiEl = document.getElementById('hud-agility');
    const camEl = document.getElementById('hud-camera');
    const districtEl = document.getElementById('hud-district');
    const orbsEl = document.getElementById('hud-orbs');
    const combatEl = document.getElementById('hud-combat');
    const buildEl = document.getElementById('hud-build');
    const relicRadarEl = document.getElementById('hud-relic-radar');
    const districtLoopEl = document.getElementById('hud-district-loop');
    const omegaBountyEl = document.getElementById('hud-omega-bounty');
    const neuralDriftEl = document.getElementById('hud-neural-drift');

    const curDistrict = getDistrictForPosition(agent.position.x, agent.position.z);
    if (posEl) {
      posEl.textContent = `X: ${agent.position.x.toFixed(1)}m | Y: ${agent.position.y.toFixed(1)}m | Z: ${agent.position.z.toFixed(1)}m`;
    }
    if (districtEl) {
      districtEl.textContent = curDistrict;
    }
    if (velEl) {
      const hSpeed = Math.hypot(agent.velocity.x, agent.velocity.z);
      velEl.textContent = `H: ${hSpeed.toFixed(1)} m/s | V: ${agent.velocity.y.toFixed(1)} m/s | Fuel: ${agent.jetpackFuelSec.toFixed(1)}s | Dashes: ${agent.airDashesRemaining}`;
    }
    if (stateEl) {
      const stateName = AgentAnimState[agent.animState] || 'IDLE';
      stateEl.textContent = `${stateName} (${agent.grounded ? 'GROUNDED' : 'AIRBORNE'}${agent.mantling ? ' / MANTLING' : ''})`;
    }
    if (orbsEl) {
      let nearestDist = Infinity;
      for (const o of this.netcode.orbs) {
        if (this.netcode.collectedOrbIds.has(o.orbId)) continue;
        const d = Math.hypot(
          o.position.x - agent.position.x,
          o.position.y - agent.position.y,
          o.position.z - agent.position.z
        );
        if (d < nearestDist) nearestDist = d;
      }
      const distStr = Number.isFinite(nearestDist) ? `${nearestDist.toFixed(1)}m` : 'ALL CLEAR';
      orbsEl.textContent = `${this.netcode.collectedOrbIds.size}/${TOTAL_ORBS} Collected | Nearest HRTF Ping: ${distStr}`;
    }
    if (combatEl) {
      combatEl.textContent = this.lastCombatLog;
    }
    if (buildEl) {
      const chassisInfo = AUGMENT_CHASSIS_CATALOG[agent.augmentChassis];
      const interactStr = agent.mountedVehicleId
        ? `DRIVING VEHICLE #${agent.mountedVehicleId}`
        : agent.heldPropId
          ? `CARRYING PROP #${agent.heldPropId}`
          : agent.grappleActive
            ? `GRAPPLE TETHER (${agent.grappleLength.toFixed(1)}m)`
            : 'ON FOOT';
      buildEl.textContent = `${chassisInfo.name} (${agent.unlockedSkills.size}/20 Skills) | ${interactStr}`;
    }
    if (relicRadarEl) {
      const ping = computeNearestRelicRadarPing(agent.position, agent.unlockedRelics);
      const rewindReady = '[R] 3.0s REWIND READY';
      if (ping) {
        const bearingDeg = (ping.bearingYawRad * 180) / Math.PI;
        const vSign = ping.elevationDeltaMeters >= 0 ? '+' : '';
        relicRadarEl.textContent = `${ping.name}: ${ping.distanceMeters.toFixed(1)}m (${bearingDeg.toFixed(0)}° / ${vSign}${ping.elevationDeltaMeters.toFixed(0)}m Y) | ${rewindReady}`;
      } else {
        relicRadarEl.textContent = `ALL 4 RELICS ACQUIRED | ${rewindReady}`;
      }
    }
    if (districtLoopEl) {
      const spec = DISTRICT_LOOP_SPECS.find((s) => s.district === curDistrict);
      const loopSnap = spec
        ? this.netcode.districtLoopSnapshots.find((l) => l.districtIndex === spec.districtIndex)
        : undefined;
      if (loopSnap && spec) {
        if (loopSnap.currentStage >= 4) {
          districtLoopEl.textContent = `${spec.name}: LIBERATED [${spec.rewardName} UNLOCKED]`;
        } else if (loopSnap.currentStage === 1) {
          districtLoopEl.textContent = `STAGE 1/3: Sabotage 3D Terminals (${loopSnap.terminalsHacked}/${loopSnap.totalTerminals}) — Press [H] near Terminal`;
        } else if (loopSnap.currentStage === 2) {
          districtLoopEl.textContent = `STAGE 2/3: Eliminate ${spec.lieutenantCallsign} (Enemy #${spec.lieutenantEnemyId})`;
        } else {
          districtLoopEl.textContent = `STAGE 3/3: Eliminate ${spec.kingpinCallsign} & [H] Core Override -> ${spec.rewardName}`;
        }
      }
    }
    if (omegaBountyEl) {
      const bounty = this.netcode.omegaBountySnapshot;
      if (bounty && bounty.active) {
        const d = Math.hypot(
          bounty.position.x - agent.position.x,
          bounty.position.y - agent.position.y,
          bounty.position.z - agent.position.z
        );
        omegaBountyEl.textContent = `ACTIVE HVT #${bounty.enemyId} | ${bounty.timeRemainingSec.toFixed(1)}s LEFT | WP ${bounty.waypointIndex + 1}/${bounty.totalWaypoints} (${d.toFixed(0)}m away • HP ${bounty.hp}/${bounty.maxHp})`;
      } else {
        omegaBountyEl.textContent = `OMEGA CONVOY INTERCEPTED // NEXT HVT DEPLOYING SOON`;
      }
    }
    if (neuralDriftEl) {
      const drifts = Array.from(agent.activeNeuralDrifts);
      const airships = this.netcode.auditorAirshipSnapshots.length;
      const ratios = computeNeuralDriftRatios(agent.telemetry);
      const driftStr = drifts.length > 0 ? drifts.join(', ') : 'NOMINAL (0 MUTATIONS)';
      neuralDriftEl.textContent = `${driftStr} | Airships: ${airships} | Blast:${(ratios.collateral_blast_damage_ratio * 100).toFixed(0)}% Limb:${(ratios.limb_cripple_to_kill_ratio * 100).toFixed(0)}% Air:${(ratios.airborne_time_ratio * 100).toFixed(0)}%`;
    }
    if (netEl) {
      netEl.textContent = `Seq: ${this.netcode.currentSeq} | Ack: ${this.netcode.lastReconciledSeq} | Err: ${(this.netcode.lastPositionErrorMeters * 100).toFixed(1)}cm | Agents: ${this.remoteRigs.size + 1}/8`;
    }
    if (agiEl) {
      const a = agent.attributes;
      agiEl.textContent = `AGI:${a.agility} STR:${a.strength} DRV:${a.driving} SHT:${a.shooting} EXP:${a.explosives} FLY:${a.flying} VIG:${a.vigilante} (Keys 1-5 Lv)`;
    }
    if (camEl) {
      camEl.textContent = `Arm: ${this.cameraController.currentArmLength.toFixed(2)}m | FOV: ${this.cameraController.currentFov.toFixed(0)}°`;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new Crackup3DClientApp();
  app.bootstrap().catch((err) => console.error('[CRACKUP 3D CLIENT] Bootstrap error:', err));
});
