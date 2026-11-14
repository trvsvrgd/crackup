import * as THREE from "three";
import {
  BAY_SIZE,
  BRIDGES,
  BRIDGE_LENGTH,
  bridgePoint,
  bridgeCableHeight,
  buildBayBridgeColliders,
  terrainHeight,
  terrainRadius,
} from "../../shared/world/bayVista.js";
import { productionAssets } from "../assets/productionAssets.js";
import {
  heightFog,
  triplanarPBR,
  type Atmosphere,
} from "../shaders/worldSurface.js";

const waterVertex = `
  uniform float time;
  varying vec3 surfaceWorld;
  varying vec3 waveNormal;
  void wave(vec2 d, float length, float amplitude, inout vec3 p, inout vec3 tangent, inout vec3 bitangent) {
    float k = 6.283185 / length;
    float phase = k * (dot(d, position.xz) - sqrt(9.81 / k) * time);
    p.xz += d * amplitude * 0.5 * cos(phase); p.y += amplitude * sin(phase);
    tangent += vec3(-d.x*d.x*amplitude*0.5*k*sin(phase), d.x*amplitude*k*cos(phase), -d.x*d.y*amplitude*0.5*k*sin(phase));
    bitangent += vec3(-d.x*d.y*amplitude*0.5*k*sin(phase), d.y*amplitude*k*cos(phase), -d.y*d.y*amplitude*0.5*k*sin(phase));
  }
  void main() {
    vec3 p = position, t = vec3(1,0,0), b = vec3(0,0,1);
    wave(vec2(0.8,0.6), 230.0, 0.8, p,t,b);
    wave(vec2(-0.6,0.8), 140.0, 0.35, p,t,b);
    wave(vec2(0.28,-0.96), 90.0, 0.18, p,t,b);
    surfaceWorld = (modelMatrix * vec4(p,1)).xyz; waveNormal = normalize(cross(b,t));
    gl_Position = projectionMatrix * viewMatrix * vec4(surfaceWorld,1);
  }`;
