/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * 3D Environmental Orbs (150 Agility, 20 Renegade, 12 Whisper = 182 Total)
 * Includes 3D Rooftop Waypoint Graphs & 18m Flee Steering Behavior (PRD Section 4.5 - REQ-ORBS)
 */

import {
  DistrictId,
  ORB_COLLECT_RADIUS_M,
  OrbType,
  RENEGADE_FLEE_RADIUS_M,
  RENEGADE_MAX_SPEED_MPS,
  TOTAL_AGILITY_ORBS,
  TOTAL_ORBS,
  TOTAL_RENEGADE_ORBS,
  TOTAL_WHISPER_ORBS,
} from '../constants.js';
import { Vec3 } from '../protocol/binaryProtocol.js';
import { getElevatedOrbSurfaces, LedgePlacementSurface } from './neoVeridiaBlock.js';

export interface WorldOrbInstance {
  orbId: number; // 1..182
  type: OrbType;
  district: DistrictId;
  structureId: string;
  basePosition: Vec3;
  position: Vec3;
  velocity: Vec3;
  isFleeing: boolean;
  waypoints: Vec3[];
  currentWaypointIndex: number;
  harmonicFreqHz: number;
}

/**
 * Deterministic LCG for reproducible 3D ledge offset coordinates across Server and Client
 */
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Deterministically generates all 182 3D Orbs across the 4 Districts (Y = 10m to Y = 310m)
 */
