/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Shared Deterministic 3D World Geometry Generator — 1200m x 1200m x 320m Neo-Veridia Metropolis
 * 4 Districts:
 *  - Neon Docks (SW, 0m..85m)
 *  - Foundry Slums (SE, 0m..140m, with Thermal Updraft Volumes)
 *  - Helios Financial Spire (NE, 0m..260m, stepped skyscrapers & sky-bridges)
 *  - Aegis Citadel Plaza (NW, 0m..320m, monolithic 320m tower & bastions)
 */

import { CITY_HALF_EXTENT, DistrictId, getDistrictForPosition } from '../constants.js';
import { Vec3 } from '../protocol/binaryProtocol.js';
import { WorldSpatialOctree } from './spatialOctree.js';
import { ARCHITECTURE_ROLLOUT, getArchitecturePlans } from './architecture.js';

export type StructureMaterialType =
  | 'plaza_asphalt'
  | 'brutalist_concrete'
  | 'obsidian_steel'
  | 'helios_glass'
  | 'ledge_trim'
  | 'neon_cyan'
  | 'neon_magenta'
  | 'neon_amber'
  | 'shipping_container'
  | 'industrial_grate'
  | 'harbor_water'
  | 'forcefield_energy';

export interface WorldBoxStructure {
  id: string;
  /** Center position in 3D world meters (Y-up) */
  center: { x: number; y: number; z: number };
  /** Half-extents (half-width X, half-height Y, half-depth Z) in meters */
  halfExtents: { x: number; y: number; z: number };
  /** Euler rotation in radians (XYZ order) */
  rotation?: { x: number; y: number; z: number };
  material: StructureMaterialType;
  /** Optional accent emissive trim on top edge */
  emissiveTrim?: 'cyan' | 'magenta' | 'amber';
  /** District classification */
  district?: DistrictId;
  /** Whether this structure is a non-solid visual/sensor surface */
  isSensorOnly?: boolean;
  /** Additive art/traversal geometry must not reshuffle persisted deterministic orb placements. */
  excludeOrbPlacement?: boolean;
}

export interface ThermalUpdraftVolume {
  id: string;
  district: DistrictId;
  center: { x: number; z: number };
  radius: number;
  baseY: number;
  topY: number;
  upwardAccelMps2: number;
  maxVerticalSpeedMps: number;
}

export interface ModularTowerConfig {
  idPrefix: string;
  district: DistrictId;
  x: number;
  z: number;
  baseHalfWidth: number;
  podiumHeight: number;
  totalHeight: number;
  ledgeInterval: number;
  coreMaterial: StructureMaterialType;
  podiumMaterial: StructureMaterialType;
  trimColor: 'cyan' | 'magenta' | 'amber';
  hasExteriorElevator?: boolean;
  hasTurrets?: boolean;
}

/**
 * Generates a modular multi-part 3D skyscraper with base podium, recessed window bay shaft,
 * climbable setback ledges, exterior HVAC protrusions, rooftop parapets, and neon signage.
 */
