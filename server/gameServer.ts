import crypto from 'node:crypto';
import { parseCampaignPresentation, campaignRecap, type CampaignPresentation } from '../shared/campaign/presentation.js';
import { encodeEffects } from '../shared/protocol/presentationProtocol.js';
import { CampaignStore, type OwnedSoloCampaign } from './campaignStore.js';
import { captureSoloWorld, restoreSoloWorld } from './soloWorldCheckpoint.js';
import { SOLO_RESUME_POSITION, soloCheckpointLabel } from '../shared/campaign/soloCampaign.js';
/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Authoritative 60Hz Rapier3D Game Server, 182-Orb Manager & 30Hz Binary Broadcaster
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { encodeCombatPresentation } from '../shared/combat/combatPresentation.js';
import { encodeVehicleDamage } from '../shared/protocol/vehicleDamageProtocol.js';
import { encodeRelays } from '../shared/protocol/relayProtocol.js';
import {
  AgentAttributes,
  AugmentChassisId,
  computeAttributeLevelFromXP,
  FIXED_TIMESTEP,
  FIXED_TIMESTEP_MS,
  MAX_PLAYERS,
  OrbType,
  PetMode,
  TOTAL_AGILITY_ORBS,
  TOTAL_ORBS,
  TOTAL_RENEGADE_ORBS,
  TOTAL_WHISPER_ORBS,
} from '../shared/constants.js';
import {
  AgentPhysicsBody,
  initRapierPhysics,
  SharedPhysicsWorld,
} from '../shared/physics/characterController.js';
import {
  AUGMENT_CHASSIS_CATALOG,
  checkAgentRelicIntersection,
  PROTOTYPE_RELIC_SPECS,
  availableSkillPoints,
  skillUnlockError,
} from '../shared/progression/skillTreeSystem.js';
import {
  ClientInputPacket,
  decodeClientInput,
  encodeEnemySnapshot,
  encodeRenegadeOrbSnapshot,
  encodeVehiclePropSnapshot,
  encodeWorldEventsSnapshot,
  encodeWorldSnapshot,
  encodePhase6Snapshot,
  EntitySnapshotState,
  RenegadeOrbBinaryState,
  Vec3,
} from '../shared/protocol/binaryProtocol.js';
import {
  checkAgentOrbIntersection,
  generateNeoVeridiaOrbs,
  stepRenegadeOrbSteering,
  WorldOrbInstance,
} from '../shared/world/orbSystem.js';
import { computeNeuralDriftRatios } from '../shared/world/phase5Systems.js';
import { AgentDatabase, PersistentAgentRecord } from './db.js';
import { isValidPetSpecies } from '../shared/world/cyberPetArena.js';

interface ConnectedClientSession {
  ws: WebSocket;
  visit?: CampaignPresentation;
  entityId: number;
  callsign: string;
  record: PersistentAgentRecord;
  collectedOrbSet: Set<number>;
  agent: AgentPhysicsBody;
  inputQueue: ClientInputPacket[];
  lastInput: ClientInputPacket;
  authenticated: boolean;
  lastInputAt: number;
  downedAt: number;
}

export interface ServerConfig {
  port?: number;
  dbPath?: string;
  publicDir?: string;
  mode?: 'shared' | 'solo' | 'campaign';
  bindAddress?: string;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.hdr': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export class CrackupAuthoritativeServer {
  public readonly mode: 'shared' | 'solo' | 'campaign';
  public soloPaused = false;
  public soloSaveError = false;
  public lastLocalActivityAt = Date.now();
  private readonly campaignStore: CampaignStore | null;
  private soloCampaign: OwnedSoloCampaign | null = null;
  private pendingPresentation: CampaignPresentation | null = null;
  public readonly db: AgentDatabase;
  public physicsWorld!: SharedPhysicsWorld;
  public readonly orbs: WorldOrbInstance[];
  public httpServer!: http.Server;
  public wss!: WebSocketServer;

  private readonly clientsByEntityId: Map<number, ConnectedClientSession> = new Map();
  private readonly clientsByCallsign: Map<string, ConnectedClientSession> = new Map();
  private nextEntityId = 1;
  private physicsInterval: NodeJS.Timeout | null = null;
  private autosaveInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly authAttempts = new Map<string, { count: number; since: number }>();
  private startTimeMs = Date.now();
  private readonly publicDir: string;
  private port: number;
  private readonly bindAddress: string;
  private campaignOwnerRecord: PersistentAgentRecord | null = null;
  private campaignInvite = '';

  constructor(config: ServerConfig = {}) {
    this.mode = config.mode ?? 'shared';
    this.bindAddress = this.mode === 'solo' ? '127.0.0.1' : config.bindAddress ?? (this.mode === 'campaign' ? '127.0.0.1' : '0.0.0.0');
    this.port = config.port ?? Number(process.env.PORT || 3000);
    this.db = new AgentDatabase(config.dbPath);
    this.campaignStore = this.mode !== 'shared' ? new CampaignStore(this.db) : null;
    this.publicDir = config.publicDir || path.resolve(process.cwd(), 'public');
    this.orbs = generateNeoVeridiaOrbs();
  }

