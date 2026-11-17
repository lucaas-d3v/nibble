import * as THREE from 'three';
import { PALETTE, mat, metal, glow, mesh, canvasTexture, hash, smooth } from '../../util.js';
import { boardMaterial, boardMaps, wornMaterial } from '../../sim/gen.js';
import { buildObject } from '../../prefabs/index.js';
import { lights, tex2, lightShaft, fairyLights, dust } from './common.js';

// ---------------------------------------------------------------------------
// Bancada: oficina de eletrônica à noite, iluminada pela luminária e pelo monitor
// ---------------------------------------------------------------------------
export function bancada(q) {
  const g = new THREE.Group();
  const updaters = [];
  lights(g, { keyI: 1.5, rimI: 4, fillI: 0.7, shadowSize: q.shadowSize });

  // mesa de madeira gasta
  g.add(mesh(new THREE.BoxGeometry(14, 0.2, 10), wornMaterial(0x6b5340, 'wood', { seed: 4, repeat: [3, 2], normalScale: 0.8 }), { pos: [0, -0.1, -1], shadow: false }));
  // manta antiestática: grade serigrafada sobre borracha manchada
  const grid = canvasTexture(1024, (c, s) => {
    c.fillStyle = '#0e3b38'; c.fillRect(0, 0, s, s);
    c.strokeStyle = 'rgba(160,255,235,0.10)'; c.lineWidth = 2;
    for (let i = 0; i <= 16; i++) { const p = i * s / 16; c.beginPath(); c.moveTo(p, 0); c.lineTo(p, s); c.moveTo(0, p); c.lineTo(s, p); c.stroke(); }
    c.strokeStyle = 'rgba(160,255,235,0.22)'; c.lineWidth = 4;
    for (let i = 0; i <= 4; i++) { const p = i * s / 4; c.beginPath(); c.moveTo(p, 0); c.lineTo(p, s); c.moveTo(0, p); c.lineTo(s, p); c.stroke(); }
    c.fillStyle = 'rgba(160,255,235,0.35)'; c.font = '600 28px "JetBrains Mono", monospace'; c.fillText('ESD SAFE  ⏚', 24, s - 24);
  });
  g.add(mesh(new THREE.BoxGeometry(4.6, 0.02, 3.6), wornMaterial(0xffffff, 'rubber', { seed: 8, map: grid, normalScale: 0.5 }), { pos: [0, 0.01, 0.2], shadow: false }));

  // parede de chapa perfurada pintada, com lascas e escorridos
  // só os furos, com fundo transparente: a pintura gasta aparece entre eles
  const holes = canvasTexture(512, (c, s) => {
    c.clearRect(0, 0, s, s); c.fillStyle = '#05070b';
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { c.beginPath(); c.arc((x + 0.5) * s / 16, (y + 0.5) * s / 16, 5, 0, 7); c.fill(); }
  });
  holes.wrapS = holes.wrapT = THREE.RepeatWrapping; holes.repeat.set(5, 3);
  g.add(mesh(new THREE.PlaneGeometry(16, 9), wornMaterial(0x4d5768, 'paint', { seed: 3, repeat: [3, 2], normalScale: 0.6 }), { pos: [0, 3.5, -3.62], shadow: false }));
  g.add(mesh(new THREE.PlaneGeometry(16, 9), new THREE.MeshBasicMaterial({ map: holes, transparent: true, depthWrite: false }), { pos: [0, 3.5, -3.6], shadow: false }));

  // prateleira com gaveteiro de componentes e bobinas de fio
  const wood = wornMaterial(0x7a5c43, 'wood', { seed: 9, repeat: [2, 0.3] });
  g.add(mesh(new THREE.BoxGeometry(4.2, 0.06, 0.45), wood, { pos: [0, 2.7, -3.38] }));
  const cab = new THREE.Group();
  cab.add(mesh(new THREE.BoxGeometry(0.95, 0.62, 0.32), wornMaterial(0x39424f, 'paint', { seed: 12 })));
  const drawer = mat(0x9fb4c7, { roughness: 0.35, transparent: true, opacity: 0.85 });
  const label = mat(0xe8e2d0, { roughness: 0.8 });
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    cab.add(mesh(new THREE.BoxGeometry(0.2, 0.12, 0.02), drawer, { pos: [-0.33 + c * 0.22, 0.22 - r * 0.145, 0.17] }));
    cab.add(mesh(new THREE.PlaneGeometry(0.11, 0.035), label, { pos: [-0.33 + c * 0.22, 0.25 - r * 0.145, 0.182], shadow: false }));
    // componentes coloridos aparecendo no fundo das gavetas transparentes
    cab.add(mesh(new THREE.BoxGeometry(0.15, 0.04, 0.01), mat([0xc0392b, 0x2e86de, 0xf1c40f, 0x27ae60, 0x8e44ad][(r * 4 + c) % 5]), { pos: [-0.33 + c * 0.22, 0.19 - r * 0.145, 0.16], shadow: false }));
  }
  cab.position.set(-1.35, 3.04, -3.35);
  g.add(cab);
  [[0.9, 0xc0392b], [1.18, 0x2e86de], [1.46, 0xf1c40f]].forEach(([x, c]) => {
    const sp = new THREE.Group();
    sp.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 28), mat(c, { roughness: 0.35, metalness: 0.4 })));
    for (const y of [-0.085, 0.085]) sp.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.015, 28), mat(0x1a1a1a, { roughness: 0.5 }), { pos: [0, y, 0] }));
    sp.rotation.z = Math.PI / 2; sp.position.set(x, 2.86, -3.3);
    g.add(sp);
  });
  // osciloscópio na prateleira, tela verde
  const scope = new THREE.Group();
  scope.add(mesh(new THREE.BoxGeometry(0.62, 0.42, 0.34), wornMaterial(0x2c3546, 'paint', { seed: 15 }), { pos: [0, 0.21, 0] }));
  const wave = tex2(256, 160, (c, w, h) => {
    c.fillStyle = '#021a0c'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(80,255,150,0.2)';
    for (let i = 1; i < 8; i++) { c.beginPath(); c.moveTo(i * w / 8, 0); c.lineTo(i * w / 8, h); c.stroke(); }
    for (let i = 1; i < 5; i++) { c.beginPath(); c.moveTo(0, i * h / 5); c.lineTo(w, i * h / 5); c.stroke(); }
    c.strokeStyle = '#5dff9b'; c.lineWidth = 3; c.beginPath();
    for (let x = 0; x <= w; x += 2) { const y = h / 2 + (Math.floor(x / 32) % 2 ? -1 : 1) * h * 0.25; x ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
  });
  scope.add(mesh(new THREE.PlaneGeometry(0.34, 0.24), new THREE.MeshStandardMaterial({ color: 0x000000, emissiveMap: wave, emissive: 0xffffff, emissiveIntensity: 1.8 }), { pos: [-0.08, 0.23, 0.171], shadow: false }));
  for (let i = 0; i < 4; i++) scope.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 16), mat(0x888888, { metalness: 0.6, roughness: 0.3 }), { pos: [0.18, 0.33 - i * 0.07, 0.18], rot: [Math.PI / 2, 0, 0] }));
  scope.position.set(1.95, 2.73, -3.3); scope.rotation.y = -0.25;
  g.add(scope);
  // fita de LED sob a prateleira (luz prática âmbar) e cordão de lâmpadas em cima
  g.add(mesh(new THREE.BoxGeometry(4, 0.025, 0.025), glow(PALETTE.amber, 3.2), { pos: [0, 2.655, -3.18], shadow: false }));
  g.add(fairyLights(-2.4, 2.4, 3.55, -3.4, 0.35, 26, [0xffc070, 0xffb050, 0xffe2a8]));

  // ferramentas penduradas nas laterais da chapa (o centro fica livre para o objeto)
  const steel = mat(0xb8c2ce, { metalness: 0.9, roughness: 0.3 });
  const pliers = new THREE.Group();
  pliers.add(mesh(new THREE.BoxGeometry(0.03, 0.34, 0.015), steel, { pos: [-0.02, 0, 0], rot: [0, 0, 0.18] }));
  pliers.add(mesh(new THREE.BoxGeometry(0.03, 0.34, 0.015), steel, { pos: [0.02, 0, 0], rot: [0, 0, -0.18] }));
  pliers.add(mesh(new THREE.CapsuleGeometry(0.025, 0.2, 4, 10), mat(0xc0392b, { roughness: 0.6 }), { pos: [-0.07, -0.24, 0], rot: [0, 0, 0.22] }));
  pliers.add(mesh(new THREE.CapsuleGeometry(0.025, 0.2, 4, 10), mat(0xc0392b, { roughness: 0.6 }), { pos: [0.07, -0.24, 0], rot: [0, 0, -0.22] }));
  pliers.position.set(-1.45, 1.95, -3.55);
  g.add(pliers);
  [0x27ae60, 0xf1c40f, 0x2e86de, 0xc0392b].forEach((c, i) => {
    const sd = new THREE.Group();
    sd.add(mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.17, 12), mat(c, { roughness: 0.35, transparent: true, opacity: 0.92 })));
    sd.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.24, 8), steel, { pos: [0, -0.2, 0] }));
    sd.position.set(1.15 + i * 0.13, 2.0 - (i % 2) * 0.05, -3.55);
    g.add(sd);
  });
  const coil = mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 40), mat(0x111418, { roughness: 0.45 }), { pos: [1.7, 1.5, -3.55], rot: [0, 0, 0.3] });
  g.add(coil);
  // post-its na chapa
  const note = (txt, color, x, y, rz) => {
    const t = tex2(128, 128, (c, w, h) => {
      c.fillStyle = color; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(30,30,40,0.85)';
      c.font = '600 22px "JetBrains Mono", monospace'; txt.split('\n').forEach((l, i) => c.fillText(l, 10, 34 + i * 26));
    });
    g.add(mesh(new THREE.PlaneGeometry(0.22, 0.22), mat(0xffffff, { map: t, roughness: 0.9 }), { pos: [x, y, -3.58], rot: [0, 0, rz], shadow: false }));
  };
  note('TODO:\nUSB HID', '#f7e36b', -0.95, 1.55, 0.08);
  note('0x04\n= A', '#ff9fb2', 1.0, 1.42, -0.1);

  // monitor ao fundo à esquerda, com código (fora de foco, vira mancha de cor)
  const code = tex2(512, 320, (c, w, h) => {
    c.fillStyle = '#0b1220'; c.fillRect(0, 0, w, h);
    const cols = ['#c792ea', '#82aaff', '#ffcb6b', '#c3e88d', '#e2e8f0', '#89ddff'];
    for (let i = 0; i < 18; i++) {
      let x = 16 + (Math.floor(hash(i + 3) * 4)) * 22;
      for (let k = 0; k < 1 + Math.floor(hash(i * 7) * 5); k++) {
        const wd = 18 + hash(i * 13 + k) * 90;
        c.fillStyle = cols[Math.floor(hash(i * 5 + k * 3) * cols.length)];
        c.fillRect(x, 14 + i * 17, wd, 9); x += wd + 10;
      }
    }
  });
  const mon = new THREE.Group();
  mon.add(mesh(new THREE.BoxGeometry(1.25, 0.76, 0.05), mat(0x15181e, { roughness: 0.4 })));
  mon.add(mesh(new THREE.PlaneGeometry(1.17, 0.68), new THREE.MeshStandardMaterial({ color: 0x000000, emissiveMap: code, emissive: 0xffffff, emissiveIntensity: 1.5, roughness: 0.2 }), { pos: [0, 0, 0.027], shadow: false }));
  mon.add(mesh(new THREE.BoxGeometry(0.08, 0.36, 0.06), mat(0x15181e), { pos: [0, -0.52, -0.05] }));
  mon.add(mesh(new THREE.BoxGeometry(0.42, 0.03, 0.26), mat(0x15181e), { pos: [0, -0.69, -0.03] }));
  mon.position.set(-1.45, 0.71, -2.5); mon.rotation.y = 0.42;
  g.add(mon);

  // luminária articulada à direita: a luz quente motivada da cena
  const lampMat = wornMaterial(0x23272e, 'paint', { seed: 21, metalness: 0.5 });
  const lamp = new THREE.Group();
  // fica no limite direito do quadro: a luz entra, a fonte quase não aparece
  const base = [2.35, 0, -2.3], joint = [2.3, 1.3, -2.55], head = [1.75, 1.85, -1.9];
  lamp.add(mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.05, 32), lampMat, { pos: [base[0], 0.025, base[2]] }));
  const arm = (a, b) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
    const m = mesh(new THREE.CylinderGeometry(0.018, 0.018, d.length(), 10), lampMat);
    m.position.copy(A).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    lamp.add(m);
  };
  arm(base, joint); arm(joint, head);
  lamp.add(mesh(new THREE.SphereGeometry(0.035, 12, 10), lampMat, { pos: joint }));
  const aim = new THREE.Vector3(0.2, 0, -0.1);
  const shade = new THREE.Group();
  shade.add(mesh(new THREE.ConeGeometry(0.17, 0.24, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide })));
  shade.add(mesh(new THREE.SphereGeometry(0.055, 16, 12), glow(0xffd7a0, 9), { pos: [0, -0.06, 0], shadow: false }));
  shade.position.set(...head);
  shade.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), aim.clone().sub(new THREE.Vector3(...head)).normalize());
  lamp.add(shade);
  g.add(lamp);
  const spot = new THREE.SpotLight(0xffc98a, 28, 7, 0.62, 0.75, 1.3);
  spot.position.set(...head); spot.target.position.copy(aim);
  spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0006; spot.shadow.radius = 6;
  g.add(spot, spot.target);
  g.add(lightShaft(head, [aim.x + 0.2, -0.1, aim.z], 0.8, 0xffc98a, 0.035));

  // vaso de espada-de-são-jorge no fundo à direita
  const plant = new THREE.Group();
  plant.add(mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.32, 28), wornMaterial(0xb8673f, 'rubber', { seed: 30 }), { pos: [0, 0.16, 0] }));
  plant.add(mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 28), mat(0x2a1c12, { roughness: 1 }), { pos: [0, 0.3, 0] }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + hash(i) * 0.6, hgt = 0.55 + hash(i + 9) * 0.5;
    const leaf = mesh(new THREE.SphereGeometry(1, 16, 20), mat(i % 3 ? 0x2f5d3a : 0x3f7a45, { roughness: 0.55 }), { scale: [0.045, hgt, 0.012] });
    leaf.position.set(Math.cos(a) * 0.07, 0.3 + hgt * 0.85, Math.sin(a) * 0.07);
    leaf.rotation.set(Math.sin(a) * 0.25, a, Math.cos(a) * 0.25);
    plant.add(leaf);
  }
  plant.position.set(1.85, 0, -2.75);
  g.add(plant);

  // objetos sobre a mesa: caneca, protoboard com jumpers, multímetro, resistores, cabos
  const mug = new THREE.Group();
  mug.add(mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.24, 32, 1, true), mat(0xe6dfd2, { roughness: 0.3, side: THREE.DoubleSide }), { pos: [0, 0.12, 0] }));
  mug.add(mesh(new THREE.CircleGeometry(0.1, 28), mat(0x2a1607, { roughness: 0.1 }), { pos: [0, 0.2, 0], rot: [-Math.PI / 2, 0, 0], shadow: false }));
  mug.add(mesh(new THREE.TorusGeometry(0.06, 0.016, 10, 24), mat(0xe6dfd2, { roughness: 0.3 }), { pos: [0.12, 0.13, 0] }));
  mug.position.set(-1.05, 0.02, -1.1);
  g.add(mug);

  const bb = tex2(512, 180, (c, w, h) => {
    c.fillStyle = '#ecebe4'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#d33'; c.fillRect(0, 10, w, 3); c.fillStyle = '#36c'; c.fillRect(0, 28, w, 3);
    c.fillStyle = '#d33'; c.fillRect(0, h - 13, w, 3); c.fillStyle = '#36c'; c.fillRect(0, h - 31, w, 3);
    c.fillStyle = '#2a2a2a';
    for (let x = 8; x < w; x += 12) for (const y of [16, 22, h - 25, h - 19]) c.fillRect(x, y, 4, 4);
    for (let x = 8; x < w; x += 12) for (let y = 44; y < h - 44; y += 12) if (Math.abs(y - h / 2) > 6) c.fillRect(x, y, 4, 4);
  });
  const board = new THREE.Group();
  board.add(mesh(new THREE.BoxGeometry(0.72, 0.035, 0.26), [mat(0xecebe4), mat(0xecebe4), mat(0xffffff, { map: bb, roughness: 0.6 }), mat(0xecebe4), mat(0xecebe4), mat(0xecebe4)]));
  const jumper = (a, b, c) => {
    const A = new THREE.Vector3(a, 0.02, -0.06 + hash(a * 9) * 0.12), B = new THREE.Vector3(b, 0.02, -0.06 + hash(b * 7) * 0.12);
    const M = A.clone().lerp(B, 0.5); M.y = 0.06 + Math.abs(b - a) * 0.12;
    board.add(mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(A, M, B), 20, 0.006, 6), mat(c, { roughness: 0.4 })));
  };
  jumper(-0.3, -0.1, 0xe74c3c); jumper(-0.18, 0.12, 0x3498db); jumper(0.0, 0.28, 0xf1c40f); jumper(-0.25, 0.3, 0x2ecc71);
  board.position.set(0.95, 0.03, -0.55); board.rotation.y = -0.35;
  g.add(board);

  const dmm = new THREE.Group();
  dmm.add(mesh(new THREE.BoxGeometry(0.26, 0.06, 0.42), wornMaterial(0xe8b923, 'rubber', { seed: 41 }), { pos: [0, 0.03, 0] }));
  const lcd = tex2(128, 64, (c, w, h) => { c.fillStyle = '#9fb59a'; c.fillRect(0, 0, w, h); c.fillStyle = '#18221a'; c.font = '700 40px "JetBrains Mono", monospace'; c.fillText('3.30', 12, 46); });
  dmm.add(mesh(new THREE.PlaneGeometry(0.18, 0.09), mat(0xffffff, { map: lcd, roughness: 0.3 }), { pos: [0, 0.062, -0.1], rot: [-Math.PI / 2, 0, 0], shadow: false }));
  dmm.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 24), mat(0x1c1c1c), { pos: [0, 0.07, 0.06] }));
  dmm.position.set(-1.35, 0.01, -0.35); dmm.rotation.y = 0.5;
  g.add(dmm);

  for (let i = 0; i < 7; i++) {
    const r = new THREE.Group();
    r.add(mesh(new THREE.CapsuleGeometry(0.012, 0.035, 4, 8), mat(0xd8c49a, { roughness: 0.5 }), { rot: [0, 0, Math.PI / 2] }));
    r.add(mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.14, 6), steel, { rot: [0, 0, Math.PI / 2] }));
    r.position.set(0.35 + hash(i) * 0.9, 0.035, -0.05 + hash(i + 20) * 0.5); r.rotation.y = hash(i + 40) * 3;
    g.add(r);
  }
  // cabos saindo do monitor e atravessando a mesa
  [[0.022, 0x0d0f12], [0.016, 0x1b1e24]].forEach(([rad, c], k) => {
    const pts = [[-1.45, 0.25, -2.62], [-1.3, 0.02, -2.2], [-0.4, 0.02, -1.9 - k * 0.2], [0.6, 0.02, -2.4], [1.2, 0.02, -2.9 + k * 0.1], [2.6, 0.02, -2.6]];
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 90, rad, 8), mat(c, { roughness: 0.55 })));
  });

  // poeira no ar, acesa pela luminária
  const d = dust([0.95, 0.2, -1.0], { count: 110, height: 1.8, width: 1.5, intensity: 1.4 });
  g.add(d.root); updaters.push(d);

  return { group: g, background: 0x0a0d13, fog: [0x0a0d13, 8, 22],
    grade: { lift: [0.012, 0.006, 0.0], gamma: [1.0, 1.0, 0.97], gain: [1.05, 1.0, 0.92], sat: 1.06 }, update: (t) => updaters.forEach((u) => u.update(t)) };
}