function appendModularSkyscraper(
  structures: WorldBoxStructure[],
  cfg: ModularTowerConfig
): void {
  const {
    idPrefix,
    district,
    x,
    z,
    baseHalfWidth,
    podiumHeight,
    totalHeight,
    ledgeInterval,
    coreMaterial,
    podiumMaterial,
    trimColor,
  } = cfg;

  // 1. Base Podium
  structures.push({
    id: `${idPrefix}_podium`,
    center: { x, y: podiumHeight * 0.5, z },
    halfExtents: { x: baseHalfWidth + 3.0, y: podiumHeight * 0.5, z: baseHalfWidth + 3.0 },
    material: podiumMaterial,
    emissiveTrim: trimColor,
    district,
  });

  // 2. Stepped Lower & Upper Core Shafts (with recessed window bay profile)
  const midSplitY = podiumHeight + (totalHeight - podiumHeight) * 0.55;
  const lowerShaftH = midSplitY - podiumHeight;
  structures.push({
    id: `${idPrefix}_lower_shaft`,
    center: { x, y: podiumHeight + lowerShaftH * 0.5, z },
    halfExtents: { x: baseHalfWidth, y: lowerShaftH * 0.5, z: baseHalfWidth },
    material: coreMaterial,
    district,
  });

  const upperHalfWidth = Math.max(5.5, baseHalfWidth * 0.78);
  const upperShaftH = totalHeight - midSplitY;
  if (upperShaftH > 4.0) {
    structures.push({
      id: `${idPrefix}_upper_shaft`,
      center: { x, y: midSplitY + upperShaftH * 0.5, z },
      halfExtents: { x: upperHalfWidth, y: upperShaftH * 0.5, z: upperHalfWidth },
      material: coreMaterial,
      emissiveTrim: trimColor,
      district,
    });
  }

  // 3. Wrap-around Climbable Setback Ledges & HVAC Protrusions spaced for Agility Lv 1-5 jump arcs
  let tierIdx = 0;
  for (let y = podiumHeight + ledgeInterval; y <= totalHeight - 2.0; y += ledgeInterval) {
    const inUpper = y > midSplitY;
    const shaftHW = inUpper ? upperHalfWidth : baseHalfWidth;
    const lipOutset = tierIdx % 2 === 0 ? 2.2 : 1.5;

    structures.push({
      id: `${idPrefix}_ledge_${tierIdx}`,
      center: { x, y: y - 0.4, z },
      halfExtents: { x: shaftHW + lipOutset, y: 0.4, z: shaftHW + lipOutset },
      material: 'ledge_trim',
      emissiveTrim: tierIdx % 2 === 0 ? trimColor : undefined,
      district,
    });

    // Exterior HVAC / Mechanical Protrusion Box on alternating faces for parkour stepping
    const hvacSide = tierIdx % 4;
    const hvacOffset = shaftHW + lipOutset + 1.4;
    const hx = hvacSide === 0 ? x + hvacOffset : hvacSide === 1 ? x - hvacOffset : x;
    const hz = hvacSide === 2 ? z + hvacOffset : hvacSide === 3 ? z - hvacOffset : z;
    structures.push({
      id: `${idPrefix}_hvac_${tierIdx}`,
      center: { x: hx, y: y + 1.2, z: hz },
      halfExtents: { x: 2.2, y: 1.2, z: 2.2 },
      material: 'industrial_grate',
      emissiveTrim: 'amber',
      district,
    });

    tierIdx += 1;
  }

  // 4. Exterior Elevator Shaft (for Aegis Citadel towers)
  if (cfg.hasExteriorElevator) {
    structures.push({
      id: `${idPrefix}_elevator_spine`,
      center: { x, y: totalHeight * 0.5, z: z + baseHalfWidth + 2.4 },
      halfExtents: { x: 2.8, y: totalHeight * 0.5, z: 1.8 },
      material: 'obsidian_steel',
      emissiveTrim: 'magenta',
      district,
    });
  }

  // 5. Rooftop Crown Deck & Parapet Walls
  structures.push({
    id: `${idPrefix}_rooftop_crown`,
    center: { x, y: totalHeight - 0.6, z },
    halfExtents: { x: upperHalfWidth + 1.6, y: 0.6, z: upperHalfWidth + 1.6 },
    material: 'obsidian_steel',
    emissiveTrim: trimColor,
    district,
  });

  if (cfg.hasTurrets) {
    const cornerOffset = upperHalfWidth;
    const corners = [
      { cx: x - cornerOffset, cz: z - cornerOffset, tag: 'nw' },
      { cx: x + cornerOffset, cz: z - cornerOffset, tag: 'ne' },
      { cx: x - cornerOffset, cz: z + cornerOffset, tag: 'sw' },
      { cx: x + cornerOffset, cz: z + cornerOffset, tag: 'se' },
    ];
    for (const c of corners) {
      structures.push({
        id: `${idPrefix}_turret_${c.tag}`,
        center: { x: c.cx, y: totalHeight + 1.4, z: c.cz },
        halfExtents: { x: 1.8, y: 1.4, z: 1.8 },
        material: 'obsidian_steel',
        emissiveTrim: 'magenta',
        district,
      });
    }
  }
}

let cachedCityStructures: WorldBoxStructure[] | null = null;
let cachedOctree: WorldSpatialOctree<WorldBoxStructure> | null = null;

/**
 * Thermal Updraft Volumes in Foundry Slums (Southeast Quadrant)
 */
