import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

export const INK_FRAGMENT_SHADER = `
  uniform sampler2D tDiffuse, tNormal, tDepth;
  uniform vec2 resolution;
  uniform float cameraNear, cameraFar;
  varying vec2 vUv;
  float linearDepth(vec2 uv) {
    float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
    return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
  }
  void main() {
    vec3 nx = vec3(0.0), ny = vec3(0.0);
    float dx = 0.0, dy = 0.0;
    float center = linearDepth(vUv);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 uv = vUv + vec2(float(x), float(y)) * 1.5 / resolution;
      float kx = float(x) * (y == 0 ? 2.0 : 1.0);
      float ky = float(y) * (x == 0 ? 2.0 : 1.0);
      vec3 normal = texture2D(tNormal, uv).rgb;
      nx += normal * kx; ny += normal * ky;
      float d = linearDepth(uv) / max(center, 1.0);
      dx += d * kx; dy += d * ky;
    }
    float edge = max(smoothstep(0.045, 0.14, length(vec2(dx, dy))),
                     smoothstep(0.8, 1.8, length(nx) + length(ny)));
    vec4 color = texture2D(tDiffuse, vUv);
    gl_FragColor = vec4(mix(color.rgb, vec3(0.008, 0.014, 0.025), edge * 0.9), color.a);
  }`;

/** A genuine depth+normal Sobel pass; never uses color edges that outline window textures. */
export class InkOutlinePass extends Pass {
  public readonly target = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  private readonly normal = new THREE.MeshNormalMaterial();
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  constructor(private readonly scene: THREE.Scene, private readonly camera: THREE.PerspectiveCamera) {
    super();
    this.target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.material = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tNormal: { value: this.target.texture }, tDepth: { value: this.target.depthTexture },
        resolution: { value: new THREE.Vector2(1, 1) }, cameraNear: { value: camera.near }, cameraFar: { value: camera.far } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: INK_FRAGMENT_SHADER, depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }
  public override setSize(w: number, h: number): void {
    this.target.setSize(w, h); this.material.uniforms.resolution.value.set(w, h);
  }
  public override render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    const override = this.scene.overrideMaterial, background = this.scene.background;
    const clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
    const shadowUpdate = renderer.shadowMap.autoUpdate;
    const hidden: THREE.Object3D[] = [];
    try {
      // Translucent effects do not contribute an opaque surface normal/depth. In particular,
      // a zero-opacity dash ring must not leave a black silhouette around an idle agent.
      this.scene.traverse(object => {
        if (!object.visible) return;
        if (object instanceof THREE.Sprite || object instanceof THREE.Line || object instanceof THREE.Points ||
          object instanceof THREE.Mesh && (Array.isArray(object.material) ? object.material : [object.material]).every(m => m.opacity <= 0.001 || m.transparent && m.opacity < 1)) {
          hidden.push(object); object.visible = false;
        }
      });
      this.scene.overrideMaterial = this.normal; this.scene.background = null;
      renderer.shadowMap.autoUpdate = false;
      renderer.setClearColor(0x8080ff, 1);
      renderer.setRenderTarget(this.target); renderer.clear(); renderer.render(this.scene, this.camera);
    } finally {
      this.scene.overrideMaterial = override; this.scene.background = background;
      for (const object of hidden) object.visible = true;
      renderer.setClearColor(clear, alpha); renderer.shadowMap.autoUpdate = shadowUpdate;
    }
    this.material.uniforms.tDiffuse.value = read.texture;
    this.material.uniforms.cameraNear.value = this.camera.near;
    this.material.uniforms.cameraFar.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : write);
    this.quad.render(renderer);
  }
  public override dispose(): void { this.target.dispose(); this.normal.dispose(); this.material.dispose(); this.quad.dispose(); }
}
