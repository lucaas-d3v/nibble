import * as THREE from 'three';
import { PALETTE, mat, metal, glow, mesh, canvasTexture, hash, smooth } from '../util.js';
import { boardMaterial, boardMaps, wornMaterial } from '../sim/gen.js';
import { buildObject } from '../prefabs/index.js';

// Cenários. Regras de composição para o quadro 9:16:
//  - o centro alto (x -0.6..0.6, y 1.2..2.4) fica calmo: é onde flutua o objeto do episódio;
//  - detalhe vai para as laterais e para o fundo, onde a profundidade de campo desfoca;
//  - toda superfície tem desgaste (gen.zig): cor e brilho nunca são uniformes;
//  - cada cenário tem fontes de luz que existem na cena (luminária, monitor, LEDs) e atmosfera.

function lights(group, { key = 0xfff1df, keyI = 2.0, rim = PALETTE.amber, rimI = 5, fill = 0x4aa8ff, fillI = 0.9, shadowSize = 2048 }) {
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

const tex2 = (w, h, draw, srgb = true) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

/** Feixe de luz visível: cone aditivo que some com a distância. */
function lightShaft(from, to, radius, color, opacity) {
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
function fairyLights(x0, x1, y, z, sag, n, colors) {
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

function dust(pos, { count = 200, height = 2, width = 3, color = 0xffdcae, intensity = 2.2, speed = 0.06, seed = 11 } = {}) {
  return buildObject({ id: 'dust', type: 'particles', kind: 'dust', pos, count, spread: height, length: width, speed, size: 0.0055, color, intensity, seed });
}

// ---------------------------------------------------------------------------
// Bancada: oficina de eletrônica à noite, iluminada pela luminária e pelo monitor
// ---------------------------------------------------------------------------
function bancada(q) {
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

  return { group: g, background: 0x0a0d13, fog: [0x0a0d13, 8, 22], update: (t) => updaters.forEach((u) => u.update(t)) };
}

// ---------------------------------------------------------------------------
// Chip: dentro do silício. Cidade de lógica com dados correndo pelas trilhas.
// ---------------------------------------------------------------------------
function chip(q) {
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
  for (const im of [pulseA, pulseC]) { im.frustumCulled = false; im.castShadow = false; g.add(im); }
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

  return { group: g, background: 0x04070d, fog: [0x050912, 5, 20], update: (t) => updaters.forEach((u) => u.update(t)) };
}

// ---------------------------------------------------------------------------
// Vazio: estúdio escuro com fundo infinito, halo atrás do personagem e bokeh
// ---------------------------------------------------------------------------
function vazio(q) {
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
  return { group: g, background: 0x070a10, fog: [0x070a10, 7, 18], update: (t) => updaters.forEach((u) => u.update(t)) };
}

const ENVS = { bancada, chip, vazio };

export function buildEnvironment(name, quality) {
  return (ENVS[name] ?? ENVS.bancada)(quality);
}
