import * as THREE from 'three';
import { PALETTE, mat, metal, glow, mesh, canvasTexture, lerp, smooth, ramp, clamp01, hash, easeOutBack } from '../util.js';
import { createEmitter } from '../sim/sim.js';
import { boardMaterial } from '../sim/gen.js';
import { pcb, labelTexture, nandLabel } from './common.js';

export function cpu(o) {
  const root = new THREE.Group();
  root.add(mesh(new THREE.BoxGeometry(1, 0.05, 1), pcb(3)));
  // contatos dourados embaixo
  const pads = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8), metal(PALETTE.gold), 24 * 24);
  const m4 = new THREE.Matrix4(); let n = 0;
  for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) m4.setPosition(-0.46 + i * 0.04, -0.035, -0.46 + j * 0.04), pads.setMatrixAt(n++, m4);
  root.add(pads);
  // die: o silício de verdade
  // silício: planta gerada no Zig (blocos de memória, barramentos roteados, trilhas acesas)
  const dieMat = boardMaterial({ size: 1024, grid: 48, seed: o.seed ?? 11, style: 1, components: 7, nets: 90 }, { emissive: 1, normalScale: 0.8 });
  dieMat.emissiveIntensity = 0;
  root.add(mesh(new THREE.BoxGeometry(0.4, 0.03, 0.4), dieMat, { pos: [0, 0.04, 0] }));
  // tampa metálica (IHS) com gravação
  const lid = new THREE.Group();
  lid.add(mesh(new THREE.BoxGeometry(0.78, 0.07, 0.78), metal(PALETTE.steel, { roughness: 0.28 })));
  lid.add(mesh(new THREE.BoxGeometry(0.88, 0.02, 0.88), metal(PALETTE.steel, { roughness: 0.34 }), { pos: [0, -0.03, 0] }));
  lid.add(mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshStandardMaterial({ map: labelTexture(o.label ?? 'CZ-0\n64 BIT', { fg: '#5b6675', bg: '#c9d1dc' }), metalness: 0.9, roughness: 0.3 }), { pos: [0, 0.0355, 0], rot: [-Math.PI / 2, 0, 0], shadow: false }));
  lid.position.y = 0.075;
  root.add(lid);
  return {
    root,
    update(lt) {
      const open = o.cutaway ? easeOutBack(ramp(lt, o.open_at ?? 0.5, 0.8)) : 0;
      lid.position.set(0, 0.075 + open * 0.34, -open * 0.4);
      lid.rotation.x = -open * 0.3;
      dieMat.emissiveIntensity = (o.cutaway ? open : 0) * (2.6 + Math.sin(lt * 7) * 0.6) + (o.active ? 0.8 : 0);
    },
  };
}

export function ram(o) {
  const root = new THREE.Group();
  root.add(mesh(new THREE.BoxGeometry(1.4, 0.36, 0.022), pcb(8, { repeat: [1, 0.26] })));
  const chips = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.MeshStandardMaterial({ color: PALETTE.plastic, emissive: PALETTE.amber, emissiveIntensity: 0, roughness: 0.4 });
    chips.push(m);
    root.add(mesh(new THREE.BoxGeometry(0.13, 0.19, 0.025), m, { pos: [-0.56 + i * 0.16, 0.04, 0.022] }));
  }
  // contatos dourados com o entalhe
  for (let i = 0; i < 44; i++) {
    const x = -0.67 + i * 0.031; if (Math.abs(x + 0.08) < 0.03) continue;
    root.add(mesh(new THREE.BoxGeometry(0.02, 0.07, 0.026), metal(PALETTE.gold), { pos: [x, -0.14, 0], shadow: false }));
  }
  return {
    root,
    update(lt) {
      chips.forEach((m, i) => { m.emissiveIntensity = o.active ? Math.max(0, Math.sin(lt * 5 - i * 0.8)) ** 4 * 3 : 0; });
    },
  };
}