export function generateNeoVeridiaOrbs(): WorldOrbInstance[] {
  const surfaces = getElevatedOrbSurfaces();
  const rand = createSeededRandom(0x2077c0de);
  const orbs: WorldOrbInstance[] = [];

  // Partition surfaces by district to guarantee balanced 4-district coverage
  const byDistrict: Record<DistrictId, LedgePlacementSurface[]> = {
    [DistrictId.NEON_DOCKS]: [],
    [DistrictId.FOUNDRY_SLUMS]: [],
    [DistrictId.HELIOS_SPIRE]: [],
    [DistrictId.AEGIS_CITADEL]: [],
  };
  for (const s of surfaces) {
    byDistrict[s.district].push(s);
  }
  const districtOrder = [
    DistrictId.NEON_DOCKS,
    DistrictId.FOUNDRY_SLUMS,
    DistrictId.HELIOS_SPIRE,
    DistrictId.AEGIS_CITADEL,
  ];

  const hoverOffset = 1.25; // Orbs float +1.25m above the architectural ledge surface

  // -------------------------------------------------------------------------
  // 1. 150 AGILITY ORBS (IDs 1..150, Y = 10.0m to 310.0m)
  // -------------------------------------------------------------------------
  for (let i = 0; i < TOTAL_AGILITY_ORBS; i++) {
    const orbId = i + 1;

    // Anchor Orb #1 directly on Central Command Spire Platform (0, 10.0m, -32.0m -> Y = 11.25m)
    if (orbId === 1) {
      const pos = { x: 0.0, y: 11.25, z: -32.0 };
      orbs.push({
        orbId,
        type: OrbType.AGILITY,
        district: DistrictId.AEGIS_CITADEL,
        structureId: 'mantle_terrace_tier_5',
        basePosition: { ...pos },
        position: { ...pos },
        velocity: { x: 0, y: 0, z: 0 },
        isFleeing: false,
        waypoints: [],
        currentWaypointIndex: 0,
        harmonicFreqHz: 432,
      });
      continue;
    }

    const dId = districtOrder[i % 4];
    const pool = byDistrict[dId].length > 0 ? byDistrict[dId] : surfaces;
    const surf = pool[Math.floor(rand() * pool.length)];

    // Place near the outer climbable rim of the ledge
    const rimSide = i % 4;
    const marginX = Math.max(0.8, surf.halfWidthX - 1.1);
    const marginZ = Math.max(0.8, surf.halfDepthZ - 1.1);
    const jitter = (rand() - 0.5) * 1.4;

    let ox = surf.centerX;
    let oz = surf.centerZ;
    if (rimSide === 0) {
      ox = surf.centerX + jitter * marginX;
      oz = surf.centerZ - marginZ;
    } else if (rimSide === 1) {
      ox = surf.centerX + marginX;
      oz = surf.centerZ + jitter * marginZ;
    } else if (rimSide === 2) {
      ox = surf.centerX + jitter * marginX;
      oz = surf.centerZ + marginZ;
    } else {
      ox = surf.centerX - marginX;
      oz = surf.centerZ + jitter * marginZ;
    }

    const oy = Math.min(310.0, Math.max(10.0, surf.topY + hoverOffset));
    const pos = { x: Number(ox.toFixed(2)), y: Number(oy.toFixed(2)), z: Number(oz.toFixed(2)) };

    orbs.push({
      orbId,
      type: OrbType.AGILITY,
      district: dId,
      structureId: surf.structureId,
      basePosition: { ...pos },
      position: { ...pos },
      velocity: { x: 0, y: 0, z: 0 },
      isFleeing: false,
      waypoints: [],
      currentWaypointIndex: 0,
      harmonicFreqHz: 432 + (orbId % 12) * 12,
    });
  }

  // -------------------------------------------------------------------------
  // 2. 20 RENEGADE ORBS (IDs 151..170, with 3D Rooftop Waypoint Graphs & Flee AI)
  // -------------------------------------------------------------------------
  for (let i = 0; i < TOTAL_RENEGADE_ORBS; i++) {
    const orbId = TOTAL_AGILITY_ORBS + i + 1; // 151..170
    const dId = districtOrder[i % 4];
    const pool = byDistrict[dId].filter((s) => s.halfWidthX >= 5.0 && s.halfDepthZ >= 5.0);
    const surf =
      i === 0
        ? surfaces.find((s) => s.structureId === 'helios_alpha_ledge_0') || pool[0] || surfaces[0]
        : pool[i % pool.length] || surfaces[i % surfaces.length];

    const oy = Math.min(308.0, Math.max(11.5, surf.topY + 1.5));
    const rx = Math.max(3.5, surf.halfWidthX - 1.5);
    const rz = Math.max(3.5, surf.halfDepthZ - 1.5);

    // 4-node 3D Rooftop Perimeter Waypoint Graph with vertical arc undulations
    const waypoints: Vec3[] = [
      { x: surf.centerX - rx, y: oy, z: surf.centerZ - rz },
      { x: surf.centerX + rx, y: Math.min(310.0, oy + 1.8), z: surf.centerZ - rz },
      { x: surf.centerX + rx, y: oy, z: surf.centerZ + rz },
      { x: surf.centerX - rx, y: Math.min(310.0, oy + 1.8), z: surf.centerZ + rz },
    ];

    const startPos = { ...waypoints[0] };
    orbs.push({
      orbId,
      type: OrbType.RENEGADE,
      district: surf.district,
      structureId: surf.structureId,
      basePosition: { x: surf.centerX, y: oy, z: surf.centerZ },
      position: startPos,
      velocity: { x: 0, y: 0, z: 0 },
      isFleeing: false,
      waypoints,
      currentWaypointIndex: 1,
      harmonicFreqHz: 528 + i * 15,
    });
  }

  // -------------------------------------------------------------------------
  // 3. 12 WHISPER ORBS (IDs 171..182, High-Altitude & Spire Apex Sentinel Perches)
  // -------------------------------------------------------------------------
  const highSurfaces = [...surfaces].sort((a, b) => b.topY - a.topY);
  for (let i = 0; i < TOTAL_WHISPER_ORBS; i++) {
    const orbId = TOTAL_AGILITY_ORBS + TOTAL_RENEGADE_ORBS + i + 1; // 171..182
    const dId = districtOrder[i % 4];
    const districtHigh = highSurfaces.filter((s) => s.district === dId);
    const surf = districtHigh[Math.floor(i / 4) % Math.max(1, districtHigh.length)] || highSurfaces[i];

    const oy = Math.min(310.0, Math.max(14.0, surf.topY + 1.6));
    const angle = (i / TOTAL_WHISPER_ORBS) * Math.PI * 2;
    const ox = surf.centerX + Math.cos(angle) * Math.min(4.0, surf.halfWidthX * 0.5);
    const oz = surf.centerZ + Math.sin(angle) * Math.min(4.0, surf.halfDepthZ * 0.5);
    const pos = { x: Number(ox.toFixed(2)), y: Number(oy.toFixed(2)), z: Number(oz.toFixed(2)) };

    orbs.push({
      orbId,
      type: OrbType.WHISPER,
      district: dId,
      structureId: surf.structureId,
      basePosition: { ...pos },
      position: { ...pos },
      velocity: { x: 0, y: 0, z: 0 },
      isFleeing: false,
      waypoints: [],
      currentWaypointIndex: 0,
      harmonicFreqHz: 288 + i * 18,
    });
  }

  return orbs;
}

/**
 * Steps the 3D Steering Behavior (Flee Vector + Rooftop Waypoint Graph) for all Renegade Orbs.
 * Triggered when any player enters an 18m 3D radius (PRD Section 4.5).
 */
