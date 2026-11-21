import { TIER3_SKILL_NODES } from '../shared/content/skillTreeRegistry.js';
import { WEAPON_REGISTRY, VEHICLE_REGISTRY, RELIC_REGISTRY, meetsRequirements } from '../shared/content/arsenalAndVehicleRegistry.js';
import { characterNameForCallsign } from '../shared/content/characterRegistry.js';
import { RESONANCE_MEMORY_FRAGMENTS, RESONANCE_SPIRE_RULES } from '../shared/content/worldLore.js';
import type { PresentationStorage } from './narrative/campaignStorage.js';
import type { TacticalMap } from './map/tacticalMap.js';
import { districtObjective, navigationTo } from './map/mapModel.js';
import * as THREE from "three";
import {
  EnemyCombatState,
  getDistrictForPosition,
  PetArenaState,
  PetMode,
  DreadnoughtPhase,
} from "../shared/constants.js";
import type { AgentPhysicsBody } from "../shared/physics/characterController.js";
import type { Vec3 } from "../shared/protocol/binaryProtocol.js";
import {
  AUGMENT_CHASSIS_CATALOG,
  SKILL_TREE_NODES,
  skillUnlockError,
} from "../shared/progression/skillTreeSystem.js";
import { DISTRICT_LOOP_SPECS } from "../shared/world/phase5Systems.js";
import type { CombatEventResult } from "../shared/combat/enemyRigSystem.js";
import type { PredictionAndInterpolationManager } from "./net/netcodeClient.js";
import type { SpringArmCameraController } from "./camera/springArmCamera.js";
import type { NeoVeridiaSceneEnvironment } from "./world/cityBuilder.js";

const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const text = (id: string, value: string) => {
  const node = el(id);
  if (node.textContent !== value) node.textContent = value;
};
const titleCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (s) => s.toUpperCase());

/** Player presentation stays separate from simulation and never awards progress. */
export class PlayerHUD {
  public controllerActive = false;
  public menuOpen = false;
  public downed = false;
  public onMenuChanged: (() => void) | null = null;
  public onDamage: (() => void) | null = null;
  public onDefeat: (() => void) | null = null;
  public isOverlayBlocking: (() => boolean) | null = null;
  public map: TacticalMap | null = null;
  private noticeUntil = 0;
  private provenanceNode: HTMLDetailsElement | null = null;
  private previousHp: number | null = null;
  private previousPoints = 0;
  private startPos: Vec3 | null = null;
  private moved = false;
  private jumped = false;
  private upgradeSignature = "";
  private selectedPanel = "briefing";
  private readonly projected = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly previousEnemyHealth = new Map<number, number>();

