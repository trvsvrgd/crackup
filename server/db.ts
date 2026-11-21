import type { Tier4Award } from '../shared/world/tier4World.js';
import { ATTRIBUTE_NAMES, PROGRESSION_XP_THRESHOLDS } from '../shared/content/progressionRegistry.js';
import { DistrictId } from '../shared/constants.js';
import { PET_PROVENANCE_REGISTRY, provenanceForCitizen } from '../shared/content/worldLore.js';
import { applyMicroAction, DEFAULT_MICRO_TELEMETRY, normalizeGrid, normalizeResonance, type MunicipalGridStability, type MicroActionTelemetry, type MicroActionKind, type LoreProgress } from '../shared/content/campaignGraph.js';
export interface PendingLoreAction { id: string; kind: MicroActionKind; district: DistrictId }
/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Persistent Relational Database Layer — SQLite3 (better-sqlite3) in WAL Mode
 */

import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  AgentAttributes,
  AgentAttributeXP,
  AgentTelemetry,
  AugmentChassisId,
  clampAttributeLevel,
  DEFAULT_ATTRIBUTE_XP,
  DEFAULT_ATTRIBUTES,
  DEFAULT_TELEMETRY,
} from '../shared/constants.js';
import { normalizeQuat, Quat4, Vec3 } from '../shared/protocol/binaryProtocol.js';
import { computeNeuralDriftRatios, NeuralDriftRatios } from '../shared/world/phase5Systems.js';
import { isValidPetSpecies, type PersistedPetStats } from '../shared/world/cyberPetArena.js';

export interface PersistentAgentRecord {
  municipalGridStability?: MunicipalGridStability;
  gestaltResonance?: number;
  microActionTelemetry?: MicroActionTelemetry;
  pendingLoreActions?: PendingLoreAction[];
  tier3WeaponId?: string;
  collectedLore?: string[];
  completedQuests?: string[];
  tier4Unlocks?: string[];
  pendingTier4Awards?: Tier4Award[];
  hp?: number;
  callsign: string;
  position: Vec3;
  rotation: Quat4;
  attributes: AgentAttributes;
  xp: AgentAttributeXP;
  telemetry: AgentTelemetry;
  collectedOrbs: number[];
  augmentChassis: AugmentChassisId;
  unlockedSkills: string[];
  unlockedRelics: string[];
  unlockedDistrictRewards: string[];
  activeNeuralDrifts: string[];
  neuralDriftRatios: NeuralDriftRatios;
  pet: PersistedPetStats | null;
  createdAt: number;
  updatedAt: number;
}

interface RawAgentRow {
  tier3_weapon_id?: string;
  collected_lore_json?: string;
  completed_quests_json?: string;
  tier4_unlocks_json?: string;
  municipal_grid_json?: string;
  gestalt_resonance?: number;
  micro_action_json?: string;
  hp?: number | null;
  callsign: string;
  pin_hash: string;
  pos_x: number;
  pos_y: number;
  pos_z: number;
  quat_x: number;
  quat_y: number;
  quat_z: number;
  quat_w: number;
  agility_level: number;
  strength_level: number;
  driving_level: number;
  shooting_level: number;
  explosives_level: number;
  flying_level: number;
  vigilante_level: number;
  xp_json: string;
  telemetry_json: string;
  collected_orbs_json?: string;
  augment_chassis?: string;
  unlocked_skills_json?: string;
  unlocked_relics_json?: string;
  unlocked_district_rewards_json?: string;
  neural_drift_json?: string;
  pet_json?: string;
  created_at: number;
  updated_at: number;
}

function legacyHashPin(callsign: string, pin: string): string {
  const normalizedCallsign = callsign.trim().toUpperCase();
  return crypto
    .createHash('sha256')
    .update(`CRACKUP_V2_SALT:${normalizedCallsign}:${pin}`)
    .digest('hex');
}

