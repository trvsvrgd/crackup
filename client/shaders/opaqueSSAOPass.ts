import * as THREE from 'three';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';

/** The color pass already updated CSM shadows. Normals need neither another shadow
 * render nor translucent effects; their depth/normal target is reusable by ink. */
export class OpaqueSSAOPass extends SSAOPass {
  public reuseShadows = true;
  public override render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget, dt: number, mask: boolean): void {
    const auto = renderer.shadowMap.autoUpdate, needs = renderer.shadowMap.needsUpdate, override = this.scene.overrideMaterial;
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse(o => {
      if (!o.visible) return;
      if (o.userData.excludeSurfacePass || o instanceof THREE.Sprite || o instanceof THREE.Mesh && (Array.isArray(o.material) ? o.material : [o.material]).every(m => m.opacity <= 0.001 || m.transparent && m.opacity < 1)) {
        hidden.push(o); o.visible = false;
      }
    });
    try {
      if (this.reuseShadows) { renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false; }
      super.render(renderer, write, read, dt, mask);
    } finally {
      renderer.shadowMap.autoUpdate = auto; renderer.shadowMap.needsUpdate = needs;
      this.scene.overrideMaterial = override; hidden.forEach(o => o.visible = true);
    }
  }
}