  constructor(
    private readonly net: PredictionAndInterpolationManager,
    private readonly camera: SpringArmCameraController,
    private readonly environment: NeoVeridiaSceneEnvironment,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly storage: PresentationStorage | null = null,
  ) {
    el("resume-button").onclick = () => this.setMenu(false);
    el("respawn-button").onclick = () => this.net.sendControl("RESPAWN");
    el("solo-save").onclick = () => this.net.sendControl(this.net.mode === "campaign" ? "CAMPAIGN_SAVE" : "SOLO_SAVE");
    el("solo-leave").onclick = () => this.net.sendControl(this.net.mode === "campaign" ? "CAMPAIGN_LEAVE" : "SOLO_LEAVE");
    this.net.onSoloState = () => {
      const state = this.net.soloState;
      if (!state) return;
      el("solo-controls").hidden = false;
      text("session-note", state.paused ? "Offline solo is paused. Your campaign belongs to this local profile." : "Offline solo. Progress saves on this computer.");
      text("solo-checkpoint", state.saveError
        ? "Save failed. Play is paused. Free disk space, then select Save checkpoint to retry."
        : `Saved ${new Date(state.savedAt).toLocaleTimeString()} · ${state.checkpoint}`);
      if (this.net.mode === "campaign") {
        text("session-note", state.paused ? "Campaign paused: waiting for the host or save recovery." : "Co-op remains live while this menu is open.");
        el("campaign-party").hidden = false;
        text("campaign-party", `${state.role === 'host' ? 'Hosting your campaign' : `Visiting ${state.owner}'s campaign`} | Party ${state.members?.length ?? 0}/8: ${state.members?.join(', ') ?? ''}${state.inviteCode ? ` | Session code: ${state.inviteCode}` : ''}`);
        text("campaign-policy", "Only the host's world advances. Connected players keep district unlocks once per character; joining after completion grants no past unlocks. Guest dialogue and settings save for this host's campaign; their own world stays unchanged. No automatic catch-up or host migration.");
        el("campaign-policy").hidden = false;
        text("campaign-resume-note", "Rejoin at the agency drop point in the host's latest world checkpoint. An absent host pauses play; unfinished encounters restart after a service restart.");
        el<HTMLButtonElement>("solo-leave").textContent = state.role === 'host' ? 'Save & end party' : 'Save & leave visit';
        if (state.paused && !this.menuOpen) this.setMenu(true);
      }
      text("solo-recap", state.recap);
      if (state.saveError) {
        this.notice("Save failed. Play is paused; retry from the field menu.");
        if (!this.menuOpen) this.setMenu(true);
      }
    };
    document
      .querySelectorAll<HTMLButtonElement>("[data-panel]")
      .forEach((button) => {
        button.onclick = () => this.selectPanel(button.dataset.panel!);
      });
    el("pet-adopt").onclick = () =>
      this.net.sendControl("PET_ADOPT", {
        species: Number(el<HTMLSelectElement>("pet-species").value),
      });
    el("pet-derby").onclick = () => this.net.sendControl("PET_DERBY_JOIN");
    el("pet-clash").onclick = () => this.net.sendControl("PET_CLASH_JOIN");
    el("pet-leave").onclick = () => this.net.sendControl("PET_ARENA_LEAVE");
    this.bindSettings();
    this.net.onNotice = (message) => this.notice(message);
    this.net.onConnectionChanged = (state, message) => {
      const banner = el("connection-banner");
      banner.hidden = state === "connected";
      banner.textContent = message;
      if (state !== "connected") this.onMenuChanged?.();
      if (!el("auth-overlay").hidden) {
        text("auth-error", state === "connected" ? "" : message);
        el<HTMLButtonElement>("deploy-button").disabled =
          state === "connecting" || state === "reconnecting";
      }
    };
    // A local-only heading/progress preference is safe to lose if browser storage is blocked.
    document.addEventListener("keydown", (event) => {
      if (!this.menuOpen || this.isOverlayBlocking?.() || event.key !== "Tab") return;
      const focusable = [
        ...el("field-menu").querySelectorAll<HTMLElement>(
          "button:not(:disabled),select,input",
        ),
      ].filter((node) => node.getClientRects().length > 0);
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    });
  }

  public get blocksInput(): boolean {
    return (
      this.menuOpen || this.downed || !this.net.connected || document.hidden || Boolean(this.net.soloState?.paused) || Boolean(this.isOverlayBlocking?.())
    );
  }

  public deploy(callsign: string): void {
    el("auth-overlay").hidden = true;
    el("player-hud").hidden = false;
    text("player-callsign", callsign);
    el("solo-controls").hidden = this.net.mode === "shared";
    if (this.net.mode === "solo") text("session-note", "Offline solo pauses in this menu. Progress saves on this computer.");
    this.startPos = null;
    this.previousHp = null;
    this.notice(
      "Welcome to Neon Docks. Follow the gold diamond to disrupt the relay network.",
    );
    (document.activeElement as HTMLElement | null)?.blur();
  }

  public setMenu(open: boolean, panel = "briefing"): void {
    if (!this.net.connected || (this.downed && !this.net.soloState?.paused)) return;
    this.menuOpen = open;
    el("field-menu").hidden = !open;
    this.onMenuChanged?.();
    if (open) {
      document.exitPointerLock?.();
      this.selectPanel(panel);
      el("resume-button").focus();
    } else if (!this.controllerActive) {
      this.renderer.domElement.requestPointerLock?.()?.catch(() => {});
    }
  }

  public handleKey(code: string): boolean {
    if (code === 'KeyN') { this.map?.open(); return true; }
    if (code === "Escape") {
      this.setMenu(!this.menuOpen);
      return true;
    }
    if (code === "KeyB") {
      this.setMenu(
        !this.menuOpen || this.selectedPanel !== "upgrades",
        "upgrades",
      );
      return true;
    }
    if (code === "F3") {
      el("telemetry-hud").hidden = !el("telemetry-hud").hidden;
      return true;
    }
    return false;
  }

  private selectPanel(panel: string): void {
    this.selectedPanel = panel;
    for (const name of ["briefing", "upgrades", "companion"])
      el(`panel-${name}`).hidden = name !== panel;
    document
      .querySelectorAll<HTMLButtonElement>("[data-panel]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.panel === panel),
        ),
      );
    this.upgradeSignature = "";
  }

  public notice(message: string): void {
    text("combat-notice", message);
    el("combat-notice").classList.add("visible");
    this.noticeUntil = performance.now() + 4000;
  }

