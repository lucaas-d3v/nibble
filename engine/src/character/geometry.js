import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Texturas de escamas: uma de relevo (bumpMap) e uma de cor (sulcos escuros).
// ---------------------------------------------------------------------------

function canvasPair(size, draw) {
  const bump = document.createElement('canvas');
  bump.width = bump.height = size;
  const g = bump.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  draw(g, size);
  // cor: sulco a 50% de brilho, centro da escama a 100%
  const color = document.createElement('canvas');
  color.width = color.height = size;
  const c = color.getContext('2d');
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (img.data[i] / 255) * 127;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
  }
  c.putImageData(img, 0, 0);
  const toTex = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { bump: toTex(bump, false), color: toTex(color, true) };
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function domeCell(g, x, y, w, h, r) {
  const grad = g.createRadialGradient(x + w * 0.45, y + h * 0.4, 0, x + w / 2, y + h / 2, Math.max(w, h) * 0.62);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.55, '#d8d8d8');
  grad.addColorStop(1, '#4a4a4a');
  g.fillStyle = grad;
  roundRect(g, x, y, w, h, r);
  g.fill();
}

/** Escamas em tijolinho, como no escudo do tatu (6x6 células por ladrilho). */
export function hexScutes(size = 512) {
  return canvasPair(size, (g, s) => {
    const n = 6, w = s / n, h = s / n, gap = w * 0.09;
    for (let row = 0; row < n; row++) {
      const off = row % 2 ? w / 2 : 0;
      for (let col = -1; col <= n; col++) {
        domeCell(g, col * w + off + gap / 2, row * h + gap / 2, w - gap, h - gap, w * 0.32);
      }
    }
  });
}

/** Placas retangulares numa fileira só: as bandas móveis. 8 placas por ladrilho. */
export function slatScutes(size = 512) {
  return canvasPair(size, (g, s) => {
    const n = 8, w = s / n, gap = w * 0.12;
    for (let i = 0; i < n; i++) {
      const x = i * w + gap / 2;
      const grad = g.createLinearGradient(x, 0, x + w - gap, 0);
      grad.addColorStop(0, '#5a5a5a');
      grad.addColorStop(0.35, '#fff');
      grad.addColorStop(1, '#6a6a6a');
      g.fillStyle = grad;
      roundRect(g, x, s * 0.08, w - gap, s * 0.84, w * 0.28);
      g.fill();
    }
  });
}

// ---------------------------------------------------------------------------
// Superfícies paramétricas
// ---------------------------------------------------------------------------

/** Grade (u, v) -> ponto. Devolve geometria indexada com UV. */
export function surfaceGrid(nu, nv, fn, { merge = false } = {}) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      pos.push(...fn(u, v));
      uv.push(u, v);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  if (merge) {
    // costura sem vinco: funde vértices duplicados antes de calcular normais
    geo.deleteAttribute('uv');
    geo = mergeVertices(geo, 1e-5);
  }
  geo.computeVertexNormals();
  return geo;
}

// Perfil da cabeça ao longo do eixo do focinho: [h, raio]. h=0 é o centro do crânio.
const HEAD_PROFILE = [
  [-0.26, 0.0], [-0.248, 0.09], [-0.215, 0.163], [-0.15, 0.218], [-0.06, 0.245], [0.03, 0.24],
  [0.11, 0.212], [0.18, 0.162], [0.25, 0.112], [0.32, 0.083], [0.4, 0.068], [0.47, 0.061],
  [0.53, 0.058], [0.565, 0.05], [0.585, 0.03], [0.592, 0.0],
];
export const DROOP = 0.62;
export const HEAD_H0 = HEAD_PROFILE[0][0];
export const HEAD_H1 = HEAD_PROFILE[HEAD_PROFILE.length - 1][0];

const profileTable = (() => {
  const curve = new THREE.SplineCurve(HEAD_PROFILE.map(([h, r]) => new THREE.Vector2(h, r)));
  return curve.getPoints(400);
})();