export function chip(o) {
  const root = new THREE.Group();
  root.add(mesh(new THREE.BoxGeometry(0.9, 0.16, 0.5), mat(PALETTE.plastic, { roughness: 0.45 })));
  root.add(mesh(new THREE.PlaneGeometry(0.7, 0.35), mat(0xffffff, { map: labelTexture(o.label ?? 'MCU', { fg: '#8b97a8', bg: '#14181f', font: 84 }), roughness: 0.5 }), { pos: [0, 0.081, 0], rot: [-Math.PI / 2, 0, 0], shadow: false }));
  for (let i = 0; i < 8; i++) for (const s of [-1, 1]) {
    root.add(mesh(new THREE.BoxGeometry(0.05, 0.02, 0.14), metal(PALETTE.steel), { pos: [-0.385 + i * 0.11, -0.03, s * 0.3] }));
    root.add(mesh(new THREE.BoxGeometry(0.05, 0.1, 0.02), metal(PALETTE.steel), { pos: [-0.385 + i * 0.11, -0.075, s * 0.365] }));
  }
  const led = glow(o.color ?? PALETTE.amber, 0);
  root.add(mesh(new THREE.SphereGeometry(0.03, 12, 10), led, { pos: [-0.36, 0.085, 0.17], shadow: false }));
  return { root, update(lt) { led.emissiveIntensity = lt > (o.on_at ?? 0) ? 3 + Math.sin(lt * 12) * 2 : 0; } };
}

export function key(o) {
  const root = new THREE.Group();
  const housingMat = o.cutaway
    ? new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.16, roughness: 0.08, metalness: 0.2, depthWrite: false })
    : mat(PALETTE.plastic);
  root.add(mesh(new THREE.BoxGeometry(0.62, 0.36, 0.62), housingMat, { pos: [0, 0.18, 0], shadow: !o.cutaway }));
  root.add(mesh(new THREE.BoxGeometry(0.9, 0.04, 0.9), pcb(5), { pos: [0, -0.02, 0] }));
  // os dois contatos de metal que fecham o circuito
  const contactMat = new THREE.MeshStandardMaterial({ color: PALETTE.copper, metalness: 0.9, roughness: 0.3, emissive: PALETTE.amber, emissiveIntensity: 0 });
  const fixed = mesh(new THREE.BoxGeometry(0.05, 0.24, 0.16), contactMat, { pos: [0.1, 0.13, 0] });
  const leaf = new THREE.Group(); leaf.position.set(-0.14, 0.01, 0);
  leaf.add(mesh(new THREE.BoxGeometry(0.03, 0.26, 0.16), contactMat, { pos: [0, 0.13, 0] }));
  root.add(fixed, leaf);
  // haste + mola + tecla
  const moving = new THREE.Group();
  moving.add(mesh(new THREE.BoxGeometry(0.16, 0.3, 0.16), mat(o.stem ?? 0xd9422b, { roughness: 0.4 }), { pos: [0, 0.38, 0] }));
  const cap = mesh(new THREE.CylinderGeometry(0.36, 0.5, 0.3, 4, 1), mat(o.color ?? 0x2b3445, { roughness: 0.5 }), { pos: [0, 0.62, 0], rot: [0, Math.PI / 4, 0] });
  moving.add(cap);
  moving.add(mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshStandardMaterial({ map: labelTexture(o.label ?? 'A', { fg: '#f8fafc', bg: '#2b3445', font: 170 }), roughness: 0.5 }), { pos: [0, 0.771, 0], rot: [-Math.PI / 2, 0, 0], shadow: false }));
  root.add(moving);
  const spring = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 12, 1, true), metal(PALETTE.steel, { wireframe: true }), { pos: [0, 0.14, 0], shadow: false });
  root.add(spring);
  const pressAt = o.press_at ?? 1.0, hold = o.hold ?? 0.9;
  return {
    root,
    update(lt) {
      // desce rápido, segura, volta
      const down = smooth((lt - pressAt) / 0.12) * (1 - smooth((lt - pressAt - hold) / 0.18));
      moving.position.y = -down * 0.13;
      spring.scale.y = 1 - down * 0.5; spring.position.y = 0.14 - down * 0.04;
      leaf.rotation.z = -down * 0.62; // a lâmina encosta no contato fixo
      const closed = down > 0.85 ? 1 : 0;
      contactMat.emissiveIntensity = closed * (1.3 + Math.sin(lt * 30) * 0.3);
    },
  };
}

