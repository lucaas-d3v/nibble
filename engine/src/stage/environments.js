import * as THREE from 'three';
import { PALETTE, mat, metal, glow, mesh, canvasTexture, hash } from '../util.js';
import { boardMaterial } from '../sim/gen.js';

function lights(group, { key = 0xfff1df, keyI = 2.0, rim = PALETTE.amber, rimI = 5, fill = 0x4aa8ff, fillI = 0.9, shadowSize = 2048 }) {
  const k = new THREE.DirectionalLight(key, keyI);
  k.position.set(2.6, 5.2, 4.2);
  k.castShadow = true;
  k.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(k.shadow.camera, { left: -3, right: 3, top: 4, bottom: -1.5, near: 0.5, far: 14 });
  k.shadow.bias = -0.0004; k.shadow.normalBias = 0.02; k.shadow.radius = 5; k.shadow.blurSamples = 16;
  const r = new THREE.SpotLight(rim, rimI * 4.5, 12, 0.7, 0.6, 1.4);
  r.position.set(-2.6, 2.6, -2.4); r.target.position.set(0, 0.8, 0.2);
  const f = new THREE.PointLight(fill, fillI * 3.2, 10, 1.6);
  f.position.set(-2.2, 1.0, 3.2);
  group.add(k, r, r.target, f, new THREE.HemisphereLight(0x8fb4ff, 0x1a120a, 0.35));
}

function bancada(q) {
  const g = new THREE.Group();
  lights(g, { shadowSize: q.shadowSize });
  // tampo
  g.add(mesh(new THREE.BoxGeometry(14, 0.2, 10), mat(0x171c26, { roughness: 0.85 }), { pos: [0, -0.1, -1], shadow: false }));
  // manta antiestática com grade serigrafada
  const matTex = canvasTexture(1024, (c, s) => {
    c.fillStyle = '#0e3b38'; c.fillRect(0, 0, s, s);
    c.strokeStyle = 'rgba(160,255,235,0.10)'; c.lineWidth = 2;
    for (let i = 0; i <= 16; i++) { const p = i * s / 16; c.beginPath(); c.moveTo(p, 0); c.lineTo(p, s); c.moveTo(0, p); c.lineTo(s, p); c.stroke(); }
    c.strokeStyle = 'rgba(160,255,235,0.22)'; c.lineWidth = 4;
    for (let i = 0; i <= 4; i++) { const p = i * s / 4; c.beginPath(); c.moveTo(p, 0); c.lineTo(p, s); c.moveTo(0, p); c.lineTo(s, p); c.stroke(); }
  });
  g.add(mesh(new THREE.BoxGeometry(4.6, 0.02, 3.6), mat(0xffffff, { map: matTex, roughness: 0.9 }), { pos: [0, 0.01, 0.2], shadow: false }));
  // parede perfurada
  const wallTex = canvasTexture(512, (c, s) => {
    c.fillStyle = '#131a26'; c.fillRect(0, 0, s, s); c.fillStyle = '#080c13';
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { c.beginPath(); c.arc((x + 0.5) * s / 16, (y + 0.5) * s / 16, 4, 0, 7); c.fill(); }
  });
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(5, 3);
  g.add(mesh(new THREE.PlaneGeometry(16, 9), mat(0xffffff, { map: wallTex, roughness: 0.9 }), { pos: [0, 3.5, -3.6], shadow: false }));
  // fitas de LED (alimentam o bloom e dão profundidade)
  g.add(mesh(new THREE.BoxGeometry(7, 0.035, 0.035), glow(PALETTE.amber, 2.6), { pos: [0, 3.05, -3.5], shadow: false }));
  g.add(mesh(new THREE.BoxGeometry(7, 0.03, 0.03), glow(PALETTE.cyan, 2.2), { pos: [0, 0.03, -3.5], shadow: false }));
  // objetos de fundo, fora de foco: caixas de gaveta, osciloscópio, bobina de solda
  for (let i = 0; i < 6; i++) {
    const w = 0.5 + hash(i) * 0.5, h = 0.35 + hash(i + 9) * 0.9;
    g.add(mesh(new THREE.BoxGeometry(w, h, 0.5), mat(i % 2 ? 0x1e2633 : 0x243047, { roughness: 0.7 }), { pos: [-2.6 + i * 1.05, h / 2, -2.9 + hash(i + 4) * 0.4] }));
  }
  const scope = new THREE.Group();
  scope.add(mesh(new THREE.BoxGeometry(1.0, 0.7, 0.5), mat(0x2a3446), { pos: [0, 0.35, 0] }));
  scope.add(mesh(new THREE.PlaneGeometry(0.55, 0.42), glow(0x35ff9a, 1.6), { pos: [-0.15, 0.38, 0.256], shadow: false }));
  scope.position.set(1.7, 0.9, -2.9);
  g.add(scope);
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.2, 24), metal(PALETTE.steel), { pos: [-1.9, 0.1, -1.6] }));
  return { group: g, background: 0x0a0e15, fog: [0x0a0e15, 9, 24] };
}

function chip(q) {
  const g = new THREE.Group();
  lights(g, { key: 0xbfd9ff, keyI: 1.6, rim: PALETTE.cyan, rimI: 6, fill: PALETTE.amber, fillI: 1.0, shadowSize: q.shadowSize });
  // piso de silício: interconexão roteada pelo gerador em Zig, repete sem costura
  const floorMat = boardMaterial({ size: 2048, grid: 128, seed: 7, style: 1, components: 12, nets: 220 },
    { repeat: [4, 4], emissive: 2.6, normalScale: 1.2 });
  g.add(mesh(new THREE.PlaneGeometry(26, 26), floorMat, { rot: [-Math.PI / 2, 0, 0], pos: [0, 0, -2], shadow: false }));
  // "prédios" de lógica ao fundo
  for (let i = 0; i < 22; i++) {
    const w = 0.5 + hash(i + 1) * 1.1, h = 0.4 + hash(i + 30) * 2.6;
    const x = (hash(i + 60) - 0.5) * 12, z = -3.2 - hash(i + 90) * 6;
    g.add(mesh(new THREE.BoxGeometry(w, h, w), metal(0x1c2638, { roughness: 0.45, metalness: 0.7 }), { pos: [x, h / 2, z] }));
    if (i % 3 === 0) g.add(mesh(new THREE.BoxGeometry(w * 0.7, 0.03, 0.03), glow(i % 2 ? PALETTE.amber : PALETTE.cyan, 4), { pos: [x, h * 0.75, z + w / 2 + 0.02], shadow: false }));
  }
  return { group: g, background: 0x04070d, fog: [0x04070d, 5, 15] };
}

function vazio(q) {
  const g = new THREE.Group();
  lights(g, { shadowSize: q.shadowSize, rimI: 4 });
  g.add(mesh(new THREE.CircleGeometry(9, 64), mat(0x10151e, { roughness: 0.55, metalness: 0.2 }), { rot: [-Math.PI / 2, 0, 0], shadow: false }));
  return { group: g, background: 0x070a10, fog: [0x070a10, 6, 15] };
}

const ENVS = { bancada, chip, vazio };

export function buildEnvironment(name, quality) {
  return (ENVS[name] ?? ENVS.bancada)(quality);
}
