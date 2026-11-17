import * as THREE from 'three';
import { PALETTE, mat, metal, glow, mesh, canvasTexture, hash, smooth } from '../../util.js';
import { boardMaterial, boardMaps, wornMaterial } from '../../sim/gen.js';
import { buildObject } from '../../prefabs/index.js';
import { lights, tex2, lightShaft, fairyLights, dust } from './common.js';

// ---------------------------------------------------------------------------
// Vazio: estúdio escuro com fundo infinito, halo atrás do personagem e bokeh
// ---------------------------------------------------------------------------
export function vazio(q) {
  const g = new THREE.Group();
  const updaters = [];
  lights(g, { shadowSize: q.shadowSize, rimI: 4 });
  const cyc = wornMaterial(0x1a212d, 'rubber', { seed: 61, repeat: [4, 4], normalScale: 0.4 });
  g.add(mesh(new THREE.PlaneGeometry(24, 12), cyc, { rot: [-Math.PI / 2, 0, 0], pos: [0, 0, 2.5], shadow: false }));
  const cove = new THREE.CylinderGeometry(1.4, 1.4, 24, 32, 1, true, Math.PI, Math.PI / 2);
  g.add(mesh(cove, new THREE.MeshStandardMaterial({ color: 0x1a212d, roughness: 0.85, side: THREE.BackSide }), { pos: [0, 1.4, -3.5], rot: [0, 0, Math.PI / 2], shadow: false }));
  g.add(mesh(new THREE.PlaneGeometry(24, 10), cyc, { pos: [0, 6.4, -4.9], shadow: false }));
  // halo suave atrás do personagem: separa a silhueta do fundo
  const halo = tex2(256, 256, (c, w, h) => {
    const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  });
  g.add(mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: halo, color: 0x2a4a80, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), { pos: [0.2, 1.7, -4.85], shadow: false }));
  for (let i = 0; i < 18; i++) {
    const x = (hash(i + 300) - 0.5) * 5, y = 0.6 + hash(i + 310) * 3.4;
    g.add(mesh(new THREE.SphereGeometry(0.02 + hash(i + 320) * 0.02, 10, 8), glow(i % 3 ? PALETTE.amber : PALETTE.cyan, 3 + hash(i) * 4), { pos: [x, y, -4.6], shadow: false }));
  }
  const d = dust([0, 0.1, -0.5], { count: 180, height: 3, width: 4, color: 0xcfe3ff, intensity: 1.6 });
  g.add(d.root); updaters.push(d);
  return { group: g, background: 0x070a10, fog: [0x070a10, 7, 18],
    grade: { lift: [0.004, 0.004, 0.01], gamma: [1, 1, 1], gain: [1.0, 1.0, 1.02], sat: 1.04 }, update: (t) => updaters.forEach((u) => u.update(t)) };
}