export function key_matrix(o) {
  const rows = o.rows ?? 4, cols = o.cols ?? 6, pitch = 0.2;
  const root = new THREE.Group();
  const w = cols * pitch, h = rows * pitch;
  root.add(mesh(new THREE.BoxGeometry(w + 0.2, 0.03, h + 0.2), pcb(2), { pos: [0, -0.02, 0] }));
  const rowM = [], colM = [], cell = [];
  for (let r = 0; r < rows; r++) {
    const m = new THREE.MeshStandardMaterial({ color: 0x3a2a10, emissive: PALETTE.amber, emissiveIntensity: 0.15, roughness: 0.4 });
    rowM.push(m);
    root.add(mesh(new THREE.BoxGeometry(w, 0.012, 0.022), m, { pos: [0, 0.004, (r - (rows - 1) / 2) * pitch], shadow: false }));
  }
  for (let c = 0; c < cols; c++) {
    const m = new THREE.MeshStandardMaterial({ color: 0x0c2a36, emissive: PALETTE.cyan, emissiveIntensity: 0.15, roughness: 0.4 });
    colM.push(m);
    root.add(mesh(new THREE.BoxGeometry(0.022, 0.012, h), m, { pos: [(c - (cols - 1) / 2) * pitch, 0.018, 0], shadow: false }));
    for (let r = 0; r < rows; r++) {
      const cm = new THREE.MeshStandardMaterial({ color: 0x2b3445, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.5 });
      cell.push(cm);
      root.add(mesh(new THREE.BoxGeometry(0.13, 0.05, 0.13), cm, { pos: [(c - (cols - 1) / 2) * pitch, 0.05, (r - (rows - 1) / 2) * pitch] }));
    }
  }
  const [hr, hc] = o.hit ?? [1, 2];
  const period = o.scan_period ?? 1.2;
  return {
    root,
    update(lt) {
      // o microcontrolador energiza uma coluna por vez e lê as linhas
      const active = Math.floor((lt / period) * cols) % cols;
      colM.forEach((m, c) => { m.emissiveIntensity = c === active ? 4 : 0.15; });
      const found = active === hc && lt > (o.hit_at ?? 0);
      rowM.forEach((m, r) => { m.emissiveIntensity = found && r === hr ? 4.5 : 0.15; });
      cell.forEach((m, i) => {
        const c = Math.floor(i / rows), r = i % rows;
        const isHit = c === hc && r === hr && lt > (o.hit_at ?? 0);
        m.emissive.set(isHit ? PALETTE.amber : PALETTE.cyan);
        m.emissiveIntensity = isHit ? (found ? 5 : 1.2) : (c === active ? 0.25 : 0);
      });
    },
  };
}

