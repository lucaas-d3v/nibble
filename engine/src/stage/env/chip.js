import * as THREE from 'three';
import { PALETTE, mat, metal, glow, mesh, canvasTexture, hash, smooth } from '../../util.js';
import { boardMaterial, boardMaps, wornMaterial } from '../../sim/gen.js';
import { buildObject } from '../../prefabs/index.js';
import { lights, tex2, lightShaft, fairyLights, dust } from './common.js';

// ---------------------------------------------------------------------------
// Chip: dentro do silício. Cidade de lógica com dados correndo pelas trilhas.
// ---------------------------------------------------------------------------
export function chip(q) {
  const g = new THREE.Group();
  const updaters = [];
  lights(g, { key: 0xbfd9ff, keyI: 1.4, rim: PALETTE.cyan, rimI: 6, fill: PALETTE.amber, fillI: 1.0, shadowSize: q.shadowSize });

  // céu: brilho no horizonte, como se o chip estivesse quente lá longe
  const sky = tex2(512, 256, (c, w, h) => {
    const gr = c.createRadialGradient(w * 0.5, h * 1.05, 0, w * 0.5, h * 1.05, w * 0.75);
    gr.addColorStop(0, '#5a3a1a'); gr.addColorStop(0.25, '#26304f'); gr.addColorStop(0.6, '#0b1224'); gr.addColorStop(1, '#03060c');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  });
  g.add(mesh(new THREE.PlaneGeometry(70, 22), new THREE.MeshBasicMaterial({ map: sky, fog: false, depthWrite: false }), { pos: [0, 8, -22], shadow: false }));

  // chão: interconexão roteada (gen.zig), 4x4 ladrilhos sem costura
  const P = { size: 2048, grid: 128, seed: 7, style: 1, components: 12, nets: 220 };
  const floorMat = boardMaterial(P, { repeat: [4, 4], emissive: 2.6, normalScale: 1.2 });
  g.add(mesh(new THREE.PlaneGeometry(26, 26), floorMat, { rot: [-Math.PI / 2, 0, 0], pos: [0, 0, -2], shadow: false }));

  // pulsos de dados correndo exatamente pelas trilhas acesas do chão
  const routes = boardMaps(P).routes.filter((r) => r.glow > 0 && r.pts.length > 3);
  const TILE = 26 / 4;
  const paths = [];
  for (let ti = 0; ti < 4; ti++) for (let tj = 0; tj < 4; tj++) for (const r of routes) {
    const pts = r.pts.map(([u, v]) => new THREE.Vector3(-13 + (ti + u) * TILE, 0.015, 11 - (tj + v) * TILE));
    const c = pts[Math.floor(pts.length / 2)];
    if (c.x < -4.5 || c.x > 4.5 || c.z < -12 || c.z > 4) continue;
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + pts[k].distanceTo(pts[k - 1]));
    paths.push({ pts, cum, len: cum[cum.length - 1], glow: r.glow, phase: hash(paths.length * 3.7), speed: 1.2 + hash(paths.length * 1.3) * 1.4 });
  }
  const streak = new THREE.CapsuleGeometry(0.018, 0.16, 4, 8).rotateZ(Math.PI / 2);
  const pulseA = new THREE.InstancedMesh(streak, glow(PALETTE.amber, 9), paths.length * 2);
  const pulseC = new THREE.InstancedMesh(streak, glow(PALETTE.cyan, 9), paths.length * 2);
  for (const im of [pulseA, pulseC]) { im.frustumCulled = false; im.castShadow = false; im.userData.noProbe = true; g.add(im); }
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0), X = new THREE.Vector3(1, 0, 0), dir = new THREE.Vector3();
  updaters.push({
    update(t) {
      let a = 0, c = 0;
      for (const p of paths) {
        const im = p.glow === 1 ? pulseA : pulseC;
        for (let k = 0; k < 2; k++) {
          const span = p.len + 2.5;
          const s = ((t * p.speed + (p.phase + k * 0.5) * span) % span + span) % span;
          let scale = zero;
          if (s < p.len) {
            let i = 1; while (i < p.cum.length - 1 && p.cum[i] < s) i++;
            const f = (s - p.cum[i - 1]) / (p.cum[i] - p.cum[i - 1] || 1);
            pos.lerpVectors(p.pts[i - 1], p.pts[i], f);
            qt.setFromUnitVectors(X, dir.subVectors(p.pts[i], p.pts[i - 1]).normalize());
            scale = one;
          }
          m4.compose(pos, qt, scale);
          im.setMatrixAt(p.glow === 1 ? a++ : c++, m4);
        }
      }
      pulseA.count = a; pulseC.count = c;
      pulseA.instanceMatrix.needsUpdate = pulseC.instanceMatrix.needsUpdate = true;
    },
  });

  // torres de lógica com "janelas" (células de memória acesas) e capacitores
  const windows = canvasTexture(256, (c, s) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, s, s);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = hash(x * 17 + y * 131);
      if (v < 0.8) continue;
      c.fillStyle = v > 0.95 ? '#ffb020' : v > 0.88 ? '#38d6ff' : '#3a5a8a';
      c.fillRect(x * 16 + 3, y * 16 + 4, 10, 8);
    }
  });
  windows.wrapS = windows.wrapT = THREE.RepeatWrapping;
  const towerSkin = (seed) => wornMaterial(0x1d2738, 'paint', { seed, repeat: [1, 2], metalness: 0.5, roughness: 0.8 });
  const skins = [towerSkin(51), towerSkin(52), towerSkin(53)];
  for (let i = 0; i < 34; i++) {
    const w = 0.5 + hash(i + 1) * 1.1, h = 0.5 + hash(i + 30) * 3.2;
    const side = hash(i + 60) > 0.5 ? 1 : -1;
    const x = side * (1.6 + hash(i + 61) * 6), z = -2.5 - hash(i + 90) * 11;
    if (Math.abs(x) < 1.4 && z > -6) continue;
    const win = windows.clone(); win.repeat.set(Math.max(1, Math.round(w * 2)), Math.max(1, Math.round(h * 2))); win.needsUpdate = true;
    const m = skins[i % 3].clone();
    m.emissiveMap = win; m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = 1.8;
    const tw = mesh(new THREE.BoxGeometry(w, h, w), m, { pos: [x, h / 2, z] });
    g.add(tw);
    g.add(mesh(new THREE.BoxGeometry(w * 1.04, 0.05, w * 1.04), metal(0x3a4658, { roughness: 0.35 }), { pos: [x, h + 0.025, z] }));
  }
  // capacitores eletrolíticos nas laterais
  [[-2.4, -3.2], [2.7, -4.6], [-3.6, -7.5]].forEach(([x, z], i) => {
    const cap = new THREE.Group(), h = 1.3 + i * 0.4;
    cap.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, h, 40), wornMaterial(0x1d3270, 'paint', { seed: 70 + i, roughness: 0.6 }), { pos: [0, h / 2, 0] }));
    cap.add(mesh(new THREE.CylinderGeometry(0.425, 0.425, h * 0.94, 40, 1, true, -0.3, 0.6), mat(0xc9d1dc, { roughness: 0.5 }), { pos: [0, h / 2, 0] }));
    cap.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 40), metal(0xc9d1dc, { roughness: 0.25 }), { pos: [0, h + 0.012, 0] }));
    for (const r of [0, Math.PI / 2]) cap.add(mesh(new THREE.BoxGeometry(0.5, 0.012, 0.025), mat(0x6b7480), { pos: [0, h + 0.03, 0], rot: [0, r, 0] }));
    cap.position.set(x, 0, z);
    g.add(cap);
  });
  // pilares de vias subindo para o céu: escala e profundidade
  for (let i = 0; i < 9; i++) {
    const x = (hash(i + 200) - 0.5) * 18, z = -6 - hash(i + 210) * 10;
    if (Math.abs(x) < 3.2) continue;
    g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 14, 8), glow(i % 3 ? PALETTE.cyan : PALETTE.amber, 2.2), { pos: [x, 7, z], shadow: false }));
  }
  // barramento suspenso no fundo, com pacotes passando
  const bus = buildObject({ id: 'bus', type: 'cable', pos: [0, 3.6, -8], from: [-9, 0, 0], to: [9, 0, 0], sag: 0.5, bow: 0, pulses: 7, speed: 0.12, radius: 0.08, color: 0x1b2433 });
  g.add(bus.root); updaters.push(bus);
  // elétrons à deriva
  const e = buildObject({ id: 'el', type: 'particles', kind: 'flow', pos: [-5, 0.6, -2.5], count: 160, length: 10, spread: 3.2, speed: 0.6, size: 0.007, color: PALETTE.cyan, intensity: 4, seed: 5 });
  g.add(e.root); updaters.push(e);

  return { group: g, background: 0x04070d, fog: [0x050912, 5, 20],
    grade: { lift: [0.0, 0.006, 0.016], gamma: [0.98, 1.0, 1.02], gain: [0.95, 1.0, 1.07], sat: 1.12 }, update: (t) => updaters.forEach((u) => u.update(t)) };
}
