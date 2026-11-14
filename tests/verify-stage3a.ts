import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildNeoVeridiaSector01 } from '../shared/world/neoVeridiaBlock.js';
import { getArchitecturePlans, ARCHITECTURE_REPRESENTATIVES } from '../shared/world/architecture.js';
import { generateNeoVeridiaOrbs } from '../shared/world/orbSystem.js';
import { DISTRICT_LOOP_SPECS } from '../shared/world/phase5Systems.js';
import { initRapierPhysics, SharedPhysicsWorld, RAPIER } from '../shared/physics/characterController.js';
import { FIXED_TIMESTEP, INPUT_FLAG_MANTLE } from '../shared/constants.js';
import { ArchBuilder } from '../client/builders/ArchBuilder.js';
import { ProductionAssetManager, productionAssets } from '../client/assets/productionAssets.js';

const baseline = JSON.parse(fs.readFileSync(new URL('./fixtures/stage3a-legacy.json', import.meta.url), 'utf8'));
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const structures = buildNeoVeridiaSector01(), ids = new Set<string>(baseline.structureIds);
assert.equal(hash(structures.filter(s => ids.has(s.id))), baseline.structuresHash, 'All legacy structures/IDs must remain unchanged');
assert.equal(hash(generateNeoVeridiaOrbs()), baseline.orbsHash, 'All 182 orb transforms and waypoints must remain unchanged');
assert.equal(hash(DISTRICT_LOOP_SPECS), baseline.objectivesHash, 'Mission anchors and triggers must remain unchanged');
const plans = getArchitecturePlans(structures, 'representatives'); assert.equal(plans.length, 4);
const cityPlans = getArchitecturePlans(structures, 'citywide');
for (const plan of cityPlans) for (const part of plan.additions) for (const orb of generateNeoVeridiaOrbs()) {
  assert.ok(!(Math.abs(part.center.x - orb.position.x) < part.halfExtents.x + 0.2 && Math.abs(part.center.y - orb.position.y) < part.halfExtents.y + 0.2 && Math.abs(part.center.z - orb.position.z) < part.halfExtents.z + 0.2), `${part.id} obstructs saved orb ${orb.orbId}`);
}
const allAdditions = cityPlans.flatMap(p => p.additions);
assert.equal(structures.filter(s => s.excludeOrbPlacement).length, allAdditions.length, 'The live world must contain every rendered building collider');
for (const spec of DISTRICT_LOOP_SPECS) for (const point of [...spec.stage1Terminals, spec.coreOverridePos]) for (const part of allAdditions) {
  assert.ok(!(Math.abs(point.x - part.center.x) < part.halfExtents.x + 0.4 && Math.abs(point.z - part.center.z) < part.halfExtents.z + 0.4 && Math.abs(point.y + 0.95 - part.center.y) < part.halfExtents.y + 0.95), `${part.id} blocks mission interaction`);
}
const claimed = cityPlans.flatMap(p => p.members.map(m => m.id));
assert.equal(new Set(claimed).size, claimed.length, 'Nested building prefixes must not claim each other or share visual parts');
assert.ok(!claimed.some(id => id.includes('forcefield')), 'Forcefield material and gameplay remain independent');
assert.deepEqual(new Set(plans.map(p => p.id)), new Set(ARCHITECTURE_REPRESENTATIVES));
const builder = new ArchBuilder();
const results = plans.map(plan => builder.build(plan));
for (const [i, built] of results.entries()) {
  const plan = plans[i];
  for (const name of ['Entrance', 'RoofEntry', 'Helipad', 'Antenna', 'Sign']) assert.ok(built.anchors.has(name));
  for (const name of ['RecessedLobbyGlazing', 'LobbyDoorMullions', 'StructuralCornerColumns', 'InteriorWindowBays', 'HelipadRing', 'HVACRotor0', 'HVACFanGrille0', 'VerticalNeonSign']) assert.ok(built.root.getObjectByName(name), `${plan.id}: missing ${name}`);
  assert.ok([...built.materials].some(m => m.userData.interiorMapping));
  const rotor = built.animatedParts.get('HVACRotor0')!; built.update(0.1); assert.ok(rotor.rotation.y > 0);
  built.update(0.1, new THREE.Vector3(plan.origin.x + 1000, 0, plan.origin.z)); assert.equal(built.root.getObjectByName('RooftopAndStreetDetail')!.visible, false);
  built.update(0.1, new THREE.Vector3(plan.origin.x, 0, plan.origin.z));
  built.root.updateMatrixWorld(true);
  const represented = new Map<string, THREE.Box3>();
  built.root.traverse(o => {
    if (!(o instanceof THREE.InstancedMesh) || !o.userData.collisionIds) return;
    for (let j = 0; j < o.count; j++) {
      const matrix = new THREE.Matrix4(); o.getMatrixAt(j, matrix); matrix.premultiply(o.matrixWorld);
      represented.set(o.userData.collisionIds[j], new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5)).applyMatrix4(matrix));
    }
  });
  for (const collision of plan.additions) {
    const shown = represented.get(collision.id)!; assert.ok(shown, `${collision.id}: invisible collider`);
    assert.ok(Math.abs(shown.max.y - collision.center.y - collision.halfExtents.y) < 0.0001);
    assert.ok(shown.getCenter(new THREE.Vector3()).distanceTo(new THREE.Vector3(collision.center.x, collision.center.y, collision.center.z)) < 0.0001);
  }
}
// Verify each resource is shared safely and freed after its last owner, including repeated disposal.
const duplicate = builder.build(plans[0]); const resources = builder.resources.size; results[0].dispose();
assert.equal(builder.resources.size, resources, 'A neighbor retains references to its shared resources');
duplicate.update(0.1); duplicate.dispose(); results.forEach(result => result.dispose()); assert.equal(builder.resources.size, 0);

