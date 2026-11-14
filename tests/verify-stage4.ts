import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import * as THREE from "three";
import {
  PBRTextureLibrary,
  makeFallbackPBR,
} from "../client/assets/pbrTextureLibrary.js";
import {
  BRIDGES,
  BRIDGE_LENGTH,
  bridgeHeight,
  bridgePoint,
  buildBayBridgeColliders,
  terrainRadius,
} from "../shared/world/bayVista.js";
import {
  initRapierPhysics,
  SharedPhysicsWorld,
  RAPIER,
} from "../shared/physics/characterController.js";
import { FIXED_TIMESTEP } from "../shared/constants.js";
import { BayVista } from "../client/world/bayVista.js";

const library = new PBRTextureLibrary();
for (const [name, maps] of library.textures) {
  const again = makeFallbackPBR(name);
  for (const [channel, texture] of Object.entries(maps)) {
    assert.deepEqual(
      texture.image.data,
      again[channel].image.data,
      "Fallbacks must be reproducible",
    );
    again[channel].dispose();
    assert.equal(
      texture.colorSpace,
      ["diffuse", "emissive"].includes(channel)
        ? THREE.SRGBColorSpace
        : THREE.NoColorSpace,
    );
  }
}
const material = new THREE.MeshStandardMaterial();
library.applyMaterial(material, "asphalt_02");
const fallback = material.map;
let released = 0;
fallback!.addEventListener("dispose", () => released++);
const urls = {
  diffuse: "albedo.webp",
  normal: "normal.png",
  roughness: "roughness.jpg",
  metalness: "metalness.png",
  emissive: "emissive.webp",
};
const texture = async () => new THREE.DataTexture(new Uint8Array(16), 2, 2);
assert.equal(
  await library.replaceMaterialPack("asphalt_02", urls, texture),
  true,
);
assert.notEqual(material.map, fallback);
assert.equal(released, 1);
assert.ok(material.emissiveMap);
const withoutMetal = {
  diffuse: urls.diffuse,
  normal: urls.normal,
  roughness: urls.roughness,
};
await library.replaceMaterialPack("asphalt_02", withoutMetal, texture);
assert.equal(
  material.metalness,
  0,
  "Removing the metal map restores the base scalar",
);
const good = material.map;
assert.equal(
  await library.replaceMaterialPack(
    "asphalt_02",
    { ...urls, normal: "fake.fbx" },
    texture,
  ),
  false,
);
assert.equal(
  material.map,
  good,
  "Failed pack must retain the previous complete set",
);
library.applyMaterial(material, "asphalt_02", [3, 7]);
assert.deepEqual(material.map!.repeat.toArray(), [3, 7]);
let finish!: (texture: THREE.Texture) => void;
const stale = library.replaceMaterialPack(
  "asphalt_02",
  urls,
  () =>
    new Promise((resolve) => {
      finish = resolve;
    }),
);
await library.replaceMaterialPack("asphalt_02", urls, texture);
// Finish each channel of the older request; it must never overwrite the newer pack.
for (let i = 0; i < 5; i++) {
  finish(await texture());
  await new Promise((resolve) => setTimeout(resolve, 0));
}
assert.equal(await stale, false);
material.dispose();
library.disposeTextures();
assert.equal(library.textures.size, 0);

await initRapierPhysics();
const world = new SharedPhysicsWorld(),
  parts = buildBayBridgeColliders();
assert.equal(parts.length, 422);
assert.ok(parts.every((p) => p.excludeOrbPlacement));
assert.equal(new Set(parts.map((p) => p.id)).size, parts.length);
let deckSamples = 0;
for (const bridge of BRIDGES)
  for (let t = 4; t < BRIDGE_LENGTH - 4; t += 17) {
    const p = bridgePoint(bridge, t),
      ray = new RAPIER.Ray(
        { x: p.x, y: p.y + 4, z: p.z },
        { x: 0, y: -1, z: 0 },
      );
    const hit = world.world.castRay(ray, 8, true);
    assert.ok(hit, `${bridge.id} deck hole at ${t}`);
    assert.ok(
      Math.abs(hit.timeOfImpact - 4) < 0.12,
      `${bridge.id}: render/collision height ${t}`,
    );
    deckSamples++;
  }
let bridgeWalks = 0;
for (const bridge of BRIDGES)
  for (const start of [425, 2280]) {
    const p = bridgePoint(bridge, start);
    p.y += 0.05;
    const agent = world.createAgent(4400 + bridgeWalks, "BRIDGE-WALK", p);
    for (let i = 0; i < 600; i++) {
      world.applyAgentInput(agent, {
        seq: i,
        moveX: 0,
        moveZ: 1,
        yaw: bridge.yaw,
        pitch: 0,
        buttons: 0,
        dt: FIXED_TIMESTEP,
      });
      world.world.step();
    }
    const distance =
      bridge.yaw === 0
        ? bridge.origin.z - agent.position.z
        : agent.position.x - bridge.origin.x;
    assert.ok(distance > start + 60, `Controller blocked at ${distance}`);
    assert.ok(
      agent.grounded &&
        Math.abs(agent.position.y - bridgeHeight(distance)) < 0.1,
      "Controller stays on the sloped deck",
    );
    world.removeAgent(agent.entityId);
    bridgeWalks++;
  }
const vista = new BayVista();
vista.root.updateMatrixWorld(true);
const represented = new Set<string>();
vista.root.traverse((o) => {
  if (o instanceof THREE.InstancedMesh && o.userData.collisionIds) {
    for (const id of o.userData.collisionIds) represented.add(id);
  }
});
assert.deepEqual(
  represented,
  new Set(parts.map((p) => p.id)),
  "Every collider has visible geometry",
);
assert.ok(bridgeHeight(600) > 14, "Deck clears legacy sea-wall");
for (let angle = 0; angle < Math.PI * 2; angle += 0.05)
  assert.ok(terrainRadius(angle) >= 3000 && terrainRadius(angle) <= 3540);
for (const night of [0, 0.5, 1]) {
  vista.setNight(night);
  assert.equal(vista.night, night);
  assert.ok(vista.atmosphere.color.value.toArray().every(Number.isFinite));
}
assert.equal(vista.water.geometry.parameters.width, 10000);
assert.equal(vista.water.geometry.parameters.height, 10000);
vista.dispose();
world.world.free();
const result = {
  status: "passed",
  checkedAt: new Date().toISOString(),
  bridgeColliders: parts.length,
  deckRaySamples: deckSamples,
  bridgeWalks,
  deterministicFallbacks: 4,
  atomicPackSwap: true,
  staleRequestRejected: true,
  visibleColliderParity: true,
};
writeFileSync(
  "output/playwright/stage4-verification.json",
  JSON.stringify(result, null, 2),
);
console.log(
  "Stage 4 passed: deterministic five-channel PBR, atomic pack swap/failure/races/disposal, two complete collision-matched bridges and bay/terrain bounds.",
);
