import * as THREE from 'three';
import { PALETTE, mat, metal, glow, mesh, canvasTexture, lerp, smooth, ramp, clamp01, hash, easeOutBack } from '../util.js';
import { createEmitter } from '../sim/sim.js';
import { boardMaterial } from '../sim/gen.js';
import { pcb, labelTexture, nandLabel } from './common.js';

export function cable(o) {
  const from = new THREE.Vector3(...(o.from ?? [-0.8, 0, 0])), to = new THREE.Vector3(...(o.to ?? [0.8, 0, 0]));
  const mid = from.clone().lerp(to, 0.5); mid.y -= o.sag ?? 0.25; mid.z += o.bow ?? 0.15;
  const curve = new THREE.CatmullRomCurve3([from, from.clone().lerp(mid, 0.5).setY(lerp(from.y, mid.y, 0.75)), mid, to.clone().lerp(mid, 0.5).setY(lerp(to.y, mid.y, 0.75)), to]);
  const root = new THREE.Group();
  root.add(mesh(new THREE.TubeGeometry(curve, 80, o.radius ?? 0.035, 16), mat(o.color ?? 0x1b2230, { roughness: 0.5 })));
  [from, to].forEach((p) => root.add(mesh(new THREE.BoxGeometry(0.16, 0.08, 0.1), metal(PALETTE.steel), { pos: p.toArray() })));
  const n = o.pulses ?? 5;
  const pulses = Array.from({ length: n }, () => {
    const p = mesh(new THREE.SphereGeometry((o.radius ?? 0.035) * 1.5, 16, 12), glow(o.pulse_color ?? PALETTE.amber, 5), { shadow: false });
    root.add(p); return p;
  });
  return {
    root,
    update(lt) {
      const start = o.start_at ?? 0, speed = o.speed ?? 0.7;
      pulses.forEach((p, i) => {
        const u = (lt - start) * speed - i / n;
        p.visible = u >= 0 && (o.loop === false ? u <= 1 : true);
        if (p.visible) { p.position.copy(curve.getPointAt(o.loop === false ? clamp01(u) : u % 1)); }
      });
    },
  };
}

export function bit_grid(o) {
  const bits = (o.pattern ?? '01000001').replace(/[^01]/g, '');
  const cols = o.cols ?? 8, rows = Math.ceil(bits.length / cols), pitch = 0.16;
  const root = new THREE.Group();
  const cells = [...bits].map((b, i) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x1b2333, emissive: PALETTE.amber, emissiveIntensity: 0, roughness: 0.35, metalness: 0.4 });
    const c = mesh(new THREE.BoxGeometry(0.13, 0.13, 0.13), m, { pos: [((i % cols) - (cols - 1) / 2) * pitch, ((rows - 1) / 2 - Math.floor(i / cols)) * pitch, 0] });
    root.add(c);
    return { c, m, on: b === '1', i };
  });
  return {
    root,
    update(lt) {
      cells.forEach(({ c, m, on, i }) => {
        const k = on ? easeOutBack(ramp(lt, (o.start_at ?? 0.3) + i * (o.stagger ?? 0.09), 0.3)) : 0;
        c.position.z = k * 0.07; c.scale.setScalar(1 + k * 0.08);
        m.emissiveIntensity = k * (3 + Math.sin(lt * 5 + i) * 0.5);
      });
    },
  };
}

export function transistor(o) {
  const root = new THREE.Group();
  root.add(mesh(new THREE.BoxGeometry(1.2, 0.2, 0.6), mat(PALETTE.silicon, { roughness: 0.3, metalness: 0.5 }), { pos: [0, -0.1, 0] }));
  root.add(mesh(new THREE.BoxGeometry(0.34, 0.1, 0.5), metal(PALETTE.copper), { pos: [-0.38, 0.03, 0] }));  // fonte
  root.add(mesh(new THREE.BoxGeometry(0.34, 0.1, 0.5), metal(PALETTE.copper), { pos: [0.38, 0.03, 0] }));   // dreno
  const channel = glow(PALETTE.cyan, 0);
  root.add(mesh(new THREE.BoxGeometry(0.42, 0.03, 0.46), channel, { pos: [0, -0.005, 0], shadow: false }));
  root.add(mesh(new THREE.BoxGeometry(0.4, 0.02, 0.5), mat(0xdfe7f2, { roughness: 0.2 }), { pos: [0, 0.03, 0] })); // óxido
  const gate = new THREE.MeshStandardMaterial({ color: 0x8a5a16, emissive: PALETTE.amber, emissiveIntensity: 0, metalness: 0.7, roughness: 0.3 });
  root.add(mesh(new THREE.BoxGeometry(0.36, 0.14, 0.5), gate, { pos: [0, 0.11, 0] }));
  return {
    root,
    update(lt) {
      const period = o.period ?? 0, on = period ? ((lt - (o.on_at ?? 0.8)) % period) < period / 2 && lt > (o.on_at ?? 0.8) : lt > (o.on_at ?? 0.8);
      gate.emissiveIntensity = on ? 3 : 0; channel.emissiveIntensity = on ? 4.5 : 0;
    },
  };
}

