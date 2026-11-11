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
  public menuOpen = false;
  public downed = false;
  public onMenuChanged: (() => void) | null = null;
  public onDamage: (() => void) | null = null;
  public onDefeat: (() => void) | null = null;
  private noticeUntil = 0;
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
  ) {
    el("resume-button").onclick = () => this.setMenu(false);
    el("respawn-button").onclick = () => this.net.sendControl("RESPAWN");
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
      if (!this.menuOpen || event.key !== "Tab") return;
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
      this.menuOpen || this.downed || !this.net.connected || document.hidden
    );
  }

  public deploy(callsign: string): void {
    el("auth-overlay").hidden = true;
    el("player-hud").hidden = false;
    text("player-callsign", callsign);
    this.startPos = null;
    this.previousHp = null;
    this.notice(
      "Welcome to Neon Docks. Follow the gold diamond to disrupt the relay network.",
    );
    (document.activeElement as HTMLElement | null)?.blur();
  }

  public setMenu(open: boolean, panel = "briefing"): void {
    if (!this.net.connected || this.downed) return;
    this.menuOpen = open;
    el("field-menu").hidden = !open;
    this.onMenuChanged?.();
    if (open) {
      document.exitPointerLock?.();
      this.selectPanel(panel);
      el("resume-button").focus();
    } else {
      this.renderer.domElement.requestPointerLock?.()?.catch(() => {});
    }
  }

  public handleKey(code: string): boolean {
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
        ? `VEHICLE · ${Math.ceil(this.net.vehicleDamageSnapshot.vehicles.find(v => v.vehicleId === agent.mountedVehicleId)?.hp ?? 0)} HP`
        : AUGMENT_CHASSIS_CATALOG[agent.augmentChassis].branchName,
    );
    text("player-orbs", `${this.net.collectedOrbIds.size} ORBS`);
    text("player-dashes", `Dash · ${agent.airDashesRemaining}`);
    text("player-fuel", `Fuel · ${agent.jetpackFuelSec.toFixed(1)}s`);
    text(
      "player-rewind",
      agent.buildModifiers.chronoRewindUnlocked
        ? "Rewind ready"
        : "Relic locked",
    );
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
    const loops = this.net.districtLoopSnapshots;
    const spec = DISTRICT_LOOP_SPECS.find(
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
    const enemyId = stage === 2 ? spec.lieutenantEnemyId : spec.kingpinEnemyId;
    const enemy = this.net.enemySnapshots.get(enemyId);
    let position = loop?.activeObjectivePos ?? spec.stage1Terminals[0];
    if (stage >= 2 && enemy && enemy.combatState !== EnemyCombatState.DEAD)
      position = enemy.position;
    const distance = Math.hypot(
      position.x - agent.position.x,
      position.y - agent.position.y,
      position.z - agent.position.z,
    );
    const label =
      stage === 1
        ? "RELAY"
        : stage === 2
          ? "LIEUTENANT"
          : enemy && enemy.hp > 0
            ? "KINGPIN"
            : "CORE OVERRIDE";
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
          ? `Defeat ${spec.lieutenantCallsign}. Aim for exposed limbs and counter amber attacks.`
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
        ? "[H] Sabotage relay"
        : "[H] Override core · Liberate district",
    );
    this.projectObjective(position, `${label} · ${Math.round(distance)}m`);
  }

  private projectObjective(position: Vec3, label: string): void {
    const marker = el("objective-marker");
    marker.hidden = this.menuOpen || this.downed;
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
    text("objective-label", `${behind ? "TURN · " : ""}${label}`);
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
    text("target-hint", hint);
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
      !document.pointerLockElement && !this.menuOpen
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
    text("onboarding-text", textValue);
    text(
      "onboarding-next",
      stage?.currentStage === 4
        ? "Neon Docks liberated. Your next operation is tracked above."
        : "Esc · Full controls and mission briefing",
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
    const signature = `${agent.augmentChassis}|${status.skillPoints}|${[...agent.unlockedSkills].join(",")}`;
    if (signature === this.upgradeSignature) return;
    this.upgradeSignature = signature;
    const chassisRoot = el("chassis-options"),
      skillsRoot = el("skill-options");
    chassisRoot.replaceChildren();
    skillsRoot.replaceChildren();
    for (const spec of Object.values(AUGMENT_CHASSIS_CATALOG)) {
      const button = document.createElement("button");
      button.textContent = spec.branchName;
      button.title = spec.description;
      button.classList.toggle("selected", agent.augmentChassis === spec.id);
      button.setAttribute(
        "aria-pressed",
        String(agent.augmentChassis === spec.id),
      );
      button.onclick = () =>
        this.net.sendControl("SELECT_CHASSIS", { augmentChassis: spec.id });
      chassisRoot.append(button);
    }
    for (const skill of SKILL_TREE_NODES.filter(
      (s) => s.branch === agent.augmentChassis,
    )) {
      const card = document.createElement("article");
      card.className = "skill-card";
      const tier = document.createElement("small");
      tier.textContent = `TIER 0${skill.tier}`;
      const heading = document.createElement("h4");
      heading.textContent = skill.name;
      const description = document.createElement("p");
      description.textContent = skill.description;
      const button = document.createElement("button");
      const installed = agent.unlockedSkills.has(skill.id);
      const error = skillUnlockError(skill.id, status.xp, agent.unlockedSkills);
      button.textContent = installed ? "Installed ✓" : "Install · 1 point";
      button.disabled = Boolean(error);
      button.title = error ?? "Install this upgrade";
      button.onclick = () =>
        this.net.sendControl("UNLOCK_SKILL", { skillId: skill.id });
      card.append(tier, heading, description, button);
      skillsRoot.append(card);
    }
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

  private bindSettings(): void {
    const sensitivity = el<HTMLInputElement>("sensitivity-setting");
    const quality = el<HTMLSelectElement>("quality-setting");
    const bloom = el<HTMLInputElement>("bloom-setting");
    try {
      const settings = JSON.parse(
        localStorage.getItem("crackup.settings") || "{}",
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
    const apply = () => {
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
      try {
        localStorage.setItem(
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
    sensitivity.oninput = apply;
    quality.onchange = apply;
    bloom.onchange = apply;
    apply();
  }
}
