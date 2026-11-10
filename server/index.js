/**
 * CRACKUP: Protocol Eclipse — Authoritative Real-Time Multiplayer Server
 * Built with Node.js HTTP + RFC 6455 WebSocket Server (20Hz Authoritative Tick)
 * Supports up to 8 concurrent players per city instance with persistent Agent accounts.
 */
const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { WebSocketServer } = require('./ws_server');
const {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  MAX_PLAYERS_PER_INSTANCE,
  SKILLS,
  CLASSES,
  SKILL_TREE,
  BODY_PARTS,
  SECRET_MUTATIONS,
  DISTRICTS,
  BUILDINGS,
  PROTOTYPE_RELICS,
  PET_SPECIES,
  OMEGA_BOUNTIES,
  STORY_ACTS,
  generateOrbs
} = require('./world_data');
const { PersistenceManager, computeSkillLevel } = require('./persistence');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PRD_PATH = path.join(__dirname, '..', 'PRD.md');
const TUNNEL_URL_FILE = path.join(__dirname, '..', 'data', 'public_url.txt');

const persistence = new PersistenceManager();
let currentPublicTunnelUrl = process.env.PUBLIC_URL || null;

function getLanAddresses() {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        addrs.push(`http://${net.address}:${PORT}`);
      }
    }
  }
  return addrs;
}