  public combat(event: CombatEventResult): void {
    if (event.attackerEntityId !== this.net.localEntityId) return;
    if (event.type === "WEAPON_MISS") return;
    if (event.type === "COUNTER_BOUNCE_THROW") {
      this.notice(
        "Counter shield active. Wait for the amber attack cue, then press Q.",
      );
      return;
    }
    const marker = el("hit-marker");
    marker.classList.remove("active");
    marker.classList.toggle("critical", Boolean(event.isCrit));
    void marker.offsetWidth;
    marker.classList.add("active");
    if (event.type === "PARRY_TAKEDOWN")
      this.notice("COUNTER — Enemy staggered");
    else if (event.type === 'VEHICLE_HIT' && event.detachedPanelMask) this.notice('PANEL DETACHED');
    else if (event.type === 'RELAY_VENT_HIT' && event.damageDealt > 0 && event.ventHp === 0) this.notice('COOLING VENT DISABLED');
    else if (event.limbCrippled) this.notice("LIMB DISABLED — Enemy weakened");
  }

  public update(agent: AgentPhysicsBody): void {
    const status = this.net.playerStatus;
    if (!status) return;
    const hp = Math.ceil(status.hp),
      maxHp = Math.ceil(status.maxHp);
    text("player-health", `${hp} / ${maxHp}`);
    const meter = el<HTMLProgressElement>("player-hp");
    meter.max = maxHp;
    meter.value = hp;
    meter.classList.toggle("critical", hp < maxHp * 0.3);
    text(
      "player-protection",
      status.protectionSec > 0
        ? `DROP SHIELD ${Math.ceil(status.protectionSec)}s`
        : "",
    );
    if (this.previousHp !== null && hp < this.previousHp) {
      this.onDamage?.();
      const vignette = el("damage-vignette");
      vignette.classList.remove("active");
      void vignette.offsetWidth;
      vignette.classList.add("active");
    }
    this.previousHp = hp;
    if (this.downed !== hp <= 0) {
      this.downed = hp <= 0;
      el("downed-overlay").hidden = !this.downed;
      this.onMenuChanged?.();
      if (this.downed) {
        this.menuOpen = false;
        el("field-menu").hidden = true;
        document.exitPointerLock?.();
        el("respawn-button").focus();
      }
    }
    const recover = el<HTMLButtonElement>("respawn-button");
    recover.disabled = status.respawnIn > 0;
    recover.textContent =
      status.respawnIn > 0
        ? `Recover in ${Math.ceil(status.respawnIn)}s`
        : "Recover at drop point";
    const companion = this.net.phase6Snapshot?.pets.find(
      (p) => p.ownerEntityId === this.net.localEntityId,
    );
    text(
      "player-district",
      companion && companion.mode !== PetMode.FOLLOW
        ? "Companion Arena"
        : titleCase(getDistrictForPosition(agent.position.x, agent.position.z)),
    );
    text(
      "player-build",
      agent.mountedVehicleId
        ? `VEHICLE · ${Math.ceil(this.net.vehicleDamageSnapshot.vehicles.find(v => v.vehicleId === agent.mountedVehicleId)?.hp ?? status.tier3Aircraft?.find(v => v.id === agent.mountedVehicleId)?.hp ?? 0)} HP`
        : AUGMENT_CHASSIS_CATALOG[agent.augmentChassis].branchName,
    );
    text("player-orbs", `${this.net.collectedOrbIds.size} ORBS`);
    const provenance = this.net.playerStatus?.lore?.pet;
    if (provenance?.provenanceDiscovered && provenance.originCitizenId) {
      const citizen = RESONANCE_MEMORY_FRAGMENTS.find(c => c.citizenId === provenance.originCitizenId);
      if (citizen) {
        if (!this.provenanceNode) {
          this.provenanceNode = document.createElement('details');
          this.provenanceNode.id = 'citizen-provenance';
          el('panel-companion').append(this.provenanceNode);
        }
        if (this.provenanceNode.dataset.citizen !== citizen.citizenId) {
          this.provenanceNode.replaceChildren();
          const title = document.createElement('summary'); title.textContent = RESONANCE_SPIRE_RULES.provenanceTitle;
          const record = document.createElement('p');
          record.textContent = `${citizen.citizenId} ? ${citizen.name} ? ${citizen.formerOccupation} ? ${citizen.districtOfOrigin}. ${citizen.transcript}`;
          this.provenanceNode.append(title, record); this.provenanceNode.dataset.citizen = citizen.citizenId;
        }
        this.provenanceNode.hidden = false;
      }
    } else if (this.provenanceNode) this.provenanceNode.hidden = true;
    text("player-dashes", `Dash · ${agent.airDashesRemaining}`);
    text("player-fuel", `Fuel · ${agent.jetpackFuelSec.toFixed(1)}s`);
    text(
      "player-rewind",
      agent.buildModifiers.chronoRewindUnlocked
        ? "Rewind ready"
        : "Relic locked",
    );
    if (agent.tier3.scanSec > 0 && agent.tier3.trackedRelicIds.length) {
      const tracked = RELIC_REGISTRY.filter(r => agent.tier3.trackedRelicIds.includes(r.id)).sort((a, b) => Math.hypot(a.position.x - agent.position.x, a.position.y - agent.position.y, a.position.z - agent.position.z) - Math.hypot(b.position.x - agent.position.x, b.position.y - agent.position.y, b.position.z - agent.position.z))[0];
      if (tracked) {
        const dx = tracked.position.x - agent.position.x, dz = tracked.position.z - agent.position.z;
        const bearing = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
        text('player-rewind', `${tracked.name} / ${Math.round(Math.hypot(dx, tracked.position.y - agent.position.y, dz))}m / ${Math.round(bearing)} degrees`);
      }
    }
    text(
      "upgrade-badge",
      status.skillPoints > 0 ? `+${status.skillPoints}` : "",
    );
    if (status.skillPoints > this.previousPoints)
      this.notice("UPGRADE AVAILABLE — Press B to install a skill.");
    this.previousPoints = status.skillPoints;
    const bearing = ((((this.camera.yaw * -180) / Math.PI) % 360) + 360) % 360;
    text(
      "compass",
      `${["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(bearing / 45) % 8]}  ${Math.round(bearing)}°`,
    );
    if (performance.now() > this.noticeUntil)
      el("combat-notice").classList.remove("visible");
    this.updateMission(agent);
    this.updateWaypoint(agent);
    this.updateTarget(agent);
    this.updateGuidance(agent);
    if (this.menuOpen) this.updateUpgrades(agent);
    this.updateArena();
  }

