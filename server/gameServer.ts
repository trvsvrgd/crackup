/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Authoritative 60Hz Rapier3D Game Server, 182-Orb Manager & 30Hz Binary Broadcaster
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import {
  AgentAttributes,
  AugmentChassisId,
  clampAttributeLevel,
  computeAttributeLevelFromXP,
  FIXED_TIMESTEP,
  FIXED_TIMESTEP_MS,
  MAX_PLAYERS,
  OrbType,
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
  SKILL_NODE_BY_ID,
} from '../shared/progression/skillTreeSystem.js';
import {
  ClientInputPacket,
  decodeClientInput,
  encodeEnemySnapshot,
  encodeRenegadeOrbSnapshot,
  encodeVehiclePropSnapshot,
  encodeWorldEventsSnapshot,
  encodeWorldSnapshot,
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

interface ConnectedClientSession {
  ws: WebSocket;
  entityId: number;
  callsign: string;
  record: PersistentAgentRecord;
  collectedOrbSet: Set<number>;
  agent: AgentPhysicsBody;
  inputQueue: ClientInputPacket[];
  lastInput: ClientInputPacket;
  authenticated: boolean;
}

export interface ServerConfig {
  port?: number;
  dbPath?: string;
  publicDir?: string;
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
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export class CrackupAuthoritativeServer {
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
  private startTimeMs = Date.now();
  private readonly publicDir: string;
  private port: number;

  constructor(config: ServerConfig = {}) {
    this.port = config.port ?? Number(process.env.PORT || 3000);
    this.db = new AgentDatabase(config.dbPath);
    this.publicDir = config.publicDir || path.resolve(process.cwd(), 'public');
    this.orbs = generateNeoVeridiaOrbs();
  }

  public async start(): Promise<number> {
    await initRapierPhysics();
    this.physicsWorld = new SharedPhysicsWorld();
    this.startTimeMs = Date.now();

    this.httpServer = http.createServer((req, res) => this.handleHttpRequest(req, res));
    this.wss = new WebSocketServer({ server: this.httpServer, path: '/ws' });

    this.wss.on('connection', (ws) => this.handleSocketConnection(ws));

    await new Promise<void>((resolve, reject) => {
      this.httpServer.once('error', reject);
      this.httpServer.listen(this.port, '0.0.0.0', () => {
        const addr = this.httpServer.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
        }
        resolve();
      });
    });

    // Authoritative 60Hz deterministic physics loop + 30Hz binary snapshot broadcast
    this.physicsInterval = setInterval(() => {
      this.tickAuthoritativeSimulation();
    }, FIXED_TIMESTEP_MS);

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
      await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    }
    if (this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer.close(() => resolve()));
    }
    this.db.close();
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = urlObj.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
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
        version: '2.0.0',
        architecture: 'True-3D-Rapier3D-BinaryNetcode',
        journalMode: this.db.getJournalMode(),
        activeAgents: this.clientsByEntityId.size,
        maxPlayers: MAX_PLAYERS,
        tickCount: this.physicsWorld.tickCount,
        serverTimeSec: (Date.now() - this.startTimeMs) / 1000,
        registeredAccounts: this.db.getTotalAgentCount(),
        totalOrbs: this.orbs.length,
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
      return;
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
      x: Number((Math.sin(angle) * radius).toFixed(2)),
      y: 0.0,
      z: Number((2.0 + Math.cos(angle) * 1.5).toFixed(2)),
    };
  }

  private handleSocketConnection(ws: WebSocket): void {
    let activeSession: ConnectedClientSession | null = null;

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      if (isBinary) {
        if (!activeSession || !activeSession.authenticated) {
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
        if (!inputPacket) {
          return;
        }

        if (activeSession.inputQueue.length < 32) {
          activeSession.inputQueue.push(inputPacket);
        }
        activeSession.lastInput = inputPacket;
        return;
      }

      // Control handshake messages (AUTH, SET_ATTRIBUTES)
      try {
        const text = typeof data === 'string' ? data : data.toString('utf8');
        const msg = JSON.parse(text);

        if (msg.type === 'AUTH') {
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

          const prevSession = this.clientsByCallsign.get(authRes.record.callsign);
          if (prevSession) {
            this.cleanupSession(prevSession);
            try {
              prevSession.ws.close(4001, 'Replaced by newer session');
            } catch {
              // Ignore
            }
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

          activeSession = {
            ws,
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
          };

          this.clientsByEntityId.set(entityId, activeSession);
          this.clientsByCallsign.set(activeSession.callsign, activeSession);

          ws.send(
            JSON.stringify({
              type: 'AUTH_OK',
              entityId,
              callsign: activeSession.callsign,
              isNew: authRes.isNew,
              record: activeSession.record,
              serverTimeSec: (Date.now() - this.startTimeMs) / 1000,
            })
          );

          this.broadcastRoster();
          return;
        }

        if (msg.type === 'SET_ATTRIBUTES' && activeSession) {
          const attrs: Partial<AgentAttributes> = msg.attributes || {};
          if (attrs.agility !== undefined)
            activeSession.agent.attributes.agility = clampAttributeLevel(attrs.agility);
          if (attrs.strength !== undefined)
            activeSession.agent.attributes.strength = clampAttributeLevel(attrs.strength);
          if (attrs.driving !== undefined)
            activeSession.agent.attributes.driving = clampAttributeLevel(attrs.driving);
          if (attrs.shooting !== undefined)
            activeSession.agent.attributes.shooting = clampAttributeLevel(attrs.shooting);
          if (attrs.explosives !== undefined)
            activeSession.agent.attributes.explosives = clampAttributeLevel(attrs.explosives);
          if (attrs.flying !== undefined)
            activeSession.agent.attributes.flying = clampAttributeLevel(attrs.flying);
          if (attrs.vigilante !== undefined)
            activeSession.agent.attributes.vigilante = clampAttributeLevel(attrs.vigilante);

          this.physicsWorld.recomputeAgentBuild(activeSession.agent);
          this.persistSession(activeSession);
          this.broadcastRoster();
          return;
        }

        if (msg.type === 'SET_BUILD' && activeSession) {
          if (
            msg.augmentChassis &&
            AUGMENT_CHASSIS_CATALOG[msg.augmentChassis as AugmentChassisId]
          ) {
            activeSession.agent.augmentChassis = msg.augmentChassis as AugmentChassisId;
          }
          if (Array.isArray(msg.unlockedSkills)) {
            activeSession.agent.unlockedSkills.clear();
            for (const sId of msg.unlockedSkills) {
              if (SKILL_NODE_BY_ID.has(String(sId))) {
                activeSession.agent.unlockedSkills.add(String(sId));
              }
            }
          }
          if (Array.isArray(msg.unlockedRelics)) {
            for (const rId of msg.unlockedRelics) {
              if (PROTOTYPE_RELIC_SPECS.some((r) => r.id === String(rId))) {
                activeSession.agent.unlockedRelics.add(String(rId));
              }
            }
          }

          this.physicsWorld.recomputeAgentBuild(activeSession.agent);
          this.persistSession(activeSession);

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

  private cleanupSession(session: ConnectedClientSession): void {
    if (!this.clientsByEntityId.has(session.entityId)) {
      return;
    }
    this.persistSession(session);
    this.physicsWorld.removeAgent(session.entityId);
    this.clientsByEntityId.delete(session.entityId);
    if (this.clientsByCallsign.get(session.callsign) === session) {
      this.clientsByCallsign.delete(session.callsign);
    }
  }

  private persistSession(session: ConnectedClientSession): void {
    session.record.position = { ...session.agent.position };
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
    this.db.saveAgent(session.record);
  }

  private persistAllConnectedAgents(): void {
    for (const session of this.clientsByEntityId.values()) {
      this.persistSession(session);
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
    const agentPositions: Vec3[] = [];

    for (const session of this.clientsByEntityId.values()) {
      if (session.inputQueue.length > 0) {
        const toProcess = session.inputQueue.splice(0, 4);
        for (const input of toProcess) {
          this.physicsWorld.applyAgentInput(session.agent, input);
        }
      } else {
        const idleContinue: ClientInputPacket = {
          ...session.lastInput,
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

    // Process 3D Combat Events (V.A.T.S. Bone-Collider Shots, Motion-Warped Melee, Q Counter-Parry Shockwaves)
    this.processPendingCombatEvents();

    // Process Phase 5 Events (District Loops, 90s Omega Bounty, Secret Neural Drift & Aegis Auditor Airships)
    this.processPendingPhase5Events();

    // Step 3D Renegade Orb Flee + Rooftop Waypoint Steering (PRD 4.5)
    stepRenegadeOrbSteering(this.orbs, agentPositions, FIXED_TIMESTEP);

    // Authoritative 3D Orb & Prototype Relic Collection + Attribute XP Progression
    for (const session of this.clientsByEntityId.values()) {
      this.evaluateOrbCollectionForSession(session);
      this.evaluateRelicCollectionForSession(session);
    }

    // Broadcast binary ArrayBuffer World, Renegade Orb, Enemy, Vehicle/Prop & Phase 5 World Events Snapshots at 30Hz (every 2nd 60Hz tick)
    if (this.physicsWorld.tickCount % 2 === 0 && this.clientsByEntityId.size > 0) {
      this.broadcastBinaryWorldSnapshots();
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
      this.broadcastRoster();
    }
  }

  private processPendingCombatEvents(): void {
    const events = this.physicsWorld.pendingCombatEvents.splice(0);
    if (events.length === 0) return;

    let anyLevelUp = false;
    for (const ev of events) {
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
    const vehicleStates = this.physicsWorld.vehiclePropManager.toBinaryVehicleSnapshots();
    const propStates = this.physicsWorld.vehiclePropManager.toBinaryPropSnapshots();
    const vehiclePropBuffer = encodeVehiclePropSnapshot(serverTick, vehicleStates, propStates);
    const worldEventsBuffer = encodeWorldEventsSnapshot(
      serverTick,
      this.physicsWorld.phase5Director.toBinaryOmegaBountySnapshot(),
      this.physicsWorld.phase5Director.toBinaryDistrictLoopSnapshots(),
      this.physicsWorld.phase5Director.toBinaryAuditorAirshipSnapshots()
    );

    for (const session of this.clientsByEntityId.values()) {
      if (session.ws.readyState !== WebSocket.OPEN) continue;

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
      session.ws.send(vehiclePropBuffer, { binary: true });
      session.ws.send(worldEventsBuffer, { binary: true });
    }
  }
}