export function stepRenegadeOrbSteering(
  orbs: WorldOrbInstance[],
  agentPositions: Vec3[],
  dt: number
): void {
  for (const orb of orbs) {
    if (orb.type !== OrbType.RENEGADE || orb.waypoints.length === 0) {
      continue;
    }

    // Find closest agent in 3D space
    let closestAgent: Vec3 | null = null;
    let minDist = Infinity;
    for (const agentPos of agentPositions) {
      const d = Math.hypot(
        orb.position.x - agentPos.x,
        orb.position.y - (agentPos.y + 1.0),
        orb.position.z - agentPos.z
      );
      if (d < minDist) {
        minDist = d;
        closestAgent = agentPos;
      }
    }

    const targetWaypoint = orb.waypoints[orb.currentWaypointIndex % orb.waypoints.length];
    const wpDx = targetWaypoint.x - orb.position.x;
    const wpDy = targetWaypoint.y - orb.position.y;
    const wpDz = targetWaypoint.z - orb.position.z;
    const wpDist = Math.hypot(wpDx, wpDy, wpDz);

    if (wpDist < 1.5) {
      orb.currentWaypointIndex = (orb.currentWaypointIndex + 1) % orb.waypoints.length;
    }

    const wpDirX = wpDist > 1e-4 ? wpDx / wpDist : 0;
    const wpDirY = wpDist > 1e-4 ? wpDy / wpDist : 0;
    const wpDirZ = wpDist > 1e-4 ? wpDz / wpDist : 0;

    if (closestAgent && minDist <= RENEGADE_FLEE_RADIUS_M) {
      // Player is within 18m radius -> activate 3D Flee Vector + Rooftop Waypoint Steering
      orb.isFleeing = true;

      let fleeX = orb.position.x - closestAgent.x;
      let fleeY = (orb.position.y - (closestAgent.y + 1.0)) * 0.35;
      let fleeZ = orb.position.z - closestAgent.z;
      const fleeLen = Math.hypot(fleeX, fleeY, fleeZ);
      if (fleeLen > 1e-4) {
        fleeX /= fleeLen;
        fleeY /= fleeLen;
        fleeZ /= fleeLen;
      } else {
        fleeX = 1;
        fleeY = 0;
        fleeZ = 0;
      }

      // Pick the waypoint that best aligns with the flee direction if cornered
      let bestWpIdx = orb.currentWaypointIndex;
      let bestDot = -Infinity;
      for (let w = 0; w < orb.waypoints.length; w++) {
        const wp = orb.waypoints[w];
        const vx = wp.x - orb.position.x;
        const vz = wp.z - orb.position.z;
        const vLen = Math.hypot(vx, vz);
        if (vLen > 1.0) {
          const dot = (vx / vLen) * fleeX + (vz / vLen) * fleeZ;
          if (dot > bestDot) {
            bestDot = dot;
            bestWpIdx = w;
          }
        }
      }
      orb.currentWaypointIndex = bestWpIdx;

      // Blend 65% direct 3D flee vector + 35% rooftop waypoint graph vector
      let steerX = fleeX * 0.65 + wpDirX * 0.35;
      let steerY = fleeY * 0.5 + wpDirY * 0.5;
      let steerZ = fleeZ * 0.65 + wpDirZ * 0.35;
      const steerLen = Math.hypot(steerX, steerY, steerZ) || 1;
      steerX /= steerLen;
      steerY /= steerLen;
      steerZ /= steerLen;

      const desiredSpeed = RENEGADE_MAX_SPEED_MPS;
      const accelBlend = Math.min(1.0, dt * 12.0);
      orb.velocity.x += (steerX * desiredSpeed - orb.velocity.x) * accelBlend;
      orb.velocity.y += (steerY * desiredSpeed - orb.velocity.y) * accelBlend;
      orb.velocity.z += (steerZ * desiredSpeed - orb.velocity.z) * accelBlend;
    } else {
      // Idle patrol along rooftop waypoint graph
      orb.isFleeing = false;
      const patrolSpeed = 4.2;
      const accelBlend = Math.min(1.0, dt * 6.0);
      orb.velocity.x += (wpDirX * patrolSpeed - orb.velocity.x) * accelBlend;
      orb.velocity.y += (wpDirY * patrolSpeed - orb.velocity.y) * accelBlend;
      orb.velocity.z += (wpDirZ * patrolSpeed - orb.velocity.z) * accelBlend;
    }

    orb.position.x += orb.velocity.x * dt;
    orb.position.y += orb.velocity.y * dt;
    orb.position.z += orb.velocity.z * dt;

    // Keep Renegade Orb tethered within 28m horizontal & [10m, 310m] vertical of its rooftop anchor
    const offsetH = Math.hypot(
      orb.position.x - orb.basePosition.x,
      orb.position.z - orb.basePosition.z
    );
    if (offsetH > 28.0) {
      const pullBack = 28.0 / offsetH;
      orb.position.x = orb.basePosition.x + (orb.position.x - orb.basePosition.x) * pullBack;
      orb.position.z = orb.basePosition.z + (orb.position.z - orb.basePosition.z) * pullBack;
    }
    orb.position.y = Math.max(
      Math.max(10.0, orb.basePosition.y - 2.0),
      Math.min(310.0, Math.min(orb.basePosition.y + 6.0, orb.position.y))
    );
  }
}

/**
 * Checks if an Agent's 3D capsule center is within collection radius of an Orb
 */
export function checkAgentOrbIntersection(agentFootPos: Vec3, orbPos: Vec3): boolean {
  const agentCenterY = agentFootPos.y + 0.95;
  const dist = Math.hypot(
    agentFootPos.x - orbPos.x,
    agentCenterY - orbPos.y,
    agentFootPos.z - orbPos.z
  );
  return dist <= ORB_COLLECT_RADIUS_M;
}

export { TOTAL_ORBS };

