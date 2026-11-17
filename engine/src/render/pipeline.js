import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Sequência de Halton: amostras bem distribuídas para jitter de subpixel e de lente.
function halton(i, base) {
  let f = 1, r = 0;
  while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
  return r;
}

const FULLSCREEN_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/**
 * Render por acumulação.
 *
 * Cada quadro final é a média de N sub-quadros em HDR linear. Em cada um:
 *  - o tempo avança dentro do obturador  -> motion blur real
 *  - a projeção desloca uma fração de pixel -> antialiasing por superamostragem
 *  - a câmera desloca no disco da lente  -> profundidade de campo real
 * Tone mapping, vinheta e grão só entram depois da média.
 */
export class RenderPipeline {
  constructor(canvas, scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.samples = 1;
    this.shutter = 0.5;   // fração do intervalo do quadro (0.5 = obturador 180°)
    this.aperture = 0.0;  // raio da lente em unidades de mundo (0 = tudo em foco)
    this.fps = 30;

    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.92;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = r;

    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.32;
    pmrem.dispose();

    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.renderToScreen = false;
    this.composer.addPass(new RenderPass(scene, camera));
    this.gtao = new GTAOPass(scene, camera, 2, 2);
    this.gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16 });
    this.composer.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.32, 0.55, 1.25);
    this.composer.addPass(this.bloom);

    this.accum = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    this.addMat = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: null }, uWeight: { value: 1 } },
      vertexShader: FULLSCREEN_VS,
      fragmentShader: /* glsl */ `
        uniform sampler2D tMap; uniform float uWeight; varying vec2 vUv;
        void main() { gl_FragColor = vec4(texture2D(tMap, vUv).rgb * uWeight, 1.0); }
      `,
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false,
    });

    this.outMat = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: null }, uSeed: { value: 0 }, uAspect: { value: 9 / 16 } },
      vertexShader: FULLSCREEN_VS,
      fragmentShader: /* glsl */ `
        uniform sampler2D tMap; uniform float uSeed; uniform float uAspect; varying vec2 vUv;
        float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        void main() {
          vec2 c = vUv - 0.5;
          // aberração cromática leve só nas bordas
          float d = dot(c, c);
          vec3 col;
          col.r = texture2D(tMap, vUv + c * d * 0.006).r;
          col.g = texture2D(tMap, vUv).g;
          col.b = texture2D(tMap, vUv - c * d * 0.006).b;
          // vinheta
          vec2 v = c * vec2(1.0, 1.0 / uAspect) * 0.9;
          col *= mix(1.0, 0.62, smoothstep(0.25, 1.05, dot(v, v) * 2.2));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          // grão de filme (depois do tone mapping, quebra o banding do gradiente)
          float g = hash(gl_FragCoord.xy + uSeed) - 0.5;
          gl_FragColor.rgb += g * 0.018;
        }
      `,
      depthTest: false, depthWrite: false, toneMapped: true,
    });
  }

  setSize(w, h) {
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.accum.setSize(w, h);
    this.outMat.uniforms.uAspect.value = w / h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** `update(t)` deve posicionar o mundo e a câmera (com camera.userData.target) no tempo t. */
  render(t, update) {
    const { renderer: r, camera, samples: n } = this;
    const right = new THREE.Vector3(), up = new THREE.Vector3();
    const frame = Math.round(t * this.fps);

    r.setRenderTarget(this.accum);
    r.setClearColor(0x000000, 1);
    r.clear();

    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : (i + 0.5) / n;
      update(Math.max(0, t + (u - 0.5) * this.shutter / this.fps));

      if (n > 1) {
        const jx = halton(i + 1, 2) - 0.5, jy = halton(i + 1, 3) - 0.5;
        camera.setViewOffset(this.w, this.h, jx, jy, this.w, this.h);
        if (this.aperture > 0 && camera.userData.target) {
          const a = halton(i + 1, 5) * Math.PI * 2, rad = Math.sqrt(halton(i + 1, 7)) * this.aperture;
          camera.updateMatrixWorld();
          right.setFromMatrixColumn(camera.matrixWorld, 0);
          up.setFromMatrixColumn(camera.matrixWorld, 1);
          camera.position.addScaledVector(right, Math.cos(a) * rad).addScaledVector(up, Math.sin(a) * rad);
          camera.lookAt(camera.userData.target);
        }
      }

      this.composer.render();

      this.addMat.uniforms.tMap.value = this.composer.readBuffer.texture;
      this.addMat.uniforms.uWeight.value = 1 / n;
      this.quad.material = this.addMat;
      r.setRenderTarget(this.accum);
      const ac = r.autoClear; r.autoClear = false;
      r.render(this.quadScene, this.quadCam);
      r.autoClear = ac;
    }
    camera.clearViewOffset();

    this.outMat.uniforms.tMap.value = this.accum.texture;
    this.outMat.uniforms.uSeed.value = (frame * 0.618) % 97;
    this.quad.material = this.outMat;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }
}