  public async start(): Promise<number> {
    await initRapierPhysics();
    this.physicsWorld = new SharedPhysicsWorld();
    this.startTimeMs = Date.now();

    this.httpServer = http.createServer((req, res) => this.handleHttpRequest(req, res));
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
    this.httpServer.on('upgrade', (req, socket, head) => {
      let allowedOrigin = !req.headers.origin;
      try {
        const origin = req.headers.origin;
        const configured = process.env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim());
        allowedOrigin ||= Boolean(origin && (this.mode === 'solo' || (this.mode === 'campaign' && this.bindAddress === '127.0.0.1')
          ? new URL(origin).host === `127.0.0.1:${this.port}` && new URL(origin).protocol === 'http:'
          : configured ? configured.includes(origin) : new URL(origin).host === req.headers.host));
      } catch { allowedOrigin = false; }
      if (req.url !== '/ws' || !allowedOrigin || this.wss.clients.size >= 32) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req));
    });
    this.wss.on('connection', (ws, req) => this.handleSocketConnection(ws, req.socket.remoteAddress || 'unknown'));
    this.heartbeatInterval = setInterval(() => {
      for (const ws of this.wss.clients) {
        if (!this.liveSockets.delete(ws)) { ws.terminate(); continue; }
        ws.ping();
      }
      for (const [ip, attempt] of this.authAttempts) {
        if (Date.now() - attempt.since > 60_000) this.authAttempts.delete(ip);
      }
    }, 30_000);

    await new Promise<void>((resolve, reject) => {
      this.httpServer.once('error', reject);
      this.httpServer.listen(this.port, this.bindAddress, () => {
        const addr = this.httpServer.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
        }
        resolve();
      });
    });

    // Authoritative 60Hz deterministic physics loop + 30Hz binary snapshot broadcast
    let previousTime = performance.now();
    let accumulatedMs = 0;
    this.physicsInterval = setInterval(() => {
      const now = performance.now();
      accumulatedMs = Math.min(accumulatedMs + now - previousTime, FIXED_TIMESTEP_MS * 4);
      previousTime = now;
      while (accumulatedMs >= FIXED_TIMESTEP_MS) {
        this.tickAuthoritativeSimulation();
        accumulatedMs -= FIXED_TIMESTEP_MS;
      }
    }, FIXED_TIMESTEP_MS / 2);

    // Periodic 5-second SQLite WAL autosave for all active agents
    this.autosaveInterval = setInterval(() => {
      this.persistAllConnectedAgents();
    }, 5000);

    return this.port;
  }

  public getPort(): number {
    return this.port;
  }

  public getActiveAgentCount(): number {
    return this.clientsByEntityId.size;
  }

  public async stop(): Promise<void> {
    if (this.mode !== 'shared' && !this.persistAllConnectedAgents()) throw new Error('Solo save failed; shutdown cancelled to preserve the active campaign.');
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.physicsInterval) {
      clearInterval(this.physicsInterval);
      this.physicsInterval = null;
    }
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
      this.autosaveInterval = null;
    }

    this.persistAllConnectedAgents();

    for (const session of this.clientsByEntityId.values()) {
      try {
        session.ws.close(1000, 'Server shutting down');
      } catch {
        // Ignore close errors
      }
      this.physicsWorld.removeAgent(session.entityId);
    }
    this.clientsByEntityId.clear();
    this.clientsByCallsign.clear();

    if (this.wss) {
      for (const ws of this.wss.clients) ws.terminate();
      await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    }
    if (this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer.close(() => resolve()));
    }
    this.db.close();
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // A local server must not become a cross-origin profile API or a DNS-rebinding target.
    if ((this.mode === 'solo' || (this.mode === 'campaign' && this.bindAddress === '127.0.0.1')) && (req.headers.host !== `127.0.0.1:${this.port}` ||
        (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${this.port}`))) {
      res.writeHead(403); res.end('Local solo access only'); return;
    }
    if (this.mode === 'solo') this.lastLocalActivityAt = Date.now();
    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = urlObj.pathname;

    if (this.mode === 'shared') res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === '/api/health' && req.method === 'GET') {
      const payload = {
        status: 'ok',
        product: 'crackup-protocol-eclipse',
        mode: this.mode,
        soloPaused: this.mode === 'solo' && (this.soloPaused || this.soloSaveError || this.clientsByEntityId.size === 0),
        version: '2.0.0',
        architecture: 'True-3D-Rapier3D-BinaryNetcode',
        journalMode: this.db.getJournalMode(),
        activeAgents: this.clientsByEntityId.size,
        maxPlayers: this.mode === 'solo' ? 1 : MAX_PLAYERS,
        tickCount: this.physicsWorld.tickCount,
        serverTimeSec: (Date.now() - this.startTimeMs) / 1000,
        registeredAccounts: this.db.getTotalAgentCount(),
        totalOrbs: this.orbs.length,
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
      return;
    }

    if (this.mode !== 'shared' && pathname.startsWith('/api/')) {
      res.writeHead(404); res.end('Use the local profile screen.'); return;
    }

    if (pathname === '/api/orbs' && req.method === 'GET') {
      const renegades = this.orbs
        .filter((o) => o.type === OrbType.RENEGADE)
        .map((o) => ({
          orbId: o.orbId,
          district: o.district,
          position: o.position,
          velocity: o.velocity,
          isFleeing: o.isFleeing,
        }));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          totalOrbs: TOTAL_ORBS,
          agilityOrbs: TOTAL_AGILITY_ORBS,
          renegadeOrbs: TOTAL_RENEGADE_ORBS,
          whisperOrbs: TOTAL_WHISPER_ORBS,
          renegades,
        })
      );
      return;
    }

    if (pathname === '/api/enemies' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          enemies: this.physicsWorld.combatManager.toBinarySnapshots(),
        })
      );
      return;
    }

    if (pathname === '/api/phase5' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          districtLoops: this.physicsWorld.phase5Director.toBinaryDistrictLoopSnapshots(),
          omegaBounty: this.physicsWorld.phase5Director.toBinaryOmegaBountySnapshot(),
          auditorAirships: this.physicsWorld.phase5Director.toBinaryAuditorAirshipSnapshots(),
        })
      );
      return;
    }

    if (pathname.startsWith('/api/agent/') && req.method === 'GET') {
      const callsign = decodeURIComponent(pathname.slice('/api/agent/'.length));
      const liveSession = this.clientsByCallsign.get(callsign.trim().toUpperCase());
      if (liveSession) {
        this.persistSession(liveSession);
      }
      const record = this.db.getAgent(callsign);
      if (!record) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Agent not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, agent: record }));
      return;
    }

    if (pathname === '/api/auth' && req.method === 'POST') {
      if (!this.allowAuthAttempt(req.socket.remoteAddress || 'unknown')) {
        res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
        res.end(JSON.stringify({ ok: false, error: 'Too many login attempts. Try again in a minute.' }));
        return;
      }
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 16384) req.destroy();
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const result = this.db.authenticateOrCreate(
            String(parsed.callsign || ''),
            String(parsed.pin || ''),
            this.computeDefaultSpawn(this.db.getTotalAgentCount())
          );
          res.writeHead(result.ok ? 200 : 401, {
            'Content-Type': 'application/json; charset=utf-8',
          });
          res.end(JSON.stringify(result));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'Malformed JSON body' }));
        }
      });
      return;
    }

    // Serve static files from public/
    const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const safePath = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.join(this.publicDir, safePath);

    if (!fullPath.startsWith(this.publicDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.stat(fullPath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
      const ext = path.extname(fullPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(fullPath).pipe(res);
    });
  }

  private computeDefaultSpawn(index: number): { x: number; y: number; z: number } {
    const slot = index % MAX_PLAYERS;
    const angle = ((slot - 3.5) / MAX_PLAYERS) * Math.PI * 0.65;
    const radius = 3.5;
    return {
      x: Number((-12 + Math.sin(angle) * radius).toFixed(2)),
      y: 0.0,
      z: Number((12.0 + Math.cos(angle) * 1.5).toFixed(2)),
    };
  }

  private readonly liveSockets = new Set<WebSocket>();

  private allowAuthAttempt(ip: string): boolean {
    const now = Date.now();
    const attempt = this.authAttempts.get(ip);
    if (!attempt || now - attempt.since >= 60_000) {
      this.authAttempts.set(ip, { count: 1, since: now });
      return true;
    }
    return ++attempt.count <= 20;
  }

  private handleSocketConnection(ws: WebSocket, ip: string): void {
    let activeSession: ConnectedClientSession | null = null;
    let windowStart = Date.now(), inputs = 0, controls = 0, lastSeq = -1;
    this.liveSockets.add(ws);
    ws.on('pong', () => this.liveSockets.add(ws));
    const authTimeout = setTimeout(() => { if (!activeSession) ws.close(4003, 'Login timed out'); }, 10_000);

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      if (Date.now() - windowStart >= 1000) { windowStart = Date.now(); inputs = controls = 0; }
      if ((isBinary ? ++inputs > 120 : ++controls > 20)) { ws.close(4008, 'Message rate exceeded'); return; }
      if (isBinary) {
        if ((this.mode === 'solo' && (this.soloPaused || this.soloSaveError)) || this.partySuspended) return;
        if (!activeSession || !activeSession.authenticated || this.clientsByEntityId.get(activeSession.entityId) !== activeSession) {
          return;
        }
        let buf: ArrayBufferLike;
        if (Buffer.isBuffer(data)) {
          buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        } else if (data instanceof ArrayBuffer) {
          buf = data;
        } else {
          const joined = Buffer.concat(data as Buffer[]);
          buf = joined.buffer.slice(joined.byteOffset, joined.byteOffset + joined.byteLength);
        }

        const inputPacket = decodeClientInput(buf);
        if (!inputPacket || inputPacket.seq <= lastSeq) {
          return;
        }

        lastSeq = inputPacket.seq;
        if (activeSession.inputQueue.length < 8) {
          activeSession.inputQueue.push(inputPacket);
        }
        activeSession.lastInput = inputPacket;
        activeSession.lastInputAt = Date.now();
        return;
      }

      // Control handshake messages (AUTH, SET_ATTRIBUTES)
      try {
        const text = typeof data === 'string' ? data : data.toString('utf8');
        const msg = JSON.parse(text);
        if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

        if (msg.type === 'AUTH') {
          if (activeSession) return;
          if (this.mode === 'solo' && [...this.clientsByCallsign.keys()].some(name => name !== String(msg.callsign || '').trim().toUpperCase())) {
            ws.send(JSON.stringify({ type: 'AUTH_ERROR', error: 'Another local profile is playing. Save and return to profiles first.' }));
            return;
          }
          if (!this.allowAuthAttempt(ip)) {
            ws.send(JSON.stringify({ type: 'AUTH_ERROR', error: 'Too many login attempts. Try again in a minute.' }));
            return;
          }
          if (
            this.clientsByEntityId.size >= MAX_PLAYERS &&
            !this.clientsByCallsign.has(String(msg.callsign || '').trim().toUpperCase())
          ) {
            ws.send(
              JSON.stringify({
                type: 'AUTH_ERROR',
                error: `Server instance full (${MAX_PLAYERS}/${MAX_PLAYERS} Agents active).`,
              })
            );
            return;
          }

          const authRes = this.db.authenticateOrCreate(
            String(msg.callsign || ''),
            String(msg.pin || ''),
            this.computeDefaultSpawn(this.clientsByEntityId.size)
          );

          if (!authRes.ok) {
            ws.send(JSON.stringify({ type: 'AUTH_ERROR', error: authRes.error }));
            return;
          }

          if (this.mode === 'campaign') {
            const host = msg.campaignRole === 'host';
            const owner = this.soloCampaign?.owner;
            const valid = host ? (!owner || owner === authRes.record.callsign)
              : msg.campaignRole === 'guest' && owner && owner !== authRes.record.callsign &&
                this.clientsByCallsign.has(owner) && msg.campaignOwner === owner && msg.inviteCode === this.campaignInvite;
            if (!valid || (this.soloSaveError && !host)) {
              ws.send(JSON.stringify({ type: 'AUTH_ERROR', error: this.soloSaveError
                ? 'Campaign saving needs recovery. The host must retry Save checkpoint.'
                : 'Host your own campaign, or join an active host with their callsign and current session code.' }));
              return;
            }
          }

          const prevSession = this.clientsByCallsign.get(authRes.record.callsign);
          if (prevSession) {
            if (!this.cleanupSession(prevSession)) {
              ws.send(JSON.stringify({ type: 'AUTH_ERROR', error: 'The active campaign could not be saved. Free disk space and retry.' }));
              return;
            }
            // Replacement must use the just-saved state, including health and upgrades.
            const latest = this.db.getAgent(authRes.record.callsign);
            if (latest) authRes.record = latest;
            try {
              prevSession.ws.close(4001, 'Replaced by newer session');
            } catch {
              // Ignore
            }
          }

          if (this.campaignStore && (this.mode === 'solo' || !this.soloCampaign)) {
            try {
              const campaign = this.campaignStore.loadOrCreate(authRes.record.callsign);
              const restored = new SharedPhysicsWorld();
              try { restoreSoloWorld(restored, campaign.state); }
              catch (error) { restored.world.free(); throw error; }
              this.physicsWorld.world.free();
              this.physicsWorld = restored;
              this.soloCampaign = campaign;
              this.pendingPresentation = null;
              if (this.mode === 'campaign') this.campaignInvite = crypto.randomBytes(9).toString('base64url');
              this.soloPaused = false; this.soloSaveError = false;
              authRes.record.position = { ...SOLO_RESUME_POSITION };
            } catch {
              ws.send(JSON.stringify({ type: 'AUTH_ERROR', error: 'This solo campaign could not be loaded. The save has been kept unchanged; check the local save folder before retrying.' }));
              return;
            }
          }

          let visit: CampaignPresentation | undefined;
          if (this.mode === 'campaign') {
            if (authRes.record.callsign === this.soloCampaign!.owner) this.campaignOwnerRecord = authRes.record;
            else {
              try { visit = this.campaignStore!.loadVisit(this.soloCampaign!, authRes.record.callsign); }
              catch { ws.send(JSON.stringify({ type: 'AUTH_ERROR', error: 'Your campaign visit could not be loaded. The save was kept unchanged.' })); return; }
            }
            authRes.record.position = { ...SOLO_RESUME_POSITION };
          }

          const entityId = this.nextEntityId++;
          if (this.nextEntityId > 65000) {
            this.nextEntityId = 1;
          }

          const agentBody = this.physicsWorld.createAgent(
            entityId,
            authRes.record.callsign,
            authRes.record.position,
            authRes.record.rotation,
            authRes.record.attributes,
            authRes.record.telemetry,
            authRes.record.augmentChassis,
            authRes.record.unlockedSkills,
            authRes.record.unlockedRelics,
            authRes.record.unlockedDistrictRewards,
            authRes.record.activeNeuralDrifts
          );
          if (this.mode === 'campaign' && visit) {
            // Shared mode intentionally grants existing world technology on join. Owned visits do not.
            agentBody.unlockedDistrictRewards = new Set(authRes.record.unlockedDistrictRewards);
            this.physicsWorld.recomputeAgentBuild(agentBody);
          }
          if (typeof authRes.record.hp === 'number') agentBody.hp = Math.min(agentBody.maxHp, authRes.record.hp);

          activeSession = {
            ws, visit,
            entityId,
            callsign: authRes.record.callsign,
            record: authRes.record,
            collectedOrbSet: new Set(authRes.record.collectedOrbs || []),
            agent: agentBody,
            inputQueue: [],
            lastInput: {
              seq: 0,
              moveX: 0,
              moveZ: 0,
              yaw: 0,
              pitch: 0,
              buttons: 0,
              dt: FIXED_TIMESTEP,
            },
            authenticated: true,
            lastInputAt: Date.now(),
            downedAt: agentBody.hp <= 0 ? Date.now() : 0,
          };

          this.clientsByEntityId.set(entityId, activeSession);
          clearTimeout(authTimeout);
          agentBody.spawnProtectionSec = 15;
          this.clientsByCallsign.set(activeSession.callsign, activeSession);
          if (authRes.record.pet) {
            this.physicsWorld.cyberPetArenaManager.adoptPet(agentBody, authRes.record.pet.species, authRes.record.pet);
          }

          ws.send(
            JSON.stringify({
              type: 'AUTH_OK',
              entityId,
              callsign: activeSession.callsign,
              isNew: authRes.isNew,
              record: activeSession.record,
              mode: this.mode,
              presentation: visit ?? this.soloCampaign?.state.presentation ?? null,
              serverTimeSec: (Date.now() - this.startTimeMs) / 1000,
            })
          );

          this.broadcastRoster();
          this.sendPlayerState(activeSession);
          if (this.mode === 'solo') this.sendSoloState(activeSession);
          if (this.mode === 'campaign') { this.clearPartyInput(); this.persistParty(); this.broadcastPartyState(); }
          return;
        }

        if (activeSession && this.clientsByEntityId.get(activeSession.entityId) !== activeSession) return;
        if (activeSession && this.mode === 'campaign') {
          if (msg.type === 'CAMPAIGN_PRESENTATION') {
            try {
              const presentation = parseCampaignPresentation(msg.presentation);
              if (activeSession.callsign === this.soloCampaign?.owner) this.pendingPresentation = presentation;
              else activeSession.visit = presentation;
            } catch { ws.send(JSON.stringify({ type: 'SOLO_PRESENTATION_ERROR', error: 'Invalid campaign presentation update.' })); return; }
            this.persistParty(); return;
          }
          if (msg.type === 'CAMPAIGN_SAVE' || msg.type === 'CAMPAIGN_LEAVE') {
            if (!this.persistParty()) return;
            if (msg.type === 'CAMPAIGN_LEAVE') {
              const leaving = activeSession.callsign === this.soloCampaign?.owner ? [...this.clientsByEntityId.values()] : [activeSession];
              for (const member of leaving) {
                member.ws.send(JSON.stringify({ type: 'CAMPAIGN_LEFT' }));
                this.removeSession(member); member.ws.close(1000, 'Campaign visit saved');
              }
              this.releaseEmptyParty(); this.broadcastRoster(); this.broadcastPartyState();
            }
            return;
          }
          if (this.partySuspended || msg.type.startsWith('SOLO_')) { this.broadcastPartyState(); return; }
        }
        if (activeSession && this.mode === 'solo' && msg.type === 'SOLO_PRESENTATION') {
          try { this.pendingPresentation = parseCampaignPresentation(msg.presentation); }
          catch { ws.send(JSON.stringify({ type: 'SOLO_PRESENTATION_ERROR', error: 'Invalid story or settings update. Reload to restore your saved campaign.' })); return; }
          this.persistSession(activeSession);
          return;
        }
        if (activeSession && this.mode === 'solo' && ['SOLO_PAUSE', 'SOLO_SAVE', 'SOLO_LEAVE'].includes(msg.type)) {
          if (msg.type === 'SOLO_PAUSE') {
            if (typeof msg.paused !== 'boolean') return;
            this.soloPaused = msg.paused;
            activeSession.inputQueue.length = 0;
            activeSession.lastInput = { ...activeSession.lastInput, moveX: 0, moveZ: 0, buttons: 0 };
          }
          const saved = this.persistSession(activeSession);
          this.sendSoloState(activeSession);
          if (msg.type === 'SOLO_LEAVE' && saved) {
            this.cleanupSession(activeSession);
            ws.send(JSON.stringify({ type: 'SOLO_LEFT' }));
            ws.close(1000, 'Local profile saved');
          }
          return;
        }
        if (activeSession && this.mode === 'solo' && this.soloSaveError) {
          this.sendSoloState(activeSession); return;
        }

        if (activeSession && ['PET_ADOPT', 'PET_DERBY_JOIN', 'PET_DERBY_LEAVE', 'PET_CLASH_JOIN', 'PET_CLASH_LEAVE', 'PET_ARENA_LEAVE'].includes(msg.type)) {
          const manager = this.physicsWorld.cyberPetArenaManager;
          const agent = activeSession.agent;
          let result: { ok: boolean; error?: string };
          if (msg.type === 'PET_ADOPT') {
            const existing = manager.getPetForOwner(agent.entityId);
            if (!isValidPetSpecies(msg.species)) {
              result = { ok: false, error: 'Unknown Cyber-Pet species.' };
            } else if (existing && existing.mode !== PetMode.FOLLOW) {
              result = { ok: false, error: 'Leave the pet arena before adopting.' };
            } else {
              const stats = manager.getPersistedStats(agent.entityId);
              manager.adoptPet(agent, msg.species, {
                derbyWins: stats?.derbyWins ?? 0, clashWins: stats?.clashWins ?? 0,
                name: typeof msg.name === 'string' ? msg.name.trim().slice(0, 32) : undefined,
              });
              result = { ok: true };
            }
          } else if (msg.type.endsWith('_JOIN')) {
            result = agent.hp <= 0 || agent.mountedVehicleId > 0 || agent.heldPropId > 0
              ? { ok: false, error: 'Enter on foot, alive, with empty hands.' }
              : msg.type === 'PET_DERBY_JOIN' ? manager.joinDerby(agent) : manager.joinClash(agent);
          } else {
            const pet = manager.getPetForOwner(agent.entityId);
            const matches = msg.type === 'PET_ARENA_LEAVE' ||
              (msg.type === 'PET_DERBY_LEAVE' && pet?.mode === PetMode.DERBY) ||
              (msg.type === 'PET_CLASH_LEAVE' && pet?.mode === PetMode.CLASH);
            result = matches && manager.leaveArena(agent) ? { ok: true } : { ok: false, error: 'Agent is not in that arena.' };
          }
          if (result.ok) this.persistSession(activeSession);
          ws.send(JSON.stringify({ type: 'PHASE6_CONTROL_RESULT', requestType: msg.type, ...result,
            pet: manager.getPersistedStats(agent.entityId) }));
          return;
        }

        if (['SET_ATTRIBUTES', 'SET_BUILD'].includes(msg.type) && activeSession) {
          ws.send(JSON.stringify({ type: 'CONTROL_ERROR', error: 'Progression is earned through play. Use the upgrade menu.' }));
          return;
        }

        if (msg.type === 'RESPAWN' && activeSession) {
          const session = activeSession;
          if (session.agent.hp > 0 || !session.downedAt || Date.now() - session.downedAt < 3000) return;
          this.persistSession(session);
          const old = session.agent;
          this.physicsWorld.removeAgent(session.entityId);
          session.agent = this.physicsWorld.createAgent(session.entityId, session.callsign,
            this.computeDefaultSpawn(0), { x: 0, y: 0, z: 0, w: 1 }, old.attributes, old.telemetry,
            old.augmentChassis, [...old.unlockedSkills], [...old.unlockedRelics], [...old.unlockedDistrictRewards], [...old.activeNeuralDrifts]);
          session.agent.spawnProtectionSec = 15;
          session.inputQueue.length = 0;
          session.lastInput = { ...session.lastInput, buttons: 0, moveX: 0, moveZ: 0 };
          session.downedAt = 0;
          if (session.record.pet) this.physicsWorld.cyberPetArenaManager.adoptPet(session.agent, session.record.pet.species, session.record.pet);
          this.persistSession(session);
          ws.send(JSON.stringify({ type: 'RESPAWNED', position: session.agent.position }));
          this.sendPlayerState(session);
          return;
        }

        if (['SELECT_CHASSIS', 'UNLOCK_SKILL'].includes(msg.type) && activeSession) {
          if (activeSession.agent.hp <= 0) return;
          if (msg.type === 'SELECT_CHASSIS') {
            if (!Object.hasOwn(AUGMENT_CHASSIS_CATALOG, msg.augmentChassis)) return;
            activeSession.agent.augmentChassis = msg.augmentChassis as AugmentChassisId;
          } else {
            const error = skillUnlockError(String(msg.skillId), activeSession.record.xp, activeSession.agent.unlockedSkills);
            if (error) {
              ws.send(JSON.stringify({ type: 'CONTROL_ERROR', error }));
              return;
            }
            activeSession.agent.unlockedSkills.add(String(msg.skillId));
          }

          this.physicsWorld.recomputeAgentBuild(activeSession.agent);
          this.persistSession(activeSession);
          this.sendPlayerState(activeSession);
          this.broadcastRoster();

          if (activeSession.ws.readyState === WebSocket.OPEN) {
            activeSession.ws.send(
              JSON.stringify({
                type: 'BUILD_UPDATED',
                augmentChassis: activeSession.agent.augmentChassis,
                unlockedSkills: Array.from(activeSession.agent.unlockedSkills),
                unlockedRelics: Array.from(activeSession.agent.unlockedRelics),
                maxHp: activeSession.agent.maxHp,
              })
            );
          }
          return;
        }
      } catch {
        // Ignore malformed control text
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      this.liveSockets.delete(ws);
      if (activeSession) {
        this.cleanupSession(activeSession);
        activeSession = null;
        this.broadcastRoster();
      }
    });

    ws.on('error', () => {
      if (activeSession) {
        this.cleanupSession(activeSession);
        activeSession = null;
      }
    });
  }

  private sendPlayerState(session: ConnectedClientSession): void {
    if (session.ws.readyState !== WebSocket.OPEN) return;
    const a = session.agent;
    session.ws.send(JSON.stringify({ type: 'PLAYER_STATE', hp: a.hp, maxHp: a.maxHp,
      fuel: a.jetpackFuelSec, maxFuel: a.maxJetpackFuelSec, protectionSec: a.spawnProtectionSec,
      attributes: a.attributes, xp: session.record.xp, skillPoints: availableSkillPoints(session.record.xp, a.unlockedSkills),
      unlockedSkills: [...a.unlockedSkills], unlockedRelics: [...a.unlockedRelics],
      narrativeProgress: { whisperOrbs: a.telemetry.whisperOrbsCollected ?? 0, nonLethalBounties: a.telemetry.nonLethalBountiesCompleted ?? 0 },
      respawnIn: a.hp <= 0 ? Math.max(0, 3 - (Date.now() - session.downedAt) / 1000) : 0 }));
  }

  private cleanupSession(session: ConnectedClientSession): boolean {
    if (!this.clientsByEntityId.has(session.entityId)) {
      return true;
    }
    if (!this.persistSession(session)) return false;
    this.removeSession(session);
    this.releaseEmptyParty();
    this.broadcastPartyState();
    return true;
  }

  private removeSession(session: ConnectedClientSession): void {
    if (this.clientsByEntityId.get(session.entityId) !== session) return;
    this.physicsWorld.removeAgent(session.entityId);
    this.clientsByEntityId.delete(session.entityId);
    if (this.clientsByCallsign.get(session.callsign) === session) {
      this.clientsByCallsign.delete(session.callsign);
    }
  }

  private syncRecord(session: ConnectedClientSession): void {
    session.record.hp = session.agent.hp;
    session.record.position = { ...(this.physicsWorld.cyberPetArenaManager.agentReturnPositions.get(session.entityId) ?? session.agent.position) };
    session.record.pet = this.physicsWorld.cyberPetArenaManager.getPersistedStats(session.entityId);
    session.record.rotation = { ...session.agent.rotation };
    session.record.attributes = { ...session.agent.attributes };
    session.record.telemetry = { ...session.agent.telemetry };
    session.record.collectedOrbs = Array.from(session.collectedOrbSet);
    session.record.augmentChassis = session.agent.augmentChassis;
    session.record.unlockedSkills = Array.from(session.agent.unlockedSkills);
    session.record.unlockedRelics = Array.from(session.agent.unlockedRelics);
    session.record.unlockedDistrictRewards = Array.from(session.agent.unlockedDistrictRewards);
    session.record.activeNeuralDrifts = Array.from(session.agent.activeNeuralDrifts);
    session.record.neuralDriftRatios = computeNeuralDriftRatios(session.agent.telemetry);
    session.record.updatedAt = Date.now();
  }

  private persistSession(session: ConnectedClientSession): boolean {
    if (this.mode === 'campaign') return this.persistParty();
    this.syncRecord(session);
    if (this.campaignStore && this.soloCampaign) {
      try {
        this.soloCampaign = this.campaignStore.commit(this.soloCampaign, session.record, captureSoloWorld(this.physicsWorld, this.pendingPresentation ?? this.soloCampaign.state.presentation));
        this.pendingPresentation = null;
        this.soloSaveError = false;
        this.sendSoloState(session);
      } catch {
        this.soloSaveError = true;
        this.soloPaused = true;
        this.sendSoloState(session);
        return false;
      }
    } else this.db.saveAgent(session.record);
    return true;
  }

  private persistAllConnectedAgents(): boolean {
    if (this.mode === 'campaign') return this.persistParty();
    let ok = true;
    for (const session of this.clientsByEntityId.values()) {
      if (!this.persistSession(session)) ok = false;
    }
    return ok;
  }

  private sendSoloState(session: ConnectedClientSession): void {
    if (session.ws.readyState !== WebSocket.OPEN || !this.soloCampaign) return;
    session.ws.send(JSON.stringify({ type: 'SOLO_STATE', paused: this.soloPaused || this.soloSaveError,
      saveError: this.soloSaveError, savedAt: this.soloCampaign.savedAt,
      checkpoint: soloCheckpointLabel(this.soloCampaign.state), revision: this.soloCampaign.revision,
      recap: this.soloCampaign.state.presentation ? campaignRecap(this.soloCampaign.state.presentation) : '' }));
  }

  private get partySuspended(): boolean {
    return this.mode === 'campaign' && (this.soloSaveError || !this.soloCampaign ||
      this.clientsByCallsign.get(this.soloCampaign.owner)?.ws.readyState !== WebSocket.OPEN);
  }

  private clearPartyInput(): void {
    for (const session of this.clientsByEntityId.values()) {
      session.inputQueue.length = 0;
      session.lastInput = { ...session.lastInput, moveX: 0, moveZ: 0, buttons: 0 };
    }
  }

  private releaseEmptyParty(): void {
    if (this.mode !== 'campaign') return;
    this.clearPartyInput();
    if (this.clientsByEntityId.size === 0) {
      this.soloCampaign = null; this.campaignOwnerRecord = null;
      this.pendingPresentation = null; this.campaignInvite = ''; this.soloSaveError = false;
    }
  }

  private persistParty(): boolean {
    if (!this.soloCampaign || !this.campaignStore || !this.campaignOwnerRecord) return true;
    const sessions = [...this.clientsByEntityId.values()];
    sessions.forEach(s => this.syncRecord(s));
    const records = sessions.map(s => s.record);
    const owner = this.clientsByCallsign.get(this.soloCampaign.owner);
    if (owner) this.campaignOwnerRecord = owner.record;
    else records.push(this.campaignOwnerRecord);
    try {
      this.soloCampaign = this.campaignStore.commitParty(this.soloCampaign, records,
        captureSoloWorld(this.physicsWorld, this.pendingPresentation ?? this.soloCampaign.state.presentation),
        sessions.filter(s => s.visit).map(s => ({ guest: s.callsign, presentation: s.visit! })));
      this.pendingPresentation = null; this.soloSaveError = false;
      // A failed write keeps disconnected agents in memory for retry. Once durable, release them.
      const departed = sessions.filter(s => s.ws.readyState !== WebSocket.OPEN);
      departed.forEach(s => this.removeSession(s));
      if (departed.length) this.releaseEmptyParty();
    } catch {
      this.soloSaveError = true; this.clearPartyInput();
    }
    this.broadcastPartyState();
    return !this.soloSaveError;
  }

  private broadcastPartyState(): void {
    if (this.mode !== 'campaign' || !this.soloCampaign) return;
    for (const member of this.clientsByEntityId.values()) {
      if (member.ws.readyState !== WebSocket.OPEN) continue;
      const host = member.callsign === this.soloCampaign.owner;
      const presentation = member.visit ?? this.soloCampaign.state.presentation;
      member.ws.send(JSON.stringify({ type: 'CAMPAIGN_STATE', owner: this.soloCampaign.owner,
        role: host ? 'host' : 'guest', inviteCode: host ? this.campaignInvite : undefined,
        members: [...this.clientsByCallsign.keys()], paused: this.partySuspended,
        saveError: this.soloSaveError, savedAt: this.soloCampaign.savedAt, revision: this.soloCampaign.revision,
        checkpoint: soloCheckpointLabel(this.soloCampaign.state), recap: presentation ? campaignRecap(presentation) : '' }));
    }
  }

  private broadcastRoster(): void {
    const roster = Array.from(this.clientsByEntityId.values()).map((s) => ({
      entityId: s.entityId,
      callsign: s.callsign,
      attributes: s.agent.attributes,
      augmentChassis: s.agent.augmentChassis,
      unlockedDistrictRewards: Array.from(s.agent.unlockedDistrictRewards),
      activeNeuralDrifts: Array.from(s.agent.activeNeuralDrifts),
    }));
    const payload = JSON.stringify({ type: 'ROSTER_UPDATE', roster });
    for (const session of this.clientsByEntityId.values()) {
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(payload);
      }
    }
  }

  /**
   * Executes one authoritative 60Hz Rapier3D physics tick, Renegade Orb steering, Orb/Relic collection, Phase 5 Director, and 30Hz binary snapshots
   */
  public tickAuthoritativeSimulation(): void {
    if ((this.mode === 'solo' && (this.soloPaused || this.soloSaveError || this.clientsByEntityId.size === 0)) || this.partySuspended) return;
    const agentPositions: Vec3[] = [];

    for (const session of this.clientsByEntityId.values()) {
      if (session.inputQueue.length > 0) {
        const toProcess = session.inputQueue.splice(0, 1);
        for (const input of toProcess) {
          this.physicsWorld.applyAgentInput(session.agent, input);
        }
      } else {
        const idleContinue: ClientInputPacket = {
          ...session.lastInput,
          moveX: Date.now() - session.lastInputAt < 250 ? session.lastInput.moveX : 0,
          moveZ: Date.now() - session.lastInputAt < 250 ? session.lastInput.moveZ : 0,
          buttons:
            session.lastInput.buttons &
            ~(
              (1 << 0) |
              (1 << 1) |
              (1 << 5) |
              (1 << 6) |
              (1 << 7) |
              (1 << 12) |
              (1 << 13) |
              (1 << 14)
            ),
        };
        this.physicsWorld.applyAgentInput(session.agent, idleContinue);
      }
      agentPositions.push(session.agent.position);
    }

    this.physicsWorld.stepWorld();
    // A single hacked relay has no Phase 5 notification; checkpoint it before publishing success.
    if (this.soloCampaign && JSON.stringify(captureSoloWorld(this.physicsWorld, this.soloCampaign.state.presentation)) !== JSON.stringify(this.soloCampaign.state)) {
      if (!this.persistAllConnectedAgents()) return;
    }
    for (const session of this.clientsByEntityId.values()) {
      if (session.agent.hp <= 0 && !session.downedAt) session.downedAt = Date.now();
      if (session.agent.hp > 0) session.downedAt = 0;
      if (this.physicsWorld.tickCount % 6 === 0) this.sendPlayerState(session);
    }

    // Process 3D Combat Events (V.A.T.S. Bone-Collider Shots, Motion-Warped Melee, Q Counter-Parry Shockwaves)
    this.processPendingCombatEvents();

    // Process Phase 5 Events (District Loops, 90s Omega Bounty, Secret Neural Drift & Aegis Auditor Airships)
    this.processPendingPhase5Events();
    this.processPendingPhase6Events();

    // Step 3D Renegade Orb Flee + Rooftop Waypoint Steering (PRD 4.5)
    stepRenegadeOrbSteering(this.orbs, agentPositions, FIXED_TIMESTEP);

    // Authoritative 3D Orb & Prototype Relic Collection + Attribute XP Progression
    for (const session of this.clientsByEntityId.values()) {
      this.evaluateOrbCollectionForSession(session);
      this.evaluateRelicCollectionForSession(session);
    }

    // Broadcast binary ArrayBuffer World, Renegade Orb, Enemy, Vehicle/Prop & Phase 5 World Events Snapshots at 30Hz (every 2nd 60Hz tick)
    if (this.physicsWorld.tickCount % 2 === 0) {
      if (this.clientsByEntityId.size > 0) this.broadcastBinaryWorldSnapshots();
      // Transient effects never survive an empty session for the next player.
      const events = this.physicsWorld.effects.drain();
      if (events.length && this.clientsByEntityId.size > 0) {
        const packet = encodeEffects({ tick: this.physicsWorld.tickCount >>> 0, events });
        for (const session of this.clientsByEntityId.values()) {
          if (session.ws.readyState === WebSocket.OPEN && session.ws.bufferedAmount < 1024 * 1024) {
            session.ws.send(packet, { binary: true });
          }
        }
      }
    }
  }

  private evaluateRelicCollectionForSession(session: ConnectedClientSession): void {
    const agentPos = session.agent.position;
    for (const relic of PROTOTYPE_RELIC_SPECS) {
      if (session.agent.unlockedRelics.has(relic.id)) continue;
      if (!checkAgentRelicIntersection(agentPos, relic.position)) continue;

      session.agent.unlockedRelics.add(relic.id);
      session.agent.telemetry.relicsCollected =
        (session.agent.telemetry.relicsCollected || 0) + 1;
      session.record.xp.agility += 150;
      session.record.xp.strength += 150;
      session.record.xp.driving += 150;
      session.record.xp.shooting += 150;
      session.record.xp.explosives += 150;
      session.record.xp.flying += 150;
      session.record.xp.vigilante += 150;

      for (const key of Object.keys(session.agent.attributes) as (keyof AgentAttributes)[]) {
        session.agent.attributes[key] = Math.max(session.agent.attributes[key], computeAttributeLevelFromXP(session.record.xp[key]));
      }
      this.physicsWorld.recomputeAgentBuild(session.agent);
      this.persistSession(session);

      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(
          JSON.stringify({
            type: 'RELIC_COLLECTED',
            relicId: relic.id,
            name: relic.name,
            unlockedRelics: Array.from(session.agent.unlockedRelics),
          })
        );
      }
    }
  }

  private evaluateOrbCollectionForSession(session: ConnectedClientSession): void {
    const agentPos = session.agent.position;
    let anyLevelUp = false;

    for (const orb of this.orbs) {
      if (session.collectedOrbSet.has(orb.orbId)) continue;
      if (!checkAgentOrbIntersection(agentPos, orb.position)) continue;

      session.collectedOrbSet.add(orb.orbId);

      // Award attribute XP based on Orb type
      if (orb.type === OrbType.AGILITY) {
        session.record.xp.agility += 50;
        session.agent.telemetry.agilityOrbsCollected =
          (session.agent.telemetry.agilityOrbsCollected || 0) + 1;
      } else if (orb.type === OrbType.RENEGADE) {
        session.record.xp.agility += 150;
        session.record.xp.strength += 75;
        session.record.xp.driving += 75;
        session.record.xp.shooting += 75;
        session.record.xp.explosives += 75;
        session.record.xp.flying += 75;
        session.record.xp.vigilante += 75;
        session.agent.telemetry.renegadeOrbsCollected =
          (session.agent.telemetry.renegadeOrbsCollected || 0) + 1;
      } else if (orb.type === OrbType.WHISPER) {
        session.record.xp.vigilante += 120;
        session.record.xp.flying += 100;
        session.record.xp.shooting += 100;
        session.agent.telemetry.whisperOrbsCollected =
          (session.agent.telemetry.whisperOrbsCollected || 0) + 1;
      }

      // Check and apply attribute level-ups (Levels 1..5)
      const statKeys: (keyof AgentAttributes)[] = [
        'agility',
        'strength',
        'driving',
        'shooting',
        'explosives',
        'flying',
        'vigilante',
      ];
      for (const k of statKeys) {
        const computedLv = computeAttributeLevelFromXP(session.record.xp[k]);
        if (computedLv > session.agent.attributes[k]) {
          session.agent.attributes[k] = computedLv;
          anyLevelUp = true;
        }
      }

      this.persistSession(session);

      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(
          JSON.stringify({
            type: 'ORB_COLLECTED',
            orbId: orb.orbId,
            orbType: orb.type,
            district: orb.district,
            xp: session.record.xp,
            attributes: session.agent.attributes,
            collectedCount: session.collectedOrbSet.size,
          })
        );
      }
    }

    if (anyLevelUp) {
      this.physicsWorld.recomputeAgentBuild(session.agent);
      this.broadcastRoster();
    }
  }

  private processPendingCombatEvents(): void {
    const events = this.physicsWorld.pendingCombatEvents.splice(0);
    if (events.length === 0) return;

    let anyLevelUp = false;
    for (const ev of events) {
      this.physicsWorld.effects.fromCombat(ev);
      const session = this.clientsByEntityId.get(ev.attackerEntityId);
      if (session) {
        if (ev.type === 'WEAPON_HIT') {
          session.record.xp.shooting += ev.isCrit || ev.limbCrippled ? 50 : 30;
        } else if (ev.type === 'MELEE_HIT') {
          session.record.xp.strength += 40;
        } else if (ev.type === 'PARRY_TAKEDOWN') {
          session.record.xp.strength += 75;
          session.record.xp.vigilante += 75;
        }

        const statKeys: (keyof AgentAttributes)[] = [
          'agility',
          'strength',
          'driving',
          'shooting',
          'explosives',
          'flying',
          'vigilante',
        ];
        for (const k of statKeys) {
          const computedLv = computeAttributeLevelFromXP(session.record.xp[k]);
          if (computedLv > session.agent.attributes[k]) {
            session.agent.attributes[k] = computedLv;
            anyLevelUp = true;
          }
        }
        this.physicsWorld.recomputeAgentBuild(session.agent);
        this.persistSession(session);
      }

      const payload = JSON.stringify({
        type: 'COMBAT_EVENT',
        event: ev,
      });
      for (const s of this.clientsByEntityId.values()) {
        if (s.ws.readyState === WebSocket.OPEN) {
          s.ws.send(payload);
        }
      }
    }

    if (anyLevelUp) {
      this.broadcastRoster();
    }
  }

  private processPendingPhase5Events(): void {
    const notifications = this.physicsWorld.phase5Director.pendingNotifications.splice(0);
    if (notifications.length === 0) return;

    this.persistAllConnectedAgents();
    this.broadcastRoster();

    for (const note of notifications) {
      const payload = JSON.stringify({
        type: 'PHASE5_EVENT',
        notification: note,
      });
      for (const s of this.clientsByEntityId.values()) {
        if (s.ws.readyState === WebSocket.OPEN) {
          s.ws.send(payload);
        }
      }
    }
  }

  private processPendingPhase6Events(): void {
    const notifications = this.physicsWorld.pendingPhase6Events.splice(0);
    if (notifications.length === 0) return;
    this.persistAllConnectedAgents();
    for (const notification of notifications) {
      const payload = JSON.stringify({ type: 'PHASE6_EVENT', notification });
      for (const session of this.clientsByEntityId.values()) {
        if (session.ws.readyState === WebSocket.OPEN) session.ws.send(payload);
      }
    }
  }

  private broadcastBinaryWorldSnapshots(): void {
    const entities: EntitySnapshotState[] = [];
    for (const session of this.clientsByEntityId.values()) {
      entities.push(this.physicsWorld.toEntitySnapshot(session.agent));
    }

    const renegadeStates: RenegadeOrbBinaryState[] = [];
    for (const orb of this.orbs) {
      if (orb.type === OrbType.RENEGADE) {
        renegadeStates.push({
          orbId: orb.orbId,
          isFleeing: orb.isFleeing,
          position: orb.position,
        });
      }
    }

    const serverTimeSec = (Date.now() - this.startTimeMs) / 1000;
    const serverTick = this.physicsWorld.tickCount;
    const renegadeBuffer = encodeRenegadeOrbSnapshot(serverTick, renegadeStates);
    const enemyStates = this.physicsWorld.combatManager.toBinarySnapshots();
    const enemyBuffer = encodeEnemySnapshot(serverTick, enemyStates);
    const presentationBuffer = encodeCombatPresentation(serverTick, this.physicsWorld.combatManager.getPresentationStates(), this.physicsWorld.combatManager.getDroppedWeaponStates());
    const vehicleStates = this.physicsWorld.vehiclePropManager.toBinaryVehicleSnapshots();
    const propStates = this.physicsWorld.vehiclePropManager.toBinaryPropSnapshots();
    const vehiclePropBuffer = encodeVehiclePropSnapshot(serverTick, vehicleStates, propStates);
    const vehicleDamageBuffer = encodeVehicleDamage(this.physicsWorld.vehiclePropManager.toVehicleDamagePacket(serverTick));
    const relayBuffer = encodeRelays(this.physicsWorld.relaySystem.snapshot(serverTick));
    const worldEventsBuffer = encodeWorldEventsSnapshot(
      serverTick,
      this.physicsWorld.phase5Director.toBinaryOmegaBountySnapshot(),
      this.physicsWorld.phase5Director.toBinaryDistrictLoopSnapshots(),
      this.physicsWorld.phase5Director.toBinaryAuditorAirshipSnapshots()
    );
    const pets = this.physicsWorld.cyberPetArenaManager;
    const phase6Buffer = encodePhase6Snapshot(serverTick, pets.toBinaryPetStates(), pets.toBinaryArenaHeader(),
      pets.toBinaryDerbyRacers(), pets.toBinaryClashFighters(), this.physicsWorld.dreadnoughtDirector.toBinarySnapshot());

    for (const session of this.clientsByEntityId.values()) {
      if (session.ws.readyState !== WebSocket.OPEN) continue;
      if (session.ws.bufferedAmount > 1024 * 1024) { session.ws.close(4008, 'Connection too slow'); continue; }

      const snapshotBuffer = encodeWorldSnapshot({
        recipientEntityId: session.entityId,
        serverTick,
        lastProcessedInputSeq: session.agent.lastProcessedInputSeq,
        serverTimeSec,
        entities,
      });

      session.ws.send(snapshotBuffer, { binary: true });
      session.ws.send(renegadeBuffer, { binary: true });
      session.ws.send(enemyBuffer, { binary: true });
      session.ws.send(presentationBuffer, { binary: true });
      session.ws.send(vehiclePropBuffer, { binary: true });
      session.ws.send(vehicleDamageBuffer, { binary: true });
      session.ws.send(relayBuffer, { binary: true });
      session.ws.send(worldEventsBuffer, { binary: true });
      session.ws.send(phase6Buffer, { binary: true });
    }
  }
}