export function headRadius(h) {
  const t = profileTable;
  if (h <= t[0].x) return 0;
  if (h >= t[t.length - 1].x) return 0;
  let lo = 0, hi = t.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m].x < h) lo = m; else hi = m; }
  const k = (h - t[lo].x) / (t[hi].x - t[lo].x || 1);
  return Math.max(0, t[lo].y + (t[hi].y - t[lo].y) * k);
}

/**
 * Ponto na superfície da cabeça. h: ao longo do focinho (+Z), psi: ângulo em volta
 * do eixo, 0 = topo, +pi/2 = lado +X. inflate empurra para fora.
 */
export function headPoint(h, psi, inflate = 0) {
  const r = headRadius(h) + inflate;
  let x = r * Math.sin(psi);
  let y = r * Math.cos(psi) * 0.92;
  // focinho cai um pouco, como no tatu de verdade
  y -= DROOP * Math.max(0, h - 0.1) ** 2;
  // bochechas levemente cheias embaixo dos olhos
  const cheek = Math.exp(-(((h - 0.06) / 0.1) ** 2)) * Math.max(0, -Math.cos(psi) + 0.2);
  x *= 1 + 0.07 * cheek;
  return [x, y, h];
}

/** Posição e base local (normal, tangente em psi, tangente em h) num ponto da cabeça. */
export function headFrame(h, psi, inflate = 0) {
  const e = 1e-3;
  const p = new THREE.Vector3(...headPoint(h, psi, inflate));
  const tPsi = new THREE.Vector3(...headPoint(h, psi + e, inflate)).sub(new THREE.Vector3(...headPoint(h, psi - e, inflate))).normalize();
  const tH = new THREE.Vector3(...headPoint(h + e, psi, inflate)).sub(new THREE.Vector3(...headPoint(h - e, psi, inflate))).normalize();
  const n = new THREE.Vector3().crossVectors(tH, tPsi).normalize();
  // garante a normal para fora
  const axis = new THREE.Vector3(0, -DROOP * Math.max(0, h - 0.1) ** 2, h);
  if (n.dot(p.clone().sub(axis)) < 0) n.negate();
  return { pos: p, normal: n, tPsi, tH };
}

export function headGeometry() {
  return surfaceGrid(72, 110, (u, v) => {
    const h = HEAD_H0 + (HEAD_H1 - HEAD_H0) * v;
    return headPoint(h, (u - 0.5) * Math.PI * 2);
  }, { merge: true });
}

/** Escudo cefálico: placa triangular no topo da cabeça, larga atrás e fina sobre o focinho. */
export const shieldHalfWidth = (h) => {
  const k = THREE.MathUtils.smoothstep(h, -0.22, 0.34);
  return 0.86 + (0.26 - 0.86) * k;
};
export const SHIELD_H0 = -0.215, SHIELD_H1 = 0.34;

export function shieldGeometry(inflate = 0.016) {
  return surfaceGrid(28, 40, (u, v) => {
    const h = SHIELD_H0 + (SHIELD_H1 - SHIELD_H0) * v;
    // borda arredondada: encolhe nas pontas para não terminar em degrau
    const edge = Math.sin(Math.PI * Math.min(1, v * 1.05)) ** 0.35;
    return headPoint(h, (u - 0.5) * 2 * shieldHalfWidth(h), inflate * (0.35 + 0.65 * edge));
  });
}

export function shieldOutline(inflate = 0.016) {
  const pts = [];
  const N = 28;
  for (let i = 0; i <= N; i++) { const h = SHIELD_H0 + (SHIELD_H1 - SHIELD_H0) * (i / N); pts.push(headPoint(h, shieldHalfWidth(h), inflate * 0.55)); }
  for (let i = 1; i <= N; i++) { const psi = shieldHalfWidth(SHIELD_H1) * (1 - 2 * i / N); pts.push(headPoint(SHIELD_H1, psi, inflate * 0.4)); }
  for (let i = 1; i <= N; i++) { const h = SHIELD_H1 - (SHIELD_H1 - SHIELD_H0) * (i / N); pts.push(headPoint(h, -shieldHalfWidth(h), inflate * 0.55)); }
  for (let i = 1; i < N; i++) { const psi = -shieldHalfWidth(SHIELD_H0) * (1 - 2 * i / N); pts.push(headPoint(SHIELD_H0, psi, inflate * 0.4)); }
  return new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), true, 'centripetal');
}

