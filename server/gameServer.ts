import { CHASSIS_REGISTRY, TIER3_SKILL_BY_ID } from '../shared/content/skillTreeRegistry.js';
import { awardActionXP, ATTRIBUTE_NAMES, COLLECTIBLE_XP } from '../shared/content/progressionRegistry.js';
import { createTier3State } from '../shared/progression/tier3System.js';
import { RELIC_REGISTRY, WEAPON_BY_ID, meetsRequirements } from '../shared/content/arsenalAndVehicleRegistry.js';
import { resolveCampaignEnding, normalizeGrid, DEFAULT_MICRO_TELEMETRY, type MicroActionKind } from '../shared/content/campaignGraph.js';
import { applySpireTraversal, resolveSpireMemory } from '../shared/world/resonanceSpire.js';
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
import { encodeTier2 } from '../shared/protocol/tier2Protocol.js';
import { encodeRelays } from '../shared/protocol/relayProtocol.js';
import {
  AgentAttributes,
  DistrictId,
  getDistrictForPosition,
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
import { DiagnosticRecorder, diagnosticErrorCode, diagnosticCloseCode, isDiagnosticId, sanitizeDiagnosticEvent, type DiagnosticContext } from '../shared/diagnostics/events.js';
import { DiagnosticJournal } from './diagnosticJournal.js';
import { DiagnosticReports } from './diagnosticReports.js';
import { diagnosticIdentity, diagnosticRef, serverDiagnostics } from './diagnostics.js';
import { PerformanceSampler, PerformanceClock, type ActivityState } from '../shared/diagnostics/performance.js';

interface ConnectedClientSession {
  diagnosticContext: DiagnosticContext;
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
  diagnosticJournal?: DiagnosticJournal;
  diagnostics?: DiagnosticRecorder;
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
  public readonly diagnostics: DiagnosticRecorder;
  public readonly performance: PerformanceSampler;
  private performanceClock: PerformanceClock | null = null;
  private readonly traffic = new WeakMap<WebSocket, {bytes: number; messages: number; since: number}>();
  public readonly diagnosticJournal: DiagnosticJournal;
  private readonly ownsDiagnosticJournal: boolean;
  private diagnosticReads = 0;
  private diagnosticReadWindow = 0;
  private diagnosticReadCount = 0;
  private readonly diagnosticBuilds = diagnosticIdentity();
  private lastSaveAttemptId: string | undefined;
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
    this.ownsDiagnosticJournal = !config.diagnosticJournal;
    this.diagnosticJournal = config.diagnosticJournal ?? new DiagnosticJournal(config.dbPath ? path.dirname(path.resolve(config.dbPath)) : process.env.DATA_DIR || path.resolve('data'));
    this.diagnostics = config.diagnostics ?? serverDiagnostics('server', this.diagnosticJournal.runId, this.diagnosticJournal);
    this.performance = new PerformanceSampler(this.diagnostics);
    if (config.diagnostics) this.diagnostics.subscribe(event => this.diagnosticJournal.enqueue(event));
    this.mode = config.mode ?? 'shared';
    this.diagnostics.record('server.start', { mode: this.mode });
    this.bindAddress = this.mode === 'solo' ? '127.0.0.1' : config.bindAddress ?? (this.mode === 'campaign' ? '127.0.0.1' : '0.0.0.0');
    this.port = config.port ?? Number(process.env.PORT || 3000);
    try { this.db = new AgentDatabase(config.dbPath); }
    catch (error) { this.diagnostics.record('server.failed', { code: diagnosticErrorCode(error) }); throw error; }
    this.campaignStore = this.mode !== 'shared' ? new CampaignStore(this.db, this.performance) : null;
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
      const dropped = Math.max(0, accumulatedMs + now - previousTime - FIXED_TIMESTEP_MS * 4);
      if (dropped >= 100) this.diagnostics.record('performance.stall', { metric: 'simulation.interval', state: this.activityState(), durationMs: now-previousTime, catchupDroppedMs: dropped });
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

    this.diagnostics.record('server.ready', { mode: this.mode, port: this.port });
    this.performanceClock = new PerformanceClock(this.diagnostics, this.performance, () => this.activityState(), () => this.recordResources());
    this.performanceClock.start();
    return this.port;
  }

  private activityState(): ActivityState {
    if (!this.clientsByEntityId.size) return 'menu';
    return this.soloPaused || this.soloSaveError || this.partySuspended ? 'paused' : 'active';
  }
  private recordResources(): void {
    const memory = process.memoryUsage(), journal = this.diagnosticJournal.status();
    let bufferedBytes = 0, inputQueue = 0;
    for (const s of this.clientsByEntityId.values()) {
      bufferedBytes = Math.max(bufferedBytes, s.ws.bufferedAmount); inputQueue = Math.max(inputQueue, s.inputQueue.length);
      const traffic = this.traffic.get(s.ws);
      if (traffic) {
        this.diagnostics.record('network.traffic', { bytes: traffic.bytes, messages: traffic.messages, durationMs: performance.now()-traffic.since,
          bufferedBytes: s.ws.bufferedAmount, inputQueue: s.inputQueue.length, state: this.activityState() }, s.diagnosticContext);
        traffic.bytes = traffic.messages = 0; traffic.since = performance.now();
      }
    }
    this.diagnostics.record('performance.resources', { state: this.activityState(), activeAgents: this.clientsByEntityId.size,
      serverTick: this.physicsWorld.tickCount, rssBytes: memory.rss, heapBytes: memory.heapUsed, externalBytes: memory.external,
      bodies: this.physicsWorld.world.bodies.len(), colliders: this.physicsWorld.world.colliders.len(),
      bufferedBytes, inputQueue, journalQueue: journal.queued,
      ...(this.soloCampaign ? { saveAgeMs: Math.max(0, Date.now()-this.soloCampaign.savedAt) } : {}) });
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
    this.performanceClock?.stop();
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
    this.diagnostics.record('server.stop', { mode: this.mode });
    if (this.ownsDiagnosticJournal) await this.diagnosticJournal.close();
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
        diagnostics: { serverRunId: this.diagnostics.runId, captureEnabled: this.diagnostics.enabled, ...this.diagnosticBuilds, journal: this.diagnosticJournal.status() },
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

    if (pathname.startsWith('/api/diagnostics/')) {
      // Local operator diagnostics are available before login for startup/re-entry failures.
      // Hosted/shared logs and paths must never be exposed through this endpoint.
      if (this.mode !== 'solo' || !['127.0.0.1', '::ffff:127.0.0.1', '::1'].includes(req.socket.remoteAddress ?? '') || req.headers['sec-fetch-site'] === 'cross-site') {
        res.writeHead(404); res.end(); return;
      }
      if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); res.end(); return; }
      if (Date.now() - this.diagnosticReadWindow > 60000) { this.diagnosticReadWindow = Date.now(); this.diagnosticReadCount = 0; }
      if (this.diagnosticReads >= 2 || ++this.diagnosticReadCount > 30) { res.writeHead(429, { 'Retry-After': '5' }); res.end(); return; }
      const match = pathname.match(/^\/api\/diagnostics\/session\/([a-f0-9-]{36})$/i);
      if (pathname !== '/api/diagnostics/sessions' && (!match || !isDiagnosticId(match[1]))) { res.writeHead(404); res.end(); return; }
      this.diagnosticReads++;
      const reports = new DiagnosticReports(this.diagnosticJournal.directory, this.diagnosticJournal.runId);
      void (async () => {
        try {
          const data = match ? await reports.detail(match[1]) : await reports.catalogue();
          if (res.destroyed) return;
          res.writeHead(data ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
          res.end(JSON.stringify(data ?? { error: 'session-unavailable' }));
        } catch {
          if (!res.destroyed) { res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: 'diagnostics-unavailable' })); }
        } finally { this.diagnosticReads--; }
      })();
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
    if (this.diagnostics.enabled) {
      const traffic = { bytes: 0, messages: 0, since: performance.now() }; this.traffic.set(ws, traffic);
      const send = ws.send;
      ws.send = (data: any, ...args: any[]) => {
        traffic.messages++;
        traffic.bytes += typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength ?? data.length ?? 0;
        return Reflect.apply(send, ws, [data, ...args]);
      };
    }
    const correlation: DiagnosticContext = { connectionId: crypto.randomUUID(), serverRunId: this.diagnostics.runId };
    this.diagnostics.record('connection.open', { mode: this.mode }, correlation);
    let activeSession: ConnectedClientSession | null = null;
    let lastDiagnosticBatch = 0, diagnosticBatchPending = false;
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
          if (isDiagnosticId(msg.diagnostics?.clientRunId)) correlation.clientRunId = msg.diagnostics.clientRunId;
          if (typeof msg.diagnostics?.clientBuild === 'string' && /^client-[a-f0-9]{16}$/.test(msg.diagnostics.clientBuild)) correlation.clientBuild = msg.diagnostics.clientBuild;
          this.diagnostics.record('connection.attempt', { mode: this.mode }, correlation);
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
            this.diagnostics.record('connection.rejected', { code: 'AUTH_REJECTED' }, correlation);
            ws.send(JSON.stringify({ type: 'AUTH_ERROR', error: authRes.error }));
            return;
          }
          correlation.agentRef = diagnosticRef(authRes.record.callsign);

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
              this.lastSaveAttemptId = undefined;
              this.pendingPresentation = null;
              if (this.mode === 'campaign') this.campaignInvite = crypto.randomBytes(9).toString('base64url');
              this.soloPaused = false; this.soloSaveError = false;
              correlation.campaignRef = diagnosticRef(campaign.id);
              this.diagnostics.record('campaign.loaded', { revision: campaign.revision }, correlation);
              authRes.record.position = { ...SOLO_RESUME_POSITION };
            } catch (error) {
              this.diagnostics.record('campaign.load-failed', { code: diagnosticErrorCode(error) }, correlation);
              ws.send(JSON.stringify({ type: 'AUTH_ERROR', error: 'This solo campaign could not be loaded. The save has been kept unchanged; check the local save folder before retrying.' }));
              return;
            }
          }

          let visit: CampaignPresentation | undefined;
          if (this.mode === 'campaign') {
            if (authRes.record.callsign === this.soloCampaign!.owner) this.campaignOwnerRecord = authRes.record;
            else {
              try { visit = this.campaignStore!.loadVisit(this.soloCampaign!, authRes.record.callsign); }
              catch (error) {
                this.diagnostics.record('campaign.load-failed', { code: diagnosticErrorCode(error) }, correlation);
                ws.send(JSON.stringify({ type: 'AUTH_ERROR', error: 'Your campaign visit could not be loaded. The save was kept unchanged.' })); return;
              }
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
          this.physicsWorld.tier4.restore(agentBody, { collectedLore: authRes.record.collectedLore, completedQuests: authRes.record.completedQuests, unlocks: authRes.record.tier4Unlocks });
          if (authRes.record.tier3WeaponId && meetsRequirements(agentBody.attributes, WEAPON_BY_ID.get(authRes.record.tier3WeaponId)?.requires ?? { shooting: 99 })) agentBody.tier3 = createTier3State(authRes.record.tier3WeaponId);
          if (typeof authRes.record.hp === 'number') agentBody.hp = Math.min(agentBody.maxHp, authRes.record.hp);

          activeSession = {
            diagnosticContext: { ...correlation, agentRef: diagnosticRef(authRes.record.callsign),
              campaignRef: this.soloCampaign ? diagnosticRef(this.soloCampaign.id) : undefined },
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

          this.diagnostics.record('connection.authenticated', { mode: this.mode, isNew: authRes.isNew }, activeSession.diagnosticContext);
          ws.send(
            JSON.stringify({
              type: 'AUTH_OK',
              diagnostics: { ...activeSession.diagnosticContext, ...this.diagnosticBuilds },
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
        if (msg.type === 'DIAGNOSTICS_BATCH') {
          if (this.mode !== 'solo' || !activeSession || diagnosticBatchPending || Date.now() - lastDiagnosticBatch < 2000 ||
              !isDiagnosticId(msg.id) || !Array.isArray(msg.events) || msg.events.length < 1 || msg.events.length > 16 || JSON.stringify(msg.events).length > 12000) return;
          const events = msg.events.map(sanitizeDiagnosticEvent) as ReturnType<typeof sanitizeDiagnosticEvent>[];
          if (events.some(e => !e || e.component !== 'client' || e.context.runId !== activeSession!.diagnosticContext.clientRunId)) return;
          lastDiagnosticBatch = Date.now(); diagnosticBatchPending = true;
          const before = this.diagnosticJournal.status();
          for (const event of events) {
            if (!event) continue;
            // An authenticated local page cannot impersonate another server/Agent/campaign in its upload.
            event.context = { ...activeSession.diagnosticContext, runId: event.context.runId, clientBuild: activeSession.diagnosticContext.clientBuild,
              saveAttemptId: event.context.saveAttemptId };
            this.diagnosticJournal.enqueue(event);
          }
          void this.diagnosticJournal.flush().then(flushed => {
            const after = this.diagnosticJournal.status();
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'DIAGNOSTICS_ACK', id: msg.id,
              durable: flushed && before.dropped === after.dropped && before.writeFailures === after.writeFailures }));
          }).catch(() => { /* Diagnostic delivery cannot interrupt gameplay. */ }).finally(() => { diagnosticBatchPending = false; });
          return;
        }
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
          session.agent.tier3 = createTier3State(old.tier3.weaponId);
          this.physicsWorld.tier4.restore(session.agent, { collectedLore: session.record.collectedLore, completedQuests: session.record.completedQuests, unlocks: session.record.tier4Unlocks });
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

        if (activeSession && ['TIER3_EQUIP', 'TIER3_SKILL', 'TIER3_ATTRIBUTE', 'TIER3_PET', 'TIER3_VEHICLE', 'TIER3_RELOAD'].includes(msg.type)) {
          const agent = activeSession.agent, system = this.physicsWorld.tier3;
          if (this.soloPaused || agent.hp <= 0 || this.physicsWorld.combatManager.isPaired(agent)) return;
          const id = typeof msg.id === 'string' && msg.id.length <= 64 ? msg.id : '';
          let error: string | null = null;
          if (['GN_10', 'ML_09', 'ML_10', 'VH_G05'].includes(id) && !this.physicsWorld.tier4.profile(agent).unlocks.has(id)) error = 'Recover this equipment through its landmark quest or Chimera log set.';
          else if (msg.type === 'TIER3_EQUIP') error = system.equip(agent, id);
          else if (msg.type === 'TIER3_SKILL') error = system.activateSkill(agent, id);
          else if (msg.type === 'TIER3_ATTRIBUTE') error = system.activateAttribute(agent, id);
          else if (msg.type === 'TIER3_PET') error = system.petAbility(agent);
          else if (msg.type === 'TIER3_VEHICLE') error = system.spawnVehicle(agent, id);
          else { const w = WEAPON_BY_ID.get(agent.tier3.weaponId); if (w && !agent.tier3.reloadSec) agent.tier3.reloadSec = w.reloadSec; }
          if (error) ws.send(JSON.stringify({ type: 'CONTROL_ERROR', error }));
          else { this.persistSession(activeSession); this.sendPlayerState(activeSession); }
          return;
        }

        if (['SELECT_CHASSIS', 'UNLOCK_SKILL'].includes(msg.type) && activeSession) {
          if (activeSession.agent.hp <= 0) return;
          if (msg.type === 'SELECT_CHASSIS') {
            msg.augmentChassis = CHASSIS_REGISTRY.find(c => c.id === msg.augmentChassis)?.legacyId ?? msg.augmentChassis;
            if (!Object.hasOwn(AUGMENT_CHASSIS_CATALOG, msg.augmentChassis)) return;
            if (!this.physicsWorld.tier2.swapChassis(activeSession.agent, msg.augmentChassis as AugmentChassisId)) {
              ws.send(JSON.stringify({ type: 'CONTROL_ERROR', error: 'Enter a cleared Forward Operating Safe House to swap Augment Chassis.' }));
              return;
            }
          } else {
            const error = TIER3_SKILL_BY_ID.has(String(msg.skillId)) ? skillUnlockError(String(msg.skillId), activeSession.record.xp, activeSession.agent.unlockedSkills) : 'This legacy upgrade is retained for saved builds but cannot be newly installed.';
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

    ws.on('close', (closeCode, reason) => {
      this.diagnostics.record('connection.closed', { closeCode, code: diagnosticCloseCode(reason.toString()) }, activeSession?.diagnosticContext ?? correlation);
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
      shapedCharges: this.physicsWorld.tier2.charges.get(a.entityId) ?? 3,
      tier4: this.physicsWorld.tier4.snapshot(a),
      tier3: a.tier3, tier3Projectiles: this.physicsWorld.tier3.projectiles.map(p => ({ position: p.body.translation(), weaponId: p.weaponId })), tier3Peers: [...this.physicsWorld.agents.values()].map(p => ({ id: p.entityId, mode: p.tier3.mode, combatLayer: p.tier3.combatLayer, weaponId: p.tier3.weaponId })),
      vehicleVariants: [...this.physicsWorld.tier3.vehicleVariants],
      tier3Aircraft: [...this.physicsWorld.tier2.airspace.aircraft.values()].filter(v => v.hp !== undefined).map(v => ({ id: v.state.id, hp: v.hp, maxHp: v.maxHp })),
      canSwapChassis: this.physicsWorld.tier2.canSwapChassis(a),
      fuel: a.jetpackFuelSec, maxFuel: a.maxJetpackFuelSec, protectionSec: a.spawnProtectionSec,
      attributes: a.attributes, xp: session.record.xp, skillPoints: availableSkillPoints(session.record.xp, a.unlockedSkills),
      unlockedSkills: [...a.unlockedSkills], unlockedRelics: [...a.unlockedRelics],
      lore: { municipalGridStability: normalizeGrid(session.record.municipalGridStability), gestaltResonance: session.record.gestaltResonance ?? 0,
        ending: resolveCampaignEnding(session.record.microActionTelemetry ?? DEFAULT_MICRO_TELEMETRY, normalizeGrid(session.record.municipalGridStability), session.record.gestaltResonance ?? 0),
        pet: this.physicsWorld.cyberPetArenaManager.getPersistedStats(a.entityId), neuralDriftRatios: computeNeuralDriftRatios(a.telemetry) },
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

  private queueLoreAction(session: ConnectedClientSession, id: string, kind: MicroActionKind, district: DistrictId): void {
    session.record.pendingLoreActions ??= [];
    if (!session.record.pendingLoreActions.some(a => a.id === id)) session.record.pendingLoreActions.push({ id, kind, district });
  }

  private syncRecord(session: ConnectedClientSession): void {
    const spared = session.agent.telemetry.nonLethalBountiesCompleted ?? 0;
    for (let i = (session.record.telemetry.nonLethalBountiesCompleted ?? 0) + 1; i <= spared; i++) {
      this.queueLoreAction(session, `nonlethal-bounty:${i}`, 'SPARE_CITIZEN', getDistrictForPosition(session.agent.position.x, session.agent.position.z));
    }
    const tier4Progress = this.physicsWorld.tier4.progress(session.agent);
    session.record.collectedLore = tier4Progress.collectedLore; session.record.completedQuests = tier4Progress.completedQuests; session.record.tier4Unlocks = tier4Progress.unlocks;
    session.record.tier3WeaponId = session.agent.tier3.weaponId;
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
      const started = performance.now();
      this.lastSaveAttemptId = crypto.randomUUID();
      const correlation = { ...session.diagnosticContext, saveAttemptId: this.lastSaveAttemptId };
      this.diagnostics.record('save.requested', { revision: this.soloCampaign.revision, serverTick: this.physicsWorld.tickCount }, correlation);
      try {
        this.soloCampaign = this.campaignStore.commit(this.soloCampaign, session.record, captureSoloWorld(this.physicsWorld, this.pendingPresentation ?? this.soloCampaign.state.presentation));
        this.pendingPresentation = null;
        this.soloSaveError = false;
        this.diagnostics.record('save.committed', { revision: this.soloCampaign.revision, durationMs: performance.now() - started }, correlation);
        this.sendSoloState(session);
      } catch (error) {
        this.diagnostics.record('save.failed', { code: diagnosticErrorCode(error), revision: this.soloCampaign.revision, durationMs: performance.now() - started }, correlation);
        this.soloSaveError = true;
        this.soloPaused = true;
        this.sendSoloState(session);
        return false;
      }
    } else {
      const started = performance.now();
      const correlation = { ...session.diagnosticContext, saveAttemptId: crypto.randomUUID() };
      this.diagnostics.record('save.requested', { mode: this.mode, serverTick: this.physicsWorld.tickCount }, correlation);
      try {
        this.db.saveAgent(session.record);
        this.diagnostics.record('save.committed', { mode: this.mode, durationMs: performance.now() - started }, correlation);
      } catch (error) {
        this.diagnostics.record('save.failed', { code: diagnosticErrorCode(error), durationMs: performance.now() - started }, correlation);
        throw error;
      }
    }
    session.record.pendingTier4Awards = [];
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
      diagnostics: { ...session.diagnosticContext, ...this.diagnosticBuilds, saveAttemptId: this.lastSaveAttemptId },
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
      this.lastSaveAttemptId = undefined;
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
    const started = performance.now();
    this.lastSaveAttemptId = crypto.randomUUID();
    const correlation = { ...owner?.diagnosticContext, campaignRef: diagnosticRef(this.soloCampaign.id), saveAttemptId: this.lastSaveAttemptId };
    this.diagnostics.record('save.requested', { revision: this.soloCampaign.revision, serverTick: this.physicsWorld.tickCount }, correlation);
    try {
      this.soloCampaign = this.campaignStore.commitParty(this.soloCampaign, records,
        captureSoloWorld(this.physicsWorld, this.pendingPresentation ?? this.soloCampaign.state.presentation),
        sessions.filter(s => s.visit).map(s => ({ guest: s.callsign, presentation: s.visit! })));
      this.pendingPresentation = null; this.soloSaveError = false;
      this.diagnostics.record('save.committed', { revision: this.soloCampaign.revision, durationMs: performance.now() - started }, correlation);
      for (const record of records) record.pendingTier4Awards = [];
      // A failed write keeps disconnected agents in memory for retry. Once durable, release them.
      const departed = sessions.filter(s => s.ws.readyState !== WebSocket.OPEN);
      departed.forEach(s => this.removeSession(s));
      if (departed.length) this.releaseEmptyParty();
    } catch (error) {
      this.diagnostics.record('save.failed', { code: diagnosticErrorCode(error), durationMs: performance.now() - started }, correlation);
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
        diagnostics: { ...member.diagnosticContext, ...this.diagnosticBuilds, saveAttemptId: this.lastSaveAttemptId },
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
    return this.performance.measure('simulation.work', () => this.tickSimulationWork(), this.activityState());
  }
  private tickSimulationWork(): void {
    if ((this.mode === 'solo' && (this.soloPaused || this.soloSaveError || this.clientsByEntityId.size === 0)) || this.partySuspended) return;
    this.physicsWorld.tier4.onAward = (agent, award) => {
      const session = this.clientsByEntityId.get(agent.entityId); if (!session) return;
      session.record.xp.vigilante += award.reward.xp;
      session.record.pendingTier4Awards ??= []; session.record.pendingTier4Awards.push(award);
      agent.attributes.vigilante = Math.max(agent.attributes.vigilante, computeAttributeLevelFromXP(session.record.xp.vigilante));
      this.physicsWorld.recomputeAgentBuild(agent); this.persistSession(session);
    };
    this.physicsWorld.tier3.onXP = (agent, action) => {
      const session = this.clientsByEntityId.get(agent.entityId); if (!session) return;
      awardActionXP(session.record.xp, action);
      let changed = false;
      for (const stat of ATTRIBUTE_NAMES) { const level = computeAttributeLevelFromXP(session.record.xp[stat]); if (level > agent.attributes[stat]) { agent.attributes[stat] = level; changed = true; } }
      if (changed) this.physicsWorld.recomputeAgentBuild(agent);
    };
    const agentPositions: Vec3[] = [];
    const stabilityRecords = this.campaignOwnerRecord ? [this.campaignOwnerRecord] : [...this.clientsByEntityId.values()].map(s => s.record);
    if (stabilityRecords.length) {
      const grids = stabilityRecords.map(r => normalizeGrid(r.municipalGridStability));
      for (const district of Object.keys(this.physicsWorld.tier2.stability) as DistrictId[]) this.physicsWorld.tier2.stability[district] = grids.reduce((sum, g) => sum + g[district], 0) / grids.length;
    }

    for (const session of this.clientsByEntityId.values()) {
      if (session.inputQueue.length > 0) {
        const toProcess = session.inputQueue.splice(0, 1);
        for (const input of toProcess) {
          this.physicsWorld.applyAgentInput(session.agent, input);
        }
      } else {
        const inputFresh = Date.now() - session.lastInputAt < 250;
        const idleContinue: ClientInputPacket = {
          ...session.lastInput,
          moveX: inputFresh ? session.lastInput.moveX : 0,
          moveZ: inputFresh ? session.lastInput.moveZ : 0,
          buttons:
            (inputFresh ? session.lastInput.buttons : 0) &
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
    if (session.agent.hp <= 0) return;
    const agentPos = session.agent.position;
    for (const relic of PROTOTYPE_RELIC_SPECS) {
      if (session.agent.unlockedRelics.has(relic.id)) continue;
      if (!checkAgentRelicIntersection(agentPos, relic.position)) continue;

      session.agent.unlockedRelics.add(relic.id);
      session.agent.telemetry.relicsCollected =
        (session.agent.telemetry.relicsCollected || 0) + 1;
      awardActionXP(session.record.xp, 'relic');

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
            name: RELIC_REGISTRY.find(r => r.legacyId === relic.id)?.name ?? relic.name,
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
        awardActionXP(session.record.xp, 'agility_orb');
        session.agent.telemetry.agilityOrbsCollected =
          (session.agent.telemetry.agilityOrbsCollected || 0) + 1;
      } else if (orb.type === OrbType.RENEGADE) {
        for (const [stat, amount] of Object.entries(COLLECTIBLE_XP.renegade)) session.record.xp[stat as keyof AgentAttributes] += amount;
        session.agent.telemetry.renegadeOrbsCollected =
          (session.agent.telemetry.renegadeOrbsCollected || 0) + 1;
      } else if (orb.type === OrbType.WHISPER) {
        for (const [stat, amount] of Object.entries(COLLECTIBLE_XP.whisper)) session.record.xp[stat as keyof AgentAttributes] += amount;
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

      this.physicsWorld.recomputeAgentBuild(session.agent);
      applySpireTraversal(session.agent);
      this.physicsWorld.tier3.onSpire(session.agent);
      const resonance = resolveSpireMemory(orb.orbId, session.agent.telemetry.whisperOrbsCollected ?? 0);
      if (!resonance.filtered) this.queueLoreAction(session, `memory:${resonance.memoryId}`, 'RECOVER_MEMORY', orb.district);
      this.persistSession(session);

      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(
          JSON.stringify({
            type: 'ORB_COLLECTED',
            resonance,
            traversal: { velocityY: session.agent.velocity.y, fuel: session.agent.jetpackFuelSec, dashes: session.agent.airDashesRemaining },
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
        if (ev.type === 'RELAY_VENT_HIT' && ev.damageDealt > 0 && ev.ventHp === 0 && ev.targetRelayId) {
          const relay = this.physicsWorld.relaySystem.states.get(ev.targetRelayId);
          const plan = this.physicsWorld.relaySystem.plans.find(p => p.relayId === ev.targetRelayId);
          if (relay && plan && relay.ventHp.every(hp => hp === 0)) {
            const district = Object.values(DistrictId)[plan.districtIndex]!;
            this.queueLoreAction(session, `relay-purge:${relay.relayId}:${relay.generation}`, 'PURGE_RELAY', district);
          }
        }
        if (ev.progressionAction) {
          awardActionXP(session.record.xp, ev.progressionAction);
        } else if (ev.type === 'WEAPON_HIT') {
          awardActionXP(session.record.xp, session.agent.mountedVehicleId >= 1000 ? 'vtol_strafe' : ev.isCrit || ev.limbCrippled ? 'weakpoint_hit' : 'weapon_hit');
        } else if (ev.type === 'MELEE_HIT') {
          awardActionXP(session.record.xp, 'melee_hit');
        } else if (ev.type === 'PARRY_TAKEDOWN') {
          awardActionXP(session.record.xp, 'parry');
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

    for (const note of notifications) {
      if (note.type === 'DISTRICT_STAGE_ADVANCED' && note.stage === 2 && note.district) {
        const index = Object.values(DistrictId).indexOf(note.district);
        const relays = this.physicsWorld.relaySystem.plans.filter(p => p.districtIndex === index);
        if (relays.every(p => this.physicsWorld.relaySystem.states.get(p.relayId)?.ventHp.every(hp => hp > 0))) {
          for (const session of this.clientsByEntityId.values()) {
            if (getDistrictForPosition(session.agent.position.x, session.agent.position.z) === note.district)
              this.queueLoreAction(session, `grid-preserved:${note.district}`, 'PRESERVE_INFRASTRUCTURE', note.district);
          }
        }
      }
    }
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
    for (const note of notifications) {
      if (note.type === 'PET_PROVENANCE_DISCOVERED' && note.ownerEntityId && note.provenance) {
        const owner = this.clientsByEntityId.get(note.ownerEntityId);
        if (owner) this.queueLoreAction(owner, `provenance:${note.provenance.originCitizenId}`, 'DISCOVER_PROVENANCE', note.provenance.districtOfOrigin);
      }
    }
    this.persistAllConnectedAgents();
    for (const notification of notifications) {
      const payload = JSON.stringify({ type: 'PHASE6_EVENT', notification });
      for (const session of this.clientsByEntityId.values()) {
        if (session.ws.readyState === WebSocket.OPEN) session.ws.send(payload);
      }
    }
  }

  private broadcastBinaryWorldSnapshots(): void {
    const encodeStarted = performance.now();
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
    const tier2Buffer = encodeTier2(this.physicsWorld.tier2.snapshot(serverTick));
    const worldEventsBuffer = encodeWorldEventsSnapshot(
      serverTick,
      this.physicsWorld.phase5Director.toBinaryOmegaBountySnapshot(),
      this.physicsWorld.phase5Director.toBinaryDistrictLoopSnapshots(),
      this.physicsWorld.phase5Director.toBinaryAuditorAirshipSnapshots()
    );
    const pets = this.physicsWorld.cyberPetArenaManager;
    const phase6Buffer = encodePhase6Snapshot(serverTick, pets.toBinaryPetStates(), pets.toBinaryArenaHeader(),
      pets.toBinaryDerbyRacers(), pets.toBinaryClashFighters(), this.physicsWorld.dreadnoughtDirector.toBinarySnapshot());
    this.performance.sample('network.encode', performance.now()-encodeStarted, this.activityState());

    for (const session of this.clientsByEntityId.values()) {
      if (session.ws.readyState !== WebSocket.OPEN) continue;
      if (session.ws.bufferedAmount > 1024 * 1024) {
        this.diagnostics.record('network.pressure', { bufferedBytes: session.ws.bufferedAmount, inputQueue: session.inputQueue.length,
          serverTick, closeCode: 4008, code: 'CONNECTION_TOO_SLOW' }, session.diagnosticContext);
        session.ws.close(4008, 'Connection too slow'); continue;
      }

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
      session.ws.send(tier2Buffer, { binary: true });
    }
  }
}