  private updateMission(agent: AgentPhysicsBody): void {
    const phase = this.net.phase6Snapshot;
    const pet = phase?.pets.find(
      (p) => p.ownerEntityId === this.net.localEntityId,
    );
    if (phase && pet && pet.mode !== PetMode.FOLLOW) {
      const isDerby = pet.mode === PetMode.DERBY;
      const state = isDerby ? phase.arena.derbyState : phase.arena.clashState;
      const timer = isDerby
        ? phase.arena.derbyTimerSec
        : phase.arena.clashTimerSec;
      text("mission-title", isDerby ? "Neon Pet Derby" : "Cyber-Pit Clash");
      text("mission-stage", ["LOBBY", "STARTING", "LIVE", "RESULTS"][state]);
      text(
        "mission-detail",
        state === PetArenaState.LOBBY
          ? "Waiting for another squadmate. Two companions are needed to start."
          : state === PetArenaState.COUNTDOWN
            ? "Get ready. Your companions compete automatically."
            : state === PetArenaState.ACTIVE
              ? "Watch your companion compete. Open Esc → Companion arena to return to the city."
              : "Round complete. Stay for the next round or return to the city.",
      );
      text(
        "mission-distance",
        state === PetArenaState.LOBBY
          ? "SQUAD EVENT"
          : `${Math.ceil(timer)}s remaining`,
      );
      text(
        "mission-reward",
        isDerby ? "TWO LAPS · ONE WINNER" : "LAST COMPANION STANDING",
      );
      el("objective-marker").hidden = el("interaction-prompt").hidden = true;
      return;
    }
    const field = this.net.playerStatus?.tier4;
    const tracked = document.getElementById('tier4-field-journal')?.dataset.track;
    const fieldObjective = field?.objectives.find(o => o.id === tracked) ?? field?.markers.find(o => o.id === tracked) ?? field?.objectives[0];
    if (fieldObjective) {
      const distance = Math.hypot(fieldObjective.position.x - agent.position.x, fieldObjective.position.y - agent.position.y, fieldObjective.position.z - agent.position.z);
      text('mission-title', 'Field operation'); text('mission-detail', fieldObjective.label);
      text('mission-stage', `${field!.completedQuests.filter(id => /^MISSION_D[1-4]_0[1-6]$/.test(id)).length} / 24`);
      text('mission-distance', `${Math.round(distance)}m / altitude ${Math.round(fieldObjective.position.y)}m`);
      text('mission-reward', 'PROGRESS SAVES AUTOMATICALLY');
      el('interaction-prompt').hidden = distance > 3.5 || this.menuOpen || this.downed;
      text('interaction-prompt', this.controllerActive ? '[X] Interact / hold to work' : '[H] Interact / hold to work');
      this.projectObjective(fieldObjective.position, `${fieldObjective.label} / ${Math.round(distance)}m`);
      return;
    }
    const loops = this.net.districtLoopSnapshots;
    const spec = DISTRICT_LOOP_SPECS.find(s => s.districtIndex === this.map?.trackedDistrictIndex) ?? DISTRICT_LOOP_SPECS.find(
      (s) =>
        (loops.find((l) => l.districtIndex === s.districtIndex)?.currentStage ??
          1) < 4,
    );
    if (!spec) {
      text("mission-title", "The city is yours.");
      text(
        "mission-detail",
        "All four districts liberated. Regroup for Protocol Eclipse.",
      );
      text("mission-stage", "COMPLETE");
      text("mission-distance", "4 / 4 DISTRICTS");
      text("mission-reward", "PROTOCOL ECLIPSE UNLOCKED");
      el("objective-marker").hidden = el("interaction-prompt").hidden = true;
      return;
    }
    const loop = loops.find((l) => l.districtIndex === spec.districtIndex);
    const stage = loop?.currentStage ?? 1;
    const objective = districtObjective(spec, loop, this.net.enemySnapshots);
    const position = objective.position;
    const distance = Math.hypot(
      position.x - agent.position.x,
      position.y - agent.position.y,
      position.z - agent.position.z,
    );
    const label = objective.label.split(' · ').at(-1)!;
    text("mission-stage", `0${stage} / 03`);
    text(
      "mission-title",
      spec.districtIndex === 0
        ? "Break the smuggler grid"
        : titleCase(spec.district),
    );
    text(
      "mission-detail",
      stage === 1
        ? `Sabotage the relay network (${loop?.terminalsHacked ?? 0}/${loop?.totalTerminals ?? 2}). Press H near each relay.`
        : stage === 2
          ? `Defeat ${characterNameForCallsign(spec.lieutenantCallsign)}. Aim for exposed limbs and counter amber attacks.`
          : "Defeat the kingpin, then press H at the core to liberate the district.",
    );
    text("mission-distance", `${Math.round(distance)}m · ${titleCase(label)}`);
    const rewards = [
      "GRAPPLE OVERDRIVE",
      "PLASMA RAILGUN",
      "GRAV-FLIGHT OVERDRIVE",
      "ECLIPSE OVERRIDE",
    ];
    text("mission-reward", `REWARD · ${rewards[spec.districtIndex]}`);
    const prompt = el("interaction-prompt");
    prompt.hidden =
      !(distance <= 4.2 && (stage === 1 || label === "CORE OVERRIDE")) ||
      this.menuOpen ||
      this.downed;
    text(
      "interaction-prompt",
      stage === 1
        ? `[${this.controllerActive ? 'X' : 'H'}] Sabotage relay`
        : `[${this.controllerActive ? 'X' : 'H'}] Override core · Liberate district`,
    );
    this.projectObjective(position, `${label} · ${Math.round(distance)}m`);
  }