export function getNeoVeridiaThermalUpdrafts(): ThermalUpdraftVolume[] {
  return [
    {
      id: 'updraft_foundry_alpha',
      district: DistrictId.FOUNDRY_SLUMS,
      center: { x: 95, z: 95 },
      radius: 9.0,
      baseY: 0,
      topY: 95,
      upwardAccelMps2: 36.0,
      maxVerticalSpeedMps: 20.0,
    },
    {
      id: 'updraft_foundry_beta',
      district: DistrictId.FOUNDRY_SLUMS,
      center: { x: 185, z: 155 },
      radius: 10.5,
      baseY: 0,
      topY: 125,
      upwardAccelMps2: 38.0,
      maxVerticalSpeedMps: 22.0,
    },
    {
      id: 'updraft_foundry_gamma',
      district: DistrictId.FOUNDRY_SLUMS,
      center: { x: 280, z: 220 },
      radius: 11.0,
      baseY: 0,
      topY: 142,
      upwardAccelMps2: 40.0,
      maxVerticalSpeedMps: 24.0,
    },
    {
      id: 'updraft_foundry_delta',
      district: DistrictId.FOUNDRY_SLUMS,
      center: { x: 380, z: 310 },
      radius: 12.0,
      baseY: 0,
      topY: 145,
      upwardAccelMps2: 40.0,
      maxVerticalSpeedMps: 24.0,
    },
  ];
}

/**
 * Generates the full deterministic 1200m x 1200m x 320m Neo-Veridia Metropolis across all 4 Districts.
 * Preserves all Central Sector 01 structures for backward compatibility with Phase 1 calibration.
 */
