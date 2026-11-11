import * as THREE from 'three';
import { stylizePBR } from './factionPalette.js';

/** Intersect a ray with a virtual room cube behind each window. No flat room photograph is used. */
export function createInteriorMaterial(tint: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.32 });
  material.userData.interiorMapping = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.roomTint = { value: new THREE.Color(tint) };
    shader.vertexShader = 'varying vec2 vRoomUv; varying vec3 vRoomView; varying float vRoomSeed;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vRoomUv = uv;
      vec4 roomPoint = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        roomPoint = instanceMatrix * roomPoint;
      #endif
      vec3 worldRoomPoint = (modelMatrix * roomPoint).xyz;
      vec3 toViewer = cameraPosition - worldRoomPoint;
      vec3 objectView = vec3(dot(toViewer, normalize(modelMatrix[0].xyz)), dot(toViewer, normalize(modelMatrix[1].xyz)), dot(toViewer, normalize(modelMatrix[2].xyz)));
      #ifdef USE_INSTANCING
        vRoomView = vec3(dot(objectView, normalize(instanceMatrix[0].xyz)), dot(objectView, normalize(instanceMatrix[1].xyz)), dot(objectView, normalize(instanceMatrix[2].xyz)));
        vRoomSeed = fract(sin(dot(instanceMatrix[3].xyz, vec3(12.9898, 78.233, 41.413))) * 43758.5453);
      #else
        vRoomView = objectView; vRoomSeed = 0.7;
      #endif`);
    shader.fragmentShader = 'uniform vec3 roomTint; varying vec2 vRoomUv; varying vec3 vRoomView; varying float vRoomSeed;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec3 roomRay = normalize(-vRoomView);
      roomRay = vec3(roomRay.xy, -max(0.02, abs(roomRay.z)));
      vec3 roomStart = vec3(vRoomUv * 2.0 - 1.0, 0.999);
      vec3 safeRay = sign(roomRay) * max(abs(roomRay), vec3(0.0001));
      safeRay += vec3(equal(safeRay, vec3(0.0))) * 0.0001;
      vec3 distances = (sign(safeRay) - roomStart) / safeRay;
      float roomDistance = min(min(distances.x, distances.y), distances.z);
      vec3 roomHit = roomStart + roomRay * roomDistance;
      float backWall = step(abs(roomHit.x), abs(roomHit.z)) * step(abs(roomHit.y), abs(roomHit.z));
      float floorWall = step(abs(roomHit.x), abs(roomHit.y)) * step(abs(roomHit.z), abs(roomHit.y));
      float roomLight = mix(0.06, 0.75 + vRoomSeed * 0.4, step(0.25, vRoomSeed));
      float furniture = step(abs(roomHit.x + 0.3), 0.42) * step(abs(roomHit.y + 0.5), 0.14) * backWall;
      float mullion = step(0.93, max(abs(vRoomUv.x * 2.0 - 1.0), abs(vRoomUv.y * 2.0 - 1.0)));
      vec3 roomColor = roomTint * (0.42 + backWall * 0.35 + floorWall * 0.15);
      roomColor *= mix(1.0, 0.2, furniture);
      roomColor *= 1.0 - mullion * 0.8;
      diffuseColor.rgb *= roomColor * roomLight;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      totalEmissiveRadiance += roomColor * roomLight * 0.45;
    `);
  };
  stylizePBR(material);
  material.customProgramCacheKey = () => `eclipse-interior-v1-${tint}`;
  return material;
}
