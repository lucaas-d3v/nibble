// Peças compartilhadas pelos cenários: luzes, feixe, cordão de lâmpadas, poeira.
import * as THREE from 'three';
import { PALETTE, mat, metal, glow, mesh, canvasTexture, hash, smooth } from '../../util.js';
import { boardMaterial, boardMaps, wornMaterial } from '../../sim/gen.js';
import { buildObject } from '../../prefabs/index.js';

export function lights(group, { key = 0xfff1df, keyI = 2.0, rim = PALETTE.amber, rimI = 5, fill = 0x4aa8ff, fillI = 0.9, shadowSize = 2048 }) {
  const k = new THREE.DirectionalLight(key, keyI);
  k.position.set(2.6, 5.2, 4.2);
  k.castShadow = true;
  k.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(k.shadow.camera, { left: -3.5, right: 3.5, top: 4.5, bottom: -1.5, near: 0.5, far: 16 });
  k.shadow.bias = -0.0004; k.shadow.normalBias = 0.02; k.shadow.radius = 5; k.shadow.blurSamples = 16;
  const r = new THREE.SpotLight(rim, rimI * 4.5, 12, 0.7, 0.6, 1.4);
  r.position.set(-2.6, 2.6, -2.4); r.target.position.set(0, 0.8, 0.2);
  const f = new THREE.PointLight(fill, fillI * 3.2, 10, 1.6);
  f.position.set(-2.2, 1.0, 3.2);
  group.add(k, r, r.target, f, new THREE.HemisphereLight(0x8fb4ff, 0x1a120a, 0.3));
}

export const tex2 = (w, h, draw, srgb = true) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

/** Feixe de luz visível: cone aditivo que some com a distância. */

export function lightShaft(from, to, radius, color, opacity) {
  const dir = new THREE.Vector3(...to).sub(new THREE.Vector3(...from));
  const len = dir.length();
  const geo = new THREE.ConeGeometry(radius, len, 48, 1, true);
  geo.translate(0, -len / 2, 0);
  const alpha = tex2(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#000'); gr.addColorStop(0.08, '#fff'); gr.addColorStop(0.55, '#777'); gr.addColorStop(1, '#000');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, false);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color, alphaMap: alpha, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  }));
  m.position.set(...from);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
  m.castShadow = m.receiveShadow = false;
  return m;
}

/** Cordão de lâmpadas penduradas: com profundidade de campo vira bokeh. */

export function fairyLights(x0, x1, y, z, sag, n, colors) {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 40; i++) { const u = i / 40; pts.push(new THREE.Vector3(x0 + (x1 - x0) * u, y - sag * 4 * u * (1 - u), z)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  g.add(mesh(new THREE.TubeGeometry(curve, 80, 0.006, 6), mat(0x111111), { shadow: false }));
  const mats = colors.map((c) => glow(c, 7));
  for (let i = 0; i < n; i++) {
    const p = curve.getPointAt((i + 0.5) / n);
    g.add(mesh(new THREE.SphereGeometry(0.022, 10, 8), mats[i % mats.length], { pos: [p.x, p.y - 0.03, p.z], shadow: false }));
  }
  return g;
}

export function dust(pos, { count = 200, height = 2, width = 3, color = 0xffdcae, intensity = 2.2, speed = 0.06, seed = 11 } = {}) {
  return buildObject({ id: 'dust', type: 'particles', kind: 'dust', pos, count, spread: height, length: width, speed, size: 0.0055, color, intensity, seed });
}