await initRapierPhysics();
const world = new SharedPhysicsWorld();
try {
  for (const id of [...world.combatManager.enemies.keys()]) world.combatManager.removeEnemy(id);
  const agent = world.createAgent(700, 'ARCH-MANTLE', { x: 800, y: 0, z: 800 });
  let checked = 0;
  for (const plan of cityPlans) {
    for (const ledge of plan.additions.filter(p => p.id.includes('_ledge_'))) {
      const top = ledge.center.y + ledge.halfExtents.y;
      const north = ledge.id.endsWith('_north'), south = ledge.id.endsWith('_south'), west = ledge.id.endsWith('_west');
      const dir = north ? { x: 0, y: 0, z: 1 } : south ? { x: 0, y: 0, z: -1 } : west ? { x: 1, y: 0, z: 0 } : { x: -1, y: 0, z: 0 };
      agent.position = { x: ledge.center.x - dir.x * (ledge.halfExtents.x + 0.5) + (dir.x === 0 ? ledge.halfExtents.x * 0.55 : 0), y: top - 1.5,
        z: ledge.center.z - dir.z * (ledge.halfExtents.z + 0.5) + (dir.z === 0 ? ledge.halfExtents.z * 0.45 : 0) };
      agent.velocity = { x: 0, y: 0, z: 0 }; world.syncAgentKinematicTransform(agent); world.world.step();
      for (const level of [1, 3, 5]) {
        const mantle = world.detectLedgeMantle(agent, dir, level);
        if (!mantle.detected) {
          const inspect = (dy: number) => {
            const hit = world.world.castRayAndGetNormal(new RAPIER.Ray({ x: agent.position.x, y: agent.position.y + dy, z: agent.position.z }, dir), 2, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, agent.collider);
            return hit ? { toi: hit.timeOfImpact, normal: hit.normal, body: hit.collider.translation() } : null;
          };
          assert.fail(`${ledge.id}: Lv${level} cannot mantle ${JSON.stringify({ position: agent.position, chest: inspect(1.3), head: inspect(2.1) })}`);
        }
        assert.ok(Math.abs(mantle.ledgeTopY - top) < 0.001);
      }
      const hit = world.world.castRayAndGetNormal(new RAPIER.Ray({ x: dir.x === 0 ? agent.position.x : ledge.center.x, y: top + 0.1, z: dir.z === 0 ? agent.position.z : ledge.center.z }, { x: 0, y: -1, z: 0 }), 0.5, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, agent.collider);
      assert.ok(hit && Math.abs(hit.timeOfImpact - 0.1) < 0.001, `${ledge.id}: visible ledge top must agree with Rapier`); checked++;
    }
  }
  assert.ok(checked >= 30); console.log(`Verified ${checked} actual ledges at agility Lv1/3/5 with Rapier.`);
  for (const plan of plans) {
    const ledge = plan.additions.find(p => p.id.includes('_ledge_') && p.id.endsWith('_north'))!;
    const top = ledge.center.y + ledge.halfExtents.y;
    agent.position = { x: ledge.center.x, y: top - 1.5, z: ledge.center.z - ledge.halfExtents.z - 0.5 };
    agent.velocity = { x: 0, y: 0, z: 0 }; agent.grounded = false; agent.mantling = false;
    world.syncAgentKinematicTransform(agent); world.world.step();
    world.applyAgentInput(agent, { seq: 9000, moveX: 0, moveZ: 1, yaw: Math.PI, pitch: 0, buttons: INPUT_FLAG_MANTLE, dt: FIXED_TIMESTEP });
    assert.ok(agent.mantling, `${plan.id}: controller must enter mantle on its new ledge`);
    for (let i = 0; i < 32; i++) {
      world.applyAgentInput(agent, { seq: 9001 + i, moveX: 0, moveZ: 0, yaw: Math.PI, pitch: 0, buttons: 0, dt: FIXED_TIMESTEP }); world.world.step();
    }
    assert.ok(!agent.mantling && agent.grounded && Math.abs(agent.position.y - top) < 0.05, `${plan.id}: vault must end standing on the visible ledge`);
  }
} finally { world.world.free(); }

