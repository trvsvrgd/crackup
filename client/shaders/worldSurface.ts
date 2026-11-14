import * as THREE from "three";

/** World metres, including non-uniformly scaled instances. Static surfaces only. */
export function triplanarPBR(
  material: THREE.MeshStandardMaterial,
  metresPerTile = 4,
): void {
  if (material.userData.worldTile) {
    material.userData.worldTile.value = metresPerTile;
    return;
  }
  const tile = { value: metresPerTile };
  material.userData.worldTile = tile;
  const previous = material.onBeforeCompile,
    key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}|world-triplanar-v1`;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.worldTile = tile;
    shader.vertexShader = "varying vec3 surfaceWorld;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `
      #include <project_vertex>
      vec4 surfacePosition = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
        surfacePosition = batchingMatrix * surfacePosition;
      #endif
      #ifdef USE_INSTANCING
        surfacePosition = instanceMatrix * surfacePosition;
      #endif
      surfaceWorld = (modelMatrix * surfacePosition).xyz;`,
    );
    shader.fragmentShader =
      `varying vec3 surfaceWorld;
      uniform float worldTile;
      vec3 triWeight;
      vec3 triNormal;
      vec4 triSample(sampler2D tex) {
        vec3 p = surfaceWorld / worldTile;
        return texture2D(tex, p.zy * vec2(sign(triNormal.x), 1.0)) * triWeight.x
          + texture2D(tex, p.xz * vec2(sign(triNormal.y), 1.0)) * triWeight.y
          + texture2D(tex, p.xy * vec2(-sign(triNormal.z), 1.0)) * triWeight.z;
      }
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
      triNormal = normalize(cross(dFdx(surfaceWorld), dFdy(surfaceWorld)));
      triWeight = pow(abs(triNormal), vec3(4.0)); triWeight /= max(dot(triWeight, vec3(1.0)), 0.00001);
      #ifdef USE_MAP
        diffuseColor *= triSample(map);
      #endif`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `
      float roughnessFactor = roughness;
      #ifdef USE_ROUGHNESSMAP
        roughnessFactor *= triSample(roughnessMap).g;
      #endif`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <metalnessmap_fragment>",
      `
      float metalnessFactor = metalness;
      #ifdef USE_METALNESSMAP
        metalnessFactor *= triSample(metalnessMap).b;
      #endif`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `
      #ifdef USE_EMISSIVEMAP
        totalEmissiveRadiance *= triSample(emissiveMap).rgb;
      #endif`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `
      #ifdef USE_NORMALMAP
        vec3 p = surfaceWorld / worldTile;
        vec3 nx = texture2D(normalMap, p.zy * vec2(sign(triNormal.x), 1.0)).xyz * 2.0 - 1.0;
        vec3 ny = texture2D(normalMap, p.xz * vec2(sign(triNormal.y), 1.0)).xyz * 2.0 - 1.0;
        vec3 nz = texture2D(normalMap, p.xy * vec2(-sign(triNormal.z), 1.0)).xyz * 2.0 - 1.0;
        nx.xy *= normalScale; ny.xy *= normalScale; nz.xy *= normalScale;
        vec3 worldN = normalize(triNormal + vec3(0.0, nx.y, nx.x * sign(triNormal.x)) * triWeight.x
          + vec3(ny.x * sign(triNormal.y), 0.0, ny.y) * triWeight.y
          + vec3(-nz.x * sign(triNormal.z), nz.y, 0.0) * triWeight.z);
        normal = normalize(mat3(viewMatrix) * worldN);
      #endif`,
    );
  };
  material.needsUpdate = true;
}

export interface Atmosphere {
  color: { value: THREE.Color };
  density: { value: number };
}
export const heightFogGLSL = `
  float fogHeight = max(0.0, (surfaceWorld.y + cameraPosition.y) * 0.5);
  float heightDensity = atmosphereDensity * (0.22 + 0.78 * exp(-fogHeight / 180.0));
  float heightAmount = 1.0 - exp(-length(surfaceWorld - cameraPosition) * heightDensity);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, atmosphereColor, clamp(heightAmount, 0.0, 0.97));`;
export function heightFog(
  material: THREE.MeshStandardMaterial,
  atmosphere: Atmosphere,
): void {
  if (material.userData.heightFog) return;
  material.userData.heightFog = true;
  const previous = material.onBeforeCompile,
    key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}|height-fog-v1`;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.atmosphereColor = atmosphere.color;
    shader.uniforms.atmosphereDensity = atmosphere.density;
    // Triplanar installs this varying first. Other PBR materials retain their own UVs.
    if (!material.userData.worldTile) {
      shader.vertexShader =
        "varying vec3 surfaceWorld;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        surfaceWorld = (cameraMatrixWorld * mvPosition).xyz;`.replace(
          "cameraMatrixWorld",
          "inverse(viewMatrix)",
        ),
      );
      shader.fragmentShader =
        "varying vec3 surfaceWorld;\n" + shader.fragmentShader;
    }
    shader.fragmentShader =
      "uniform vec3 atmosphereColor; uniform float atmosphereDensity;\n" +
      shader.fragmentShader;
    // Before output conversion: atmosphere colours remain in linear light.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <tonemapping_fragment>",
      heightFogGLSL + "\n#include <tonemapping_fragment>",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <fog_fragment>",
      "",
    );
  };
  material.needsUpdate = true;
}