function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(pin, salt, 32).toString('hex')}`;
}

function verifyPin(callsign: string, pin: string, stored: string): boolean {
  if (!stored.startsWith('scrypt$')) {
    const candidate = Buffer.from(legacyHashPin(callsign, pin), 'hex');
    const expected = Buffer.from(stored, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  }
  const [, salt, encoded] = stored.split('$');
  if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{64}$/.test(encoded || '')) return false;
  return crypto.timingSafeEqual(crypto.scryptSync(pin, salt, 32), Buffer.from(encoded, 'hex'));
}

export class AgentDatabase {
  public readonly db: Database.Database;
  public readonly dbPath: string;

  private readonly stmtGetAgent: Database.Statement<[string], RawAgentRow>;
  private readonly stmtInsertAgent: Database.Statement;
  private readonly stmtUpdateState: Database.Statement;
  private readonly stmtCountAgents: Database.Statement<[], { count: number }>;

  constructor(customDbPath?: string) {
    const dataDir = customDbPath ? path.dirname(customDbPath) : process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = customDbPath || path.join(dataDir, 'crackup_v2.db');
    const dirOfDb = path.dirname(this.dbPath);
    if (!fs.existsSync(dirOfDb)) {
      fs.mkdirSync(dirOfDb, { recursive: true });
    }

    this.db = new Database(this.dbPath);

    // Enable WAL mode & acid performance pragmas (PRD Section 2.1)
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');

    this.initializeSchema();
    this.migrateLore();
    this.migrateTier3();

    this.stmtGetAgent = this.db.prepare<[string], RawAgentRow>(
      `SELECT * FROM agents WHERE callsign = ?`
    );

    this.stmtInsertAgent = this.db.prepare(`
      INSERT INTO agents (
        callsign, pin_hash,
        pos_x, pos_y, pos_z,
        quat_x, quat_y, quat_z, quat_w,
        agility_level, strength_level, driving_level, shooting_level,
        explosives_level, flying_level, vigilante_level,
        xp_json, telemetry_json, collected_orbs_json,
        augment_chassis, unlocked_skills_json, unlocked_relics_json,
        unlocked_district_rewards_json, neural_drift_json, pet_json,
        created_at, updated_at
      ) VALUES (
        @callsign, @pin_hash,
        @pos_x, @pos_y, @pos_z,
        @quat_x, @quat_y, @quat_z, @quat_w,
        @agility_level, @strength_level, @driving_level, @shooting_level,
        @explosives_level, @flying_level, @vigilante_level,
        @xp_json, @telemetry_json, @collected_orbs_json,
        @augment_chassis, @unlocked_skills_json, @unlocked_relics_json,
        @unlocked_district_rewards_json, @neural_drift_json, @pet_json,
        @created_at, @updated_at
      )
    `);

    this.stmtUpdateState = this.db.prepare(`
      UPDATE agents SET
        municipal_grid_json = @municipal_grid_json,
        gestalt_resonance = @gestalt_resonance,
        micro_action_json = @micro_action_json,
        hp = @hp,
        pos_x = @pos_x,
        pos_y = @pos_y,
        pos_z = @pos_z,
        quat_x = @quat_x,
        quat_y = @quat_y,
        quat_z = @quat_z,
        quat_w = @quat_w,
        agility_level = @agility_level,
        strength_level = @strength_level,
        driving_level = @driving_level,
        shooting_level = @shooting_level,
        explosives_level = @explosives_level,
        flying_level = @flying_level,
        vigilante_level = @vigilante_level,
        xp_json = @xp_json,
        telemetry_json = @telemetry_json,
        collected_orbs_json = @collected_orbs_json,
        augment_chassis = @augment_chassis,
        unlocked_skills_json = @unlocked_skills_json,
        unlocked_relics_json = @unlocked_relics_json,
        unlocked_district_rewards_json = @unlocked_district_rewards_json,
        neural_drift_json = @neural_drift_json,
        pet_json = @pet_json,
        updated_at = @updated_at
      WHERE callsign = @callsign
    `);

    this.stmtCountAgents = this.db.prepare<[], { count: number }>(
      `SELECT COUNT(*) as count FROM agents`
    );
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        callsign TEXT PRIMARY KEY,
        pin_hash TEXT NOT NULL,
        pos_x REAL NOT NULL DEFAULT 0.0,
        pos_y REAL NOT NULL DEFAULT 0.0,
        pos_z REAL NOT NULL DEFAULT 0.0,
        quat_x REAL NOT NULL DEFAULT 0.0,
        quat_y REAL NOT NULL DEFAULT 0.0,
        quat_z REAL NOT NULL DEFAULT 0.0,
        quat_w REAL NOT NULL DEFAULT 1.0,
        agility_level INTEGER NOT NULL DEFAULT 1,
        strength_level INTEGER NOT NULL DEFAULT 1,
        driving_level INTEGER NOT NULL DEFAULT 1,
        shooting_level INTEGER NOT NULL DEFAULT 1,
        explosives_level INTEGER NOT NULL DEFAULT 1,
        flying_level INTEGER NOT NULL DEFAULT 1,
        vigilante_level INTEGER NOT NULL DEFAULT 1,
        xp_json TEXT NOT NULL,
        telemetry_json TEXT NOT NULL,
        collected_orbs_json TEXT NOT NULL DEFAULT '[]',
        augment_chassis TEXT NOT NULL DEFAULT 'TITAN_JUGGERNAUT',
        unlocked_skills_json TEXT NOT NULL DEFAULT '[]',
        unlocked_relics_json TEXT NOT NULL DEFAULT '[]',
        unlocked_district_rewards_json TEXT NOT NULL DEFAULT '[]',
        neural_drift_json TEXT NOT NULL DEFAULT '{}',
        pet_json TEXT NOT NULL DEFAULT 'null',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    // Ensure seamless migration if table was created during Phase 1..4
    const cols = this.db.pragma('table_info(agents)') as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'hp')) this.db.exec('ALTER TABLE agents ADD COLUMN hp REAL');
    if (!cols.some((c) => c.name === 'collected_orbs_json')) {
      this.db.exec(`ALTER TABLE agents ADD COLUMN collected_orbs_json TEXT NOT NULL DEFAULT '[]'`);
    }
    if (!cols.some((c) => c.name === 'augment_chassis')) {
      this.db.exec(`ALTER TABLE agents ADD COLUMN augment_chassis TEXT NOT NULL DEFAULT 'TITAN_JUGGERNAUT'`);
    }
    if (!cols.some((c) => c.name === 'unlocked_skills_json')) {
      this.db.exec(`ALTER TABLE agents ADD COLUMN unlocked_skills_json TEXT NOT NULL DEFAULT '[]'`);
    }
    if (!cols.some((c) => c.name === 'unlocked_relics_json')) {
      this.db.exec(`ALTER TABLE agents ADD COLUMN unlocked_relics_json TEXT NOT NULL DEFAULT '[]'`);
    }
    if (!cols.some((c) => c.name === 'unlocked_district_rewards_json')) {
      this.db.exec(
        `ALTER TABLE agents ADD COLUMN unlocked_district_rewards_json TEXT NOT NULL DEFAULT '[]'`
      );
    }
    if (!cols.some((c) => c.name === 'neural_drift_json')) {
      this.db.exec(`ALTER TABLE agents ADD COLUMN neural_drift_json TEXT NOT NULL DEFAULT '{}'`);
    }
    if (!cols.some((c) => c.name === 'pet_json')) {
      this.db.exec(`ALTER TABLE agents ADD COLUMN pet_json TEXT NOT NULL DEFAULT 'null'`);
    }
  }

  private migrateTier3(): void {
    const columns = this.db.pragma('table_info(agents)') as Array<{ name: string }>;
    this.db.transaction(() => {
      if (!columns.some(c => c.name === 'tier3_weapon_id')) this.db.exec("ALTER TABLE agents ADD COLUMN tier3_weapon_id TEXT NOT NULL DEFAULT ''");
      if (columns.some(c => c.name === 'progression_version')) return;
      this.db.exec('ALTER TABLE agents ADD COLUMN progression_version INTEGER NOT NULL DEFAULT 3');
      const rows = this.db.prepare('SELECT * FROM agents').all() as RawAgentRow[];
      const update = this.db.prepare('UPDATE agents SET xp_json = ? WHERE callsign = ?');
      const oldThresholds = [0, 100, 250, 500, 900];
      for (const row of rows) {
        let xp: AgentAttributeXP;
        try { xp = { ...DEFAULT_ATTRIBUTE_XP, ...JSON.parse(row.xp_json) }; } catch { continue; }
        for (const stat of ATTRIBUTE_NAMES) {
          const value = Number.isFinite(xp[stat]) ? Math.max(0, xp[stat]) : 0;
          const level = Math.max(clampAttributeLevel(row[`${stat}_level` as keyof RawAgentRow] as number), 1 + oldThresholds.slice(1).filter(t => value >= t).length);
          const lo = oldThresholds[level - 1], hi = oldThresholds[level] ?? lo + 900;
          const next = PROGRESSION_XP_THRESHOLDS[level] ?? 36000;
          xp[stat] = Math.round(PROGRESSION_XP_THRESHOLDS[level - 1] + Math.max(0, value - lo) / (hi - lo) * (next - PROGRESSION_XP_THRESHOLDS[level - 1]));
        }
        update.run(JSON.stringify(xp), row.callsign);
      }
    })();
  }

  private migrateLore(): void {
    const columns = this.db.pragma('table_info(agents)') as Array<{ name: string }>;
    this.db.transaction(() => {
      for (const column of ['collected_lore_json', 'completed_quests_json', 'tier4_unlocks_json']) if (!columns.some(c => c.name === column)) this.db.exec(`ALTER TABLE agents ADD COLUMN ${column} TEXT NOT NULL DEFAULT '[]'`);
      this.db.exec('CREATE TABLE IF NOT EXISTS tier4_awards (callsign TEXT NOT NULL REFERENCES agents(callsign) ON DELETE CASCADE, award_id TEXT NOT NULL, PRIMARY KEY(callsign, award_id))');
      if (!columns.some(c => c.name === 'municipal_grid_json')) this.db.exec("ALTER TABLE agents ADD COLUMN municipal_grid_json TEXT NOT NULL DEFAULT '{}'");
      if (!columns.some(c => c.name === 'gestalt_resonance')) this.db.exec('ALTER TABLE agents ADD COLUMN gestalt_resonance REAL NOT NULL DEFAULT 0');
      if (!columns.some(c => c.name === 'micro_action_json')) this.db.exec("ALTER TABLE agents ADD COLUMN micro_action_json TEXT NOT NULL DEFAULT '{}'");
      this.db.exec(`CREATE TABLE IF NOT EXISTS lore_micro_actions (
        callsign TEXT NOT NULL REFERENCES agents(callsign) ON DELETE CASCADE,
        action_id TEXT NOT NULL, kind TEXT NOT NULL, district TEXT NOT NULL,
        created_at INTEGER NOT NULL, PRIMARY KEY (callsign, action_id)
      )`);
      const rows = this.db.prepare('SELECT callsign, pet_json FROM agents').all() as Array<{ callsign: string; pet_json: string }>;
      const update = this.db.prepare('UPDATE agents SET pet_json = ? WHERE callsign = ?');
      for (const row of rows) {
        try {
          const pet = JSON.parse(row.pet_json);
          if (!pet || !isValidPetSpecies(pet.species) || typeof pet.name !== 'string') continue;
          const canonical = provenanceForCitizen(pet.originCitizenId) ?? PET_PROVENANCE_REGISTRY.generate(`${row.callsign}:${pet.species}`);
          const next = JSON.stringify({ ...pet, ...canonical, provenanceDiscovered: pet.provenanceDiscovered === true });
          if (next !== row.pet_json) update.run(next, row.callsign);
        } catch { /* Preserve damaged legacy JSON for the existing safe read fallback. */ }
      }
    })();
  }

  public getJournalMode(): string {
    return String(this.db.pragma('journal_mode', { simple: true })).toLowerCase();
  }

  public getTotalAgentCount(): number {
    const row = this.stmtCountAgents.get();
    return row ? row.count : 0;
  }

  public clearAllAgents(): void {
    this.db.exec('DELETE FROM agents');
  }

  /**
   * Authenticates an existing Agent by Callsign + PIN, or registers a new Agent account in SQLite.
   */
  public authenticateOrCreate(
    rawCallsign: string,
    rawPin: string,
    defaultSpawnPos: Vec3 = { x: 0, y: 0, z: 0 }
  ): { ok: true; record: PersistentAgentRecord; isNew: boolean } | { ok: false; error: string } {
    const callsign = rawCallsign.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
    const pin = String(rawPin ?? '').trim();

    if (callsign.length < 2) {
      return { ok: false, error: 'Callsign must be at least 2 alphanumeric characters.' };
    }
    if (!/^\d{4,8}$/.test(pin)) {
      return { ok: false, error: 'PIN must be 4 to 8 digits.' };
    }

    const existing = this.stmtGetAgent.get(callsign);

    if (existing) {
      if (!verifyPin(callsign, pin, existing.pin_hash)) {
        return { ok: false, error: 'Invalid Security PIN for this Agent Callsign.' };
      }
      if (!existing.pin_hash.startsWith('scrypt$')) this.db.prepare('UPDATE agents SET pin_hash = ? WHERE callsign = ?').run(hashPin(pin), callsign);
      return {
        ok: true,
        record: this.rowToRecord(existing),
        isNew: false,
      };
    }

    const now = Date.now();
    const initialTelemetry = { ...DEFAULT_TELEMETRY };
    const initialRatios = computeNeuralDriftRatios(initialTelemetry);
    const newRecord: PersistentAgentRecord = {
      callsign,
      municipalGridStability: normalizeGrid(), gestaltResonance: 0, microActionTelemetry: { ...DEFAULT_MICRO_TELEMETRY },
      position: { ...defaultSpawnPos },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      attributes: { ...DEFAULT_ATTRIBUTES },
      xp: { ...DEFAULT_ATTRIBUTE_XP },
      telemetry: initialTelemetry,
      collectedOrbs: [],
      augmentChassis: AugmentChassisId.TITAN_JUGGERNAUT,
      unlockedSkills: [],
      unlockedRelics: [],
      unlockedDistrictRewards: [],
      activeNeuralDrifts: [],
      neuralDriftRatios: initialRatios,
      pet: null,
      createdAt: now,
      updatedAt: now,
    };

    this.stmtInsertAgent.run({
      callsign: newRecord.callsign,
      pin_hash: hashPin(pin),
      pos_x: newRecord.position.x,
      pos_y: newRecord.position.y,
      pos_z: newRecord.position.z,
      quat_x: newRecord.rotation.x,
      quat_y: newRecord.rotation.y,
      quat_z: newRecord.rotation.z,
      quat_w: newRecord.rotation.w,
      agility_level: newRecord.attributes.agility,
      strength_level: newRecord.attributes.strength,
      driving_level: newRecord.attributes.driving,
      shooting_level: newRecord.attributes.shooting,
      explosives_level: newRecord.attributes.explosives,
      flying_level: newRecord.attributes.flying,
      vigilante_level: newRecord.attributes.vigilante,
      xp_json: JSON.stringify(newRecord.xp),
      telemetry_json: JSON.stringify(newRecord.telemetry),
      pet_json: JSON.stringify(newRecord.pet),
      collected_orbs_json: JSON.stringify(newRecord.collectedOrbs),
      augment_chassis: newRecord.augmentChassis,
      unlocked_skills_json: JSON.stringify(newRecord.unlockedSkills),
      unlocked_relics_json: JSON.stringify(newRecord.unlockedRelics),
      unlocked_district_rewards_json: JSON.stringify(newRecord.unlockedDistrictRewards),
      neural_drift_json: JSON.stringify({
        activeNeuralDrifts: newRecord.activeNeuralDrifts,
        ratios: newRecord.neuralDriftRatios,
      }),
      created_at: now,
      updated_at: now,
    });

    return { ok: true, record: newRecord, isNew: true };
  }

  public getAgent(callsign: string): PersistentAgentRecord | null {
    const normalized = callsign.trim().toUpperCase();
    const row = this.stmtGetAgent.get(normalized);
    if (!row) return null;
    return this.rowToRecord(row);
  }

  public saveAgent(record: PersistentAgentRecord): void {
    this.db.transaction(() => this.saveAgentTransaction(record))();
  }

  private saveAgentTransaction(record: PersistentAgentRecord): void {
    const stored = this.stmtGetAgent.get(record.callsign.trim().toUpperCase());
    if (!stored) throw new Error('Cannot save an unregistered Agent');
    const base = record.pendingLoreActions?.length || record.pendingTier4Awards?.length ? this.rowToRecord(stored) : record;
    const lore: LoreProgress = { municipalGridStability: normalizeGrid(base.municipalGridStability), gestaltResonance: normalizeResonance(base.gestaltResonance), microActionTelemetry: { ...DEFAULT_MICRO_TELEMETRY, ...base.microActionTelemetry } };
    const insert = this.db.prepare('INSERT OR IGNORE INTO lore_micro_actions (callsign, action_id, kind, district, created_at) VALUES (?, ?, ?, ?, ?)');
    for (const action of record.pendingLoreActions ?? []) {
      if (!action.id || !Object.values(DistrictId).includes(action.district)) throw new Error('Invalid lore action');
      if (insert.run(stored.callsign, action.id, action.kind, action.district, Date.now()).changes) applyMicroAction(lore, action.kind, action.district);
    }
    for (const award of record.pendingTier4Awards ?? []) {
      if (this.db.prepare('INSERT OR IGNORE INTO tier4_awards (callsign, award_id) VALUES (?, ?)').run(stored.callsign, award.id).changes) {
        lore.municipalGridStability[award.district] = Math.max(0, Math.min(100, lore.municipalGridStability[award.district] + award.reward.stability));
        lore.gestaltResonance = normalizeResonance(lore.gestaltResonance + award.reward.resonance);
        if (award.id.startsWith('TAG_')) lore.microActionTelemetry.memoriesRecovered++;
      }
    }
    const normQ = normalizeQuat(record.rotation);
    const safePos = {
      x: Number.isFinite(record.position.x) ? record.position.x : 0,
      y: Number.isFinite(record.position.y) ? record.position.y : 0,
      z: Number.isFinite(record.position.z) ? record.position.z : 0,
    };
    const computedRatios = record.neuralDriftRatios || computeNeuralDriftRatios(record.telemetry);

    this.stmtUpdateState.run({
      municipal_grid_json: JSON.stringify(lore.municipalGridStability),
      gestalt_resonance: lore.gestaltResonance,
      micro_action_json: JSON.stringify(lore.microActionTelemetry),
      hp: Number.isFinite(record.hp) ? Math.max(0, record.hp!) : null,
      callsign: record.callsign.trim().toUpperCase(),
      pos_x: safePos.x,
      pos_y: safePos.y,
      pos_z: safePos.z,
      quat_x: normQ.x,
      quat_y: normQ.y,
      quat_z: normQ.z,
      quat_w: normQ.w,
      agility_level: clampAttributeLevel(record.attributes.agility),
      strength_level: clampAttributeLevel(record.attributes.strength),
      driving_level: clampAttributeLevel(record.attributes.driving),
      shooting_level: clampAttributeLevel(record.attributes.shooting),
      explosives_level: clampAttributeLevel(record.attributes.explosives),
      flying_level: clampAttributeLevel(record.attributes.flying),
      vigilante_level: clampAttributeLevel(record.attributes.vigilante),
      xp_json: JSON.stringify(record.xp),
      telemetry_json: JSON.stringify(record.telemetry),
      pet_json: JSON.stringify(record.pet ? { ...record.pet, ...(provenanceForCitizen(record.pet.originCitizenId ?? '') ?? PET_PROVENANCE_REGISTRY.generate(`${stored.callsign}:${record.pet.species}`)), provenanceDiscovered: record.pet.provenanceDiscovered === true } : null),
      collected_orbs_json: JSON.stringify(record.collectedOrbs || []),
      augment_chassis: record.augmentChassis || AugmentChassisId.TITAN_JUGGERNAUT,
      unlocked_skills_json: JSON.stringify(record.unlockedSkills || []),
      unlocked_relics_json: JSON.stringify(record.unlockedRelics || []),
      unlocked_district_rewards_json: JSON.stringify(record.unlockedDistrictRewards || []),
      neural_drift_json: JSON.stringify({
        activeNeuralDrifts: record.activeNeuralDrifts || [],
        ratios: computedRatios,
      }),
      updated_at: Date.now(),
    });
    this.db.prepare('UPDATE agents SET tier3_weapon_id = ? WHERE callsign = ?').run(record.tier3WeaponId ?? stored.tier3_weapon_id ?? '', stored.callsign);
    this.db.prepare('UPDATE agents SET collected_lore_json = ?, completed_quests_json = ?, tier4_unlocks_json = ? WHERE callsign = ?').run(JSON.stringify(record.collectedLore ?? JSON.parse(stored.collected_lore_json ?? '[]')), JSON.stringify(record.completedQuests ?? JSON.parse(stored.completed_quests_json ?? '[]')), JSON.stringify(record.tier4Unlocks ?? JSON.parse(stored.tier4_unlocks_json ?? '[]')), stored.callsign);
    Object.assign(record, lore);
  }

  private rowToRecord(row: RawAgentRow): PersistentAgentRecord {
    let xp: AgentAttributeXP = { ...DEFAULT_ATTRIBUTE_XP };
    let telemetry: AgentTelemetry = { ...DEFAULT_TELEMETRY };
    let collectedOrbs: number[] = [];
    let augmentChassis: AugmentChassisId = AugmentChassisId.TITAN_JUGGERNAUT;
    let unlockedSkills: string[] = [];
    let unlockedRelics: string[] = [];
    let unlockedDistrictRewards: string[] = [];
    let activeNeuralDrifts: string[] = [];
    try {
      xp = { ...DEFAULT_ATTRIBUTE_XP, ...JSON.parse(row.xp_json) };
    } catch {
      // Fallback to defaults if corrupted
    }
    try {
      telemetry = { ...DEFAULT_TELEMETRY, ...JSON.parse(row.telemetry_json) };
    } catch {
      // Fallback to defaults if corrupted
    }
    try {
      if (row.collected_orbs_json) {
        const parsed = JSON.parse(row.collected_orbs_json);
        if (Array.isArray(parsed)) {
          collectedOrbs = parsed.map(Number).filter((n) => Number.isInteger(n) && n >= 1);
        }
      }
    } catch {
      // Fallback
    }
    if (
      row.augment_chassis &&
      Object.values(AugmentChassisId).includes(row.augment_chassis as AugmentChassisId)
    ) {
      augmentChassis = row.augment_chassis as AugmentChassisId;
    }
    try {
      if (row.unlocked_skills_json) {
        const parsed = JSON.parse(row.unlocked_skills_json);
        if (Array.isArray(parsed)) {
          unlockedSkills = parsed.map(String);
        }
      }
    } catch {
      // Fallback
    }
    try {
      if (row.unlocked_relics_json) {
        const parsed = JSON.parse(row.unlocked_relics_json);
        if (Array.isArray(parsed)) {
          unlockedRelics = parsed.map(String);
        }
      }
    } catch {
      // Fallback
    }
    try {
      if (row.unlocked_district_rewards_json) {
        const parsed = JSON.parse(row.unlocked_district_rewards_json);
        if (Array.isArray(parsed)) {
          unlockedDistrictRewards = parsed.map(String);
        }
      }
    } catch {
      // Fallback
    }
    let neuralDriftRatios = computeNeuralDriftRatios(telemetry);
    try {
      if (row.neural_drift_json) {
        const parsed = JSON.parse(row.neural_drift_json);
        if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.activeNeuralDrifts)) {
            activeNeuralDrifts = parsed.activeNeuralDrifts.map(String);
          }
          if (parsed.ratios && typeof parsed.ratios === 'object') {
            neuralDriftRatios = {
              ...neuralDriftRatios,
              ...parsed.ratios,
            };
          }
        }
      }
    } catch {
      // Fallback
    }

    let pet: PersistedPetStats | null = null;
    try {
      const parsed = JSON.parse(row.pet_json || 'null');
      if (parsed && isValidPetSpecies(parsed.species) && typeof parsed.name === 'string') {
        const wins = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
          ? Math.max(0, Math.floor(value)) : 0;
        pet = { ...(provenanceForCitizen(parsed.originCitizenId) ?? PET_PROVENANCE_REGISTRY.generate(`${row.callsign}:${parsed.species}`)), provenanceDiscovered: parsed.provenanceDiscovered === true,
          species: parsed.species, name: parsed.name.slice(0, 32),
          derbyWins: wins(parsed.derbyWins), clashWins: wins(parsed.clashWins) };
      }
    } catch {
      // Legacy or damaged pet data leaves the Agent unbonded.
    }

    let municipalGridStability = normalizeGrid();
    let microActionTelemetry = { ...DEFAULT_MICRO_TELEMETRY };
    try { municipalGridStability = normalizeGrid(JSON.parse(row.municipal_grid_json ?? '{}')); } catch {}
    try {
      const raw = JSON.parse(row.micro_action_json ?? '{}');
      for (const key of Object.keys(microActionTelemetry) as Array<keyof MicroActionTelemetry>) {
        if (Number.isFinite(raw?.[key])) microActionTelemetry[key] = Math.max(0, Math.floor(raw[key]));
      }
    } catch {}
    return {
      municipalGridStability, gestaltResonance: normalizeResonance(row.gestalt_resonance), microActionTelemetry,
      callsign: row.callsign,
      hp: typeof row.hp === 'number' && Number.isFinite(row.hp) ? Math.max(0, row.hp) : undefined,
      position: {
        x: Number.isFinite(row.pos_x) ? row.pos_x : 0,
        y: Number.isFinite(row.pos_y) ? row.pos_y : 0,
        z: Number.isFinite(row.pos_z) ? row.pos_z : 0,
      },
      rotation: normalizeQuat({
        x: row.quat_x,
        y: row.quat_y,
        z: row.quat_z,
        w: row.quat_w,
      }),
      attributes: {
        agility: clampAttributeLevel(row.agility_level),
        strength: clampAttributeLevel(row.strength_level),
        driving: clampAttributeLevel(row.driving_level),
        shooting: clampAttributeLevel(row.shooting_level),
        explosives: clampAttributeLevel(row.explosives_level),
        flying: clampAttributeLevel(row.flying_level),
        vigilante: clampAttributeLevel(row.vigilante_level),
      },
      xp,
      tier3WeaponId: row.tier3_weapon_id ?? '',
      collectedLore: JSON.parse(row.collected_lore_json ?? '[]'),
      completedQuests: JSON.parse(row.completed_quests_json ?? '[]'),
      tier4Unlocks: JSON.parse(row.tier4_unlocks_json ?? '[]'),
      telemetry,
      collectedOrbs,
      augmentChassis,
      unlockedSkills,
      unlockedRelics,
      unlockedDistrictRewards,
      activeNeuralDrifts,
      neuralDriftRatios,
      pet,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public close(): void {
    this.db.close();
  }
}
