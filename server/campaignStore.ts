import crypto from 'node:crypto';
import type { AgentDatabase, PersistentAgentRecord } from './db.js';
import { newSoloCampaign, parseSoloCampaign, type SoloCampaignState } from '../shared/campaign/soloCampaign.js';
import { DISTRICT_LOOP_SPECS } from '../shared/world/phase5Systems.js';
import { newCampaignPresentation, parseCampaignPresentation, type CampaignPresentation } from '../shared/campaign/presentation.js';

export interface OwnedSoloCampaign {
  id: string;
  owner: string;
  revision: number;
  savedAt: number;
  state: SoloCampaignState;
}
interface Row { campaign_id: string; owner: string; revision: number; saved_at: number; state_json: string }

export class CampaignStore {
  constructor(private readonly agents: AgentDatabase) {
    agents.db.exec(`
      CREATE TABLE IF NOT EXISTS solo_campaigns (
        campaign_id TEXT PRIMARY KEY, owner TEXT NOT NULL UNIQUE REFERENCES agents(callsign),
        revision INTEGER NOT NULL, saved_at INTEGER NOT NULL, state_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS solo_reward_receipts (
        campaign_id TEXT NOT NULL REFERENCES solo_campaigns(campaign_id), reward_id TEXT NOT NULL,
        granted_at INTEGER NOT NULL, PRIMARY KEY(campaign_id, reward_id)
      );
      CREATE TABLE IF NOT EXISTS character_reward_receipts (
        callsign TEXT NOT NULL REFERENCES agents(callsign), reward_id TEXT NOT NULL,
        granted_at INTEGER NOT NULL, PRIMARY KEY(callsign, reward_id)
      );
      CREATE TABLE IF NOT EXISTS campaign_guest_visits (
        campaign_id TEXT NOT NULL REFERENCES solo_campaigns(campaign_id),
        guest TEXT NOT NULL REFERENCES agents(callsign), presentation_json TEXT NOT NULL,
        PRIMARY KEY(campaign_id, guest)
      );
    `);
  }

  public loadOrCreate(owner: string): OwnedSoloCampaign {
    const row = this.agents.db.prepare('SELECT * FROM solo_campaigns WHERE owner = ?').get(owner) as Row | undefined;
    if (row) {
      // Parsing happens before any write; an unknown version is retained for recovery/migration.
      return { id: row.campaign_id, owner: row.owner, revision: row.revision,
        savedAt: row.saved_at, state: parseSoloCampaign(JSON.parse(row.state_json)) };
    }
    const state = newSoloCampaign(), id = crypto.randomUUID(), savedAt = Date.now();
    this.agents.db.prepare('INSERT INTO solo_campaigns VALUES (?, ?, 0, ?, ?)').run(id, owner, savedAt, JSON.stringify(state));
    return { id, owner, revision: 0, savedAt, state };
  }

  /** Profile, world checkpoint and unique reward receipts are one SQLite transaction. */
  public commit(campaign: OwnedSoloCampaign, record: PersistentAgentRecord, input: SoloCampaignState): OwnedSoloCampaign {
    if (record.callsign !== campaign.owner) throw new Error('Campaign owner mismatch');
    return this.commitParty(campaign, [record], input, []);
  }

  public loadVisit(campaign: OwnedSoloCampaign, guest: string): CampaignPresentation {
    const visit = this.agents.db.prepare('SELECT presentation_json FROM campaign_guest_visits WHERE campaign_id = ? AND guest = ?').get(campaign.id, guest) as { presentation_json: string } | undefined;
    if (visit) return parseCampaignPresentation(JSON.parse(visit.presentation_json));
    const own = this.agents.db.prepare('SELECT state_json FROM solo_campaigns WHERE owner = ?').get(guest) as { state_json: string } | undefined;
    const settings = own ? parseSoloCampaign(JSON.parse(own.state_json)).presentation?.settings : null;
    const result = structuredClone(campaign.state.presentation ?? newCampaignPresentation());
    result.settings = structuredClone(settings ?? newCampaignPresentation().settings);
    return result;
  }

  /** One transaction commits the host world and every present character/visit; guest worlds are untouched. */
  public commitParty(campaign: OwnedSoloCampaign, records: PersistentAgentRecord[], input: SoloCampaignState,
    visits: { guest: string; presentation: CampaignPresentation }[]): OwnedSoloCampaign {
    const names = new Set(records.map(r => r.callsign));
    if (names.size !== records.length || !names.has(campaign.owner)) throw new Error('Party owner/records mismatch');
    if (new Set(visits.map(v => v.guest)).size !== visits.length || visits.some(v => v.guest === campaign.owner || !names.has(v.guest))) throw new Error('Invalid campaign visit owner');
    const validatedVisits = visits.map(v => ({ ...v, presentation: parseCampaignPresentation(v.presentation) }));
    const record = records.find(r => r.callsign === campaign.owner)!;
    const state = parseSoloCampaign(input), savedAt = Date.now();
    const rewards = state.districts.filter(d => d.stage === 4).map(d => DISTRICT_LOOP_SPECS.find(s => s.district === d.district)!.rewardId);
    if (rewards.some(reward => !record.unlockedDistrictRewards.includes(reward))) throw new Error('Campaign completion and reward disagree');
    this.agents.db.transaction(() => {
      for (const member of records) this.agents.saveAgent(member);
      const updated = this.agents.db.prepare(`UPDATE solo_campaigns SET revision = revision + 1, saved_at = ?, state_json = ?
        WHERE campaign_id = ? AND owner = ? AND revision = ?`).run(savedAt, JSON.stringify(state), campaign.id, campaign.owner, campaign.revision);
      if (updated.changes !== 1) throw new Error('Campaign changed in another session. Reload before continuing.');
      const insert = this.agents.db.prepare('INSERT OR IGNORE INTO solo_reward_receipts VALUES (?, ?, ?)');
      for (const reward of rewards) insert.run(campaign.id, reward, savedAt);
      if (state.dreadnoughtDefeated) insert.run(campaign.id, 'DREADNOUGHT_DEFEATED', savedAt);
      const reward = this.agents.db.prepare('INSERT OR IGNORE INTO character_reward_receipts VALUES (?, ?, ?)');
      for (const member of records) for (const id of member.unlockedDistrictRewards) reward.run(member.callsign, id, savedAt);
      const visit = this.agents.db.prepare('INSERT INTO campaign_guest_visits VALUES (?, ?, ?) ON CONFLICT(campaign_id, guest) DO UPDATE SET presentation_json = excluded.presentation_json');
      for (const v of validatedVisits) visit.run(campaign.id, v.guest, JSON.stringify(v.presentation));
    })();
    return { ...campaign, state, revision: campaign.revision + 1, savedAt };
  }
}