function getShareableUrls(reqHost) {
  if (fs.existsSync(TUNNEL_URL_FILE)) {
    try {
      const saved = fs.readFileSync(TUNNEL_URL_FILE, 'utf8').trim();
      if (saved) currentPublicTunnelUrl = saved;
    } catch (_) {}
  }
  return {
    publicTunnelUrl: currentPublicTunnelUrl,
    lanUrls: getLanAddresses(),
    currentOrigin: reqHost ? `http://${reqHost}` : `http://localhost:${PORT}`
  };
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function dist2D(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

/**
 * Helper: Check if player benefits from a nearby ally's Pack Vanguard Squad Uplink (`vanguard_1`)
 */
function hasSquadUplinkBuff(instance, player) {
  if (player.agent.unlockedNodes?.includes('vanguard_1')) return true;
  for (const ally of instance.players.values()) {
    if (
      ally.clientId !== player.clientId &&
      ally.agent.unlockedNodes?.includes('vanguard_1') &&
      dist2D(player.x, player.y, ally.x, ally.y) <= 280
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Represents a live Neo-Veridia City Instance (Up to 8 Concurrent Players)
 */
class CityInstance {
  constructor(instanceId) {
    this.id = instanceId;
    this.players = new Map(); // clientId -> LivePlayerState
    this.orbs = generateOrbs();
    this.enemies = [];
    this.sabotageNodes = [];
    this.vehicles = [];
    this.projectiles = [];
    this.effects = [];
    this.activeBounty = null;
    this.bountyCooldownTicks = 600; // ~30s until first Omega Bounty check
    this.eclipseBoss = null;
    this.petDerby = null; // Active multiplayer Pet Derby race state
    this.tickCount = 0;

    this._initWorldEntities();
  }

  _initWorldEntities() {
    const vehicleSpawns = [
      { id: 'veh_1', x: 480, y: 600, district: 'neon_docks' },
      { id: 'veh_2', x: 1120, y: 640, district: 'neon_docks' },
      { id: 'veh_3', x: 2080, y: 600, district: 'foundry_slums' },
      { id: 'veh_4', x: 2640, y: 1080, district: 'foundry_slums' },
      { id: 'veh_5', x: 520, y: 2080, district: 'helios_spire' },
      { id: 'veh_6', x: 1080, y: 2620, district: 'helios_spire' },
      { id: 'veh_7', x: 2100, y: 2080, district: 'citadel_plaza' },
      { id: 'veh_8', x: 2680, y: 2620, district: 'citadel_plaza' }
    ];
    this.vehicles = vehicleSpawns.map((v) => ({
      id: v.id,
      x: v.x,
      y: v.y,
      z: 0,
      vx: 0,
      vy: 0,
      angle: 0,
      driverId: null,
      tier: 1,
      name: 'Agency Interceptor',
      hp: 400,
      maxHp: 400
    }));

    DISTRICTS.forEach((d, dIdx) => {
      for (let i = 0; i < 3; i++) {
        this.sabotageNodes.push({
          id: `sab_${d.id}_${i + 1}`,
          district: d.id,
          name: `${d.name.split(':')[1].trim()} Relay #${i + 1}`,
          x: d.bounds.x + 350 + i * 420,
          y: d.bounds.y + 480 + (i % 2) * 520,
          z: 0,
          hp: 180,
          maxHp: 180,
          active: true,
          respawnTick: 0
        });
      }
      for (let e = 0; e < 6; e++) {
        this._spawnDistrictEnemy(d.id, dIdx + 1);
      }
    });
  }

  _spawnDistrictEnemy(districtId, tier = 1, isWarden = false) {
    const d = DISTRICTS.find((dist) => dist.id === districtId) || DISTRICTS[0];
    const archetypes = [
      { type: 'enforcer', name: 'Syndicate Enforcer', hp: 140, speed: 2.3, dmg: 12, canCounter: false },
      { type: 'ronin', name: 'Cyber-Ronin Blade', hp: 210, speed: 3.1, dmg: 16, canCounter: true },
      { type: 'heavy', name: 'Shock-Brute Mech', hp: 320, speed: 1.9, dmg: 22, canCounter: true },
      { type: 'peacekeeper', name: 'Aegis Wetwork Unit', hp: 280, speed: 2.7, dmg: 19, canCounter: true }
    ];
    const arch = isWarden
      ? {
          type: 'warden',
          name: d.wardenName,
          hp: 950 + tier * 200,
          speed: 2.6,
          dmg: 28,
          canCounter: true
        }
      : archetypes[Math.min(archetypes.length - 1, Math.floor(Math.random() * (tier + 1)))];

    const x = d.bounds.x + 220 + Math.random() * (d.bounds.w - 440);
    const y = d.bounds.y + 220 + Math.random() * (d.bounds.h - 440);

    const enemy = {
      id: `enemy_${crypto.randomUUID().slice(0, 8)}`,
      district: districtId,
      type: arch.type,
      name: arch.name,
      isWarden,
      tier,
      x: Math.round(x),
      y: Math.round(y),
      z: 0,
      hp: arch.hp,
      maxHp: arch.hp,
      speed: arch.speed,
      baseDamage: arch.dmg,
      canCounter: arch.canCounter,
      state: 'patrol',
      stateTicks: 0,
      targetPlayerId: null,
      debuffs: {
        blindedUntil: 0,
        armorCrackedUntil: 0,
        disarmedUntil: 0,
        crippledUntil: 0,
        severeCrippleUntil: 0
      }
    };
    this.enemies.push(enemy);
    return enemy;
  }

  broadcast(packet) {
    const raw = JSON.stringify(packet);
    for (const p of this.players.values()) {
      if (p.ws && p.ws.readyState === 1) {
        p.ws.send(raw);
      }
    }
  }

  sendTo(clientId, packet) {
    const p = this.players.get(clientId);
    if (p && p.ws && p.ws.readyState === 1) {
      p.ws.send(JSON.stringify(packet));
    }
  }
}

const instances = new Map();
function getAvailableInstance() {
  for (const inst of instances.values()) {
    if (inst.players.size < MAX_PLAYERS_PER_INSTANCE) {
      return inst;
    }
  }
  const newId = `neo-veridia-${instances.size + 1}`;
  const inst = new CityInstance(newId);
  instances.set(newId, inst);
  return inst;
}
getAvailableInstance();

/**
 * Helper: Calculate derived player stats from 7 Skills, Skill Tree, Relics, Pets & Secret Mutations
 */
function getDerivedStats(agent) {
  const s = agent.skills;
  const nodes = new Set(agent.unlockedNodes || []);
  const relics = new Set(agent.relics || []);
  const mutations = new Set(agent.secretTelemetry?.activeMutations || []);
  const sovereignBonus = nodes.has('vanguard_4') || agent.districtLoops?.citadel_plaza?.unlocked ? 1 : 0;

  const strLv = Math.min(5, (s.strength?.level || 1) + sovereignBonus);
  const agiLv = Math.min(5, (s.agility?.level || 1) + sovereignBonus);
  const drvLv = Math.min(5, (s.driving?.level || 1) + sovereignBonus);
  const shtLv = Math.min(5, (s.shooting?.level || 1) + sovereignBonus);
  const expLv = Math.min(5, (s.explosives?.level || 1) + sovereignBonus);
  const flyLv = Math.min(5, (s.flying?.level || 1) + sovereignBonus);
  const vigLv = Math.min(5, (s.vigilante?.level || 1) + sovereignBonus);

  let maxHp = 160 + strLv * 45 + (agent.classId === 'titan' ? 35 : 0);
  if (nodes.has('titan_3')) maxHp += 120;
  if (agent.pet?.speciesId === 'magma_beetle') maxHp += 25;

  let moveSpeed = 4.2 + agiLv * 0.65;
  let jumpPower = 9.5 + agiLv * 2.1;
  let maxFlightFuel = 100 + flyLv * 35;
  if (agent.classId === 'valkyrie') maxFlightFuel *= 1.25;
  if (nodes.has('valkyrie_2')) maxFlightFuel *= 1.6;
  if (agent.districtLoops?.helios_spire?.unlocked) maxFlightFuel *= 1.8;
  if (mutations.has('hollow_frame')) maxFlightFuel *= 1.25;

  let meleeDamage = 24 + strLv * 14;
  if (nodes.has('titan_1')) meleeDamage *= 1.25;
  if (relics.has('gravity_gauntlet')) meleeDamage *= 1.3;
  if (mutations.has('surgical_coldness')) meleeDamage *= 0.85;

  let rangedDamage = 20 + shtLv * 10;
  if (nodes.has('phantom_3')) rangedDamage *= 1.2;
  if (agent.districtLoops?.foundry_slums?.unlocked) rangedDamage *= 1.35;

  let explosiveDamage = 48 + expLv * 22;
  let blastRadius = 95 + expLv * 18;
  if (agent.classId === 'demolition') blastRadius *= 1.2;
  if (relics.has('gravity_gauntlet')) explosiveDamage *= 1.3;
  if (nodes.has('demo_4')) {
    blastRadius *= 1.5;
    explosiveDamage *= 1.35;
  }
  if (mutations.has('pyro_neurosis')) {
    explosiveDamage *= 1.2;
    blastRadius *= 1.15;
  }

  let accuracyBonus = (shtLv - 1) * 0.045;
  if (agent.classId === 'phantom') accuracyBonus += 0.12;
  if (agent.pet?.speciesId === 'razor_hawk') accuracyBonus += 0.06;
  if (mutations.has('surgical_coldness')) accuracyBonus += 0.18;

  let orbPickupRadius = 48 + agiLv * 6;
  if (nodes.has('valkyrie_3')) orbPickupRadius *= 1.5;
  if (relics.has('orb_resonator')) orbPickupRadius += 95;
  if (agent.pet?.speciesId === 'phase_ferret') orbPickupRadius += 30;

  let hpRegenPerSec = 3.0 + vigLv * 0.8;
  if (mutations.has('pyro_neurosis')) hpRegenPerSec *= 0.8;

  return {
    strLv,
    agiLv,
    drvLv,
    shtLv,
    expLv,
    flyLv,
    vigLv,
    maxHp: Math.round(maxHp),
    moveSpeed,
    jumpPower,
    maxFlightFuel: Math.round(maxFlightFuel),
    meleeDamage: Math.round(meleeDamage),
    rangedDamage: Math.round(rangedDamage),
    explosiveDamage: Math.round(explosiveDamage),
    blastRadius: Math.round(blastRadius),
    accuracyBonus,
    orbPickupRadius: Math.round(orbPickupRadius),
    hpRegenPerSec
  };
}

/**
 * Award Skill XP & Check for Level-Up (Includes all 5 Cyber-Pet XP Affinities)
 */
function awardSkillXp(instance, player, skillId, baseAmount, reason = '') {
  const agent = player.agent;
  if (!agent.skills[skillId]) return;

  let mult = 1.0;
  const petSpecies = agent.pet?.speciesId;
  if (petSpecies === 'chrono_cat') mult += 0.05;
  if (petSpecies === 'volt_hound' && skillId === 'agility') mult += 0.05;
  if (petSpecies === 'razor_hawk' && (skillId === 'shooting' || skillId === 'flying')) mult += 0.05;
  if (petSpecies === 'phase_ferret' && skillId === 'vigilante') mult += 0.05;
  if (petSpecies === 'magma_beetle' && (skillId === 'strength' || skillId === 'explosives')) mult += 0.05;

  if (skillId === 'vigilante' && agent.secretTelemetry?.activeMutations?.includes('ghost_conscience')) {
    mult += 0.2;
  }

  const amount = Math.max(1, Math.round(baseAmount * mult));
  const skillObj = agent.skills[skillId];
  const oldLevel = skillObj.level;
  skillObj.xp += amount;
  const newLevel = computeSkillLevel(skillId, skillObj.xp);
  skillObj.level = newLevel;

  if (newLevel > oldLevel) {
    const gainedSp = newLevel - oldLevel;
    agent.skillPoints = (agent.skillPoints || 0) + gainedSp;
    player.derived = getDerivedStats(agent);
    player.hp = player.derived.maxHp;

    instance.broadcast({
      type: 'event_banner',
      category: 'level_up',
      title: `${agent.callsign} reached ${SKILLS[skillId].name} LEVEL ${newLevel}!`,
      subtitle: `+${gainedSp} Skill Point unlocked! (${reason || 'Attribute Evolution'})`,
      color: SKILLS[skillId].color
    });
  }

  persistence.scheduleSave();
}

/**
 * Evaluate Secret Background Progression ("Neural Drift")
 */
function evaluateSecretMutations(instance, player) {
  const t = player.agent.secretTelemetry;
  if (!t) return;
  if (!Array.isArray(t.activeMutations)) t.activeMutations = [];

  const tryUnlock = (mutId) => {
    if (t.activeMutations.includes(mutId)) return;
    t.activeMutations.push(mutId);
    player.derived = getDerivedStats(player.agent);
    const m = SECRET_MUTATIONS[mutId];
    instance.sendTo(player.clientId, {
      type: 'secret_mutation_triggered',
      mutation: m
    });
    checkStoryProgression(instance, player);
    persistence.scheduleSave();
  };

  if (t.explosiveCollateralScore >= 120) {
    tryUnlock('pyro_neurosis');
  }
  if (t.limbCrippleShots >= 5 && t.limbCrippleShots / Math.max(1, t.totalRangedShots) >= 0.45) {
    tryUnlock('surgical_coldness');
  }
  if (t.airborneCombatTicks >= 60 && t.meleeHitsTaken <= 3) {
    tryUnlock('hollow_frame');
  }
  if (t.conscienceActions >= 3) {
    tryUnlock('ghost_conscience');
  }
}

/**
 * Check Story Act Progression (Act I -> Act II -> Act III Twist)
 */
function checkStoryProgression(instance, player) {
  const agent = player.agent;
  const whisperCount = (agent.collectedOrbs || []).filter((id) => id.startsWith('orb_whisper_')).length;
  const mutationCount = agent.secretTelemetry?.activeMutations?.length || 0;
  const totalTruthScore = (agent.decryptionKeys || 0) + whisperCount + mutationCount;

  if (agent.storyAct === 1 && totalTruthScore >= 2) {
    agent.storyAct = 2;
    const actData = STORY_ACTS[2];
    agent.unlockedLore.push(`ACT II UNLOCKED — DR. KAELEN VOSS: "${actData.briefing}"`);
    instance.sendTo(player.clientId, {
      type: 'story_act_transition',
      act: 2,
      story: actData
    });
    persistence.scheduleSave();
  } else if (agent.storyAct === 2 && (totalTruthScore >= 5 || agent.districtLoops?.citadel_plaza?.unlocked)) {
    agent.storyAct = 3;
    const actData = STORY_ACTS[3];
    agent.unlockedLore.push(`ACT III UNLOCKED — PROTOCOL ECLIPSE: "${actData.briefing}"`);
    instance.sendTo(player.clientId, {
      type: 'story_act_transition',
      act: 3,
      story: actData
    });
    persistence.scheduleSave();
  }
}

/**
 * Advance District Loop Progression (3 Stages -> Permanent Capability Unlock)
 */
function recordDistrictActivity(instance, player, districtId, activityType) {
  const agent = player.agent;
  if (!agent.districtLoops || !agent.districtLoops[districtId]) return;
  const loop = agent.districtLoops[districtId];
  const distDef = DISTRICTS.find((d) => d.id === districtId);
  if (!distDef) return;

  if (loop.stage === 0 && activityType === 'enemy_kill') {
    loop.progress += 1;
    if (loop.progress >= 4) {
      loop.stage = 1;
      loop.progress = 0;
      instance.sendTo(player.clientId, {
        type: 'notification',
        color: distDef.color,
        text: `[${distDef.name}] Loop Stage 1 Complete! Next: Sabotage 3 Telemetry/Reactor Relays in this sector!`
      });
    }
  } else if (loop.stage === 1 && (activityType === 'sabotage' || activityType === 'enemy_kill')) {
    loop.progress += activityType === 'sabotage' ? 1 : 0.5;
    if (loop.progress >= 3) {
      loop.stage = 2;
      loop.progress = 0;
      const existingWarden = instance.enemies.find((e) => e.district === districtId && e.isWarden);
      if (!existingWarden) {
        const warden = instance._spawnDistrictEnemy(districtId, 3, true);
        warden.x = clamp(player.x + 120, distDef.bounds.x + 100, distDef.bounds.x + distDef.bounds.w - 100);
        warden.y = clamp(player.y - 60, distDef.bounds.y + 100, distDef.bounds.y + distDef.bounds.h - 100);
      }
      instance.broadcast({
        type: 'event_banner',
        category: 'warden_spawn',
        title: `SECTOR WARDEN DEPLOYED: ${distDef.wardenName}!`,
        subtitle: `Defeat the Warden in ${distDef.name} to permanently unlock ${distDef.unlockName}!`,
        color: distDef.color
      });
    }
  } else if (activityType === 'warden_kill') {
    loop.stage = 0;
    loop.progress = 0;
    loop.tier = (loop.tier || 0) + 1;
    const firstUnlock = !loop.unlocked;
    loop.unlocked = true;
    player.derived = getDerivedStats(agent);
    awardSkillXp(instance, player, 'vigilante', 140, `Sector Loop Mastery (${distDef.name})`);
    agent.decryptionKeys = (agent.decryptionKeys || 0) + 1;

    instance.broadcast({
      type: 'event_banner',
      category: 'loop_unlock',
      title: `${agent.callsign} Unlocked ${distDef.unlockName}! (Loop Tier ${loop.tier})`,
      subtitle: firstUnlock ? distDef.unlockDesc : `Loop Mastery Tier ${loop.tier}: +25% Bonus Vigilante & Sector Power!`,
      color: distDef.color
    });
    instance.sendTo(player.clientId, {
      type: 'agent_sync',
      agent: player.agent,
      derived: player.derived
    });
    checkStoryProgression(instance, player);
  }
  persistence.scheduleSave();
}

/**
 * Apply Gravity Gauntlet Singularity Pull on Grapple or Melee Slam
 */
function applyGravityGauntletSingularity(instance, player, centerX, centerY) {
  if (!player.agent.relics?.includes('gravity_gauntlet')) return;
  const pullRadius = 190;
  const pullDmg = Math.round(player.derived.meleeDamage * 0.45);
  let pulledCount = 0;

  for (const e of [...instance.enemies]) {
    const d = dist2D(centerX, centerY, e.x, e.y);
    if (d <= pullRadius) {
      e.x = Math.round(centerX + (e.x - centerX) * 0.25);
      e.y = Math.round(centerY + (e.y - centerY) * 0.25);
      e.hp -= pullDmg;
      pulledCount++;
      if (e.hp <= 0) {
        resolveEnemyDefeat(instance, e, player, 'gravity_singularity');
      }
    }
  }
  if (pulledCount > 0) {
    instance.effects.push({
      id: crypto.randomUUID().slice(0, 8),
      type: 'chrono_rewind',
      x: centerX,
      y: centerY,
      radius: pullRadius,
      color: '#b5179e',
      createdAt: Date.now()
    });
  }
}

/**
 * Spawn a Rare, High-Stakes Server-Wide Omega Bounty
 */
function spawnOmegaBounty(instance, forcedTemplateIdx = null) {
  if (instance.activeBounty) return instance.activeBounty;
  const idx =
    forcedTemplateIdx !== null
      ? forcedTemplateIdx % OMEGA_BOUNTIES.length
      : Math.floor(Math.random() * OMEGA_BOUNTIES.length);
  const tpl = OMEGA_BOUNTIES[idx];

  instance.activeBounty = {
    id: `omega_${Date.now()}`,
    templateId: tpl.id,
    name: tpl.name,
    title: tpl.title,
    x: tpl.startX,
    y: tpl.startY,
    z: 0,
    extractX: tpl.extractX,
    extractY: tpl.extractY,
    hp: tpl.hp,
    maxHp: tpl.hp,
    baseSpeed: tpl.speed,
    rewardTokens: tpl.rewardTokens,
    rewardXp: tpl.rewardXp,
    tip: tpl.tip,
    truthTransmission: tpl.truthTransmission,
    ticksRemaining: 20 * 90,
    lastHitBodyPart: 'torso',
    state: 'running',
    stateTicks: 0,
    debuffs: {
      blindedUntil: 0,
      armorCrackedUntil: 0,
      disarmedUntil: 0,
      crippledUntil: 0,
      severeCrippleUntil: 0
    },
    contributors: new Set()
  };

  instance.broadcast({
    type: 'event_banner',
    category: 'omega_bounty',
    title: `🚨 OMEGA PRIORITY BOUNTY: ${tpl.name}`,
    subtitle: `${tpl.tip}`,
    color: '#ffbe0b'
  });

  return instance.activeBounty;
}

/**
 * Resolve Ranged Attack with Body-Part Targeting
 */
function handleRangedAttack(instance, player, msg) {
  const now = Date.now();
  const bodyPartId = BODY_PARTS[msg.bodyPart] ? msg.bodyPart : 'torso';
  const part = BODY_PARTS[bodyPartId];
  const targetX = Number(msg.targetX ?? player.x + 100);
  const targetY = Number(msg.targetY ?? player.y);
  const targetId = msg.targetId || null;

  player.agent.secretTelemetry.totalRangedShots =
    (player.agent.secretTelemetry.totalRangedShots || 0) + 1;
  if (player.z > 25) {
    player.agent.secretTelemetry.airborneCombatTicks =
      (player.agent.secretTelemetry.airborneCombatTicks || 0) + 2;
  }

  let hitTarget = null;
  let targetKind = 'enemy';

  if (
    instance.activeBounty &&
    (targetId === instance.activeBounty.id || dist2D(targetX, targetY, instance.activeBounty.x, instance.activeBounty.y) < 95)
  ) {
    hitTarget = instance.activeBounty;
    targetKind = 'bounty';
  } else if (
    instance.eclipseBoss &&
    (targetId === instance.eclipseBoss.id || dist2D(targetX, targetY, instance.eclipseBoss.x, instance.eclipseBoss.y) < 120)
  ) {
    hitTarget = instance.eclipseBoss;
    targetKind = 'eclipse_boss';
  } else {
    let bestDist = 110;
    for (const e of instance.enemies) {
      const d = targetId === e.id ? 0 : dist2D(targetX, targetY, e.x, e.y);
      if (d < bestDist) {
        bestDist = d;
        hitTarget = e;
        targetKind = 'enemy';
      }
    }
    if (!hitTarget) {
      for (const s of instance.sabotageNodes) {
        if (s.active && dist2D(targetX, targetY, s.x, s.y) < 85) {
          hitTarget = s;
          targetKind = 'sabotage';
          break;
        }
      }
    }
  }

  instance.effects.push({
    id: crypto.randomUUID().slice(0, 8),
    type: 'laser_shot',
    fromX: player.x,
    fromY: player.y,
    fromZ: player.z,
    toX: hitTarget ? hitTarget.x : targetX,
    toY: hitTarget ? hitTarget.y : targetY,
    bodyPart: bodyPartId,
    color: player.agent.districtLoops?.foundry_slums?.unlocked ? '#00f5d4' : '#3a86ff',
    createdAt: now
  });

  if (!hitTarget) return;

  if (targetKind === 'sabotage') {
    const dmg = player.derived.rangedDamage;
    hitTarget.hp -= dmg;
    awardSkillXp(instance, player, 'shooting', 8, 'Sabotage Precision');
    if (hitTarget.hp <= 0) {
      hitTarget.active = false;
      hitTarget.respawnTick = instance.tickCount + 20 * 25;
      recordDistrictActivity(instance, player, hitTarget.district, 'sabotage');
      instance.effects.push({
        id: crypto.randomUUID().slice(0, 8),
        type: 'explosion',
        x: hitTarget.x,
        y: hitTarget.y,
        radius: 90,
        color: '#00f5d4',
        createdAt: now
      });
    }
    return;
  }

  const nodes = new Set(player.agent.unlockedNodes || []);
  const relics = new Set(player.agent.relics || []);
  const mutations = new Set(player.agent.secretTelemetry?.activeMutations || []);

  // Optic Calibrator (`phantom_1`): +15% Hit Accuracy specifically when targeting HEAD or ARMS
  const opticBonus = nodes.has('phantom_1') && (bodyPartId === 'head' || bodyPartId === 'arms') ? 0.15 : 0;
  const effectiveHitChance = clamp(part.baseHitChance + player.derived.accuracyBonus + opticBonus, 0.25, 0.99);
  const roll = msg.guaranteedHit ? 0.01 : Math.random();
  const isHit = roll <= effectiveHitChance;

  if (!isHit) {
    instance.sendTo(player.clientId, {
      type: 'combat_feedback',
      x: hitTarget.x,
      y: hitTarget.y,
      text: `MISSED ${part.name.split(' ')[0]}!`,
      color: '#adb5bd'
    });
    return;
  }

  let dmg = player.derived.rangedDamage * part.damageMultiplier;
  if (nodes.has('phantom_4')) dmg *= 1.45;
  if (relics.has('vance_decryptor')) dmg *= 1.18;
  if (player.z > 25 && nodes.has('valkyrie_4')) dmg *= 1.4;
  if (player.z > 25 && mutations.has('hollow_frame')) dmg *= 1.15;
  if (hasSquadUplinkBuff(instance, player)) dmg *= 1.15;
  if (hitTarget.debuffs?.armorCrackedUntil > now) dmg *= 1.25;
  if ((targetKind === 'bounty' || hitTarget.isWarden || targetKind === 'eclipse_boss') && nodes.has('vanguard_3')) {
    dmg *= 1.35;
  }

  dmg = Math.round(dmg);
  hitTarget.hp -= dmg;
  hitTarget.lastHitBodyPart = bodyPartId;

  const debuffDurationMult = mutations.has('surgical_coldness') ? 1.3 : 1.0;
  const dur = Math.round(part.debuffDuration * debuffDurationMult);
  if (hitTarget.debuffs) {
    if (bodyPartId === 'head') {
      hitTarget.debuffs.blindedUntil = now + dur;
      if (hitTarget.state === 'counter_stance' || hitTarget.state === 'windup') {
        hitTarget.state = 'stunned';
        hitTarget.stateTicks = 50;
      }
    } else if (bodyPartId === 'torso') {
      hitTarget.debuffs.armorCrackedUntil = now + dur;
    } else if (bodyPartId === 'arms') {
      hitTarget.debuffs.disarmedUntil = now + dur;
      player.agent.secretTelemetry.limbCrippleShots =
        (player.agent.secretTelemetry.limbCrippleShots || 0) + 1;
    } else if (bodyPartId === 'legs') {
      const legDur = nodes.has('phantom_2') ? Math.max(8000, dur) : dur;
      hitTarget.debuffs.crippledUntil = now + legDur;
      if (nodes.has('phantom_2')) {
        hitTarget.debuffs.severeCrippleUntil = now + legDur; // 85% speed snare!
      }
      player.agent.secretTelemetry.limbCrippleShots =
        (player.agent.secretTelemetry.limbCrippleShots || 0) + 1;
    }
  }

  awardSkillXp(instance, player, 'shooting', bodyPartId === 'head' ? 16 : 12, `${part.name} Hit`);
  if (player.z > 25) {
    awardSkillXp(instance, player, 'flying', 8, 'Airborne Marksmanship');
  }

  instance.sendTo(player.clientId, {
    type: 'combat_feedback',
    x: hitTarget.x,
    y: hitTarget.y,
    text: `${part.name.split(' ')[0]} -${dmg} [${part.debuff.toUpperCase()}]`,
    color: bodyPartId === 'head' ? '#ffbe0b' : bodyPartId === 'legs' ? '#00f5d4' : '#3a86ff'
  });

  if (targetKind === 'bounty') {
    hitTarget.contributors.add(player.clientId);
    if (hitTarget.hp <= 0) {
      resolveBountyDefeat(instance, hitTarget, player, bodyPartId);
    }
  } else if (targetKind === 'eclipse_boss') {
    if (hitTarget.hp <= 0) {
      resolveEclipseBossDefeat(instance, player);
    }
  } else if (hitTarget.hp <= 0) {
    resolveEnemyDefeat(instance, hitTarget, player, 'shooting');
  }

  evaluateSecretMutations(instance, player);
}

/**
 * Resolve Melee Strike & Timed Melee Counter System
 */
function handleMeleeAction(instance, player, msg) {
  const now = Date.now();
  const isCounterAttempt = msg.action === 'melee_counter';
  const nodes = new Set(player.agent.unlockedNodes || []);
  const strLv = player.derived.strLv;
  const vigLv = player.derived.vigLv;

  const range = isCounterAttempt ? 160 : 125;
  let target = null;
  let targetKind = 'enemy';
  let bestDist = range;

  for (const e of instance.enemies) {
    const d = dist2D(player.x, player.y, e.x, e.y);
    if (d < bestDist) {
      bestDist = d;
      target = e;
      targetKind = 'enemy';
    }
  }
  if (instance.activeBounty) {
    const d = dist2D(player.x, player.y, instance.activeBounty.x, instance.activeBounty.y);
    if (d < bestDist) {
      bestDist = d;
      target = instance.activeBounty;
      targetKind = 'bounty';
    }
  }
  if (instance.eclipseBoss) {
    const d = dist2D(player.x, player.y, instance.eclipseBoss.x, instance.eclipseBoss.y);
    if (d < bestDist + 40) {
      bestDist = d;
      target = instance.eclipseBoss;
      targetKind = 'eclipse_boss';
    }
  }

  if (isCounterAttempt) {
    // Vigilante skill widens the player's timed counter window!
    player.counterWindowUntil = now + 700 + vigLv * 120;
    if (!target) {
      instance.sendTo(player.clientId, {
        type: 'combat_feedback',
        x: player.x,
        y: player.y,
        text: 'COUNTER STANCE READY',
        color: '#00f5d4'
      });
      return;
    }

    const isPerfectCounter =
      target.state === 'windup' || target.state === 'counter_stance' || msg.forcePerfectCounter;
    const counterMult = (isPerfectCounter ? 1.85 + strLv * 0.25 : 1.15) * (hasSquadUplinkBuff(instance, player) ? 1.15 : 1.0);
    const counterDmg = Math.round(player.derived.meleeDamage * counterMult);

    target.hp -= counterDmg;
    target.state = 'stunned';
    target.stateTicks = 60 + strLv * 10;
    if (target.debuffs && strLv >= 3) {
      target.debuffs.disarmedUntil = now + 7000;
      target.debuffs.armorCrackedUntil = now + 7000;
    }

    if (strLv >= 3 || nodes.has('titan_2')) {
      const shockRadius = nodes.has('titan_2') ? 160 : 120;
      for (const other of [...instance.enemies]) {
        if (other.id !== target.id && dist2D(player.x, player.y, other.x, other.y) <= shockRadius) {
          other.hp -= Math.round(counterDmg * 0.6);
          other.state = 'stunned';
          other.stateTicks = 45;
          if (other.hp <= 0) {
            resolveEnemyDefeat(instance, other, player, 'melee_counter');
          }
        }
      }
      instance.effects.push({
        id: crypto.randomUUID().slice(0, 8),
        type: 'counter_shockwave',
        x: player.x,
        y: player.y,
        radius: shockRadius,
        color: '#00f5d4',
        createdAt: now
      });
    }

    const tierLabel =
      strLv >= 5
        ? 'APEX OBLITERATION COUNTER!'
        : strLv >= 3
        ? 'SEISMIC DISARM COUNTER!'
        : 'KINETIC PARRY!';

    awardSkillXp(instance, player, 'strength', isPerfectCounter ? 24 : 12, tierLabel);
    awardSkillXp(instance, player, 'agility', 10, 'Reflex Counter');

    instance.sendTo(player.clientId, {
      type: 'combat_feedback',
      x: target.x,
      y: target.y,
      text: `${tierLabel} -${counterDmg}`,
      color: '#00f5d4'
    });

    if (targetKind === 'bounty') {
      target.contributors.add(player.clientId);
      if (target.hp <= 0) resolveBountyDefeat(instance, target, player, 'counter');
    } else if (targetKind === 'eclipse_boss') {
      if (target.hp <= 0) resolveEclipseBossDefeat(instance, player);
    } else if (target.hp <= 0) {
      resolveEnemyDefeat(instance, target, player, 'melee_counter');
    }
    return;
  }

  const isMeteorSlam = player.z > 30 && (nodes.has('titan_4') || player.agent.relics?.includes('gravity_gauntlet'));
  if (isMeteorSlam) {
    player.z = 0;
    player.vz = 0;
    applyGravityGauntletSingularity(instance, player, player.x, player.y);
    instance.effects.push({
      id: crypto.randomUUID().slice(0, 8),
      type: 'explosion',
      x: player.x,
      y: player.y,
      radius: 150,
      color: '#ff4d6d',
      createdAt: now
    });
  }

  if (!target) return;

  if (target.state === 'counter_stance' && !isMeteorSlam) {
    const reflectDmg = Math.round((target.baseDamage || 18) * 1.25);
    player.hp = Math.max(10, player.hp - reflectDmg);
    player.agent.secretTelemetry.meleeHitsTaken =
      (player.agent.secretTelemetry.meleeHitsTaken || 0) + 1;
    instance.sendTo(player.clientId, {
      type: 'combat_feedback',
      x: player.x,
      y: player.y,
      text: `ENEMY COUNTERED YOU! -${reflectDmg} HP (Use Q to Counter-Parry!)`,
      color: '#ff4d6d'
    });
    return;
  }

  let dmg = player.derived.meleeDamage * (isMeteorSlam ? 2.6 : 1.0);
  if (hasSquadUplinkBuff(instance, player)) dmg *= 1.15;
  if (nodes.has('titan_1') && target.debuffs) {
    target.debuffs.armorCrackedUntil = now + 5000;
  }
  dmg = Math.round(dmg);
  target.hp -= dmg;

  awardSkillXp(instance, player, 'strength', isMeteorSlam ? 22 : 14, 'Melee Combat');

  instance.sendTo(player.clientId, {
    type: 'combat_feedback',
    x: target.x,
    y: target.y,
    text: `${isMeteorSlam ? 'COLOSSUS SLAM' : 'MELEE STRIKE'} -${dmg}`,
    color: '#ff4d6d'
  });

  if (targetKind === 'bounty') {
    target.contributors.add(player.clientId);
    if (target.hp <= 0) resolveBountyDefeat(instance, target, player, 'melee');
  } else if (targetKind === 'eclipse_boss') {
    if (target.hp <= 0) resolveEclipseBossDefeat(instance, player);
  } else if (target.hp <= 0) {
    resolveEnemyDefeat(instance, target, player, 'melee');
  }
}

/**
 * Resolve Explosive Ordnance Launch (E / Right-Click Explosive)
 */
function handleExplosiveLaunch(instance, player, msg) {
  const now = Date.now();
  const targetX = clamp(Number(msg.targetX ?? player.x + 120), 0, WORLD_WIDTH);
  const targetY = clamp(Number(msg.targetY ?? player.y), 0, WORLD_HEIGHT);
  const radius = player.derived.blastRadius;
  const squadMult = hasSquadUplinkBuff(instance, player) ? 1.15 : 1.0;
  const baseDmg = Math.round(player.derived.explosiveDamage * squadMult);
  const nodes = new Set(player.agent.unlockedNodes || []);

  player.agent.secretTelemetry.explosiveCollateralScore =
    (player.agent.secretTelemetry.explosiveCollateralScore || 0) + 18;

  instance.effects.push({
    id: crypto.randomUUID().slice(0, 8),
    type: 'explosion',
    x: targetX,
    y: targetY,
    radius,
    color: '#fb5607',
    createdAt: now
  });

  if (nodes.has('demo_1')) {
    for (let c = 0; c < 3; c++) {
      const angle = (Math.PI * 2 * c) / 3;
      instance.effects.push({
        id: crypto.randomUUID().slice(0, 8),
        type: 'explosion',
        x: Math.round(targetX + Math.cos(angle) * 65),
        y: Math.round(targetY + Math.sin(angle) * 65),
        radius: Math.round(radius * 0.55),
        color: '#ffbe0b',
        createdAt: now
      });
    }
  }

  let hits = 0;
  for (const e of [...instance.enemies]) {
    const d = dist2D(targetX, targetY, e.x, e.y);
    if (d <= radius) {
      const falloff = 1 - (d / radius) * 0.4;
      const dmg = Math.round(baseDmg * falloff * (nodes.has('demo_1') ? 1.25 : 1.0));
      e.hp -= dmg;
      hits++;
      if (e.hp <= 0) {
        resolveEnemyDefeat(instance, e, player, 'explosives');
      }
    }
  }

  for (const s of instance.sabotageNodes) {
    if (s.active && dist2D(targetX, targetY, s.x, s.y) <= radius) {
      s.hp -= baseDmg;
      hits++;
      if (s.hp <= 0) {
        s.active = false;
        s.respawnTick = instance.tickCount + 20 * 25;
        recordDistrictActivity(instance, player, s.district, 'sabotage');
      }
    }
  }

  if (instance.activeBounty && dist2D(targetX, targetY, instance.activeBounty.x, instance.activeBounty.y) <= radius) {
    const bDmg = Math.round(baseDmg * (nodes.has('demo_4') ? 1.35 : 1.0));
    instance.activeBounty.hp -= bDmg;
    instance.activeBounty.contributors.add(player.clientId);
    hits++;
    if (instance.activeBounty.hp <= 0) {
      resolveBountyDefeat(instance, instance.activeBounty, player, 'explosives');
    }
  }

  if (instance.eclipseBoss && dist2D(targetX, targetY, instance.eclipseBoss.x, instance.eclipseBoss.y) <= radius + 40) {
    instance.eclipseBoss.hp -= Math.round(baseDmg * (nodes.has('demo_4') ? 1.35 : 1.0));
    hits++;
    if (instance.eclipseBoss.hp <= 0) {
      resolveEclipseBossDefeat(instance, player);
    }
  }

  if (hits > 0) {
    awardSkillXp(instance, player, 'explosives', 14 + hits * 8, 'Explosive Detonation');
  }
  evaluateSecretMutations(instance, player);
}

function resolveEnemyDefeat(instance, enemy, killerPlayer, method) {
  const idx = instance.enemies.findIndex((e) => e.id === enemy.id);
  if (idx === -1) return;
  instance.enemies.splice(idx, 1);

  const nodes = new Set(killerPlayer.agent.unlockedNodes || []);
  if (nodes.has('valkyrie_4') && killerPlayer.z > 20) {
    killerPlayer.flightFuel = Math.min(
      killerPlayer.derived.maxFlightFuel,
      killerPlayer.flightFuel + killerPlayer.derived.maxFlightFuel * 0.35
    );
  }

  // Volatile Chain Reaction (demo_3) — safely resolves secondary kills
  if (method === 'explosives' && nodes.has('demo_3')) {
    for (const other of [...instance.enemies]) {
      if (dist2D(enemy.x, enemy.y, other.x, other.y) <= 130) {
        other.hp -= 90;
        if (other.hp <= 0) {
          resolveEnemyDefeat(instance, other, killerPlayer, 'chain_reaction');
        }
      }
    }
  }

  awardSkillXp(instance, killerPlayer, 'vigilante', enemy.isWarden ? 65 : 10, `Defeated ${enemy.name}`);
  recordDistrictActivity(
    instance,
    killerPlayer,
    enemy.district,
    enemy.isWarden ? 'warden_kill' : 'enemy_kill'
  );

  if (!enemy.isWarden) {
    setTimeout(() => {
      if (instance.enemies.length < 28) {
        instance._spawnDistrictEnemy(enemy.district, enemy.tier, false);
      }
    }, 6000);
  }
}

function resolveBountyDefeat(instance, bounty, finalPlayer, lastHitMethod) {
  instance.activeBounty = null;
  instance.bountyCooldownTicks = 20 * 60;

  const nonLethalCapture =
    lastHitMethod === 'legs' ||
    lastHitMethod === 'arms' ||
    bounty.lastHitBodyPart === 'legs' ||
    bounty.lastHitBodyPart === 'arms';

  for (const p of instance.players.values()) {
    if (bounty.contributors.has(p.clientId) || dist2D(p.x, p.y, bounty.x, bounty.y) < 800) {
      const vigBonusTokens = p.derived.vigLv >= 4 ? 1 : 0;
      p.agent.bountyTokens =
        (p.agent.bountyTokens || 0) + bounty.rewardTokens + (nonLethalCapture ? 1 : 0) + vigBonusTokens;
      p.agent.decryptionKeys = (p.agent.decryptionKeys || 0) + (nonLethalCapture ? 2 : 1);
      if (nonLethalCapture) {
        p.agent.secretTelemetry.conscienceActions =
          (p.agent.secretTelemetry.conscienceActions || 0) + 2;
      }
      if (!p.agent.unlockedLore.includes(bounty.truthTransmission)) {
        p.agent.unlockedLore.push(bounty.truthTransmission);
      }
      awardSkillXp(instance, p, 'vigilante', bounty.rewardXp, `Omega Bounty: ${bounty.name}`);
      evaluateSecretMutations(instance, p);
      checkStoryProgression(instance, p);
    }
  }

  instance.broadcast({
    type: 'event_banner',
    category: 'bounty_complete',
    title: `🏆 OMEGA BOUNTY ${nonLethalCapture ? 'CAPTURED ALIVE' : 'NEUTRALIZED'}: ${bounty.name}!`,
    subtitle: `${bounty.truthTransmission}`,
    color: '#00f5d4'
  });
  persistence.saveNow();
}

function resolveEclipseBossDefeat(instance, finalPlayer) {
  if (!instance.eclipseBoss) return;
  instance.eclipseBoss = null;

  for (const p of instance.players.values()) {
    p.agent.skillPoints = (p.agent.skillPoints || 0) + 3;
    p.agent.bountyTokens = (p.agent.bountyTokens || 0) + 5;
    awardSkillXp(instance, p, 'vigilante', 250, 'Defeated Director Vance (Protocol Eclipse)');
    if (
      !p.agent.unlockedLore.includes(
        'VICTORY LOG [FREE VERIDIA]: "Director Vance\'s Eclipse Dreadnought has fallen. Neo-Veridia belongs to its people once again!"'
      )
    ) {
      p.agent.unlockedLore.push(
        'VICTORY LOG [FREE VERIDIA]: "Director Vance\'s Eclipse Dreadnought has fallen. Neo-Veridia belongs to its people once again!"'
      );
    }
  }

  instance.broadcast({
    type: 'event_banner',
    category: 'raid_victory',
    title: `🌟 PROTOCOL ECLIPSE OVERTHROWN! DIRECTOR VANCE DEFEATED!`,
    subtitle: `Your squad liberated Neo-Veridia from Aegis tyranny! (+3 Skill Points & +5 Bounty Tokens to all Agents!)`,
    color: '#ffbe0b'
  });
  persistence.saveNow();
}

/**
 * Start or Join Live Multiplayer Cyber-Pet Derby Mini-Game
 */
function startPetDerby(instance, initiatorPlayer) {
  if (instance.petDerby && instance.petDerby.status === 'racing') return;

  const racers = [];
  for (const p of instance.players.values()) {
    const pet = p.agent.pet;
    const species = PET_SPECIES[pet.speciesId] || PET_SPECIES.volt_hound;
    const overclockBonus = p.agent.unlockedNodes?.includes('vanguard_2') ? 1.15 : 1.0;
    racers.push({
      id: p.clientId,
      isPlayer: true,
      ownerCallsign: p.agent.callsign,
      petName: pet.name,
      icon: species.icon,
      color: species.color,
      progress: 0,
      speedStat: pet.stats.speed * overclockBonus,
      staminaStat: pet.stats.stamina * overclockBonus,
      witStat: pet.stats.wit * overclockBonus,
      cheerBoosts: 0
    });
  }

  const aiRivals = [
    { ownerCallsign: 'Kaelen_Voss', petName: 'Spark-Fang', icon: '🐕‍🦺', color: '#00f5d4', speedStat: 15, staminaStat: 13, witStat: 12 },
    { ownerCallsign: 'Nyx_Cipher', petName: 'Chrono-Claw', icon: '🐈‍⬛', color: '#b5179e', speedStat: 16, staminaStat: 12, witStat: 15 },
    { ownerCallsign: 'Jax_Torque', petName: 'Cinder-Shell', icon: '🪲', color: '#fb5607', speedStat: 13, staminaStat: 17, witStat: 11 }
  ];
  while (racers.length < 4) {
    const r = aiRivals[racers.length - 1] || aiRivals[0];
    racers.push({
      id: `ai_${racers.length}`,
      isPlayer: false,
      ...r,
      progress: 0,
      cheerBoosts: 0
    });
  }

  instance.petDerby = {
    id: `derby_${Date.now()}`,
    status: 'racing',
    ticksElapsed: 0,
    racers,
    winner: null
  };

  instance.broadcast({
    type: 'pet_derby_update',
    derby: instance.petDerby,
    announcement: `${initiatorPlayer.agent.callsign} launched a Live Multiplayer NEON PET DERBY! Press [CHEER BOOST] in the Pet Arena tab!`
  });
}

/**
 * Instant Competitive Pet Clash (1v1 / Arena Showdown)
 */
function runPetClash(instance, challengerPlayer, targetOwnerCallsign = null) {
  const myPet = challengerPlayer.agent.pet;
  const mySpecies = PET_SPECIES[myPet.speciesId] || PET_SPECIES.volt_hound;
  const myMult = challengerPlayer.agent.unlockedNodes?.includes('vanguard_2') ? 1.15 : 1.0;

  let opponent = null;
  for (const p of instance.players.values()) {
    if (
      p.clientId !== challengerPlayer.clientId &&
      (!targetOwnerCallsign || p.agent.callsign.toLowerCase() === targetOwnerCallsign.toLowerCase())
    ) {
      opponent = {
        ownerCallsign: p.agent.callsign,
        petName: p.agent.pet.name,
        speciesId: p.agent.pet.speciesId,
        stats: p.agent.pet.stats
      };
      break;
    }
  }
  if (!opponent) {
    opponent = {
      ownerCallsign: 'Aegis_Champion',
      petName: 'Apex Volt-Hound',
      speciesId: 'volt_hound',
      stats: { speed: 15, ferocity: 15, wit: 14, stamina: 14 }
    };
  }

  const myScore =
    (myPet.stats.ferocity * 1.6 + myPet.stats.speed * 1.2 + myPet.stats.wit * 1.4 + myPet.stats.stamina * 1.2) *
      myMult +
    Math.random() * 12;
  const oppScore =
    opponent.stats.ferocity * 1.6 +
    opponent.stats.speed * 1.2 +
    opponent.stats.wit * 1.4 +
    opponent.stats.stamina * 1.2 +
    Math.random() * 10;

  const won = myScore >= oppScore;
  if (won) {
    myPet.wins = (myPet.wins || 0) + 1;
    myPet.xp = (myPet.xp || 0) + 50;
    if (myPet.xp >= myPet.level * 80) {
      myPet.level += 1;
      myPet.stats.speed += 2;
      myPet.stats.ferocity += 2;
      myPet.stats.wit += 2;
      myPet.stats.stamina += 2;
    }
    challengerPlayer.agent.secretTelemetry.conscienceActions =
      (challengerPlayer.agent.secretTelemetry.conscienceActions || 0) + 1;
    awardSkillXp(instance, challengerPlayer, 'vigilante', 35, 'Cyber-Pet Arena Victory');
  } else {
    myPet.xp = (myPet.xp || 0) + 20;
  }

  persistence.updatePetLeaderboard(challengerPlayer.agent);
  evaluateSecretMutations(instance, challengerPlayer);

  instance.broadcast({
    type: 'pet_clash_result',
    winnerCallsign: won ? challengerPlayer.agent.callsign : opponent.ownerCallsign,
    challenger: {
      ownerCallsign: challengerPlayer.agent.callsign,
      petName: myPet.name,
      icon: mySpecies.icon,
      score: Math.round(myScore)
    },
    defender: {
      ownerCallsign: opponent.ownerCallsign,
      petName: opponent.petName,
      icon: (PET_SPECIES[opponent.speciesId] || PET_SPECIES.volt_hound).icon,
      score: Math.round(oppScore)
    },
    leaderboard: persistence.petLeaderboard
  });
}

/**
 * HTTP Server + Static File & API Router
 */
const httpServer = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        status: 'ok',
        game: 'CRACKUP: Protocol Eclipse',
        uptime: Math.round(process.uptime()),
        shareable: getShareableUrls(req.headers.host),
        instances: Array.from(instances.values()).map((i) => ({
          id: i.id,
          playersOnline: i.players.size,
          maxPlayers: MAX_PLAYERS_PER_INSTANCE,
          activeBounty: i.activeBounty ? i.activeBounty.name : null
        }))
      })
    );
    return;
  }

  if (pathname === '/api/invite-info') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(getShareableUrls(req.headers.host)));
    return;
  }

  if (pathname === '/api/metadata') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        skills: SKILLS,
        classes: CLASSES,
        skillTree: SKILL_TREE,
        bodyParts: BODY_PARTS,
        secretMutations: SECRET_MUTATIONS,
        districts: DISTRICTS,
        buildings: BUILDINGS,
        relics: PROTOTYPE_RELICS,
        petSpecies: PET_SPECIES,
        storyActs: STORY_ACTS,
        leaderboard: persistence.petLeaderboard
      })
    );
    return;
  }

  if (pathname === '/api/prd') {
    if (fs.existsSync(PRD_PATH)) {
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      res.end(fs.readFileSync(PRD_PATH, 'utf8'));
    } else {
      res.writeHead(404);
      res.end('PRD not found');
    }
    return;
  }

  let safePath = path.normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[\/\\])+/, '');
  const fullPath = path.join(PUBLIC_DIR, safePath);

  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(fullPath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

/**
 * WebSocket Server & Real-Time Message Handlers
 */
const wss = new WebSocketServer(httpServer);

wss.on('connection', (ws, req) => {
  let boundInstance = null;
  let boundPlayer = null;

  ws.on('message', (rawText) => {
    let msg;
    try {
      msg = JSON.parse(rawText);
    } catch (_) {
      return;
    }

    if (msg.type === 'login') {
      const auth = persistence.authenticateOrCreate(
        msg.callsign,
        msg.pin || '0000',
        msg.classId || 'titan',
        msg.petSpeciesId || 'volt_hound'
      );
      if (auth.error) {
        ws.send(JSON.stringify({ type: 'login_error', error: auth.error }));
        return;
      }

      boundInstance = getAvailableInstance();
      const derived = getDerivedStats(auth.agent);

      boundPlayer = {
        clientId: ws.id,
        ws,
        agent: auth.agent,
        derived,
        x: 720 + Math.round((Math.random() - 0.5) * 160),
        y: 620 + Math.round((Math.random() - 0.5) * 160),
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        hp: derived.maxHp,
        flightFuel: derived.maxFlightFuel,
        isFlying: false,
        vehicleId: null,
        selectedBodyPart: 'torso',
        counterWindowUntil: 0,
        invulnerableUntil: 0,
        lastPetTrainAt: 0,
        historyBuffer: []
      };

      boundInstance.players.set(ws.id, boundPlayer);

      ws.send(
        JSON.stringify({
          type: 'login_success',
          clientId: ws.id,
          instanceId: boundInstance.id,
          isNewAgent: auth.isNew,
          agent: auth.agent,
          derived,
          shareable: getShareableUrls(req?.headers?.host),
          world: {
            width: WORLD_WIDTH,
            height: WORLD_HEIGHT,
            districts: DISTRICTS,
            buildings: BUILDINGS,
            orbs: boundInstance.orbs,
            skills: SKILLS,
            classes: CLASSES,
            skillTree: SKILL_TREE,
            bodyParts: BODY_PARTS,
            secretMutations: SECRET_MUTATIONS,
            relics: PROTOTYPE_RELICS,
            petSpecies: PET_SPECIES,
            storyActs: STORY_ACTS,
            leaderboard: persistence.petLeaderboard
          }
        })
      );

      boundInstance.broadcast({
        type: 'squad_notice',
        text: `Agent ${auth.agent.callsign} [${CLASSES[auth.agent.classId]?.name || 'Agent'}] deployed into ${boundInstance.id} (${boundInstance.players.size}/${MAX_PLAYERS_PER_INSTANCE} Agents).`
      });
      return;
    }

    if (!boundPlayer || !boundInstance) return;
    const now = Date.now();

    switch (msg.type) {
      case 'move_input': {
        const dx = clamp(Number(msg.dx || 0), -1, 1);
        const dy = clamp(Number(msg.dy || 0), -1, 1);
        let speed = boundPlayer.derived.moveSpeed;

        if (boundPlayer.vehicleId) {
          speed = 7.2 + boundPlayer.derived.drvLv * 1.3;
        } else if (boundPlayer.isFlying && boundPlayer.flightFuel > 0) {
          speed *= 1.28;
        }

        boundPlayer.vx = dx * speed;
        boundPlayer.vy = dy * speed;
        boundPlayer.x = clamp(boundPlayer.x + boundPlayer.vx, 40, WORLD_WIDTH - 40);
        boundPlayer.y = clamp(boundPlayer.y + boundPlayer.vy, 40, WORLD_HEIGHT - 40);

        if (msg.selectedBodyPart && BODY_PARTS[msg.selectedBodyPart]) {
          boundPlayer.selectedBodyPart = msg.selectedBodyPart;
        }

        if (boundPlayer.vehicleId) {
          const v = boundInstance.vehicles.find((veh) => veh.id === boundPlayer.vehicleId);
          if (v) {
            v.x = boundPlayer.x;
            v.y = boundPlayer.y;
            if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
              v.angle = Math.atan2(dy, dx);
              if (boundInstance.tickCount % 15 === 0) {
                awardSkillXp(boundInstance, boundPlayer, 'driving', 5, 'High-Speed Pursuit');
              }
              for (const e of [...boundInstance.enemies]) {
                if (dist2D(v.x, v.y, e.x, e.y) < 65) {
                  const ramMult = boundPlayer.agent.unlockedNodes?.includes('demo_2') ? 2.5 : 1.4;
                  const ramDmg = Math.round((30 + boundPlayer.derived.drvLv * 18) * ramMult);
                  e.hp -= ramDmg;
                  awardSkillXp(boundInstance, boundPlayer, 'driving', 16, 'Vehicular Ram');
                  if (e.hp <= 0) {
                    resolveEnemyDefeat(boundInstance, e, boundPlayer, 'driving');
                  }
                }
              }
            }
          }
        }
        break;
      }

      case 'jump': {
        boundPlayer.vz = boundPlayer.derived.jumpPower;
        boundPlayer.z = Math.min(240, boundPlayer.z + boundPlayer.derived.jumpPower * 3.2);
        awardSkillXp(boundInstance, boundPlayer, 'agility', 4, 'Vertical Parkour');
        break;
      }

      case 'dodge': {
        const angle = Number(msg.angle || 0);
        const dashDist = 95 + boundPlayer.derived.agiLv * 18;
        boundPlayer.x = clamp(boundPlayer.x + Math.cos(angle) * dashDist, 40, WORLD_WIDTH - 40);
        boundPlayer.y = clamp(boundPlayer.y + Math.sin(angle) * dashDist, 40, WORLD_HEIGHT - 40);
        boundPlayer.invulnerableUntil = now + (boundPlayer.agent.unlockedNodes?.includes('valkyrie_1') ? 1000 : 450);

        if (boundPlayer.agent.unlockedNodes?.includes('valkyrie_1')) {
          for (const e of [...boundInstance.enemies]) {
            if (dist2D(boundPlayer.x, boundPlayer.y, e.x, e.y) < 110) {
              e.hp -= 28;
              if (e.hp <= 0) resolveEnemyDefeat(boundInstance, e, boundPlayer, 'agility');
            }
          }
        }
        awardSkillXp(boundInstance, boundPlayer, 'agility', 5, 'Agility Dodge');
        break;
      }

      case 'fly_toggle': {
        boundPlayer.isFlying = Boolean(msg.active);
        if (boundPlayer.isFlying && boundPlayer.flightFuel > 5) {
          const maxCeil = boundPlayer.agent.districtLoops?.helios_spire?.unlocked ? 240 : 175;
          boundPlayer.z = Math.min(maxCeil, boundPlayer.z + 28 + boundPlayer.derived.flyLv * 6);
          awardSkillXp(boundInstance, boundPlayer, 'flying', 6, 'Grav-Flight Ascent');
        }
        break;
      }

      case 'grapple': {
        const hasFullGrapple =
          boundPlayer.agent.districtLoops?.neon_docks?.unlocked ||
          boundPlayer.agent.relics?.includes('gravity_gauntlet') ||
          Boolean(msg.allowPreview);
        const maxRange = hasFullGrapple ? 1100 : 280;

        const rawTargetX = clamp(Number(msg.targetX ?? boundPlayer.x), 40, WORLD_WIDTH - 40);
        const rawTargetY = clamp(Number(msg.targetY ?? boundPlayer.y), 40, WORLD_HEIGHT - 40);
        const d = dist2D(boundPlayer.x, boundPlayer.y, rawTargetX, rawTargetY);

        let targetX = rawTargetX;
        let targetY = rawTargetY;
        if (d > maxRange && !msg.allowPreview) {
          const ang = Math.atan2(rawTargetY - boundPlayer.y, rawTargetX - boundPlayer.x);
          targetX = clamp(Math.round(boundPlayer.x + Math.cos(ang) * maxRange), 40, WORLD_WIDTH - 40);
          targetY = clamp(Math.round(boundPlayer.y + Math.sin(ang) * maxRange), 40, WORLD_HEIGHT - 40);
          if (!hasFullGrapple) {
            boundInstance.sendTo(boundPlayer.clientId, {
              type: 'combat_feedback',
              x: targetX,
              y: targetY,
              text: 'TETHER VAULT (Complete Sector 01 Loop for 1100m Grapple!)',
              color: '#00f5d4'
            });
          }
        }

        boundInstance.effects.push({
          id: crypto.randomUUID().slice(0, 8),
          type: 'grapple_line',
          fromX: boundPlayer.x,
          fromY: boundPlayer.y,
          toX: targetX,
          toY: targetY,
          color: '#00f5d4',
          createdAt: now
        });

        boundPlayer.x = targetX;
        boundPlayer.y = targetY;
        for (const b of BUILDINGS) {
          if (targetX >= b.x && targetX <= b.x + b.w && targetY >= b.y && targetY <= b.y + b.h) {
            boundPlayer.z = b.z;
            break;
          }
        }
        applyGravityGauntletSingularity(boundInstance, boundPlayer, targetX, targetY);
        awardSkillXp(boundInstance, boundPlayer, 'agility', 8, hasFullGrapple ? 'Grapple Slingshot' : 'Tether Vault');
        break;
      }

      case 'toggle_vehicle': {
        if (boundPlayer.vehicleId) {
          const v = boundInstance.vehicles.find((veh) => veh.id === boundPlayer.vehicleId);
          if (v) v.driverId = null;
          boundPlayer.vehicleId = null;
        } else {
          let chosen = boundInstance.vehicles.find(
            (veh) => !veh.driverId && dist2D(boundPlayer.x, boundPlayer.y, veh.x, veh.y) < 180
          );
          if (!chosen) {
            chosen = boundInstance.vehicles.find((veh) => !veh.driverId);
            if (chosen) {
              chosen.x = boundPlayer.x;
              chosen.y = boundPlayer.y;
            }
          }
          if (chosen) {
            chosen.driverId = boundPlayer.clientId;
            chosen.tier = boundPlayer.derived.drvLv >= 5 ? 3 : boundPlayer.derived.drvLv >= 3 ? 2 : 1;
            chosen.name =
              chosen.tier === 3
                ? 'Apex Grav-Tank'
                : chosen.tier === 2
                ? 'Armored Enforcer'
                : 'Agency Interceptor';
            boundPlayer.vehicleId = chosen.id;
            boundPlayer.z = 0;
          }
        }
        break;
      }

      case 'shoot': {
        handleRangedAttack(boundInstance, boundPlayer, msg);
        break;
      }

      case 'melee': {
        handleMeleeAction(boundInstance, boundPlayer, msg);
        break;
      }

      case 'launch_explosive': {
        handleExplosiveLaunch(boundInstance, boundPlayer, msg);
        break;
      }

      case 'unlock_skill_node': {
        const node = SKILL_TREE.find((n) => n.id === msg.nodeId);
        if (!node) break;
        const unlocked = boundPlayer.agent.unlockedNodes || [];
        if (unlocked.includes(node.id)) break;
        if (node.requires && !unlocked.includes(node.requires)) {
          boundInstance.sendTo(boundPlayer.clientId, {
            type: 'notification',
            color: '#ff4d6d',
            text: 'Unlock prerequisite Skill Tree node first!'
          });
          break;
        }
        if ((boundPlayer.agent.skillPoints || 0) < node.cost) {
          boundInstance.sendTo(boundPlayer.clientId, {
            type: 'notification',
            color: '#ff4d6d',
            text: `Requires ${node.cost} Skill Points (You have ${boundPlayer.agent.skillPoints || 0} SP).`
          });
          break;
        }
        boundPlayer.agent.skillPoints -= node.cost;
        unlocked.push(node.id);
        boundPlayer.agent.unlockedNodes = unlocked;
        boundPlayer.derived = getDerivedStats(boundPlayer.agent);
        boundPlayer.hp = boundPlayer.derived.maxHp;
        persistence.scheduleSave();

        boundInstance.sendTo(boundPlayer.clientId, {
          type: 'agent_sync',
          agent: boundPlayer.agent,
          derived: boundPlayer.derived
        });
        break;
      }

      case 'scan_relic': {
        const uncollected = PROTOTYPE_RELICS.filter(
          (r) => !(boundPlayer.agent.relics || []).includes(r.id)
        );
        if (uncollected.length === 0) {
          boundInstance.sendTo(boundPlayer.clientId, {
            type: 'relic_scan_result',
            allCollected: true,
            message: 'All 4 Prototype Relics recovered and active in your Relic Matrix!'
          });
          break;
        }
        const targetRelic = uncollected.find((r) => r.id === msg.relicId) || uncollected[0];
        const dist = Math.round(dist2D(boundPlayer.x, boundPlayer.y, targetRelic.x, targetRelic.y));
        const angle = Math.atan2(targetRelic.y - boundPlayer.y, targetRelic.x - boundPlayer.x);
        const dirs = ['EAST', 'SOUTHEAST', 'SOUTH', 'SOUTHWEST', 'WEST', 'NORTHWEST', 'NORTH', 'NORTHEAST'];
        const dirIdx = Math.round(((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;

        if (dist <= 180 || msg.claimNow) {
          boundPlayer.agent.relics = boundPlayer.agent.relics || [];
          boundPlayer.agent.relics.push(targetRelic.id);
          if (targetRelic.id === 'vance_decryptor') {
            boundPlayer.agent.decryptionKeys = (boundPlayer.agent.decryptionKeys || 0) + 2;
          }
          boundPlayer.derived = getDerivedStats(boundPlayer.agent);
          awardSkillXp(boundInstance, boundPlayer, 'vigilante', 90, `Relic Recovered: ${targetRelic.name}`);
          checkStoryProgression(boundInstance, boundPlayer);
          persistence.saveNow();

          boundInstance.broadcast({
            type: 'event_banner',
            category: 'relic_unlocked',
            title: `${targetRelic.icon} ${boundPlayer.agent.callsign} Recovered Prototype Relic: ${targetRelic.name}!`,
            subtitle: targetRelic.description,
            color: '#00f5d4'
          });
          boundInstance.sendTo(boundPlayer.clientId, {
            type: 'agent_sync',
            agent: boundPlayer.agent,
            derived: boundPlayer.derived
          });
        } else {
          boundInstance.sendTo(boundPlayer.clientId, {
            type: 'relic_scan_result',
            relic: targetRelic,
            distance: dist,
            direction: dirs[dirIdx],
            requiredElevation: targetRelic.z,
            message: `SIGNAL PING [${targetRelic.name}]: ${dist}m ${dirs[dirIdx]} (Target Elevation z=${targetRelic.z}m)`
          });
        }
        break;
      }

      case 'use_relic': {
        if (!(boundPlayer.agent.relics || []).includes('chrono_anchor')) {
          boundInstance.sendTo(boundPlayer.clientId, {
            type: 'notification',
            color: '#ffbe0b',
            text: 'Recover the Chrono-Shift Anchor Relic in Sector 01 first!'
          });
          break;
        }
        if (boundPlayer.historyBuffer.length > 0) {
          const snap = boundPlayer.historyBuffer[0];
          const maxHistoricalHp = Math.max(
            boundPlayer.hp,
            ...boundPlayer.historyBuffer.map((h) => h.hp)
          );
          boundPlayer.x = snap.x;
          boundPlayer.y = snap.y;
          boundPlayer.z = snap.z;
          boundPlayer.hp = Math.min(boundPlayer.derived.maxHp, maxHistoricalHp + 45);
          boundPlayer.flightFuel = boundPlayer.derived.maxFlightFuel;

          boundInstance.effects.push({
            id: crypto.randomUUID().slice(0, 8),
            type: 'chrono_rewind',
            x: boundPlayer.x,
            y: boundPlayer.y,
            radius: 130,
            color: '#00f5d4',
            createdAt: now
          });
          boundInstance.sendTo(boundPlayer.clientId, {
            type: 'combat_feedback',
            x: boundPlayer.x,
            y: boundPlayer.y,
            text: '⏳ CHRONO-SHIFT REWIND!',
            color: '#00f5d4'
          });
        }
        break;
      }

      case 'train_pet': {
        // Rate-limit pet training to prevent infinite packet-spam exploits
        if (now - (boundPlayer.lastPetTrainAt || 0) < 200) break;
        boundPlayer.lastPetTrainAt = now;

        const pet = boundPlayer.agent.pet;
        const stat = ['speed', 'ferocity', 'wit', 'stamina'].includes(msg.stat) ? msg.stat : 'speed';
        pet.stats[stat] = Math.min(99, (pet.stats[stat] || 10) + 2);
        pet.xp = (pet.xp || 0) + 30;
        if (pet.xp >= pet.level * 80) {
          pet.level = Math.min(20, pet.level + 1);
        }
        boundPlayer.agent.secretTelemetry.conscienceActions =
          (boundPlayer.agent.secretTelemetry.conscienceActions || 0) + 1;
        persistence.updatePetLeaderboard(boundPlayer.agent);
        evaluateSecretMutations(boundInstance, boundPlayer);
        boundInstance.sendTo(boundPlayer.clientId, {
          type: 'agent_sync',
          agent: boundPlayer.agent,
          derived: boundPlayer.derived,
          leaderboard: persistence.petLeaderboard
        });
        break;
      }

      case 'switch_pet': {
        if (PET_SPECIES[msg.speciesId]) {
          const sp = PET_SPECIES[msg.speciesId];
          const shortLabels = {
            volt_hound: 'Volt-Hound',
            razor_hawk: 'Razor-Hawk',
            phase_ferret: 'Phase-Ferret',
            magma_beetle: 'Magma-Beetle',
            chrono_cat: 'Chrono-Cat'
          };
          boundPlayer.agent.pet.speciesId = sp.id;
          boundPlayer.agent.pet.name =
            msg.customName || `${boundPlayer.agent.callsign}'s ${shortLabels[sp.id] || sp.name}`;
          boundPlayer.derived = getDerivedStats(boundPlayer.agent);
          persistence.updatePetLeaderboard(boundPlayer.agent);
          boundInstance.sendTo(boundPlayer.clientId, {
            type: 'agent_sync',
            agent: boundPlayer.agent,
            derived: boundPlayer.derived,
            leaderboard: persistence.petLeaderboard
          });
        }
        break;
      }

      case 'start_pet_derby': {
        startPetDerby(boundInstance, boundPlayer);
        break;
      }

      case 'cheer_pet_derby': {
        if (boundInstance.petDerby && boundInstance.petDerby.status === 'racing') {
          const racer = boundInstance.petDerby.racers.find((r) => r.id === boundPlayer.clientId);
          if (racer && racer.cheerBoosts < 5) {
            racer.cheerBoosts += 1;
            racer.progress = Math.min(1000, racer.progress + 55 + racer.witStat * 1.5);
          }
        }
        break;
      }

      case 'start_pet_clash': {
        runPetClash(boundInstance, boundPlayer, msg.targetOwnerCallsign);
        break;
      }

      case 'trigger_bounty': {
        spawnOmegaBounty(boundInstance, msg.templateIdx ?? null);
        break;
      }

      case 'trigger_eclipse_raid': {
        if (!boundInstance.eclipseBoss) {
          boundInstance.eclipseBoss = {
            id: 'boss_director_vance',
            name: 'DIRECTOR VANCE — ECLIPSE DREADNOUGHT',
            x: 2450,
            y: 2430,
            z: 40,
            hp: 2600,
            maxHp: 2600,
            speed: 2.8,
            baseDamage: 32,
            state: 'chase',
            stateTicks: 0,
            debuffs: {
              blindedUntil: 0,
              armorCrackedUntil: 0,
              disarmedUntil: 0,
              crippledUntil: 0,
              severeCrippleUntil: 0
            }
          };
          boundPlayer.agent.storyAct = 3;
          boundInstance.broadcast({
            type: 'event_banner',
            category: 'eclipse_raid',
            title: '⚠️ PROTOCOL ECLIPSE RAID: DIRECTOR VANCE ENGAGED!',
            subtitle: 'VANCE: "I built you Agents, and I will unmake you!" — Converge on Sector 04 Citadel Ziggurat!',
            color: '#f72585'
          });
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (boundInstance && boundPlayer) {
      if (boundPlayer.vehicleId) {
        const v = boundInstance.vehicles.find((veh) => veh.id === boundPlayer.vehicleId);
        if (v) v.driverId = null;
      }
      boundInstance.players.delete(ws.id);
      persistence.saveNow();
    }
  });
});

/**
 * Authoritative 20Hz (50ms) Server Game Loop
 */
setInterval(() => {
  const now = Date.now();

  for (const instance of instances.values()) {
    instance.tickCount++;

    // 1. Update Players, Elevation, Orbs Pickup, History Buffer & Pet Passive Assists
    for (const player of instance.players.values()) {
      if (instance.tickCount % 5 === 0) {
        player.historyBuffer.push({
          x: player.x,
          y: player.y,
          z: player.z,
          hp: player.hp
        });
        if (player.historyBuffer.length > 12) {
          player.historyBuffer.shift();
        }
      }

      let roofZ = 0;
      for (const b of BUILDINGS) {
        if (player.x >= b.x && player.x <= b.x + b.w && player.y >= b.y && player.y <= b.y + b.h) {
          if (player.z >= b.z - 28) {
            roofZ = Math.max(roofZ, b.z);
          }
        }
      }

      if (player.isFlying && player.flightFuel > 0) {
        const drain = player.agent.secretTelemetry?.activeMutations?.includes('hollow_frame') ? 0.45 : 0.65;
        player.flightFuel = Math.max(0, player.flightFuel - drain);
        if (player.flightFuel <= 0) player.isFlying = false;
      } else {
        if (player.z > roofZ) {
          player.z = Math.max(roofZ, player.z - 2.6);
        }
        const recharge = player.agent.districtLoops?.helios_spire?.unlocked ? 1.8 : 1.1;
        player.flightFuel = Math.min(player.derived.maxFlightFuel, player.flightFuel + recharge);
      }

      if (instance.tickCount % 20 === 0 && player.hp < player.derived.maxHp) {
        let regen = player.derived.hpRegenPerSec;
        if (hasSquadUplinkBuff(instance, player)) {
          regen += 4;
        }
        player.hp = Math.min(player.derived.maxHp, Math.round(player.hp + regen));
      }

      const petInterval = player.agent.unlockedNodes?.includes('vanguard_2') ? 35 : 65;
      if (instance.tickCount % petInterval === 0 && player.agent.pet?.speciesId === 'volt_hound') {
        for (const e of [...instance.enemies]) {
          if (dist2D(player.x, player.y, e.x, e.y) < 170) {
            e.hp -= 18;
            if (e.hp <= 0) resolveEnemyDefeat(instance, e, player, 'pet');
            break;
          }
        }
      }

      const collectedSet = new Set(player.agent.collectedOrbs || []);
      for (const orb of instance.orbs) {
        if (collectedSet.has(orb.id)) continue;
        const d2d = dist2D(player.x, player.y, orb.x, orb.y);
        const dz = Math.abs(player.z - orb.z);

        if (d2d <= player.derived.orbPickupRadius && dz <= 45) {
          player.agent.collectedOrbs.push(orb.id);
          collectedSet.add(orb.id);

          const xpMult =
            (player.agent.unlockedNodes?.includes('valkyrie_3') ? 1.2 : 1.0) *
            (player.agent.relics?.includes('orb_resonator') ? 1.3 : 1.0);
          const xpGain = Math.round(orb.xp * xpMult);

          if (orb.type === 'whisper') {
            for (const sk of Object.keys(SKILLS)) {
              awardSkillXp(instance, player, sk, Math.round(xpGain * 0.45), orb.name);
            }
            player.agent.decryptionKeys = (player.agent.decryptionKeys || 0) + 1;
            if (orb.loreLog && !player.agent.unlockedLore.includes(orb.loreLog)) {
              player.agent.unlockedLore.push(orb.loreLog);
            }
            checkStoryProgression(instance, player);
          } else {
            awardSkillXp(instance, player, 'agility', xpGain, orb.name);
            if (orb.type === 'renegade') {
              awardSkillXp(instance, player, 'flying', 35, 'Caught Renegade Orb');
            }
          }

          instance.sendTo(player.clientId, {
            type: 'orb_collected',
            orbId: orb.id,
            orbType: orb.type,
            orbName: orb.name,
            xpGain,
            loreLog: orb.loreLog || null,
            totalCollected: player.agent.collectedOrbs.length,
            totalOrbs: instance.orbs.length
          });
        }
      }
    }

    // 2. Update Dynamic Fleeing Renegade Orbs
    for (const orb of instance.orbs) {
      if (orb.type !== 'renegade') continue;
      let closestPlayer = null;
      let minDist = 220;
      for (const p of instance.players.values()) {
        if ((p.agent.collectedOrbs || []).includes(orb.id)) continue;
        const d = dist2D(p.x, p.y, orb.x, orb.y);
        if (d < minDist) {
          minDist = d;
          closestPlayer = p;
        }
      }
      if (closestPlayer) {
        const angle = Math.atan2(orb.y - closestPlayer.y, orb.x - closestPlayer.x);
        orb.x = clamp(Math.round(orb.x + Math.cos(angle) * 3.8), 100, WORLD_WIDTH - 100);
        orb.y = clamp(Math.round(orb.y + Math.sin(angle) * 3.8), 100, WORLD_HEIGHT - 100);
      } else {
        const t = instance.tickCount * 0.04;
        orb.x = Math.round(orb.originX + Math.cos(t) * 60);
        orb.y = Math.round(orb.originY + Math.sin(t) * 60);
      }
    }

    // 3. Respawn Sabotage Relays
    for (const s of instance.sabotageNodes) {
      if (!s.active && instance.tickCount >= s.respawnTick) {
        s.active = true;
        s.hp = s.maxHp;
      }
    }

    // 4. Update Enemies & Escalating Counter AI
    for (const e of instance.enemies) {
      if (e.state === 'stunned' || e.debuffs.blindedUntil > now) {
        e.stateTicks = Math.max(0, e.stateTicks - 1);
        if (e.stateTicks === 0 && e.debuffs.blindedUntil <= now) {
          e.state = 'patrol';
        }
        continue;
      }

      let nearestPlayer = null;
      let nearestDist = 420;
      for (const p of instance.players.values()) {
        const d = dist2D(e.x, e.y, p.x, p.y);
        if (d < nearestDist) {
          nearestDist = d;
          nearestPlayer = p;
        }
      }

      const speedMult =
        e.debuffs.severeCrippleUntil > now
          ? 0.15
          : e.debuffs.crippledUntil > now
          ? 0.3
          : 1.0;

      if (!nearestPlayer) {
        e.state = 'patrol';
        continue;
      }

      if (nearestDist > 95) {
        e.state = 'chase';
        const ang = Math.atan2(nearestPlayer.y - e.y, nearestPlayer.x - e.x);
        e.x = Math.round(e.x + Math.cos(ang) * e.speed * speedMult);
        e.y = Math.round(e.y + Math.sin(ang) * e.speed * speedMult);
      } else {
        e.stateTicks++;
        if (e.canCounter && e.stateTicks % 70 === 20) {
          e.state = 'counter_stance';
        } else if (e.stateTicks % 50 === 35) {
          e.state = 'windup';
        } else if (e.state === 'windup' && e.stateTicks % 50 === 48) {
          if (
            nearestPlayer.counterWindowUntil < now &&
            nearestPlayer.invulnerableUntil < now &&
            nearestPlayer.z < 35
          ) {
            const catParry =
              nearestPlayer.agent.pet?.speciesId === 'chrono_cat' && Math.random() < 0.15;
            if (!catParry) {
              let outDmg = e.baseDamage * (e.debuffs.disarmedUntil > now ? 0.5 : 1.0);
              if (nearestPlayer.agent.unlockedNodes?.includes('titan_3')) outDmg *= 0.75;
              if (nearestPlayer.agent.secretTelemetry?.activeMutations?.includes('hollow_frame')) {
                outDmg *= 1.2;
              }
              if (
                e.type === 'peacekeeper' &&
                nearestPlayer.agent.secretTelemetry?.activeMutations?.includes('ghost_conscience')
              ) {
                outDmg *= 1.15;
              }
              nearestPlayer.hp = Math.max(5, Math.round(nearestPlayer.hp - outDmg));
              nearestPlayer.agent.secretTelemetry.meleeHitsTaken =
                (nearestPlayer.agent.secretTelemetry.meleeHitsTaken || 0) + 1;
            }
          }
          e.state = 'chase';
        }
      }
    }

    // 5. Update Rare Omega Bounty Event (Includes Tendon Severance 85% slow & Vanguard Lockdown 25% slow)
    if (instance.activeBounty) {
      const b = instance.activeBounty;
      b.ticksRemaining--;
      if (b.ticksRemaining <= 0) {
        instance.broadcast({
          type: 'event_banner',
          category: 'bounty_escaped',
          title: `OMEGA BOUNTY ESCAPED: ${b.name}`,
          subtitle: 'Tip: Target LEGS (Key 4) next time to slow fleeing Bounties!',
          color: '#ff4d6d'
        });
        instance.activeBounty = null;
        instance.bountyCooldownTicks = 20 * 45;
      } else if (b.debuffs.blindedUntil <= now) {
        let spdMult =
          b.debuffs.severeCrippleUntil > now
            ? 0.15
            : b.debuffs.crippledUntil > now
            ? 0.3
            : 1.0;

        // Check if any player with Omega Bounty Lockdown (`vanguard_3`) is within 350px
        for (const p of instance.players.values()) {
          if (p.agent.unlockedNodes?.includes('vanguard_3') && dist2D(p.x, p.y, b.x, b.y) <= 350) {
            spdMult *= 0.75;
            break;
          }
        }

        const spd = b.baseSpeed * spdMult;
        const ang = Math.atan2(b.extractY - b.y, b.extractX - b.x);
        b.x = Math.round(b.x + Math.cos(ang) * spd);
        b.y = Math.round(b.y + Math.sin(ang) * spd);
        if (dist2D(b.x, b.y, b.extractX, b.extractY) < 45) {
          b.ticksRemaining = 0;
        }
      }
    } else if (instance.players.size > 0) {
      instance.bountyCooldownTicks--;
      if (instance.bountyCooldownTicks <= 0) {
        spawnOmegaBounty(instance);
      }
    }

    // 6. Update Final Raid Boss: Director Vance's Eclipse Dreadnought (`eclipseBoss`)
    if (instance.eclipseBoss) {
      const boss = instance.eclipseBoss;
      if (boss.debuffs.blindedUntil <= now) {
        let targetPlayer = null;
        let minDist = 1400;
        for (const p of instance.players.values()) {
          const d = dist2D(boss.x, boss.y, p.x, p.y);
          if (d < minDist) {
            minDist = d;
            targetPlayer = p;
          }
        }
        if (targetPlayer) {
          const bossSpdMult =
            boss.debuffs.severeCrippleUntil > now
              ? 0.15
              : boss.debuffs.crippledUntil > now
              ? 0.3
              : 1.0;
          if (minDist > 110) {
            boss.state = 'chase';
            const ang = Math.atan2(targetPlayer.y - boss.y, targetPlayer.x - boss.x);
            boss.x = Math.round(boss.x + Math.cos(ang) * (boss.speed || 2.8) * bossSpdMult);
            boss.y = Math.round(boss.y + Math.sin(ang) * (boss.speed || 2.8) * bossSpdMult);
          } else {
            boss.stateTicks = (boss.stateTicks || 0) + 1;
            if (boss.stateTicks % 60 === 20) {
              boss.state = 'counter_stance';
            } else if (boss.stateTicks % 60 === 40) {
              boss.state = 'windup';
            } else if (boss.state === 'windup' && boss.stateTicks % 60 === 55) {
              if (targetPlayer.counterWindowUntil < now && targetPlayer.invulnerableUntil < now) {
                const dmg = Math.round(
                  (boss.baseDamage || 32) * (boss.debuffs.disarmedUntil > now ? 0.5 : 1.0)
                );
                targetPlayer.hp = Math.max(5, targetPlayer.hp - dmg);
              }
              boss.state = 'chase';
            }
          }
        }
      }
    }

    // 7. Update Active Multiplayer Pet Derby Race
    if (instance.petDerby && instance.petDerby.status === 'racing') {
      const d = instance.petDerby;
      d.ticksElapsed++;
      for (const r of d.racers) {
        const step =
          (r.speedStat * 0.55 + r.staminaStat * 0.25 + Math.random() * (r.witStat * 0.35)) * 0.85;
        r.progress = Math.min(1000, Math.round(r.progress + step));
        if (r.progress >= 1000 && !d.winner) {
          d.winner = r;
          d.status = 'finished';
        }
      }
      if (d.status === 'finished' && d.winner) {
        const winPlayer = instance.players.get(d.winner.id);
        if (winPlayer) {
          winPlayer.agent.pet.wins = (winPlayer.agent.pet.wins || 0) + 1;
          winPlayer.agent.pet.level = (winPlayer.agent.pet.level || 1) + 1;
          winPlayer.agent.pet.stats.speed += 2;
          winPlayer.agent.pet.stats.stamina += 2;
          awardSkillXp(instance, winPlayer, 'vigilante', 50, 'Neon Pet Derby Champion');
          persistence.updatePetLeaderboard(winPlayer.agent);
        }
        instance.broadcast({
          type: 'pet_derby_update',
          derby: d,
          leaderboard: persistence.petLeaderboard,
          announcement: `🏁 NEON PET DERBY WINNER: ${d.winner.petName} (${d.winner.ownerCallsign})!`
        });
      } else if (d.ticksElapsed % 4 === 0) {
        instance.broadcast({
          type: 'pet_derby_update',
          derby: d
        });
      }
    }

    // 8. Prune expired visual effects
    instance.effects = instance.effects.filter((fx) => now - fx.createdAt < 650);

    // 9. Broadcast Authoritative World Snapshot to All Connected Players in Instance
    if (instance.players.size > 0) {
      const snapshot = {
        type: 'world_state',
        tick: instance.tickCount,
        instanceId: instance.id,
        players: Array.from(instance.players.values()).map((p) => ({
          clientId: p.clientId,
          callsign: p.agent.callsign,
          classId: p.agent.classId,
          x: Math.round(p.x),
          y: Math.round(p.y),
          z: Math.round(p.z),
          hp: p.hp,
          maxHp: p.derived.maxHp,
          flightFuel: Math.round(p.flightFuel),
          maxFlightFuel: p.derived.maxFlightFuel,
          isFlying: p.isFlying,
          vehicleId: p.vehicleId,
          selectedBodyPart: p.selectedBodyPart,
          skills: p.agent.skills,
          skillPoints: p.agent.skillPoints,
          bountyTokens: p.agent.bountyTokens,
          decryptionKeys: p.agent.decryptionKeys,
          storyAct: p.agent.storyAct,
          pet: p.agent.pet,
          districtLoops: p.agent.districtLoops,
          relics: p.agent.relics,
          collectedOrbsCount: p.agent.collectedOrbs.length,
          activeMutations: p.agent.secretTelemetry?.activeMutations || []
        })),
        renegadeOrbs: instance.orbs
          .filter((o) => o.type === 'renegade')
          .map((o) => ({ id: o.id, x: o.x, y: o.y, z: o.z })),
        enemies: instance.enemies.map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          isWarden: e.isWarden,
          x: e.x,
          y: e.y,
          z: e.z,
          hp: e.hp,
          maxHp: e.maxHp,
          state: e.state,
          debuffs: {
            blinded: e.debuffs.blindedUntil > now,
            armorCracked: e.debuffs.armorCrackedUntil > now,
            disarmed: e.debuffs.disarmedUntil > now,
            crippled: e.debuffs.crippledUntil > now
          }
        })),
        sabotageNodes: instance.sabotageNodes.map((s) => ({
          id: s.id,
          name: s.name,
          district: s.district,
          x: s.x,
          y: s.y,
          hp: s.hp,
          maxHp: s.maxHp,
          active: s.active
        })),
        vehicles: instance.vehicles,
        activeBounty: instance.activeBounty
          ? {
              id: instance.activeBounty.id,
              name: instance.activeBounty.name,
              title: instance.activeBounty.title,
              x: instance.activeBounty.x,
              y: instance.activeBounty.y,
              extractX: instance.activeBounty.extractX,
              extractY: instance.activeBounty.extractY,
              hp: instance.activeBounty.hp,
              maxHp: instance.activeBounty.maxHp,
              secondsLeft: Math.ceil(instance.activeBounty.ticksRemaining / 20),
              tip: instance.activeBounty.tip,
              state: instance.activeBounty.state,
              debuffs: {
                blinded: instance.activeBounty.debuffs.blindedUntil > now,
                armorCracked: instance.activeBounty.debuffs.armorCrackedUntil > now,
                disarmed: instance.activeBounty.debuffs.disarmedUntil > now,
                crippled: instance.activeBounty.debuffs.crippledUntil > now
              }
            }
          : null,
        eclipseBoss: instance.eclipseBoss
          ? {
              id: instance.eclipseBoss.id,
              name: instance.eclipseBoss.name,
              x: instance.eclipseBoss.x,
              y: instance.eclipseBoss.y,
              z: instance.eclipseBoss.z,
              hp: instance.eclipseBoss.hp,
              maxHp: instance.eclipseBoss.maxHp,
              state: instance.eclipseBoss.state,
              debuffs: {
                blinded: instance.eclipseBoss.debuffs.blindedUntil > now,
                armorCracked: instance.eclipseBoss.debuffs.armorCrackedUntil > now,
                disarmed: instance.eclipseBoss.debuffs.disarmedUntil > now,
                crippled: instance.eclipseBoss.debuffs.crippledUntil > now
              }
            }
          : null,
        effects: instance.effects
      };

      instance.broadcast(snapshot);
    }
  }
}, 50);

if (require.main === module) {
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================================`);
    console.log(`🚀 [CRACKUP: Protocol Eclipse] 8-Player WebSocket Server ONLINE!`);
    console.log(`   Local Browser URL : http://localhost:${PORT}`);
    const lanAddrs = getLanAddresses();
    if (lanAddrs.length > 0) {
      console.log(`   LAN Network URL   : ${lanAddrs[0]}`);
    }
    console.log(`   Cross-Country Play: Run 'npm run host:online' for an instant public HTTPS URL!`);
    console.log(`======================================================================\n`);
  });
}

module.exports = { httpServer, wss, instances };
