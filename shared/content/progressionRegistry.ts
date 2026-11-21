/** Tier 3 balance source. Unspecified intermediate values use linear interpolation.
 * XP amounts are per completed event, never multiplied by attribute level. */
export const ATTRIBUTE_NAMES = ['agility', 'strength', 'driving', 'shooting', 'explosives', 'flying', 'vigilante'] as const;
export type Attribute = typeof ATTRIBUTE_NAMES[number];
export type AttributeValues = Record<Attribute, number>;
export const PROGRESSION_XP_THRESHOLDS = [0, 1000, 3500, 8500, 18000] as const;
export const ATTRIBUTE_CURVES = {
  agility: { runSpeed: [8, 10.125, 12.25, 14.375, 16.5], jumpApexMeters: [3.2, 6.025, 8.85, 11.675, 14.5], maxAirDashes: [1, 2, 2, 3, 3], ledgeGrabReach: [.8, 1.05, 1.3, 1.55, 1.8] },
  strength: { meleeBaseDamage: [35, 61.25, 87.5, 113.75, 140], maxHp: [200, 300, 400, 500, 600], throwMassLimitKg: [150, 1112.5, 2075, 3037.5, 4000], meleeWarpRangeM: [4.5, 5.75, 7, 8.25, 9.5] },
  driving: { topSpeedMps: [28, 34.75, 41.5, 48.25, 55], chassisMassKg: [1400, 1850, 2300, 2750, 3200], gripMultiplier: [1, 1.25, 1.5, 1.75, 2] },
  shooting: { spreadConeDeg: [4.2, 3.25, 2.3, 1.35, .4], lockOnRangeMeters: [40, 57.5, 75, 92.5, 110], vatsHitProbBonusPct: [0, 15, 30, 45, 60] },
  explosives: { blastRadiusMeters: [4.5, 6.375, 8.25, 10.125, 12], impulseNs: [18, 29.75, 41.5, 53.25, 65], selfDamageReduction: [0, .225, .45, .675, .9] },
  flying: { jetpackFuelSeconds: [3, 5.25, 7.5, 9.75, 12], maxUpwardAccelMps2: [12, 16, 20, 24, 28], vtolHandlingMultiplier: [1, 1.3, 1.6, 1.9, 2.2] },
  vigilante: { auraRadiusMeters: [15, 22.5, 30, 37.5, 45], counterWindowMs: [220, 270, 320, 370, 420] },
} as const;
export function attributeLevel(xp: number): number {
  if (!Number.isFinite(xp) || xp < 0) return 1;
  return 1 + PROGRESSION_XP_THRESHOLDS.slice(1).filter(t => xp >= t).length;
}
export function attributeParams<A extends Attribute>(attribute: A, level: number): { [K in keyof typeof ATTRIBUTE_CURVES[A]]: number } {
  const index = Math.max(0, Math.min(4, Math.floor(Number.isFinite(level) ? level : 1) - 1));
  return Object.fromEntries(Object.entries(ATTRIBUTE_CURVES[attribute]).map(([key, values]) => [key, (values as readonly number[])[index]])) as { [K in keyof typeof ATTRIBUTE_CURVES[A]]: number };
}
export interface AttributeUnlock { attribute: Attribute; level: number; parameters: Readonly<Record<string, number>> }
export const ATTRIBUTE_UNLOCKS = {
  parkour_roll: { attribute: 'agility', level: 2, parameters: { durationSec: .45 } },
  wall_kick: { attribute: 'agility', level: 2, parameters: { speedMps: 12, cooldownSec: .4 } },
  wall_run: { attribute: 'agility', level: 3, parameters: { durationSec: 3.5, speedMps: 14 } },
  kinetic_vault: { attribute: 'agility', level: 4, parameters: { speedMps: 22 } },
  rail_grind: { attribute: 'agility', level: 4, parameters: { speedMps: 22 } },
  zero_terminal_fall: { attribute: 'agility', level: 5, parameters: { fallDamageMultiplier: 0 } },
  wind_shear: { attribute: 'agility', level: 5, parameters: { radiusM: 2, damage: 20, cooldownSec: 1 } },
  wall_splat: { attribute: 'strength', level: 2, parameters: { speedMps: 14 } },
  wall_breach: { attribute: 'strength', level: 3, parameters: { damage: 250 } },
  heavy_equip: { attribute: 'strength', level: 3, parameters: { enabled: 1 } },
  seismic_crater: { attribute: 'strength', level: 4, parameters: { radiusM: 8, damage: 160 } },
  shield_rip: { attribute: 'strength', level: 4, parameters: { armorDamage: 100 } },
  titan_hurl: { attribute: 'strength', level: 5, parameters: { speedMps: 24, massKg: 4000 } },
  ram_plow: { attribute: 'driving', level: 2, parameters: { damageMultiplier: 1.5 } },
  roof_hmg: { attribute: 'driving', level: 3, parameters: { damage: 32, cooldownSec: .15 } },
  thruster_hop: { attribute: 'driving', level: 3, parameters: { heightM: 4.5, cooldownSec: 1.4 } },
  bounty_harpoon: { attribute: 'driving', level: 4, parameters: { rangeM: 35, durationSec: 4 } },
  mag_grip: { attribute: 'driving', level: 4, parameters: { maxSlopeDeg: 65 } },
  rocket_pods: { attribute: 'driving', level: 5, parameters: { projectiles: 2, damage: 120, cooldownSec: 3 } },
  ejection_launch: { attribute: 'driving', level: 5, parameters: { heightM: 25 } },
  ammo_detonation: { attribute: 'shooting', level: 2, parameters: { damage: 40, radiusM: 3 } },
  airborne_focus: { attribute: 'shooting', level: 3, parameters: { timeScale: .4, durationSec: 3, cooldownSec: 8 } },
  weakpoint_scan: { attribute: 'shooting', level: 3, parameters: { durationSec: 4 } },
  dual_limb_queue: { attribute: 'shooting', level: 4, parameters: { limbs: 2 } },
  cripple_reload: { attribute: 'shooting', level: 5, parameters: { magazineFraction: .5 } },
  parabolic_arc: { attribute: 'explosives', level: 2, parameters: { segments: 24 } },
  sticky_charge: { attribute: 'explosives', level: 2, parameters: { fuseSec: 2 } },
  shaped_charge: { attribute: 'explosives', level: 3, parameters: { damage: 250 } },
  rocket_jump: { attribute: 'explosives', level: 3, parameters: { heightM: 12 } },
  cluster_bomblets: { attribute: 'explosives', level: 4, parameters: { count: 3, radiusM: 3, damage: 45 } },
  thermal_lock: { attribute: 'explosives', level: 4, parameters: { rangeM: 110 } },
  sympathetic_chain: { attribute: 'explosives', level: 5, parameters: { radiusM: 6 } },
  wingsuit: { attribute: 'flying', level: 2, parameters: { gravityMultiplier: .2, speedMps: 18 } },
  chin_autocannon: { attribute: 'flying', level: 2, parameters: { caliberMm: 20, damage: 45, cooldownSec: .2 } },
  hover_aim: { attribute: 'flying', level: 3, parameters: { fuelPerSec: 1 } },
  swarm_missiles: { attribute: 'flying', level: 3, parameters: { count: 4, damage: 45, cooldownSec: 4 } },
  sky_crane: { attribute: 'flying', level: 3, parameters: { massKg: 4000, rangeM: 20 } },
  jet_dash: { attribute: 'flying', level: 4, parameters: { speedMps: 28, durationSec: .3 } },
  emp_flares: { attribute: 'flying', level: 4, parameters: { durationSec: 3, cooldownSec: 12 } },
  dive_bomb: { attribute: 'flying', level: 5, parameters: { radiusM: 15, damage: 180 } },
  bullet_deflect: { attribute: 'vigilante', level: 2, parameters: { damage: 42 } },
  threat_scanner: { attribute: 'vigilante', level: 2, parameters: { rangeM: 45 } },
  disarm_counter: { attribute: 'vigilante', level: 3, parameters: { durationSec: 8 } },
  pet_pounce: { attribute: 'vigilante', level: 3, parameters: { rangeM: 25, damage: 55 } },
  elite_parry: { attribute: 'vigilante', level: 4, parameters: { shieldPenetration: 1 } },
  system_hack: { attribute: 'vigilante', level: 4, parameters: { durationSec: 30, radiusM: 30 } },
  parry_revive: { attribute: 'vigilante', level: 5, parameters: { healthFraction: .5 } },
} as const satisfies Record<string, AttributeUnlock>;
export type AttributeAbility = keyof typeof ATTRIBUTE_UNLOCKS;
export function hasAttributeAbility(attributes: AttributeValues, id: AttributeAbility): boolean {
  const rule = ATTRIBUTE_UNLOCKS[id]; return attributes[rule.attribute] >= rule.level;
}
const event = (xp: number, ...attributes: Attribute[]) => ({ xp, attributes });
export const XP_EVENTS = {
  run_10m: event(2, 'agility'), jump: event(4, 'agility'), mantle: event(8, 'agility'),
  drive_1s: event(2, 'driving'), fly_1s: event(2, 'flying'), throw: event(12, 'strength'),
  weapon_hit: event(30, 'shooting'), weakpoint_hit: event(50, 'shooting'), melee_hit: event(40, 'strength'),
  explosion_hit: event(40, 'explosives'), parry: event(150, 'strength', 'vigilante'),
  vtol_strafe: event(40, 'flying', 'shooting'), rocket_jump: event(20, 'agility', 'explosives'),
  vehicle_ram: event(40, 'driving', 'strength'), pet_pounce: event(40, 'vigilante', 'shooting'),
  agility_orb: event(50, 'agility'), relic: event(1050, ...ATTRIBUTE_NAMES),
  district_complete: event(3500, ...ATTRIBUTE_NAMES), bounty_complete: event(1000, 'vigilante', 'driving'),
  raid_complete: event(7000, ...ATTRIBUTE_NAMES),
} as const;
export type XPEvent = keyof typeof XP_EVENTS;
export function awardActionXP(xp: AttributeValues, action: XPEvent): void {
  const spec = XP_EVENTS[action];
  for (const stat of spec.attributes) xp[stat] = Math.max(0, Number.isFinite(xp[stat]) ? xp[stat] : 0) + spec.xp / spec.attributes.length;
}
/** Retains the previous game payouts for authored collectible types. */
export const COLLECTIBLE_XP: Readonly<Record<string, Partial<AttributeValues>>> = {
  renegade: { agility: 150, strength: 75, driving: 75, shooting: 75, explosives: 75, flying: 75, vigilante: 75 },
  whisper: { vigilante: 120, flying: 100, shooting: 100 },
};
