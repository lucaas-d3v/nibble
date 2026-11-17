import * as THREE from 'three';

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const easeOutBack = (t) => { t = clamp01(t); const c = 1.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
export const easeOutCubic = (t) => 1 - (1 - clamp01(t)) ** 3;
/** 0 antes de `at`, sobe até 1 em `dur` segundos. */
export const ramp = (t, at, dur = 0.4) => smooth((t - at) / dur);
/** Ruído 1D barato e determinístico em [0,1). */
export const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export const PALETTE = {
  graphite: 0x3a4658, graphiteLight: 0x5b6b80, snout: 0xa3b1c2,
  copper: 0xc0703a, amber: 0xffb020, cyan: 0x38d6ff,
  pcb: 0x0f5132, pcbDark: 0x0a3622, gold: 0xe6b84a, silicon: 0x1b2333,
  plastic: 0x14181f, steel: 0xc9d1dc,
};

export const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...o });
export const metal = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.9, ...o });
export const glow = (color, intensity = 3, o = {}) =>
  new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: 0.4, ...o });

export function mesh(geo, material, { pos, rot, scale, shadow = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) Array.isArray(scale) ? m.scale.set(...scale) : m.scale.setScalar(scale);
  m.castShadow = shadow; m.receiveShadow = true;
  return m;
}

/** Textura procedural desenhada em canvas 2D (trilhas, serigrafia, telas). */
export function canvasTexture(size, draw, { srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