  private updateWaypoint(agent: AgentPhysicsBody): void {
    const target = this.map?.navigation;
    const hidden = !target || this.menuOpen || this.downed || Boolean(this.isOverlayBlocking?.());
    el('waypoint-guidance').hidden = hidden;
    el('waypoint-marker').hidden = hidden;
    if (!target || hidden) return;
    const navigation = navigationTo(agent.position, target.position);
    const elevation = navigation.elevation === null || Math.abs(navigation.elevation) < 5 ? '' : ` · ${Math.round(Math.abs(navigation.elevation))}m ${navigation.elevation > 0 ? 'above' : 'below'}`;
    text('waypoint-guidance-text', `${navigation.arrived ? 'ARRIVED · ' : ''}${target.label} · ${Math.round(navigation.distance)}m${elevation}`);
    el('waypoint-arrow').style.transform = `rotate(${navigation.bearing + this.camera.yaw * 180 / Math.PI}deg)`;
    if (target.marker?.kind === 'objective') { el('waypoint-marker').hidden = true; return; }
    this.projectObjective({ ...target.position, y: target.position.y ?? agent.position.y }, `${target.label} · ${Math.round(navigation.distance)}m${elevation}`, 'waypoint-marker', 'waypoint-label');
  }

  private projectObjective(position: Vec3, label: string, markerId = 'objective-marker', labelId = 'objective-label'): void {
    const marker = el(markerId);
    marker.hidden = this.menuOpen || this.downed || Boolean(this.isOverlayBlocking?.());
    this.projected.set(position.x, position.y + 2.8, position.z);
    const delta = this.projected.clone().sub(this.camera.camera.position);
    this.camera.camera.getWorldDirection(this.forward);
    const behind = delta.dot(this.forward) < 0;
    this.projected.project(this.camera.camera);
    let x = this.projected.x,
      y = this.projected.y;
    if (behind) {
      x = -x;
      y = -y;
      if (Math.abs(x) < 0.1) x = 1;
    }
    const edge = Math.max(1, Math.abs(x) / 0.82, Math.abs(y) / 0.58);
    marker.style.left = `${((x / edge) * 0.5 + 0.5) * 100}%`;
    marker.style.top = `${((-y / edge) * 0.5 + 0.5) * 100}%`;
    text(labelId, `${behind ? "TURN · " : ""}${label}`);
  }