export function ssd(o) {
  const root = new THREE.Group();
  root.add(mesh(new THREE.BoxGeometry(1.6, 0.03, 0.42), pcb(14, { repeat: [1, 0.26] })));
  const chips = [-0.42, 0.12].map((x, i) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x0f1218, emissive: PALETTE.amber, emissiveIntensity: 0, roughness: 0.4 });
    root.add(mesh(new THREE.BoxGeometry(0.42, 0.05, 0.3), m, { pos: [x, 0.04, 0] }));
    root.add(mesh(new THREE.PlaneGeometry(0.3, 0.16), mat(0xffffff, { map: nandLabel(i ? 'NAND\n1TB' : 'NAND\n1TB'), roughness: 0.6 }), { pos: [x, 0.0651, 0], rot: [-Math.PI / 2, 0, 0], shadow: false }));
    return m;
  });
  root.add(mesh(new THREE.BoxGeometry(0.22, 0.045, 0.22), mat(0x1a1f27, { roughness: 0.35 }), { pos: [0.52, 0.037, 0] }));
  for (let i = 0; i < 18; i++) if (i !== 4) root.add(mesh(new THREE.BoxGeometry(0.02, 0.031, 0.1), metal(PALETTE.gold), { pos: [-0.79, 0, -0.17 + i * 0.02], shadow: false }));
  root.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.032, 20, 1, false, Math.PI / 2, Math.PI), metal(PALETTE.gold), { pos: [0.8, 0, 0], rot: [0, 0, 0] }));
  return { root, update(lt) { chips.forEach((m, i) => { m.emissiveIntensity = o.active ? Math.max(0, Math.sin(lt * 9 + i * 2)) ** 6 * 3 : 0; }); } };
}

export function fanBlades(radius, n, color) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(radius * 0.32, radius * 0.32, 0.08, 32), mat(0x1a1d22, { roughness: 0.4 })));
  g.add(mesh(new THREE.CircleGeometry(radius * 0.2, 24), mat(0xc9d1dc, { roughness: 0.5 }), { pos: [0, 0.041, 0], rot: [-Math.PI / 2, 0, 0], shadow: false }));
  for (let i = 0; i < n; i++) {
    const b = mesh(new THREE.BoxGeometry(radius * 0.62, 0.012, radius * 0.3), mat(color, { roughness: 0.45, transparent: true, opacity: 0.95 }));
    b.position.set(Math.cos((i / n) * Math.PI * 2) * radius * 0.6, 0, Math.sin((i / n) * Math.PI * 2) * radius * 0.6);
    b.rotation.set(0.35, -(i / n) * Math.PI * 2, 0);
    g.add(b);
  }
  return g;
}

export function fan(o) {
  const root = new THREE.Group();
  const frame = mat(0x14171c, { roughness: 0.5 });
  root.add(mesh(new THREE.TorusGeometry(0.47, 0.03, 10, 48), frame, { rot: [Math.PI / 2, 0, 0] }));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) root.add(mesh(new THREE.BoxGeometry(0.16, 0.1, 0.16), frame, { pos: [x * 0.44, 0, z * 0.44] }));
  for (let i = 0; i < 4; i++) root.add(mesh(new THREE.BoxGeometry(0.42, 0.02, 0.03), frame, { pos: [Math.cos(i * Math.PI / 2 + 0.785) * 0.25, -0.04, Math.sin(i * Math.PI / 2 + 0.785) * 0.25], rot: [0, -(i * Math.PI / 2 + 0.785), 0] }));
  const rotor = fanBlades(0.45, o.blades ?? 7, o.color ?? 0x2a2f38);
  root.add(rotor);
  const ring = mesh(new THREE.TorusGeometry(0.45, 0.012, 8, 64), glow(o.glow ?? PALETTE.cyan, o.glow === 0 ? 0 : 2.5), { rot: [Math.PI / 2, 0, 0], pos: [0, 0.05, 0], shadow: false });
  root.add(ring);
  const rps = (o.rpm ?? 900) / 60, spin = o.spin_at ?? 0;
  // gira com aceleração suave a partir de spin_at (ângulo = integral da velocidade)
  return { root, update(lt) { const u = Math.max(0, lt - spin), ramp = 0.6; const ang = u < ramp ? 0.5 * u * u / ramp : u - ramp / 2; rotor.rotation.y = -ang * rps * Math.PI * 2; } };
}