// porta lógica: entradas mudam ao longo do tempo, a saída é calculada e acende
export const GATES = { and: [(a, b) => a & b, '&'], or: [(a, b) => a | b, '≥1'], xor: [(a, b) => a ^ b, '=1'], nand: [(a, b) => 1 - (a & b), '&'], nor: [(a, b) => 1 - (a | b), '≥1'], not: [(a) => 1 - a, '1'] };

export function gate(o) {
  const kind = o.gate ?? 'and', [fn, sym] = GATES[kind] ?? GATES.and, one = kind === 'not';
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.add(mesh(new THREE.BoxGeometry(0.62, 0.16, 0.7), mat(0x1c2433, { roughness: 0.4, metalness: 0.3 })));
  body.add(mesh(new THREE.PlaneGeometry(0.5, 0.5), mat(0xffffff, { map: labelTexture(sym, { fg: '#e8edf5', bg: '#1c2433', font: 120 }), roughness: 0.5 }), { pos: [0, 0.081, 0], rot: [-Math.PI / 2, 0, 0], shadow: false }));
  if (kind.startsWith('n')) body.add(mesh(new THREE.TorusGeometry(0.05, 0.018, 8, 20), mat(0xe8edf5), { pos: [0.37, 0, 0], rot: [0, Math.PI / 2, 0] }));
  root.add(body);
  const wire = (x0, x1, z) => { const m = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, emissive: PALETTE.amber, emissiveIntensity: 0, roughness: 0.4 }); root.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, Math.abs(x1 - x0), 12), m, { pos: [(x0 + x1) / 2, 0, z], rot: [0, 0, Math.PI / 2], shadow: false })); return m; };
  const ins = one ? [wire(-0.85, -0.31, 0)] : [wire(-0.85, -0.31, -0.18), wire(-0.85, -0.31, 0.18)];
  const out = wire(kind.startsWith('n') ? 0.43 : 0.31, 0.95, 0);
  const seq = (o.inputs ?? (one ? ['0', '1'] : ['00', '01', '10', '11'])).map((s) => [...s].map(Number));
  const step = o.step ?? 1.2;
  return {
    root,
    update(lt) {
      const v = seq[Math.floor(Math.max(0, lt - (o.start_at ?? 0.5)) / step) % seq.length];
      ins.forEach((m, i) => { m.emissiveIntensity = v[i] ? 4 : 0.05; });
      out.emissiveIntensity = fn(v[0], v[1]) ? 5 : 0.05;
    },
  };
}

// células de memória (DRAM): bits gravados linha a linha; com leak, a carga vaza e volta no refresh
export function mem_cells(o) {
  const rows = o.rows ?? 4, cols = o.cols ?? 8, pitch = 0.16;
  const bits = (o.pattern ?? '01001101 10110010 01110001 11001010').replace(/[^01]/g, '');
  const root = new THREE.Group();
  root.add(mesh(new THREE.BoxGeometry(cols * pitch + 0.1, 0.04, rows * pitch + 0.1), mat(0x141b27, { roughness: 0.5, metalness: 0.4 }), { pos: [0, -0.04, 0] }));
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const m = new THREE.MeshStandardMaterial({ color: 0x1e2635, emissive: PALETTE.cyan, emissiveIntensity: 0, roughness: 0.3, metalness: 0.5 });
    root.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 20), m, { pos: [(c - (cols - 1) / 2) * pitch, 0.02, (r - (rows - 1) / 2) * pitch] }));
    cells.push({ m, r, on: bits[(r * cols + c) % bits.length] === '1' });
  }
  const wAt = o.write_at ?? 0.5, rowT = o.row_time ?? 0.25, period = o.refresh ?? 2.2;
  return {
    root,
    update(lt) {
      for (const c of cells) {
        const w = smooth((lt - wAt - c.r * rowT) / 0.12);
        let q = c.on ? w : 0;
        if (o.leak && q > 0) { const since = (lt - wAt - c.r * rowT) % period; q *= 1 - 0.75 * clamp01(since / period); }
        c.m.emissiveIntensity = q * 4;
      }
    },
  };
}

export function packet(o) {
  const root = new THREE.Group();
  root.add(mesh(new THREE.BoxGeometry(0.62, 0.3, 0.3), mat(0x1d2738, { roughness: 0.35, metalness: 0.4 })));
  root.add(mesh(new THREE.BoxGeometry(0.16, 0.31, 0.31), glow(o.color ?? PALETTE.amber, 2.8), { pos: [-0.24, 0, 0], shadow: false }));
  root.add(mesh(new THREE.PlaneGeometry(0.4, 0.2), mat(0xffffff, { map: labelTexture(o.label ?? 'TCP', { fg: '#e8edf5', bg: '#1d2738', font: 90 }), roughness: 0.5 }), { pos: [0.07, 0, 0.151], shadow: false }));
  return { root, update() {} };
}
