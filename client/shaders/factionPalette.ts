import * as THREE from 'three';
import type { NarrativeFaction } from '../../shared/narrative/storyBible.js';

export const FACTION_PALETTES = {
  aegis: { armor: 0xc6d4dc, joint: 0x26394a, trim: 0x26bbff, roughness: 0.38, metalness: 0.45 },
  syndicate: { armor: 0xa4742d, joint: 0x50332d, trim: 0xff9c28, roughness: 0.72, metalness: 0.55 },
  resistance: { armor: 0x203832, joint: 0x745341, trim: 0x47ef9e, roughness: 0.8, metalness: 0.25 },
} as const;

/** Preserve standard PBR lighting/maps/shadows; compress diffuse value into broad illustrated bands. */
export function stylizePBR(material: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  if (material.userData.eclipsePBR) return material;
  material.userData.eclipsePBR = true;
  material.userData.eclipseHitFlash = { value: 0 };
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.eclipseHitFlash = material.userData.eclipseHitFlash;
    shader.fragmentShader = 'uniform float eclipseHitFlash;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float eclipseValue = max(dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)), 0.001);
      float eclipseBand = floor(eclipseValue * 5.0 + 0.5) / 5.0;
      outgoingLight *= mix(1.0, max(0.12, eclipseBand) / eclipseValue, 0.24);
      float eclipseRim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);
      outgoingLight += vec3(eclipseRim * eclipseHitFlash * 3.0);
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'eclipse-stylized-pbr-v1';
  material.needsUpdate = true;
  return material;
}
export function createFactionMaterials(faction: NarrativeFaction) {
  const p = FACTION_PALETTES[faction];
  return {
    armor: stylizePBR(new THREE.MeshStandardMaterial({ color: p.armor, roughness: p.roughness, metalness: p.metalness })),
    joint: stylizePBR(new THREE.MeshStandardMaterial({ color: p.joint, roughness: 0.65, metalness: 0.65 })),
    trim: stylizePBR(new THREE.MeshStandardMaterial({ color: p.trim, emissive: p.trim, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.4 })),
  };
}