// ---------------------------------------------------------------------------
// Carapaça: fatias de um elipsoide (polos no eixo Y), cobrindo costas e laterais.
// ---------------------------------------------------------------------------

export const SHELL_R = [0.368, 0.438, 0.35];
export const SHELL_WRAP = 0.75; // quanto a carapaça avança para a frente além das laterais (rad)

/** Ponto do elipsoide da carapaça. theta: 0 no topo; alpha: ângulo no plano XZ (−pi/2 = costas). */
export function shellPoint(theta, alpha, inflate = 1) {
  const s = Math.sin(theta);
  return [SHELL_R[0] * s * Math.cos(alpha) * inflate, SHELL_R[1] * Math.cos(theta) * inflate, SHELL_R[2] * s * Math.sin(alpha) * inflate];
}
const A0 = -Math.PI - SHELL_WRAP, A1 = SHELL_WRAP;

export function shellSlice(t0, t1, inflate) {
  return surfaceGrid(72, Math.max(6, Math.round((t1 - t0) * 40)), (u, v) =>
    shellPoint(t0 + (t1 - t0) * v, A0 + (A1 - A0) * u, inflate));
}

/** Contorno fechado de uma fatia (para a borda arredondada). */
export function sliceOutline(t0, t1, inflate) {
  const pts = [];
  const N = 48, M = 10;
  for (let i = 0; i <= N; i++) pts.push(shellPoint(t0, A0 + (A1 - A0) * (i / N), inflate));
  for (let j = 1; j <= M; j++) pts.push(shellPoint(t0 + (t1 - t0) * (j / M), A1, inflate));
  for (let i = N - 1; i >= 0; i--) pts.push(shellPoint(t1, A0 + (A1 - A0) * (i / N), inflate));
  for (let j = M - 1; j >= 1; j--) pts.push(shellPoint(t0 + (t1 - t0) * (j / M), A0, inflate));
  return new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), true, 'centripetal');
}

/** Linha ao longo de uma latitude (o filete aceso da banda do meio). */
export function latitudeCurve(theta, inflate) {
  const pts = [];
  for (let i = 0; i <= 64; i++) pts.push(new THREE.Vector3(...shellPoint(theta, A0 + 0.04 + (A1 - A0 - 0.08) * (i / 64), inflate)));
  return new THREE.CatmullRomCurve3(pts);
}

/** Corpo: elipsoide com barriga clara pintada por cor de vértice. */
export function torsoGeometry(radii, skin, belly) {
  const geo = new THREE.SphereGeometry(1, 72, 56);
  const n = geo.attributes.normal, col = [];
  const a = new THREE.Color(skin), b = new THREE.Color(belly), c = new THREE.Color();
  for (let i = 0; i < n.count; i++) {
    const k = THREE.MathUtils.smoothstep(n.getZ(i), -0.05, 0.6) * (1 - THREE.MathUtils.smoothstep(n.getY(i), 0.55, 0.95));
    c.copy(a).lerp(b, k);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.scale(...radii);
  return geo;
}

/** Cor por vértice da cabeça: pele, ponta do focinho mais rosada, queixo claro. */
export function paintHead(geo, skin, snout, chin) {
  const p = geo.attributes.position, n = geo.attributes.normal, col = [];
  const a = new THREE.Color(skin), b = new THREE.Color(snout), d = new THREE.Color(chin), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.copy(a).lerp(d, THREE.MathUtils.smoothstep(-n.getY(i), 0.25, 0.85) * 0.6);
    c.lerp(b, THREE.MathUtils.smoothstep(p.getZ(i), 0.3, 0.5));
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}