const waterFragment = `
  uniform float time, night, atmosphereDensity, hasHDR;
  uniform sampler2D hdr;
  uniform vec3 atmosphereColor;
  varying vec3 surfaceWorld, waveNormal;
  float boxDistance(vec2 p, vec2 halfSize) { vec2 q = abs(p)-halfSize; return length(max(q,0.0)) + min(max(q.x,q.y),0.0); }
  void main() {
    vec2 p = surfaceWorld.xz;
    float island = boxDistance(p, vec2(601.0));
    float neck = boxDistance(p-vec2(0,2020),vec2(210,1420));
    float angle = atan(p.y,p.x), coast = 3270.0+150.0*sin(angle*5.0)+120.0*sin(angle*9.0);
    float distanceToCoast = min(min(island,neck),coast-length(p));
    if (distanceToCoast < -2.0) discard;
    // Analytic fragment normals avoid interpolation bands across the coarse ocean mesh.
    vec2 slope = vec2(.8,.6)*(.8*6.283185/230.0)*cos(6.283185/230.0*(dot(p,vec2(.8,.6))-sqrt(9.81*230.0/6.283185)*time));
    slope += vec2(-.6,.8)*(.35*6.283185/140.0)*cos(6.283185/140.0*(dot(p,vec2(-.6,.8))-sqrt(9.81*140.0/6.283185)*time));
    slope += vec2(.28,-.96)*(.18*6.283185/90.0)*cos(6.283185/90.0*(dot(p,vec2(.28,-.96))-sqrt(9.81*90.0/6.283185)*time));
    float detail = 1.0-smoothstep(.5,2.0,length(fwidth(p))*.2);
    slope += detail*.018*vec2(sin(dot(p,vec2(.15,.21))+time),cos(dot(p,vec2(-.17,.09))+time*.8));
    vec3 n = normalize(vec3(-slope.x,1.0,-slope.y));
    vec3 eye = normalize(cameraPosition-surfaceWorld);
    float fresnel = pow(1.0-max(0.0,dot(n,eye)),4.0);
    vec3 reflected = reflect(-eye,n);
    vec2 environmentUV = vec2(atan(reflected.z,reflected.x)/6.283185+.5,asin(reflected.y)/3.141593+.5);
    vec3 reflectedSky = mix(atmosphereColor*.65, texture2D(hdr,environmentUV).rgb*.3*(1.0-night*.85),hasHDR);
    vec3 color = mix(vec3(.012,.045,.062),reflectedSky,fresnel);
    // Deliberately stylized reflection streaks from the neon waterfront, not SSR.
    float reflection = detail * exp(-max(island,0.0)/650.0) * pow(max(0.0,sin(p.x*.055 + sin(p.y*.14+time)*1.8)*sin(p.y*.24-time*.7)),6.0);
    color += mix(vec3(.035,.15,.17),vec3(.07,.22,.35),night) * reflection * (.25+.75*fresnel);
    float foam = (1.0-smoothstep(0.0,11.0,abs(distanceToCoast))) * (.55+.45*sin(distanceToCoast*1.7-time*1.8+sin(p.x*.12)));
    color += vec3(.27,.42,.43)*foam;
    float fogAmount=1.0-exp(-length(cameraPosition-surfaceWorld)*atmosphereDensity*.65);
    gl_FragColor=vec4(mix(color,atmosphereColor,fogAmount),1);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class BayVista {
  public readonly root = new THREE.Group();
  public readonly atmosphere: Atmosphere = {
    color: { value: new THREE.Color(0x5a7687) },
    density: { value: 0.00028 },
  };
  public readonly water: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  public readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  public night = 0;
  public autoCycle = true;
  private elapsed = 0;
  private cycle = 0;
  private readonly materials = new Set<THREE.Material>();
  constructor() {
    this.root.name = "BayAreaVista";
    const waterGeometry = new THREE.PlaneGeometry(BAY_SIZE, BAY_SIZE, 192, 192);
    waterGeometry.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(
      waterGeometry,
      new THREE.ShaderMaterial({
        vertexShader: waterVertex,
        fragmentShader: waterFragment,
        uniforms: {
          time: { value: 0 },
          night: { value: 0 },
          hdr: { value: null },
          hasHDR: { value: 0 },
          atmosphereColor: this.atmosphere.color,
          atmosphereDensity: this.atmosphere.density,
        },
      }),
    );
    this.water.name = "GerstnerBay_10km";
    this.water.position.y = -3.5;
    this.water.geometry.computeBoundingSphere();
    this.water.geometry.boundingSphere!.radius += 3;
    this.root.add(this.water);
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(10000, 40, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          night: { value: 0 },
          hdr: { value: null },
          hasHDR: { value: 0 },
        },
        vertexShader:
          "varying vec3 direction; void main(){direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1);}",
        fragmentShader: `uniform float night,hasHDR; uniform sampler2D hdr; varying vec3 direction;
        void main(){ vec3 d=normalize(direction); float h=pow(max(d.y,0.0),.55);
          vec3 dusk=mix(vec3(.36,.25,.22),vec3(.027,.075,.15),h);
          vec2 uv=vec2(atan(d.z,d.x)/6.283185+.5,asin(d.y)/3.141593+.5);
          dusk=mix(dusk,texture2D(hdr,uv).rgb*.35,hasHDR*.42);
          vec3 color=mix(dusk,mix(vec3(.025,.041,.075),vec3(.002,.006,.018),h),night);
          float star=step(.9989,fract(sin(dot(floor(d.xz/max(d.y,.01)*650.0),vec2(127.1,311.7)))*43758.5453))*smoothstep(.05,.3,d.y);
          color+=vec3(star*.4*night); gl_FragColor=vec4(color,1);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      }),
    );
    this.sky.name = "DuskNightSky";
    this.sky.userData.excludeSurfacePass = true;
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.root.add(this.sky);
    this.buildTerrain();
    this.buildBridges();
    this.setNight(0.15);
  }
  private surface(
    name: string,
    color: number,
    map?: string,
  ): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      metalness: map?.includes("iron") ? 0.7 : 0,
    });
    material.name = name;
    if (map) {
      productionAssets.applyMaterial(material, map);
      triplanarPBR(material, map === "asphalt_02" ? 5 : 4);
    }
    heightFog(material, this.atmosphere);
    this.materials.add(material);
    return material;
  }
  private buildTerrain(): void {
    const vertices: number[] = [],
      colors: number[] = [],
      indices: number[] = [],
      radial = 48,
      segments = 320;
    for (let r = 0; r <= radial; r++)
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2,
          inner = terrainRadius(angle),
          radius = inner + ((8000 - inner) * r) / radial;
        const y = terrainHeight(angle, radius);
        vertices.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
        const c = new THREE.Color().setRGB(
          0.085 + y / 6000,
          0.13 + y / 6500,
          0.12 + y / 6000,
        );
        colors.push(c.r, c.g, c.b);
        if (r < radial && i < segments) {
          const a = r * (segments + 1) + i,
            b = a + segments + 1;
          indices.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const terrainMaterial = this.surface("HeadlandRock", 0xffffff);
    terrainMaterial.vertexColors = true;
    const terrain = new THREE.Mesh(geometry, terrainMaterial);
    terrain.name = "Headlands_3_to_8km";
    this.root.add(terrain);
    // Peninsula neck meets the southern terrain ring, outside the original mission foundation.
    const neck = new THREE.Mesh(
      new THREE.BoxGeometry(420, 12, 2850),
      this.surface("PeninsulaNeck", 0x445b57, "concrete_layers_02"),
    );
    neck.position.set(0, -6, 2025);
    neck.name = "SouthernPeninsula";
    this.root.add(neck);
    const points: number[] = [],
      lightColors: number[] = [];
    for (let i = 0; i < 420; i++) {
      const a = (i / 420) * Math.PI * 2,
        r = terrainRadius(a) + 65;
      points.push(Math.cos(a) * r, terrainHeight(a, r) + 4, Math.sin(a) * r);
      const c = new THREE.Color(i % 5 ? 0xffb875 : 0x62d9ff);
      lightColors.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(lightColors, 3));
    const m = new THREE.PointsMaterial({
      size: 5,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    this.materials.add(m);
    const lights = new THREE.Points(g, m);
    lights.name = "DistantShoreLights";
    this.root.add(lights);
  }
  private buildBridges(): void {
    const structures = buildBayBridgeColliders(),
      unit = new THREE.BoxGeometry(1, 1, 1);
    const matrix = new THREE.Matrix4(),
      q = new THREE.Quaternion();
    for (const road of [true, false]) {
      const parts = structures.filter(
        (s) => (s.material === "plaza_asphalt") === road,
      );
      const mesh = new THREE.InstancedMesh(
        unit,
        this.surface(
          road ? "HighwayDeck" : "BridgeSafetyRails",
          road ? 0xa4aab1 : 0x8a979c,
          road ? "asphalt_02" : "concrete_layers_02",
        ),
        parts.length,
      );
      mesh.name = road
        ? "TraversableBridgeDecks"
        : "ColliderMatchedBridgeRails";
      mesh.userData.collisionIds = parts.map((p) => p.id);
      parts.forEach((p, i) => {
        q.setFromEuler(
          new THREE.Euler(
            p.rotation?.x ?? 0,
            p.rotation?.y ?? 0,
            p.rotation?.z ?? 0,
          ),
        );
        matrix.compose(
          new THREE.Vector3(p.center.x, p.center.y, p.center.z),
          q,
          new THREE.Vector3(
            p.halfExtents.x * 2,
            p.halfExtents.y * 2,
            p.halfExtents.z * 2,
          ),
        );
        mesh.setMatrixAt(i, matrix);
      });
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }
    for (const bridge of BRIDGES) {
      const group = new THREE.Group();
      group.name = `SuspensionBridge_${bridge.id}`;
      this.root.add(group);
      const steel = this.surface(
        `${bridge.id}TowerSteel`,
        bridge.color,
        "corrugated_iron_02",
      );
      const transforms: THREE.Matrix4[] = [];
      const box = (
        distance: number,
        across: number,
        y: number,
        sx: number,
        sy: number,
        sz: number,
      ) => {
        const p = bridgePoint(bridge, distance, across, y);
        transforms.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(p.x, p.y, p.z),
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              bridge.yaw,
            ),
            new THREE.Vector3(sx, sy, sz),
          ),
        );
      };
      for (const distance of [700, 2100]) {
        for (const side of [-1, 1]) box(distance, side * 20, 120, 9, 252, 15);
        for (const y of [82, 170, 235]) box(distance, 0, y, 48, 8, 14);
      }
      const towers = new THREE.InstancedMesh(unit, steel, transforms.length);
      transforms.forEach((m, i) => towers.setMatrixAt(i, m));
      towers.name = "TowersAndCrossbeams";
      group.add(towers);
      const cableMaterial = this.surface(`${bridge.id}Cables`, 0x859fa7);
      const positions: number[] = [];
      for (const side of [-1, 1]) {
        const path: THREE.Vector3[] = [];
        for (let t = 0; t <= BRIDGE_LENGTH; t += 20) {
          const p = bridgePoint(bridge, t, side * 17, bridgeCableHeight(t));
          path.push(new THREE.Vector3(p.x, p.y, p.z));
        }
        const cable = new THREE.Mesh(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(path),
            140,
            1.0,
            5,
            false,
          ),
          cableMaterial,
        );
        cable.name = "MainSuspensionCable";
        group.add(cable);
        for (let t = 40; t < BRIDGE_LENGTH; t += 40) {
          const a = bridgePoint(bridge, t, side * 17),
            b = bridgePoint(bridge, t, side * 17, bridgeCableHeight(t));
          positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      }
      // Cylinders retain visible thickness from roof level; one batch for every suspender.
      const suspenders = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.23, 0.23, 1, 5),
        cableMaterial,
        positions.length / 6,
      );
      for (let i = 0; i < positions.length; i += 6) {
        const a = new THREE.Vector3(
            ...(positions.slice(i, i + 3) as [number, number, number]),
          ),
          b = new THREE.Vector3(
            ...(positions.slice(i + 3, i + 6) as [number, number, number]),
          );
        matrix.compose(
          a.clone().add(b).multiplyScalar(0.5),
          new THREE.Quaternion(),
          new THREE.Vector3(1, b.y - a.y, 1),
        );
        suspenders.setMatrixAt(i / 6, matrix);
      }
      suspenders.name = "IndividualSuspenders";
      group.add(suspenders);
      const stripes: THREE.Matrix4[] = [];
      for (let t = 10; t < BRIDGE_LENGTH; t += 24) {
        const p = bridgePoint(bridge, t);
        stripes.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(p.x, p.y + 0.07, p.z),
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              bridge.yaw,
            ),
            new THREE.Vector3(0.22, 0.03, 9),
          ),
        );
      }
      const stripeMat = this.surface("LaneMarkings", 0xc1b899),
        markings = new THREE.InstancedMesh(unit, stripeMat, stripes.length);
      stripes.forEach((m, i) => markings.setMatrixAt(i, m));
      group.add(markings);
    }
  }
  public setNight(value: number): void {
    this.night = THREE.MathUtils.clamp(value, 0, 1);
    this.cycle = Math.acos(1 - 2 * this.night);
    this.atmosphere.color.value
      .set(0x657b89)
      .lerp(new THREE.Color(0x17283e), this.night);
    this.atmosphere.density.value = 0.00024 + this.night * 0.00005;
    this.water.material.uniforms.night.value = this.night;
    this.sky.material.uniforms.night.value = this.night;
  }
  public update(dt: number, camera: THREE.Camera): void {
    this.elapsed += Math.max(0, Math.min(dt, 0.1));
    if (this.autoCycle) {
      const next = this.cycle + (dt * Math.PI) / 600;
      this.setNight((1 - Math.cos(next)) / 2);
      this.cycle = next;
    }
    this.water.material.uniforms.time.value = this.elapsed;
    this.sky.position.copy(camera.position);
    this.water.material.uniforms.hdr.value = productionAssets.environment;
    this.water.material.uniforms.hasHDR.value = productionAssets.environment
      ? 1
      : 0;
    this.sky.material.uniforms.hdr.value = productionAssets.environment;
    this.sky.material.uniforms.hasHDR.value = productionAssets.environment
      ? 1
      : 0;
  }
  public dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          this.materials.add(m);
      }
    });
    geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.materials.clear();
    this.root.removeFromParent();
    this.root.clear();
  }
}