  private updateTarget(agent: AgentPhysicsBody): void {
    this.camera.camera.getWorldDirection(this.forward);
    let nearest:
      | (typeof this.net.enemySnapshots extends Map<number, infer T>
          ? T
          : never)
      | undefined;
    let best = Infinity;
    for (const enemy of this.net.enemySnapshots.values()) {
      if (
        enemy.hp <= 0 &&
        (this.previousEnemyHealth.get(enemy.enemyId) ?? 0) > 0
      ) {
        const distance = Math.hypot(
          enemy.position.x - agent.position.x,
          enemy.position.z - agent.position.z,
        );
        if (distance < 35) {
          this.notice("HOSTILE DOWN");
          this.onDefeat?.();
        }
      }
      this.previousEnemyHealth.set(enemy.enemyId, enemy.hp);
      if (enemy.hp <= 0 || enemy.combatState === EnemyCombatState.DEAD)
        continue;
      const delta = new THREE.Vector3(
        enemy.position.x - agent.position.x,
        enemy.position.y - agent.position.y,
        enemy.position.z - agent.position.z,
      );
      const distance = delta.length();
      if (
        distance > 35 ||
        (distance > 6 && delta.normalize().dot(this.forward) < 0.75)
      )
        continue;
      if (distance < best) {
        best = distance;
        nearest = enemy;
      }
    }
    el("target-card").hidden = !nearest || this.menuOpen || this.downed;
    if (!nearest) return;
    text("target-name", nearest.isElite ? "ELITE HOSTILE" : "HOSTILE");
    text("target-health", `${Math.ceil(nearest.hp)} / ${nearest.maxHp}`);
    el<HTMLProgressElement>("target-hp").max = nearest.maxHp;
    el<HTMLProgressElement>("target-hp").value = nearest.hp;
    const hint =
      nearest.combatState === EnemyCombatState.WINDUP
        ? "AMBER ATTACK · Q TO COUNTER"
        : nearest.combatState === EnemyCombatState.COUNTER_STANCE
          ? "SHIELD ACTIVE · WAIT FOR AMBER"
          : this.camera.isAiming
            ? "LMB fire · Tab change limb"
            : "RMB aim · V melee";
    text("target-hint", this.controllerActive ? hint.replace('Q TO COUNTER', 'RB TO COUNTER')
      .replace('LMB fire · Tab change limb', 'RT fire · D-pad left/right change limb')
      .replace('RMB aim · V melee', 'LT aim · Right stick click melee') : hint);
  }

  private updateGuidance(agent: AgentPhysicsBody): void {
    this.startPos ??= { ...agent.position };
    this.moved ||=
      Math.hypot(
        agent.position.x - this.startPos.x,
        agent.position.z - this.startPos.z,
      ) > 4;
    this.jumped ||= !agent.grounded && agent.velocity.y > 2;
    const stage = this.net.districtLoopSnapshots.find(
      (s) => s.districtIndex === 0,
    );
    const textValue =
      !document.pointerLockElement && !this.menuOpen && !this.controllerActive
        ? "Click the city to look around. Press Esc to open your field kit."
        : agent.mountedVehicleId
          ? "W/S drive · A/D steer · E exit. Space: wall thrusters at Driving 4."
        : !this.moved
          ? "WASD to move. Hold Shift to sprint toward the gold diamond."
          : !this.jumped
            ? "Space to jump. Ctrl to dash in the air. Hold J to use your jetpack."
            : (stage?.terminalsHacked ?? 0) < 1
              ? "Follow the gold diamond. Press H close to a relay to sabotage it."
              : stage?.currentStage === 1
                ? "One relay down. Follow the next diamond to expose the lieutenant."
                : stage?.currentStage === 2
                  ? "RMB to aim, LMB to fire. Counter an amber attack with Q."
                  : "Defeat the kingpin, then override the core with H. Your squad shares the reward.";
    const controllerText = this.controllerActive ? textValue
      .replace('W/S drive · A/D steer · E exit. Space:', 'Left stick drive / steer · LB + Y exit. A:')
      .replace('WASD to move. Hold Shift', 'Left stick to move. Hold left stick click')
      .replace('Space to jump. Ctrl to dash in the air. Hold J', 'A to jump. B to dash in the air. Hold LB + LT')
      .replace('Press H', 'Press X').replace('with H', 'with X')
      .replace('RMB to aim, LMB to fire. Counter an amber attack with Q.', 'LT to aim, RT to fire. Counter an amber attack with RB.') : textValue;
    text("onboarding-text", controllerText);
    text(
      "onboarding-next",
      stage?.currentStage === 4
        ? "Neon Docks liberated. Your next operation is tracked above."
        : this.controllerActive ? "Menu · Full controls and mission briefing" : "Esc · Full controls and mission briefing",
    );
    el("onboarding").hidden =
      this.menuOpen ||
      this.downed ||
      stage?.currentStage === 4 ||
      Boolean(
        this.net.phase6Snapshot?.pets.some(
          (p) =>
            p.ownerEntityId === this.net.localEntityId &&
            p.mode !== PetMode.FOLLOW,
        ),
      );
  }