export function gpu(o) {
  const root = new THREE.Group();
  root.add(mesh(new THREE.BoxGeometry(2.0, 0.05, 0.9), pcb(21, { repeat: [1, 0.45] })));
  root.add(mesh(new THREE.BoxGeometry(1.95, 0.22, 0.86), mat(0x1b1f26, { roughness: 0.4, metalness: 0.5 }), { pos: [0, 0.14, 0] }));
  root.add(mesh(new THREE.BoxGeometry(1.95, 0.012, 0.06), glow(o.glow ?? PALETTE.amber, 2.6), { pos: [0, 0.25, 0.4], shadow: false }));
  const fans = [-0.48, 0.48].map((x) => { const f = fan({ rpm: o.rpm ?? 1400, glow: 0, spin_at: o.spin_at }); f.root.scale.setScalar(0.82); f.root.position.set(x, 0.27, 0); root.add(f.root); return f; });
  for (let i = 0; i < 16; i++) if (Math.abs(i - 6) > 0.5) root.add(mesh(new THREE.BoxGeometry(0.05, 0.051, 0.06), metal(PALETTE.gold), { pos: [-0.8 + i * 0.07, 0, -0.47], shadow: false }));
  return { root, update(lt) { fans.forEach((f) => f.update(lt)); } };
}

export function hdd(o) {
  const root = new THREE.Group();
  root.add(mesh(new THREE.BoxGeometry(1.2, 0.12, 1.6), metal(0x9aa4b0, { roughness: 0.45 }), { pos: [0, 0, 0] }));
  const platter = new THREE.Group();
  platter.add(mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.02, 96), new THREE.MeshPhysicalMaterial({ color: 0xd8dde4, metalness: 1, roughness: 0.08, clearcoat: 1 })));
  // trilhas concêntricas (ajudam a ver o giro e a busca)
  for (let r = 0.18; r < 0.5; r += 0.045) platter.add(mesh(new THREE.TorusGeometry(r, 0.0015, 4, 96), mat(0x8a95a3, { metalness: 0.8, roughness: 0.3 }), { rot: [Math.PI / 2, 0, 0], pos: [0, 0.011, 0], shadow: false }));
  platter.add(mesh(new THREE.BoxGeometry(0.08, 0.003, 0.02), glow(PALETTE.amber, 2), { pos: [0.38, 0.012, 0], shadow: false }));
  platter.position.set(0, 0.075, -0.2);
  root.add(platter);
  root.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 32), metal(0xc9d1dc), { pos: [0, 0.1, -0.2] }));
  const arm = new THREE.Group();
  arm.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 24), metal(0x5f6874), { pos: [0, 0.03, 0] }));
  arm.add(mesh(new THREE.BoxGeometry(0.06, 0.015, 0.78), metal(0xb8c2ce, { roughness: 0.3 }), { pos: [0, 0.09, -0.4] }));
  const head = glow(PALETTE.cyan, 0);
  arm.add(mesh(new THREE.BoxGeometry(0.05, 0.02, 0.05), head, { pos: [0, 0.088, -0.78], shadow: false }));
  arm.position.set(0.42, 0.04, 0.55);
  root.add(arm);
  const rps = (o.rpm ?? 120) / 60;
  return {
    root,
    update(lt) {
      platter.rotation.y = -lt * rps * Math.PI * 2;
      // busca: o braço varre entre trilhas em saltos suaves
      const seek = o.seek_at ?? 1, k = Math.max(0, lt - seek), step = Math.floor(k / 0.9);
      const a0 = hash(step + 3) * 0.5 - 0.1, a1 = hash(step + 4) * 0.5 - 0.1, f = smooth(((k % 0.9) - 0.1) / 0.25);
      arm.rotation.y = lt < seek ? 0.15 : lerp(a0, a1, f) + 0.15;
      head.emissiveIntensity = lt >= seek && f > 0.95 ? 3 : 0.4;
    },
  };
}