export function buildNeoVeridiaSector01(): WorldBoxStructure[] {
  if (cachedCityStructures) {
    return cachedCityStructures;
  }

  const structures: WorldBoxStructure[] = [];

  // =========================================================================
  // 1. METROPOLIS CONTINUOUS GROUND FOUNDATION (1200m x 1200m, Top Y = 0.0m)
  // =========================================================================
  structures.push({
    id: 'ground_plaza_main',
    center: { x: 0, y: -2.0, z: 0 },
    halfExtents: { x: CITY_HALF_EXTENT, y: 2.0, z: CITY_HALF_EXTENT },
    material: 'plaza_asphalt',
  });

  // Outer 1200m x 1200m Metropolis Sea-Wall / Boundary Parapets
  const wallHeight = 14.0;
  const halfArena = CITY_HALF_EXTENT - 2.0; // 598m
  structures.push(
    {
      id: 'perimeter_wall_north',
      center: { x: 0, y: wallHeight / 2, z: -halfArena },
      halfExtents: { x: halfArena, y: wallHeight / 2, z: 2.0 },
      material: 'brutalist_concrete',
      emissiveTrim: 'cyan',
    },
    {
      id: 'perimeter_wall_south',
      center: { x: 0, y: wallHeight / 2, z: halfArena },
      halfExtents: { x: halfArena, y: wallHeight / 2, z: 2.0 },
      material: 'brutalist_concrete',
      emissiveTrim: 'cyan',
    },
    {
      id: 'perimeter_wall_west',
      center: { x: -halfArena, y: wallHeight / 2, z: 0 },
      halfExtents: { x: 2.0, y: wallHeight / 2, z: halfArena },
      material: 'brutalist_concrete',
      emissiveTrim: 'cyan',
    },
    {
      id: 'perimeter_wall_east',
      center: { x: halfArena, y: wallHeight / 2, z: 0 },
      halfExtents: { x: 2.0, y: wallHeight / 2, z: halfArena },
      material: 'brutalist_concrete',
      emissiveTrim: 'cyan',
    }
  );

  // =========================================================================
  // 2. CENTRAL AGENCY HUB & CALIBRATION TERRACES (X in [-45m, 45m], Z in [-45m, 45m])
  // =========================================================================
  structures.push(
    {
      id: 'mantle_terrace_tier_1',
      center: { x: 0, y: 0.75, z: -10.0 },
      halfExtents: { x: 4.0, y: 0.75, z: 2.5 },
      material: 'ledge_trim',
      emissiveTrim: 'cyan',
    },
    {
      id: 'mantle_terrace_tier_2',
      center: { x: 0, y: 1.55, z: -15.0 },
      halfExtents: { x: 4.0, y: 1.55, z: 2.5 },
      material: 'ledge_trim',
      emissiveTrim: 'cyan',
    },
    {
      id: 'mantle_terrace_tier_3',
      center: { x: 0, y: 2.4, z: -20.0 },
      halfExtents: { x: 4.0, y: 2.4, z: 2.5 },
      material: 'ledge_trim',
      emissiveTrim: 'amber',
    },
    {
      id: 'mantle_terrace_tier_4',
      center: { x: 0, y: 3.5, z: -25.5 },
      halfExtents: { x: 4.5, y: 3.5, z: 3.0 },
      material: 'obsidian_steel',
      emissiveTrim: 'magenta',
    },
    {
      id: 'mantle_terrace_tier_5',
      center: { x: 0, y: 5.0, z: -32.0 },
      halfExtents: { x: 6.0, y: 5.0, z: 3.5 },
      material: 'obsidian_steel',
      emissiveTrim: 'cyan',
    }
  );

  // Auto-Stepping Staircase (East of Spawn at X = 14m)
  for (let i = 0; i < 8; i++) {
    const stepTopY = (i + 1) * 0.35;
    const stepZ = -2.0 - i * 0.85;
    structures.push({
      id: `autostep_stair_${i + 1}`,
      center: { x: 14.0, y: stepTopY / 2, z: stepZ },
      halfExtents: { x: 2.2, y: stepTopY / 2, z: 0.45 },
      material: 'ledge_trim',
    });
  }
  structures.push({
    id: 'autostep_observation_deck',
    center: { x: 14.0, y: 1.4, z: -11.5 },
    halfExtents: { x: 3.5, y: 1.4, z: 3.0 },
    material: 'industrial_grate',
    emissiveTrim: 'cyan',
  });

  // Slope-Climbing Ramps (West of Spawn at X = -14m)
  structures.push(
    {
      id: 'slope_ramp_west_24deg',
      center: { x: -14.0, y: 1.9, z: -6.5 },
      halfExtents: { x: 2.5, y: 0.35, z: 5.2 },
      rotation: { x: (24 * Math.PI) / 180, y: 0, z: 0 },
      material: 'industrial_grate',
      emissiveTrim: 'amber',
    },
    {
      id: 'slope_ramp_west_deck',
      center: { x: -14.0, y: 2.0, z: -14.5 },
      halfExtents: { x: 4.0, y: 2.0, z: 3.5 },
      material: 'brutalist_concrete',
      emissiveTrim: 'amber',
    },
    {
      id: 'skybridge_west_to_center',
      center: { x: -7.0, y: 4.0, z: -17.5 },
      halfExtents: { x: 3.5, y: 0.25, z: 1.6 },
      material: 'industrial_grate',
      emissiveTrim: 'cyan',
    }
  );

  // Inner Gateway Towers (Helios-Alpha & Aegis-Inner at Z = -36m)
  structures.push(
    {
      id: 'helios_alpha_podium',
      center: { x: -32.0, y: 4.0, z: -36.0 },
      halfExtents: { x: 12.0, y: 4.0, z: 12.0 },
      material: 'obsidian_steel',
      emissiveTrim: 'cyan',
    },
    {
      id: 'helios_alpha_core',
      center: { x: -32.0, y: 32.0, z: -36.0 },
      halfExtents: { x: 8.5, y: 32.0, z: 8.5 },
      material: 'helios_glass',
      emissiveTrim: 'cyan',
    }
  );
  for (let tier = 0; tier < 13; tier++) {
    const ledgeTopY = 12.0 + tier * 4.0;
    const isMajorTier = tier % 2 === 0;
    const ledgeReach = isMajorTier ? 10.6 : 9.8;
    structures.push({
      id: `helios_alpha_ledge_${tier}`,
      center: { x: -32.0, y: ledgeTopY - 0.35, z: -36.0 },
      halfExtents: { x: ledgeReach, y: 0.35, z: ledgeReach },
      material: 'ledge_trim',
      emissiveTrim: isMajorTier ? 'cyan' : undefined,
    });
  }
  structures.push({
    id: 'helios_alpha_crown',
    center: { x: -32.0, y: 65.5, z: -36.0 },
    halfExtents: { x: 6.0, y: 1.5, z: 6.0 },
    material: 'obsidian_steel',
    emissiveTrim: 'magenta',
  });

  structures.push(
    {
      id: 'aegis_citadel_podium',
      center: { x: 32.0, y: 5.0, z: -36.0 },
      halfExtents: { x: 13.0, y: 5.0, z: 13.0 },
      material: 'brutalist_concrete',
      emissiveTrim: 'magenta',
    },
    {
      id: 'aegis_citadel_shaft',
      center: { x: 32.0, y: 38.0, z: -36.0 },
      halfExtents: { x: 9.0, y: 38.0, z: 9.0 },
      material: 'obsidian_steel',
      emissiveTrim: 'magenta',
    }
  );
  for (let tier = 0; tier < 15; tier++) {
    const ledgeTopY = 14.0 + tier * 4.2;
    structures.push({
      id: `aegis_citadel_ledge_${tier}`,
      center: { x: 32.0, y: ledgeTopY - 0.4, z: -36.0 },
      halfExtents: { x: 10.8, y: 0.4, z: 10.8 },
      material: 'ledge_trim',
      emissiveTrim: tier % 3 === 0 ? 'magenta' : 'amber',
    });
  }
  structures.push({
    id: 'high_skybridge_helios_aegis',
    center: { x: 0.0, y: 27.6, z: -36.0 },
    halfExtents: { x: 23.5, y: 0.4, z: 2.8 },
    material: 'industrial_grate',
    emissiveTrim: 'cyan',
  });

  // =========================================================================
  // 3. DISTRICT 1: NEON DOCKS (Southwest Quadrant, X in [-560, -20], Z in [+20, +560], Max Y = 85m)
  // Shipping container stacks, gantry cranes with climbable trusses, suspended cargo platforms, water shader plane
  // =========================================================================
  structures.push({
    id: 'neon_docks_water_basin',
    center: { x: -320, y: 0.08, z: 320 },
    halfExtents: { x: 220, y: 0.08, z: 220 },
    material: 'harbor_water',
    district: DistrictId.NEON_DOCKS,
  });

  // Container Yard Clusters across Neon Docks
  const dockYardCenters = [
    { x: -85, z: 85 },
    { x: -175, z: 120 },
    { x: -265, z: 170 },
    { x: -360, z: 230 },
    { x: -450, z: 310 },
  ];
  dockYardCenters.forEach((yard, yIdx) => {
    for (let s = 0; s < 5; s++) {
      const stackTopY = (s + 1) * 3.2;
      structures.push({
        id: `neon_docks_container_yard_${yIdx}_stack_${s}`,
        center: {
          x: yard.x + (s - 2) * 8.5,
          y: stackTopY * 0.5,
          z: yard.z + (s % 2) * 9.0,
        },
        halfExtents: { x: 3.6, y: stackTopY * 0.5, z: 2.2 },
        material: 'shipping_container',
        emissiveTrim: s % 2 === 0 ? 'cyan' : 'amber',
        district: DistrictId.NEON_DOCKS,
      });
    }
  });

  // 4 Giant Climbable Gantry Cranes (reaching up to 85m elevation) + Suspended Cargo Platforms
  const craneConfigs = [
    { id: 'crane_alpha', x: -120, z: 150, height: 56 },
    { id: 'crane_beta', x: -220, z: 240, height: 68 },
    { id: 'crane_gamma', x: -340, z: 340, height: 78 },
    { id: 'crane_apex', x: -440, z: 430, height: 85 },
  ];
  for (const crane of craneConfigs) {
    // Gantry Base Pier
    structures.push({
      id: `${crane.id}_pier`,
      center: { x: crane.x, y: 4.0, z: crane.z },
      halfExtents: { x: 14.0, y: 4.0, z: 14.0 },
      material: 'brutalist_concrete',
      emissiveTrim: 'cyan',
      district: DistrictId.NEON_DOCKS,
    });
    // Vertical Climbable Truss Mast
    structures.push({
      id: `${crane.id}_mast`,
      center: { x: crane.x, y: crane.height * 0.5, z: crane.z },
      halfExtents: { x: 4.5, y: crane.height * 0.5, z: 4.5 },
      material: 'industrial_grate',
      district: DistrictId.NEON_DOCKS,
    });
    // Truss Climbable Cross-Ledges every 7m
    for (let y = 12; y <= crane.height - 4; y += 7) {
      structures.push({
        id: `${crane.id}_truss_ledge_${y}`,
        center: { x: crane.x, y: y - 0.35, z: crane.z },
        halfExtents: { x: 6.2, y: 0.35, z: 6.2 },
        material: 'ledge_trim',
        emissiveTrim: 'cyan',
        district: DistrictId.NEON_DOCKS,
      });
    }
    // Horizontal Cantilever Crane Boom at top (crane.height)
    structures.push({
      id: `${crane.id}_boom`,
      center: { x: crane.x + 18.0, y: crane.height - 1.0, z: crane.z },
      halfExtents: { x: 26.0, y: 1.0, z: 3.5 },
      material: 'obsidian_steel',
      emissiveTrim: 'amber',
      district: DistrictId.NEON_DOCKS,
    });
    // Suspended Cargo Platform hanging below the outer boom
    const cargoY = Math.round(crane.height * 0.68);
    structures.push({
      id: `${crane.id}_suspended_cargo`,
      center: { x: crane.x + 32.0, y: cargoY, z: crane.z },
      halfExtents: { x: 7.5, y: 0.8, z: 6.0 },
      material: 'shipping_container',
      emissiveTrim: 'cyan',
      district: DistrictId.NEON_DOCKS,
    });
  }

  // =========================================================================
  // 4. DISTRICT 2: FOUNDRY SLUMS (Southeast Quadrant, X in [+20, +560], Z in [+20, +560], Max Y = 140m)
  // Brutalist walkways, industrial furnace stacks, thermal updraft vents, heavy pipe bridges
  // =========================================================================
  const foundryTowers: ModularTowerConfig[] = [
    {
      idPrefix: 'foundry_stack_01',
      district: DistrictId.FOUNDRY_SLUMS,
      x: 110,
      z: 110,
      baseHalfWidth: 12,
      podiumHeight: 12,
      totalHeight: 76,
      ledgeInterval: 8,
      coreMaterial: 'brutalist_concrete',
      podiumMaterial: 'obsidian_steel',
      trimColor: 'amber',
    },
    {
      idPrefix: 'foundry_stack_02',
      district: DistrictId.FOUNDRY_SLUMS,
      x: 210,
      z: 140,
      baseHalfWidth: 13,
      podiumHeight: 14,
      totalHeight: 96,
      ledgeInterval: 9,
      coreMaterial: 'obsidian_steel',
      podiumMaterial: 'brutalist_concrete',
      trimColor: 'amber',
    },
    {
      idPrefix: 'foundry_stack_03',
      district: DistrictId.FOUNDRY_SLUMS,
      x: 310,
      z: 210,
      baseHalfWidth: 14,
      podiumHeight: 16,
      totalHeight: 118,
      ledgeInterval: 10,
      coreMaterial: 'brutalist_concrete',
      podiumMaterial: 'obsidian_steel',
      trimColor: 'magenta',
    },
    {
      idPrefix: 'foundry_apex_furnace',
      district: DistrictId.FOUNDRY_SLUMS,
      x: 420,
      z: 310,
      baseHalfWidth: 16,
      podiumHeight: 18,
      totalHeight: 140,
      ledgeInterval: 10,
      coreMaterial: 'obsidian_steel',
      podiumMaterial: 'brutalist_concrete',
      trimColor: 'amber',
    },
  ];
  for (const ft of foundryTowers) {
    appendModularSkyscraper(structures, ft);
  }

  // Heavy Pipe Bridges connecting Foundry Furnace Stacks at Y = 42m and Y = 84m
  structures.push(
    {
      id: 'foundry_pipe_bridge_low',
      center: { x: 160, y: 42, z: 125 },
      halfExtents: { x: 42, y: 1.2, z: 3.5 },
      material: 'industrial_grate',
      emissiveTrim: 'amber',
      district: DistrictId.FOUNDRY_SLUMS,
    },
    {
      id: 'foundry_pipe_bridge_mid',
      center: { x: 260, y: 74, z: 175 },
      halfExtents: { x: 46, y: 1.2, z: 3.5 },
      material: 'industrial_grate',
      emissiveTrim: 'amber',
      district: DistrictId.FOUNDRY_SLUMS,
    },
    {
      id: 'foundry_pipe_bridge_high',
      center: { x: 365, y: 108, z: 260 },
      halfExtents: { x: 52, y: 1.2, z: 3.8 },
      material: 'industrial_grate',
      emissiveTrim: 'magenta',
      district: DistrictId.FOUNDRY_SLUMS,
    }
  );

  // Thermal Updraft Exhaust Rings on Ground in Foundry Slums
  for (const updraft of getNeoVeridiaThermalUpdrafts()) {
    structures.push({
      id: `${updraft.id}_vent_ring`,
      center: { x: updraft.center.x, y: 1.2, z: updraft.center.z },
      halfExtents: { x: updraft.radius * 0.85, y: 1.2, z: updraft.radius * 0.85 },
      material: 'neon_amber',
      emissiveTrim: 'amber',
      district: DistrictId.FOUNDRY_SLUMS,
    });
  }

  // =========================================================================
  // 5. DISTRICT 3: HELIOS FINANCIAL SPIRE (Northeast Quadrant, X in [+20, +560], Z in [-560, -20], Max Y = 260m)
  // Stepped glass-and-steel skyscrapers with setback ledges every 8m..14m & sky-bridges
  // =========================================================================
  const heliosTowers: ModularTowerConfig[] = [
    {
      idPrefix: 'helios_tower_01',
      district: DistrictId.HELIOS_SPIRE,
      x: 115,
      z: -115,
      baseHalfWidth: 14,
      podiumHeight: 14,
      totalHeight: 112,
      ledgeInterval: 9,
      coreMaterial: 'helios_glass',
      podiumMaterial: 'obsidian_steel',
      trimColor: 'cyan',
    },
    {
      idPrefix: 'helios_tower_02',
      district: DistrictId.HELIOS_SPIRE,
      x: 215,
      z: -140,
      baseHalfWidth: 15,
      podiumHeight: 16,
      totalHeight: 156,
      ledgeInterval: 10,
      coreMaterial: 'helios_glass',
      podiumMaterial: 'obsidian_steel',
      trimColor: 'cyan',
    },
    {
      idPrefix: 'helios_tower_03',
      district: DistrictId.HELIOS_SPIRE,
      x: 165,
      z: -245,
      baseHalfWidth: 15,
      podiumHeight: 16,
      totalHeight: 198,
      ledgeInterval: 11,
      coreMaterial: 'helios_glass',
      podiumMaterial: 'obsidian_steel',
      trimColor: 'magenta',
    },
    {
      idPrefix: 'helios_financial_apex_spire',
      district: DistrictId.HELIOS_SPIRE,
      x: 285,
      z: -285,
      baseHalfWidth: 18,
      podiumHeight: 20,
      totalHeight: 260,
      ledgeInterval: 12,
      coreMaterial: 'helios_glass',
      podiumMaterial: 'obsidian_steel',
      trimColor: 'cyan',
    },
  ];
  for (const ht of heliosTowers) {
    appendModularSkyscraper(structures, ht);
  }

  // Helios High-Altitude Sky-Bridges
  structures.push(
    {
      id: 'helios_skybridge_tier1',
      center: { x: 165, y: 68, z: -128 },
      halfExtents: { x: 42, y: 1.0, z: 3.5 },
      material: 'helios_glass',
      emissiveTrim: 'cyan',
      district: DistrictId.HELIOS_SPIRE,
    },
    {
      id: 'helios_skybridge_tier2',
      center: { x: 190, y: 128, z: -192 },
      halfExtents: { x: 3.8, y: 1.0, z: 46 },
      material: 'helios_glass',
      emissiveTrim: 'cyan',
      district: DistrictId.HELIOS_SPIRE,
    },
    {
      id: 'helios_skybridge_tier3',
      center: { x: 225, y: 184, z: -265 },
      halfExtents: { x: 52, y: 1.2, z: 4.0 },
      material: 'obsidian_steel',
      emissiveTrim: 'magenta',
      district: DistrictId.HELIOS_SPIRE,
    }
  );

  // =========================================================================
  // 6. DISTRICT 4: AEGIS CITADEL PLAZA (Northwest Quadrant, X in [-560, -20], Z in [-560, -20], Max Y = 320m)
  // Central monolithic 320m tower with exterior elevator shafts, defensive turrets, anti-air forcefields
  // =========================================================================
  const aegisTowers: ModularTowerConfig[] = [
    {
      idPrefix: 'aegis_bastion_south',
      district: DistrictId.AEGIS_CITADEL,
      x: -135,
      z: -135,
      baseHalfWidth: 15,
      podiumHeight: 16,
      totalHeight: 148,
      ledgeInterval: 10,
      coreMaterial: 'obsidian_steel',
      podiumMaterial: 'brutalist_concrete',
      trimColor: 'magenta',
      hasExteriorElevator: true,
      hasTurrets: true,
    },
    {
      idPrefix: 'aegis_bastion_east',
      district: DistrictId.AEGIS_CITADEL,
      x: -145,
      z: -260,
      baseHalfWidth: 16,
      podiumHeight: 18,
      totalHeight: 210,
      ledgeInterval: 11,
      coreMaterial: 'obsidian_steel',
      podiumMaterial: 'brutalist_concrete',
      trimColor: 'magenta',
      hasExteriorElevator: true,
      hasTurrets: true,
    },
    {
      idPrefix: 'aegis_bastion_west',
      district: DistrictId.AEGIS_CITADEL,
      x: -260,
      z: -145,
      baseHalfWidth: 16,
      podiumHeight: 18,
      totalHeight: 235,
      ledgeInterval: 11,
      coreMaterial: 'obsidian_steel',
      podiumMaterial: 'brutalist_concrete',
      trimColor: 'amber',
      hasExteriorElevator: true,
      hasTurrets: true,
    },
    {
      idPrefix: 'aegis_citadel_monolith_apex',
      district: DistrictId.AEGIS_CITADEL,
      x: -280,
      z: -280,
      baseHalfWidth: 22,
      podiumHeight: 24,
      totalHeight: 320,
      ledgeInterval: 12,
      coreMaterial: 'obsidian_steel',
      podiumMaterial: 'brutalist_concrete',
      trimColor: 'magenta',
      hasExteriorElevator: true,
      hasTurrets: true,
    },
  ];
  for (const at of aegisTowers) {
    appendModularSkyscraper(structures, at);
  }

  // Aegis Citadel Fortified Sky-Bridges & Anti-Air Forcefield Emitter Rings
  structures.push(
    {
      id: 'aegis_skybridge_bastion_se',
      center: { x: -140, y: 110, z: -198 },
      halfExtents: { x: 4.0, y: 1.2, z: 54 },
      material: 'obsidian_steel',
      emissiveTrim: 'magenta',
      district: DistrictId.AEGIS_CITADEL,
    },
    {
      id: 'aegis_skybridge_citadel_east',
      center: { x: -212, y: 188, z: -270 },
      halfExtents: { x: 56, y: 1.4, z: 4.5 },
      material: 'obsidian_steel',
      emissiveTrim: 'magenta',
      district: DistrictId.AEGIS_CITADEL,
    },
    {
      id: 'aegis_skybridge_citadel_west',
      center: { x: -270, y: 224, z: -212 },
      halfExtents: { x: 4.5, y: 1.4, z: 56 },
      material: 'obsidian_steel',
      emissiveTrim: 'amber',
      district: DistrictId.AEGIS_CITADEL,
    },
    {
      id: 'aegis_citadel_forcefield_crown',
      center: { x: -280, y: 312, z: -280 },
      halfExtents: { x: 24.0, y: 0.5, z: 24.0 },
      material: 'forcefield_energy',
      emissiveTrim: 'cyan',
      district: DistrictId.AEGIS_CITADEL,
    }
  );

  // Tag any untagged structures with their spatial district
  for (const s of structures) {
    if (!s.district) {
      s.district = getDistrictForPosition(s.center.x, s.center.z);
    }
  }

  const architecture = getArchitecturePlans(structures, ARCHITECTURE_ROLLOUT);
  structures.push(...architecture.flatMap(plan => plan.additions));
  cachedCityStructures = structures;
  return structures;
}

