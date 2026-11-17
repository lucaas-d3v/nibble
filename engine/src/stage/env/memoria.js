import * as THREE from 'three';
import { PALETTE, mat, metal, glow, mesh, canvasTexture, hash, smooth } from '../../util.js';
import { boardMaterial, boardMaps, wornMaterial } from '../../sim/gen.js';
import { buildObject } from '../../prefabs/index.js';
import { lights, tex2, lightShaft, fairyLights, dust } from './common.js';

// ---------------------------------------------------------------------------
// Memória: corredor sem fim de bancos de DRAM. A onda de refresh percorre as fileiras.
// ---------------------------------------------------------------------------
export function memoria(q) {
  const g = new THREE.Group();
  const updaters = [];
  lights(g, { key: 0xc8d6ff, keyI: 1.2, rim: 0x8a7dff, rimI: 5, fill: PALETTE.cyan, fillI: 0.9, shadowSize: q.shadowSize });
  g.add(mesh(new THREE.PlaneGeometry(12, 40), wornMaterial(0x12161f, 'rubber', { seed: 71, repeat: [3, 10], normalScale: 0.3, roughness: 0.55 }), { rot: [-Math.PI / 2, 0, 0], pos: [0, 0, -14], shadow: false }));
  // faixa de luz no teto: dá a fuga do corredor
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.03, 40), glow(PALETTE.cyan, 2.4), { pos: [0, 4.4, -14], shadow: false }));
  g.add(mesh(new THREE.PlaneGeometry(12, 40), mat(0x07090e, { roughness: 0.9 }), { rot: [Math.PI / 2, 0, 0], pos: [0, 4.45, -14], shadow: false }));
  const RACKS = 9, ROWS = 18, COLS = 7, rackMat = wornMaterial(0x1a2130, 'paint', { seed: 72, repeat: [1, 3], metalness: 0.4 });
  const cellGeo = new THREE.BoxGeometry(0.075, 0.06, 0.02);
  const cellMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 3.2, roughness: 0.4 });
  cellMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance *= vColor;\n#endif'); };
  const count = RACKS * 2 * ROWS * COLS;
  const cells = new THREE.InstancedMesh(cellGeo, cellMat, count);
  cells.castShadow = false; cells.userData.noProbe = true;
  const m4 = new THREE.Matrix4(), info = [];
  let n = 0;
  for (const side of [-1, 1]) for (let r = 0; r < RACKS; r++) {
    const z = -1.6 - r * 2.1, x = side * 1.45;
    g.add(mesh(new THREE.BoxGeometry(0.7, 3.6, 1.9), rackMat, { pos: [x + side * 0.35, 1.8, z] }));
    g.add(mesh(new THREE.BoxGeometry(0.04, 3.6, 0.04), glow(0x8a7dff, 1.5), { pos: [x - side * 0.01, 1.8, z + 0.95], shadow: false }));
    for (let row = 0; row < ROWS; row++) for (let c = 0; c < COLS; c++) {
      m4.makeTranslation(x - side * 0.012, 0.35 + row * 0.17, z - 0.75 + c * 0.25);
      m4.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
      cells.setMatrixAt(n, m4);
      info.push({ bit: hash(n * 1.37) > 0.45, row, r, side, seed: n });
      n++;
    }
  }
  cells.setColorAt(0, new THREE.Color());
  g.add(cells);
  const col = new THREE.Color(), A = new THREE.Color(PALETTE.cyan), B = new THREE.Color(0x8a7dff), W = new THREE.Color(0xffffff);
  updaters.push({
    update(t) {
      for (let i = 0; i < info.length; i++) {
        const c = info[i];
        // alguns bits trocam de estado de tempos em tempos
        const flip = hash(c.seed * 0.71 + Math.floor(t * 1.5 + hash(c.seed) * 7)) > 0.93;
        const on = c.bit !== flip;
        // refresh: uma faixa clara desce as fileiras, defasada por rack
        const ph = ((t * 0.9 + c.r * 0.37 + (c.side > 0 ? 0.5 : 0)) % 2.2) / 2.2;
        const wave = Math.exp(-(((c.row / ROWS) - (1 - ph)) ** 2) * 160);
        const k = on ? 0.32 + 0.9 * wave : 0.04 + 0.5 * wave;
        col.copy(c.row % 3 === 0 ? B : A).lerp(W, wave * 0.6).multiplyScalar(k);
        cells.setColorAt(i, col);
      }
      cells.instanceColor.needsUpdate = true;
    },
  });
  const d = dust([0, 0.2, -2], { count: 160, height: 3.2, width: 3.6, color: 0xbfd0ff, intensity: 1.6, seed: 23 });
  g.add(d.root); updaters.push(d);
  return { group: g, background: 0x05060c, fog: [0x070912, 4, 19],
    grade: { lift: [0.004, 0.002, 0.016], gamma: [1, 0.98, 1.02], gain: [0.96, 0.98, 1.06], sat: 1.1 },
    update: (t) => updaters.forEach((u) => u.update(t)) };
}
