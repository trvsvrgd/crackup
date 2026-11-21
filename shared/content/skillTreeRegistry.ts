import { ATTRIBUTE_NAMES, attributeLevel, type Attribute, type AttributeValues } from './progressionRegistry.js';
export const CHASSIS_REGISTRY = [
  { id: 'CHASSIS_01', legacyId: 'TITAN_JUGGERNAUT', name: 'Titan Juggernaut', modifiers: { maxHpMultiplier: .15, throwMassBonusMultiplier: .2 } },
  { id: 'CHASSIS_02', legacyId: 'PHANTOM_SHARPSHOOTER', name: 'Phantom Sharpshooter', modifiers: { spreadConeMultiplier: -.15, lockOnRangeBonusM: 10 } },
  { id: 'CHASSIS_03', legacyId: 'AERO_VALKYRIE', name: 'Aero-Valkyrie', modifiers: { grappleRangeBonusM: 10, airDashSpeedMultiplier: .1 } },
  { id: 'CHASSIS_04', legacyId: 'DEMOLITION_SAVANT', name: 'Demolition Savant', modifiers: { blastRadiusMultiplier: .15, blastImpulseMultiplier: .15 } },
  { id: 'CHASSIS_05', legacyId: 'PACK_VANGUARD', name: 'Pack Vanguard', modifiers: { vehicleTopSpeedMultiplier: .1, parryWindowBonusMs: 60 } },
] as const;
export interface SkillDefinition {
  id: string; name: string; path: Attribute | 'bridge'; tier: number; cost: number;
  requires: Partial<AttributeValues>; previous: string | null;
  /** Additive modifications to the existing authoritative build calculator. */
  modifiers: Readonly<Record<string, number>>;
  /** Active effects use the shared Tier 3 ability executor and its cooldown. */
  active?: { kind: 'dash' | 'blast' | 'pull' | 'hack' | 'focus' | 'shield' | 'lift'; rangeM: number; power: number; durationSec: number; cooldownSec: number };
}
const PATHS: Record<Attribute, readonly string[]> = {
  agility: ['Slipstream Step', 'Kinetic Rebound', 'Pendulum Whip', 'Phase-Shift Dodge', 'Phase-Step Blink'],
  strength: ['Pneumatic Grip', 'Concussive Haymaker', 'Grapple Yank', 'Unstoppable Momentum', 'Tectonic Cataclysm'],
  driving: ['Hotwire Overdrive', 'Shunt Thrusters', 'Automated Turret AI', 'Reactive Armor Hull', 'Phantom Convoy Link'],
  shooting: ['Quick-Draw Telemetry', 'Severed Nerve', 'Ricochet Geometry', "Executioner's Rhythm", 'Gestalt Bullet-Time'],
  explosives: ['Scavenger Synthesis', 'Shrapnel Magnet', 'Demolition Tether', 'Napalm Afterburn', 'Miniature Singularity'],
  flying: ['Thermal Capacitor', 'Strafe Vectoring', 'Aerial Hijack', 'Counter-Battery Flak', 'Stratosphere Valhallan'],
  vigilante: ['Pacifier Rounds', 'Tactical Uplink', 'Chain Counter', 'Systemic Hijack', 'Overwatch Sovereign'],
};
const MODIFIERS: Record<Attribute, Readonly<Record<string, number>>[]> = {
  agility: [{ airDashSpeedMultiplier: .1 }, { mantleReachBonusM: .2 }, { grappleSwingImpulseMultiplier: .3 }, { bonusAirDashes: 1 }, { airDashSpeedMultiplier: .25 }],
  strength: [{ throwMassBonusMultiplier: .25 }, { parryDamageMultiplier: .25 }, { grappleReelSpeedMultiplier: .3 }, { meleeEngageRangeBonusM: 1.7 }, { parryShockwaveRadiusBonusM: 4 }],
  driving: [{ vehicleTopSpeedMultiplier: .1 }, { vehicleRamImpulseMultiplier: .25 }, { weaponDamageMultiplier: .1 }, { incomingDamageReduction: .1 }, { vigilanteAuraMultiplier: .3 }],
  shooting: [{ spreadConeMultiplier: -.15 }, { limbCrippleDurationBonusSec: 2 }, { limbDamageMultiplier: .2 }, { siphonHpOnParryOrCripple: 15 }, { vatsHitProbBonusPct: 20 }],
  explosives: [{ blastRadiusMultiplier: .1 }, { blastImpulseMultiplier: .2 }, { grappleRangeBonusM: 10 }, { weaponDamageMultiplier: .1 }, { blastRadiusMultiplier: .35 }],
  flying: [{ jetpackFuelBonusSec: 1 }, { jetpackAccelMultiplier: .15 }, { grappleRangeBonusM: 15 }, { incomingDamageReduction: .1 }, { jetpackFuelBonusSec: 3 }],
  vigilante: [{ limbDamageMultiplier: .1 }, { vigilanteAuraMultiplier: .2 }, { parryWindowBonusMs: 50 }, { vigilanteAuraRadiusBonusM: 10 }, { vigilanteTriageRegenHpPerSec: 4 }],
};
const active = (kind: NonNullable<SkillDefinition['active']>['kind'], rangeM: number, power: number, durationSec: number, cooldownSec: number): NonNullable<SkillDefinition['active']> => ({ kind, rangeM, power, durationSec, cooldownSec });
const ACTIVES: Record<string, NonNullable<SkillDefinition['active']>> = {
  agility_2: active('dash', 8, 18, .4, 4), agility_4: active('dash', 10, 25, .4, 6), agility_5: active('dash', 15, 30, .5, 8),
  strength_2: active('blast', 3, 100, .2, 5), strength_3: active('pull', 18, 14, 1, 6), strength_5: active('blast', 12, 220, .5, 15),
  driving_2: active('dash', 8, 22, .4, 4), driving_3: active('blast', 30, 40, 1, 4), driving_4: active('shield', 4, 100, 4, 12), driving_5: active('shield', 30, 150, 6, 18),
  shooting_3: active('blast', 12, 65, .2, 5), shooting_5: active('focus', 40, .4, 6, 15),
  explosives_2: active('pull', 10, 10, 1, 5), explosives_3: active('blast', 18, 100, .5, 6), explosives_4: active('blast', 6, 160, 4, 10), explosives_5: active('pull', 15, 28, 3, 18),
  flying_3: active('hack', 12, 1, 30, 20), flying_4: active('blast', 20, 100, .5, 8), flying_5: active('lift', 25, 30, 2, 15),
  vigilante_3: active('blast', 8, 90, .4, 6), vigilante_4: active('hack', 30, 1, 30, 20), vigilante_5: active('shield', 45, 200, 8, 20),
};
export const TIER3_SKILL_NODES: SkillDefinition[] = ATTRIBUTE_NAMES.flatMap(path => PATHS[path].map((name, i) => ({
  id: `${path}_${i + 1}`, name, path, tier: i + 1, cost: [1, 1, 2, 3, 4][i],
  requires: { [path]: i + 1 }, previous: i ? `${path}_${i}` : null, modifiers: MODIFIERS[path][i], active: ACTIVES[`${path}_${i + 1}`],
})));
const BRIDGES: [string, Attribute, Attribute, NonNullable<SkillDefinition['active']>][] = [
  ['Meteor Kick', 'agility', 'strength', active('blast', 6, 140, .5, 8)],
  ['Bunker-Buster Fist', 'strength', 'explosives', active('blast', 5, 250, .5, 10)],
  ['Nitrous Afterburner', 'explosives', 'driving', active('dash', 20, 35, .6, 8)],
  ['Transformable Slipstream', 'driving', 'flying', active('lift', 15, 22, 1, 8)],
  ['Archangel Gunship', 'flying', 'shooting', active('blast', 25, 120, .5, 10)],
  ['Neural Contagion', 'shooting', 'vigilante', active('hack', 20, 1, 15, 15)],
  ['Phantom Tether', 'vigilante', 'agility', active('pull', 30, 20, 1.5, 8)],
];
TIER3_SKILL_NODES.push(...BRIDGES.map(([name, a, b, ability], i) => ({ id: `bridge_${i + 1}`, name, path: 'bridge' as const, tier: 3, cost: 2, requires: { [a]: 3, [b]: 3 }, previous: null, modifiers: {}, active: ability })));
export const TIER3_SKILL_BY_ID = new Map(TIER3_SKILL_NODES.map(node => [node.id, node]));
export function tier3SkillError(id: string, xp: AttributeValues, unlocked: Set<string>, points: number): string | null {
  const node = TIER3_SKILL_BY_ID.get(id);
  if (!node) return 'Unknown upgrade.';
  if (unlocked.has(id)) return 'Upgrade already installed.';
  if (Object.entries(node.requires).some(([stat, level]) => attributeLevel(xp[stat as Attribute]) < level)) return 'Required attribute level has not been earned.';
  if (node.previous && !unlocked.has(node.previous)) return 'Install the previous upgrade in this path first.';
  return points < node.cost ? `Requires ${node.cost} upgrade points.` : null;
}