/**
 * Builds and caches the 3D Spatial Octree for the entire 1200m x 1200m x 320m Neo-Veridia Metropolis
 */
export function getNeoVeridiaSpatialOctree(): WorldSpatialOctree<WorldBoxStructure> {
  if (cachedOctree) {
    return cachedOctree;
  }
  const octree = new WorldSpatialOctree<WorldBoxStructure>();
  for (const s of buildNeoVeridiaSector01()) {
    octree.insert(s.id, s.center, s.halfExtents, s);
  }
  cachedOctree = octree;
  return octree;
}

export interface LedgePlacementSurface {
  structureId: string;
  district: DistrictId;
  topY: number;
  centerX: number;
  centerZ: number;
  halfWidthX: number;
  halfDepthZ: number;
}

/**
 * Extracts elevated walkable architectural surfaces (Y = 10m to Y = 310m) for deterministic Orb placement
 */
export function getElevatedOrbSurfaces(): LedgePlacementSurface[] {
  const surfaces: LedgePlacementSurface[] = [];
  for (const s of buildNeoVeridiaSector01()) {
    if (s.excludeOrbPlacement || s.id.startsWith('perimeter_wall_') || s.id === 'ground_plaza_main') continue;
    const topY = s.center.y + s.halfExtents.y;
    if (topY >= 10.0 && topY <= 310.0 && s.halfExtents.x >= 1.8 && s.halfExtents.z >= 1.8) {
      surfaces.push({
        structureId: s.id,
        district: s.district || getDistrictForPosition(s.center.x, s.center.z),
        topY,
        centerX: s.center.x,
        centerZ: s.center.z,
        halfWidthX: s.halfExtents.x,
        halfDepthZ: s.halfExtents.z,
      });
    }
  }
  return surfaces;
}

/**
 * Checks if a 3D point is inside an active Thermal Updraft Volume and returns the updraft spec
 */
export function findActiveThermalUpdraft(pos: Vec3): ThermalUpdraftVolume | null {
  for (const u of getNeoVeridiaThermalUpdrafts()) {
    if (pos.y >= u.baseY && pos.y <= u.topY) {
      const dx = pos.x - u.center.x;
      const dz = pos.z - u.center.z;
      if (dx * dx + dz * dz <= u.radius * u.radius) {
        return u;
      }
    }
  }
  return null;
}