  private updateUpgrades(agent: AgentPhysicsBody): void {
    const status = this.net.playerStatus!;
    text(
      "skill-points",
      `${status.skillPoints} upgrade point${status.skillPoints === 1 ? "" : "s"}`,
    );
    const signature = `${agent.augmentChassis}|${status.canSwapChassis}|${status.skillPoints}|${JSON.stringify(agent.attributes)}|${agent.tier3.weaponId}|${[...agent.unlockedSkills].join(",")}`;
    if (signature === this.upgradeSignature) return;
    this.upgradeSignature = signature;
    const chassisRoot = el("chassis-options"),
      skillsRoot = el("skill-options");
    chassisRoot.replaceChildren();
    skillsRoot.replaceChildren();
    for (const spec of Object.values(AUGMENT_CHASSIS_CATALOG)) {
      const button = document.createElement("button");
      button.textContent = spec.branchName;
      button.disabled = !status.canSwapChassis;
      button.title = status.canSwapChassis ? spec.description : 'Enter a cleared Forward Operating Safe House to swap Augment Chassis.';
      button.classList.toggle("selected", agent.augmentChassis === spec.id);
      button.setAttribute(
        "aria-pressed",
        String(agent.augmentChassis === spec.id),
      );
      button.onclick = () =>
        this.net.sendControl("SELECT_CHASSIS", { augmentChassis: spec.id });
      chassisRoot.append(button);
    }
    for (const skill of TIER3_SKILL_NODES) {
      const card = document.createElement("article");
      card.className = "skill-card";
      const tier = document.createElement("small");
      tier.textContent = `${skill.path.toUpperCase()} / TIER ${skill.tier}`;
      const heading = document.createElement("h4");
      heading.textContent = skill.name;
      const description = document.createElement("p");
      const bonuses = Object.entries(skill.modifiers).map(([key, value]) => {
        const percent = /Multiplier|Reduction/.test(key), amount = percent ? Math.round(value * 100) : value;
        const label = key.replace(/Multiplier|Bonus|Pct|Flat/g, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
        return `${label} ${amount > 0 ? '+' : ''}${amount}${percent || key.endsWith('Pct') ? '%' : ''}`;
      }).join(', ');
      description.textContent = Object.entries(skill.requires).map(([stat, level]) => `${stat} Lv ${level}`).join(' + ') + ` / ${bonuses}` + (skill.active ? ` / ${skill.active.kind}: ${skill.active.rangeM}m, ${skill.active.durationSec}s, ${skill.active.cooldownSec}s cooldown` : '');
      const button = document.createElement("button");
      const installed = agent.unlockedSkills.has(skill.id);
      const error = skillUnlockError(skill.id, status.xp, agent.unlockedSkills);
      button.textContent = installed ? "Installed ✓" : `Install · ${skill.cost} point${skill.cost === 1 ? '' : 's'}`;
      button.disabled = Boolean(error);
      button.title = error ?? "Install this upgrade";
      button.onclick = () =>
        this.net.sendControl("UNLOCK_SKILL", { skillId: skill.id });
      card.append(tier, heading, description, button);
      if (installed && skill.active) { const use = document.createElement('button'); use.textContent = 'Activate'; use.onclick = () => this.net.sendControl('TIER3_SKILL', { id: skill.id }); card.append(use); }
      skillsRoot.append(card);
    }
    const equipment = document.createElement('article'); equipment.className = 'skill-card';
    const heading = document.createElement('h4'); heading.textContent = 'Field equipment'; equipment.append(heading);
    for (const [label, registry, type] of [['Weapon', WEAPON_REGISTRY, 'TIER3_EQUIP'], ['Vehicle service', VEHICLE_REGISTRY, 'TIER3_VEHICLE']] as const) {
      const select = document.createElement('select'); select.setAttribute('aria-label', label);
      for (const item of registry) { const option = document.createElement('option'); option.value = item.id; option.textContent = `${item.name} (${Object.entries(item.requires).map(([s, lv]) => `${s} ${lv}`).join(', ')})`; option.disabled = !meetsRequirements(agent.attributes, item.requires); select.append(option); }
      if (type === 'TIER3_EQUIP' && agent.tier3.weaponId) select.value = agent.tier3.weaponId;
      const button = document.createElement('button'); button.textContent = label === 'Weapon' ? 'Equip weapon' : 'Request vehicle'; button.onclick = () => this.net.sendControl(type, { id: select.value }); equipment.append(select, button);
    }
    const help = document.createElement('p'); help.textContent = 'T: companion ability; Z: wingsuit; U: hover aim; J: jetpack; X: jet-dash; O: threat scan; I: weakpoint scan; L: airborne focus; K: reload; R: Chrono-Shift; Q: counter/deflect; Shift near wall: wall-run; Space: wall-kick. Fire equipped weapons with mouse; V uses equipped melee or an airborne crater. In vehicles: Q missiles; F winch attach/release or EMP harpoon; Ctrl flares. Vehicle services require a cleared garage or landing pad.'; equipment.append(help);
    skillsRoot.prepend(equipment);
  }

  private updateArena(): void {
    const phase = this.net.phase6Snapshot;
    if (!phase) return;
    const pet = phase.pets.find(
      (p) => p.ownerEntityId === this.net.localEntityId,
    );
    const derby = phase.arena;
    const names = [
      "Neon Fox",
      "Grid Hound",
      "Aero Raven Drone",
      "Titan Beetle",
    ];
    const race = pet && phase.racers.find((r) => r.petId === pet.petId);
    const summary = pet
      ? `${names[pet.species]} · ${["Following you", "In the derby", "In the clash"][pet.mode]} · ${Math.round(pet.hpPct)}% HP`
      : "Adopt a companion to begin.";
    text(
      "arena-summary",
      `${summary} | Derby: ${["Waiting for squad", "Starting", "Racing", "Results"][derby.derbyState]} | Clash: ${["Waiting for squad", "Starting", "Fighting", "Results"][derby.clashState]}${race && race.place > 0 ? ` | Place ${race.place}, lap ${Math.min(derby.derbyLaps, race.lap + 1)}/${derby.derbyLaps}` : ""}`,
    );
    const boss = phase.dreadnought;
    const active =
      boss.phase !== DreadnoughtPhase.DORMANT &&
      boss.phase !== DreadnoughtPhase.DEFEATED;
    el("raid-status").hidden = !active;
    text(
      "raid-status",
      boss.shielded
        ? `ECLIPSE DREADNOUGHT · Destroy the four engines (${boss.parts.filter((p) => p.partId >= 1 && p.partId <= 4 && p.destroyed).length}/4)`
        : `ECLIPSE DREADNOUGHT · Core exposed${boss.lanceChargeSec > 0 ? " · LANCE CHARGING — MOVE!" : ""}`,
    );
  }

  public bindSettings(): void {
    const sensitivity = el<HTMLInputElement>("sensitivity-setting");
    const quality = el<HTMLSelectElement>("quality-setting");
    const bloom = el<HTMLInputElement>("bloom-setting");
    try {
      const settings = JSON.parse(
        this.storage?.getItem("crackup.settings") || "{}",
      );
      sensitivity.value = String(
        Math.max(1, Math.min(10, Number(settings.sensitivity) || 4)),
      );
      quality.value =
        settings.quality === "performance" ? "performance" : "standard";
      bloom.checked = settings.bloom !== false;
    } catch {
      /* Defaults remain usable when browser storage is unavailable. */
    }
    const apply = (save = true) => {
      this.camera.sensitivity = Number(sensitivity.value) * 0.00055;
      this.environment.bloomPass.enabled = bloom.checked;
      this.environment.ssaoPass.enabled = quality.value !== "performance";
      this.renderer.setPixelRatio(
        Math.min(
          window.devicePixelRatio,
          quality.value === "performance" ? 1 : 1.5,
        ),
      );
      this.environment.resize(window.innerWidth, window.innerHeight);
      if (!save) return;
      try {
        this.storage?.setItem(
          "crackup.settings",
          JSON.stringify({
            sensitivity: sensitivity.value,
            quality: quality.value,
            bloom: bloom.checked,
          }),
        );
      } catch {
        /* Settings still apply for this session. */
      }
    };
    // Preview dragging locally, then save the chosen value without flooding control messages.
    sensitivity.oninput = () => apply(false);
    sensitivity.onchange = () => apply();
    quality.onchange = () => apply();
    bloom.onchange = () => apply();
    apply();
  }
}
