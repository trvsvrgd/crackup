/**
 * CRACKUP: Protocol Eclipse — Persistent Server Storage Engine
 * Persists Agent accounts (Callsign + PIN), 7 skills, Skill Tree builds,
 * Secret Neural Drift telemetry, Orbs collected, District Loops, Relics,
 * Cyber-Pets, and Competitive Pet Arena Leaderboards.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { SKILLS, CLASSES, PET_SPECIES } = require('./world_data');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'pet_leaderboard.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin || '0000') + '_crackup_salt').digest('hex');
}

function computeSkillLevel(skillId, xp) {
  const thresholds = SKILLS[skillId]?.xpThresholds || [0, 100, 260, 500, 900];
  let level = 1;
  for (let i = 0; i < thresholds.length; i++) {
    if (xp >= thresholds[i]) {
      level = i + 1;
    }
  }
  return Math.min(5, level);
}

function createDefaultAgent(callsign, pin, classId = 'titan', petSpeciesId = 'volt_hound') {
  const chosenClass = CLASSES[classId] || CLASSES.titan;
  const chosenPet = PET_SPECIES[petSpeciesId] || PET_SPECIES.volt_hound;

  const skills = {};
  for (const key of Object.keys(SKILLS)) {
    const startXp = chosenClass.startingBonuses[key] || 0;
    skills[key] = {
      xp: startXp,
      level: computeSkillLevel(key, startXp)
    };
  }

  const petShortNames = {
    volt_hound: 'Volt-Hound',
    razor_hawk: 'Razor-Hawk',
    phase_ferret: 'Phase-Ferret',
    magma_beetle: 'Magma-Beetle',
    chrono_cat: 'Chrono-Cat'
  };

  return {
    callsign,
    pinHash: hashPin(pin),
    classId: chosenClass.id,
    createdAt: Date.now(),
    lastLogin: Date.now(),
    skills,
    skillPoints: 2, // Start with 2 Skill Points so players can immediately customize their build!
    unlockedNodes: [],
    collectedOrbs: [],
    bountyTokens: 1,
    decryptionKeys: 0,
    storyAct: 1,
    unlockedLore: [
      'AEGIS BRIEFING #00 [DIRECTOR VANCE]: "Deploy into Neo-Veridia. Absorb Agility Orbs, crush the Syndicate Wardens, and ask no questions."'
    ],
    // Meaningful District Loop Progression
    districtLoops: {
      neon_docks: { stage: 0, progress: 0, tier: 0, unlocked: false },
      foundry_slums: { stage: 0, progress: 0, tier: 0, unlocked: false },
      helios_spire: { stage: 0, progress: 0, tier: 0, unlocked: false },
      citadel_plaza: { stage: 0, progress: 0, tier: 0, unlocked: false }
    },
    // Prototype Relics unlocked via Triangulation Side Quests
    relics: [],
    activeRelicQuest: 'chrono_anchor',
    // Cyber-Pet Companion & Competitive Mini-Game Profile
    pet: {
      speciesId: chosenPet.id,
      name: `${callsign}'s ${petShortNames[chosenPet.id] || chosenPet.name}`,
      level: 1,
      xp: 0,
      wins: 0,
      derbyBestTime: null,
      stats: { ...chosenPet.baseStats }
    },
    // Secret Background Progression ("Neural Drift" hidden counters & active mutations)
    secretTelemetry: {
      explosiveCollateralScore: 0,
      limbCrippleShots: 0,
      totalRangedShots: 0,
      airborneCombatTicks: 0,
      meleeHitsTaken: 0,
      conscienceActions: 0,
      activeMutations: [] // e.g., ['pyro_neurosis', 'surgical_coldness', ...]
    }
  };
}

class PersistenceManager {
  constructor() {
    ensureDataDir();
    this.agents = this._loadJson(AGENTS_FILE, {});
    this.petLeaderboard = this._loadJson(LEADERBOARD_FILE, []);
    this._saveTimer = null;
  }

  _loadJson(filePath, fallback) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error(`[Persistence] Failed to load ${filePath}:`, err.message);
    }
    return fallback;
  }

  saveNow() {
    ensureDataDir();
    try {
      fs.writeFileSync(AGENTS_FILE, JSON.stringify(this.agents, null, 2), 'utf8');
      fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(this.petLeaderboard, null, 2), 'utf8');
    } catch (err) {
      console.error('[Persistence] Failed to save:', err.message);
    }
  }

  scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.saveNow();
    }, 1000);
  }

  authenticateOrCreate(callsignRaw, pin, classId, petSpeciesId) {
    const cleanCallsign = String(callsignRaw || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 18);

    if (!cleanCallsign || cleanCallsign.length < 2) {
      return { error: 'Agent Callsign must be 2–18 alphanumeric characters.' };
    }

    const key = cleanCallsign.toLowerCase();
    const existing = this.agents[key];

    if (existing) {
      if (existing.pinHash !== hashPin(pin)) {
        return { error: 'Invalid Security PIN for existing Agent callsign.' };
      }
      existing.lastLogin = Date.now();
      // Allow updating class or pet if desired on login or keep existing
      this.scheduleSave();
      return { agent: existing, isNew: false };
    }

    const newAgent = createDefaultAgent(cleanCallsign, pin, classId, petSpeciesId);
    this.agents[key] = newAgent;
    this.updatePetLeaderboard(newAgent);
    this.saveNow();
    return { agent: newAgent, isNew: true };
  }

  getAgent(callsign) {
    if (!callsign) return null;
    return this.agents[String(callsign).toLowerCase()] || null;
  }

  updatePetLeaderboard(agent) {
    if (!agent || !agent.pet) return;
    const s = agent.pet.stats;
    const powerScore = Math.round(
      (s.speed + s.ferocity + s.wit + s.stamina) * 2.5 + (agent.pet.wins || 0) * 25 + (agent.pet.level || 1) * 15
    );
    const existingIdx = this.petLeaderboard.findIndex(
      (e) => e.ownerCallsign.toLowerCase() === agent.callsign.toLowerCase()
    );
    const entry = {
      ownerCallsign: agent.callsign,
      petName: agent.pet.name,
      speciesId: agent.pet.speciesId,
      level: agent.pet.level,
      wins: agent.pet.wins || 0,
      powerScore,
      stats: { ...agent.pet.stats },
      updatedAt: Date.now()
    };
    if (existingIdx >= 0) {
      this.petLeaderboard[existingIdx] = entry;
    } else {
      this.petLeaderboard.push(entry);
    }
    this.petLeaderboard.sort((a, b) => b.powerScore - a.powerScore);
    this.petLeaderboard = this.petLeaderboard.slice(0, 20);
    this.scheduleSave();
  }
}

module.exports = {
  PersistenceManager,
  computeSkillLevel
};

