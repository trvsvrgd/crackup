import { AugmentChassisId } from '../constants.js';

/** Presentation only: these variants do not change damage, fire rate or progression. */
export enum WeaponVariant { CARBINE, MARKSMAN, HEAVY }
export const WEAPON_PROFILES = [
  { key: 'carbine', receiver: 0.32, barrel: 0.28, muzzleZ: -0.55, width: 0.12, stock: 0.18, color: 0x26bbff },
  { key: 'marksman', receiver: 0.4, barrel: 0.46, muzzleZ: -0.79, width: 0.1, stock: 0.24, color: 0x47ef9e },
  { key: 'heavy', receiver: 0.46, barrel: 0.34, muzzleZ: -0.67, width: 0.17, stock: 0.21, color: 0xff9c28 },
] as const;
export function weaponForStyle(style: AugmentChassisId | number): WeaponVariant {
  if (style === AugmentChassisId.PHANTOM_SHARPSHOOTER || style === 1) return WeaponVariant.MARKSMAN;
  if (style === AugmentChassisId.TITAN_JUGGERNAUT || style === 2 || style === 3) return WeaponVariant.HEAVY;
  return WeaponVariant.CARBINE;
}
