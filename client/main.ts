/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Browser 3D Client Entrypoint — Three.js + Rapier3D + V.A.T.S. 6-Limb Targeting + Motion-Warped Melee
 */

import * as THREE from 'three';
import {
  AgentAnimState,
  AgentAttributes,
  EnemyCombatState,
  DreadnoughtPhase,
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
import { PlayerHUD } from './playerHUD.js';
import { Phase6WorldRenderer } from './entities/phase6WorldMesh.js';
import { productionAssets } from './assets/productionAssets.js';
import { TacticalCommsOverlay } from './narrative/tacticalComms.js';
import { CombatDebrisRenderer } from './animation/combatDebris.js';
import type { CombatPresentation } from '../shared/combat/combatPresentation.js';

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
  private phase6Renderer!: Phase6WorldRenderer;
  private playerHUD!: PlayerHUD;
  private comms!: TacticalCommsOverlay;
  private readonly combatDebris = new CombatDebrisRenderer();

  private localRig: ArticulatedAgentRig | null = null;
  private readonly remoteRigs: Map<number, ArticulatedAgentRig> = new Map();
  private readonly enemyRigs: Map<number, ArticulatedEnemyRigMesh> = new Map();

  private readonly keysDown: Set<string> = new Set();
  private readonly pendingActions: Set<string> = new Set();
  private mouseButtons = 0;
  private pendingMouseButtons = 0;
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
      if (orbType === 2) this.comms.whisper(Math.max(0, this.netcode.orbs.filter(o => o.type === 2).findIndex(o => o.orbId === _orbId)));
      this.playerHUD.notice(orbType === 0 ? 'AGILITY ORB — +50 agility XP' : orbType === 1 ? 'RENEGADE ORB — Attribute XP earned' : 'WHISPER ORB — A memory recovered');
    };

    this.netcode.onCombatEventCallback = (ev) => {
      (ev.attackerEntityId === this.netcode.localEntityId ? this.localRig : this.remoteRigs.get(ev.attackerEntityId))?.combat(ev);
      this.playerHUD.combat(ev);
      if (ev.attackerEntityId === this.netcode.localEntityId && ['WEAPON_HIT', 'VEHICLE_HIT', 'RELAY_VENT_HIT', 'MELEE_HIT', 'PARRY_TAKEDOWN'].includes(ev.type)) {
        this.spatialAudio.playCombatCue(ev.isCrit ? 'critical' : 'hit');
      }
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
      this.playerHUD.notice(`RELIC ACQUIRED — ${name}`);
      this.lastCombatLog = `PROTOTYPE RELIC ACQUIRED: ${name} [${relicId}]!`;
      this.spatialAudio.playOrbCollectedChime(1);
    };

    this.netcode.onPhase5EventCallback = (note) => {
      this.playerHUD.notice(note.message);
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
    this.renderer.toneMappingExposure = 1.0;
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
    this.environment.scene.add(this.combatDebris.root);
    this.vehiclePropRenderer = new ClientVehiclePropRenderer();
    this.environment.scene.add(this.vehiclePropRenderer.rootGroup);
    this.phase5Renderer = new ClientPhase5WorldRenderer(this.environment.scene, material => this.environment.prepareArtMaterial(material));
    this.phase6Renderer = new Phase6WorldRenderer(this.environment.scene);
    this.playerHUD = new PlayerHUD(this.netcode, this.cameraController, this.environment, this.renderer);
    this.comms = new TacticalCommsOverlay();
    this.playerHUD.onMenuChanged = () => this.clearInput();
    this.playerHUD.onDamage = () => this.spatialAudio.playCombatCue('hurt');
    this.playerHUD.onDefeat = () => this.spatialAudio.playCombatCue('defeat');

    try {
      await productionAssets.load(this.renderer);
      productionAssets.applyEnvironment(this.renderer, this.environment.scene);
      this.environment.applyProductionMaterials();
    } catch (error) {
      console.error('[Production assets] Keeping procedural builders available:', error);
    }

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
      if (!elIsAuthVisible() && !e.repeat && this.playerHUD.handleKey(e.code)) {
        e.preventDefault();
        return;
      }
      if (document.activeElement && document.activeElement.tagName === 'INPUT') {
        return;
      }
      if (this.playerHUD.blocksInput) return;
      this.keysDown.add(e.code);
      if (!e.repeat) this.pendingActions.add(e.code);

      if (e.code === 'Tab') {
        e.preventDefault();
        this.selectedVatsLimb = ((this.selectedVatsLimb + 1) % 6) as EnemyLimbId;
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
      if (e.target !== this.renderer.domElement || this.playerHUD.blocksInput) return;
      this.spatialAudio.unlockAndInit();
      if (document.pointerLockElement !== this.renderer.domElement) {
        Promise.resolve(this.renderer.domElement.requestPointerLock?.()).catch(() => {});
        return;
      }
      this.mouseButtons |= 1 << e.button;
      this.pendingMouseButtons |= 1 << e.button;
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
    window.addEventListener('blur', () => this.clearInput());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clearInput(); });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement) {
        this.clearInput();
        if (!this.playerHUD.menuOpen && !this.playerHUD.downed && document.hasFocus() && !document.hidden) this.playerHUD.setMenu(true);
      }
    });
  }

  private clearInput(): void {
    this.keysDown.clear();
    this.pendingActions.clear();
    this.mouseButtons = 0;
    this.pendingMouseButtons = 0;
    this.cameraController.isAiming = false;
    this.physicsAccumulator = 0;
  }

  private bindAuthUI(): void {
    const form = document.getElementById('auth-form') as HTMLFormElement | null;
    const callsignInput = document.getElementById('callsign-input') as HTMLInputElement | null;
    const pinInput = document.getElementById('pin-input') as HTMLInputElement | null;
    const errorEl = document.getElementById('auth-error');

    if (!form || !callsignInput || !pinInput) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      (document.getElementById('deploy-button') as HTMLButtonElement).disabled = true;
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
          this.playerHUD.deploy(authedCallsign);
          this.spawnOrUpdateLocalRig(authedCallsign, attributes);
          const position = this.netcode.getLocalAgent()?.position;
          if (position) {
            const target = DISTRICT_LOOP_SPECS[0].stage1Terminals[0];
            this.cameraController.yaw = Math.atan2(-(target.x - position.x), -(target.z - position.z));
          }
        },
        (errMsg) => {
          if (errorEl) errorEl.textContent = errMsg;
          (document.getElementById('deploy-button') as HTMLButtonElement).disabled = false;
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
    this.comms.useProfile(callsign);
    this.environment.scene.add(this.localRig.root);
  }

  private sampleMovementAxesAndButtons(): { moveX: number; moveZ: number; buttons: number } {
    if (this.playerHUD.blocksInput) return { moveX: 0, moveZ: 0, buttons: 0 };
    let moveX = 0;
    let moveZ = 0;
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) moveX += 1;
    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) moveX -= 1;
    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) moveZ += 1;
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) moveZ -= 1;

    const pressed = (code: string) => this.keysDown.has(code) || this.pendingActions.has(code);
    let buttons = 0;
    if (pressed('Space')) buttons |= INPUT_FLAG_JUMP;
    if (pressed('ControlLeft') || pressed('KeyX')) buttons |= INPUT_FLAG_DASH;
    if (pressed('KeyM')) buttons |= INPUT_FLAG_MANTLE;
    if (this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight'))
      buttons |= INPUT_FLAG_SPRINT;
    if ((this.mouseButtons & 4) !== 0) buttons |= INPUT_FLAG_AIM;
    if (((this.mouseButtons | this.pendingMouseButtons) & 1) !== 0) buttons |= INPUT_FLAG_FIRE;
    if (pressed('KeyV') || pressed('KeyC')) buttons |= INPUT_FLAG_MELEE;
    if (pressed('KeyQ')) buttons |= INPUT_FLAG_PARRY;
    if (this.keysDown.has('KeyG')) buttons |= INPUT_FLAG_GRAPPLE;
    if (pressed('KeyF')) buttons |= INPUT_FLAG_GRAB_THROW;
    if (pressed('KeyE')) buttons |= INPUT_FLAG_VEHICLE_INTERACT;
    if (pressed('KeyR')) buttons |= INPUT_FLAG_RELIC_REWIND;
    if (pressed('KeyH') || this.keysDown.has('KeyJ'))
      buttons |= INPUT_FLAG_OBJECTIVE_JETPACK;
    this.pendingActions.clear();
    this.pendingMouseButtons = 0;

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
    this.phase6Renderer.update(this.netcode.phase6Snapshot, dt);

    const localAgent = this.netcode.getLocalAgent();
    this.vehiclePropRenderer.updateFromSnapshots(
      Array.from(this.netcode.vehicleSnapshots.values()),
      Array.from(this.netcode.propSnapshots.values()),
      localAgent ? localAgent.unlockedRelics : new Set(),
      Boolean(localAgent?.grappleActive),
      localAgent ? localAgent.position : { x: 0, y: 0, z: 0 },
      localAgent ? localAgent.grappleAnchor : { x: 0, y: 0, z: 0 },
      nowMs / 1000,
      this.netcode.vehicleDamageSnapshot
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
      nowMs / 1000,
      this.netcode.relaySnapshot
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

      this.localRig?.setChassis(localAgent.augmentChassis);
      const paired = [...this.netcode.combatPresentations.values()].find(r => r.pairedAgentId === localAgent.entityId);
      this.localRig?.update(
        localAgent.position,
        localAgent.rotation,
        localAgent.velocity,
        localAgent.animState,
        mantleProgress,
        dt,
        localAgent.attributes.agility,
        { aim: this.cameraController.isAiming ? 1 : 0, aimPitch: this.cameraController.pitch,
          ...(paired ? { state: 'PairedCounter' as const, pairedElapsed: paired.pairedElapsed } : {}) }
      );

      if (paired && this.localRig) this.positionPairedRig(this.localRig, paired);
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
      this.playerHUD.update(localAgent);
      this.comms.update({ deployed: true,
        districtIndex: ['NEON_DOCKS', 'FOUNDRY_SLUMS', 'HELIOS_SPIRE', 'AEGIS_CITADEL'].indexOf(getDistrictForPosition(localAgent.position.x, localAgent.position.z)),
        vigilanteLevel: localAgent.attributes.vigilante,
        whisperOrbs: this.netcode.playerStatus?.narrativeProgress?.whisperOrbs ?? localAgent.telemetry.whisperOrbsCollected ?? 0,
        nonLethalBounties: this.netcode.playerStatus?.narrativeProgress?.nonLethalBounties ?? localAgent.telemetry.nonLethalBountiesCompleted ?? 0,
        relaySabotage: this.netcode.districtLoopSnapshots.some(d => d.currentStage >= 3),
        citadelLoopStage: this.netcode.districtLoopSnapshots.find(d => d.districtIndex === 3)?.currentStage ?? 1,
        bossDefeated: this.netcode.phase6Snapshot?.dreadnought.phase === DreadnoughtPhase.DEFEATED,
      }, dt);
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

      const paired = [...this.netcode.combatPresentations.values()].find(r => r.pairedAgentId === rem.entityId);
      if (rem.augmentChassis) rig.setChassis(rem.augmentChassis);
      rig.update(
        rem.position,
        rem.rotation,
        rem.velocity,
        rem.animState,
        rem.mantleProgress,
        dt,
        rem.agilityLevel,
        paired ? { state: 'PairedCounter', pairedElapsed: paired.pairedElapsed } : {}
      );
      if (paired) this.positionPairedRig(rig, paired);
    }

    for (const [id, rig] of this.remoteRigs.entries()) {
      if (!activeRemoteIds.has(id)) {
        this.environment.scene.remove(rig.root);
        rig.dispose();
        this.remoteRigs.delete(id);
      }
    }

    this.combatDebris.update(this.netcode.droppedWeapons);
    this.environment.render();
    this.comms.renderPortrait(this.renderer);
  }

  private positionPairedRig(rig: ArticulatedAgentRig, pair: CombatPresentation): void {
    const enemy = this.netcode.enemySnapshots.get(pair.enemyId);
    if (!enemy) return;
    rig.root.position.x = enemy.position.x - pair.direction.x * 1.15;
    rig.root.position.z = enemy.position.z - pair.direction.z * 1.15;
    rig.root.rotation.y = Math.atan2(-pair.direction.x, -pair.direction.z);
  }

  private updateEnemiesAndVats(
    localAgent: NonNullable<ReturnType<PredictionAndInterpolationManager['getLocalAgent']>>,
    dt: number
  ): void {
    for (const [id, rig] of this.enemyRigs) if (!this.netcode.enemySnapshots.has(id)) {
      rig.root.removeFromParent(); rig.dispose(); this.enemyRigs.delete(id);
    }
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
      const reaction = this.netcode.combatPresentations.get(enemyId);
      if (rig && reaction && rig.humanoid.style !== reaction.archetype) {
        rig.root.removeFromParent(); rig.dispose(); this.enemyRigs.delete(enemyId); rig = undefined;
      }
      if (!rig) {
        rig = new ArticulatedEnemyRigMesh(enemyId, state.isElite, reaction?.archetype);
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
        dt,
        reaction
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
      const rewindReady = agent.buildModifiers.chronoRewindUnlocked ? '[R] REWIND READY' : 'CHRONO RELIC REQUIRED';
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
      agiEl.textContent = `AGI:${a.agility} STR:${a.strength} DRV:${a.driving} SHT:${a.shooting} EXP:${a.explosives} FLY:${a.flying} VIG:${a.vigilante}`;
    }
    if (camEl) {
      camEl.textContent = `Arm: ${this.cameraController.currentArmLength.toFixed(2)}m | FOV: ${this.cameraController.currentFov.toFixed(0)}°`;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new Crackup3DClientApp();
  app.bootstrap().then(() => {
    const status = document.getElementById('auth-error');
    if (status) status.textContent = 'Ready to deploy. Your agent saves automatically.';
  }).catch((err) => {
    console.error('[CRACKUP 3D CLIENT] Bootstrap error:', err);
    const status = document.getElementById('auth-error');
    if (status) status.textContent = 'The 3D engine could not start. Enable hardware acceleration and reload in a desktop browser.';
    const button = document.getElementById('deploy-button') as HTMLButtonElement;
    if (button) button.disabled = true;
  });
});

function elIsAuthVisible(): boolean { return !document.getElementById('auth-overlay')?.hidden; }