const loader = new ProductionAssetManager();
await loader.loadModels({ building: { missing: { url: '/missing.glb' } } }, { loadAsync: async () => { throw new Error('offline'); } });
assert.equal(loader.createModel('building', 'missing'), null); assert.ok(loader.modelFailures.has('building:missing'));
const invalidScene = new THREE.Group(); invalidScene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
await loader.loadModels({ building: { malformed: { url: '/bad.glb' } } }, { loadAsync: async () => ({ scene: invalidScene } as GLTF) });
assert.equal(loader.createModel('building', 'malformed'), null, 'Missing model anchors force fallback');
const scene = new THREE.Group();
const footprint = new THREE.Box3();
for (const p of [...plans[0].members, ...plans[0].additions]) footprint.expandByPoint(new THREE.Vector3(p.center.x - plans[0].origin.x - p.halfExtents.x, 0, p.center.z - plans[0].origin.z - p.halfExtents.z)).expandByPoint(new THREE.Vector3(p.center.x - plans[0].origin.x + p.halfExtents.x, plans[0].height, p.center.z - plans[0].origin.z + p.halfExtents.z));
const dimensions = footprint.getSize(new THREE.Vector3()), center = footprint.getCenter(new THREE.Vector3());
const box = new THREE.Mesh(new THREE.BoxGeometry(dimensions.x, plans[0].height, dimensions.z), new THREE.MeshStandardMaterial()); box.position.copy(center); scene.add(box);
for (const name of ['Entrance', 'RoofEntry', 'Helipad']) { const anchor = new THREE.Object3D(); anchor.name = name; const p = plans[0].anchors[name]; anchor.position.set(p.x, p.y, p.z); scene.add(anchor); }
productionAssets.models.set(`building:${plans[0].id}`, { scene, animations: [] } as unknown as GLTF);
const imported = builder.build(plans[0]); assert.ok(builder.attachModel(imported, plans[0])); assert.equal(imported.source, 'gltf');
imported.dispose(); productionAssets.models.clear(); box.geometry.dispose(); (box.material as THREE.Material).dispose();
console.log('Stage 3A passed: legacy layout/orbs/missions, four district buildings, semantic features, instancing, LOD, resources, colliders/mantles and model fallback.');
