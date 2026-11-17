import * as THREE from 'three';
import { PALETTE, mat, metal, glow, mesh, canvasTexture, lerp, smooth, ramp, clamp01, hash, easeOutBack } from '../util.js';
import { createEmitter } from '../sim/sim.js';
import { boardMaterial } from '../sim/gen.js';

// Cada prefab devolve { root, update(lt) }. `lt` é o tempo local da cena em segundos.
// Convenção: origem no centro do objeto, frente apontando para +Z, tamanho ~1 unidade.

// Placa gerada em Zig (trilhas roteadas). Placas pequenas usam grade menos densa para ler de longe.
const pcb = (seed, opts = {}) => boardMaterial({ size: 1024, grid: 40, seed, style: 0, components: 4, nets: 45 }, opts);

const labelTexture = (text, { fg = '#cbd5e1', bg = '#11161e', size = 256, font = 64 } = {}) => canvasTexture(size, (c, s) => {
  c.fillStyle = bg; c.fillRect(0, 0, s, s);
  c.fillStyle = fg; c.font = `600 ${font}px "JetBrains Mono", monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
  text.split('\n').forEach((line, i, a) => c.fillText(line, s / 2, s / 2 + (i - (a.length - 1) / 2) * font * 1.15));
});

function cpu(o) {
  const root = new THREE.Group();
  root.add(mesh(new THREE.BoxGeometry(1, 0.05, 1), pcb(3)));
  // contatos dourados embaixo
  const pads = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8), metal(PALETTE.gold), 24 * 24);
  const m4 = new THREE.Matrix4(); let n = 0;
  for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) m4.setPosition(-0.46 + i * 0.04, -0.035, -0.46 + j * 0.04), pads.setMatrixAt(n++, m4);
  root.add(pads);
  // die: o silício de verdade
  const dieTex = canvasTexture(512, (c, s) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
      const v = hash(i * 16 + j);
      c.fillStyle = v > 0.8 ? '#ffb020' : v > 0.55 ? '#38d6ff' : v > 0.3 ? '#12324a' : '#0a1422';
      c.fillRect(i * 32 + 3, j * 32 + 3, 26, 26);
    }
  });
  const dieMat = new THREE.MeshStandardMaterial({ color: PALETTE.silicon, emissiveMap: dieTex, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.2, metalness: 0.7 });
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
      dieMat.emissiveIntensity = (o.cutaway ? open : 0) * (2.2 + Math.sin(lt * 7) * 0.6) + (o.active ? 0.8 : 0);
    },
  };
}

function ram(o) {
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

function chip(o) {
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

function key(o) {
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

function key_matrix(o) {
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

function cable(o) {
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

function bit_grid(o) {
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

function transistor(o) {
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

function screen(o) {
  const root = new THREE.Group();
  root.add(mesh(new THREE.BoxGeometry(1.5, 0.95, 0.06), mat(PALETTE.plastic, { roughness: 0.35 })));
  root.add(mesh(new THREE.BoxGeometry(0.12, 0.4, 0.06), mat(PALETTE.plastic), { pos: [0, -0.62, -0.05] }));
  root.add(mesh(new THREE.BoxGeometry(0.6, 0.04, 0.3), mat(PALETTE.plastic), { pos: [0, -0.82, -0.02] }));
  const cv = document.createElement('canvas'); cv.width = 768; cv.height = 480;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.5, roughness: 0.15 });
  root.add(mesh(new THREE.PlaneGeometry(1.4, 0.85), m, { pos: [0, 0, 0.032], shadow: false }));
  const text = o.text ?? 'A', typeAt = o.type_at ?? 1.0;
  let last = '';
  return {
    root,
    update(lt) {
      const shown = text.slice(0, Math.max(0, Math.floor((lt - typeAt) / (o.char_time ?? 0.12)) + 1));
      const cursor = Math.floor(lt * 2.5) % 2 === 0;
      const stateKey = shown + cursor;
      if (stateKey === last) return; last = stateKey;
      ctx.fillStyle = '#07101c'; ctx.fillRect(0, 0, 768, 480);
      ctx.fillStyle = '#16314a'; ctx.fillRect(0, 0, 768, 44);
      ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(28 + i * 30, 22, 9, 0, 7); ctx.fill(); });
      ctx.font = '600 210px "JetBrains Mono", monospace'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffb020';
      const wT = ctx.measureText(lt >= typeAt ? shown : '').width, x0 = 384 - (wT + 40) / 2;
      if (lt >= typeAt) ctx.fillText(shown, x0, 272);
      if (cursor) { ctx.fillStyle = '#38d6ff'; ctx.fillRect(x0 + (lt >= typeAt ? wT : 0) + 12, 180, 26, 180); }
      tex.needsUpdate = true;
    },
  };
}

function particles(o) {
  const kind = o.kind ?? 'sparks', count = Math.min(o.count ?? 160, 4096);
  const root = new THREE.Group();
  const em = createEmitter(kind, count, { seed: o.seed ?? 7, speed: o.speed, spread: o.spread, length: o.length, floor: o.floor });
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(o.size ?? 0.016, 8, 6), glow(o.color ?? PALETTE.amber, o.intensity ?? 6), count);
  im.frustumCulled = false; im.castShadow = false;
  root.add(im);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  return {
    root,
    update(lt) {
      const buf = em.at(Math.max(0, lt - (o.start_at ?? 0)));
      const visible = lt >= (o.start_at ?? 0);
      for (let i = 0; i < count; i++) {
        const life = visible ? buf[i * 4 + 3] : 0;
        p.set(buf[i * 4], buf[i * 4 + 1], buf[i * 4 + 2]); s.setScalar(Math.max(0.0001, life));
        im.setMatrixAt(i, m4.compose(p, q, s));
      }
      im.instanceMatrix.needsUpdate = true;
    },
  };
}

const simple = (geoFn) => (o) => ({
  root: mesh(geoFn(o), o.emissive ? glow(o.emissive, o.intensity ?? 3) : (o.metal ? metal(o.color ?? PALETTE.steel) : mat(o.color ?? PALETTE.graphiteLight))),
  update() {},
});

function arrow(o) {
  const root = new THREE.Group(), m = glow(o.color ?? PALETTE.amber, 3.5);
  root.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 12), m, { pos: [0, 0.25, 0], shadow: false }));
  root.add(mesh(new THREE.ConeGeometry(0.07, 0.16, 16), m, { pos: [0, 0.58, 0], shadow: false }));
  return { root, update(lt) { root.position.y = (o.pos?.[1] ?? 0) + Math.sin(lt * 4) * 0.03; root.scale.setScalar(easeOutBack(ramp(lt, o.at ?? 0, 0.35)) * (o.scale?.[0] ?? 1) || 0.0001); } };
}

const REGISTRY = {
  cpu, ram, chip, key, key_matrix, cable, bit_grid, transistor, screen, particles, arrow,
  box: simple(() => new THREE.BoxGeometry(1, 1, 1)),
  sphere: simple(() => new THREE.SphereGeometry(0.5, 40, 28)),
  cylinder: simple(() => new THREE.CylinderGeometry(0.5, 0.5, 1, 40)),
};

export const PREFAB_TYPES = Object.keys(REGISTRY);

/**
 * Constrói um objeto do roteiro. Opções comuns a todos:
 *  pos, rot, scale  — transform
 *  float: true      — flutua e gira devagar (objeto "em exibição")
 *  appear_at: s     — entra com pop nesse instante da cena
 */
export function buildObject(o) {
  const factory = REGISTRY[o.type];
  if (!factory) throw new Error(`prefab desconhecido: ${o.type}`);
  const inner = factory(o);
  const root = new THREE.Group();
  root.add(inner.root);
  const pos = o.pos ?? [0, 0, 0], rot = o.rot ?? [0, 0, 0];
  const sc = Array.isArray(o.scale) ? o.scale : [o.scale ?? 1, o.scale ?? 1, o.scale ?? 1];
  if (o.type !== 'arrow') { root.position.set(...pos); root.scale.set(...sc); } else root.position.set(pos[0], 0, pos[2]);
  root.rotation.set(...rot);
  // quadros-chave: keys: [{ t, pos?, rot?, scale? }], interpolados com curva C2 (sai e chega parado)
  const keys = (o.keys ?? []).map((k) => ({ ...k, scale: k.scale === undefined ? undefined : Array.isArray(k.scale) ? k.scale : [k.scale, k.scale, k.scale] })).sort((a, b) => a.t - b.t);
  const smoother = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * t * (t * (t * 6 - 15) + 10); };
  const keyed = (lt, field, base) => {
    const ks = keys.filter((k) => k[field]);
    if (!ks.length) return base;
    if (lt <= ks[0].t) return ks[0][field];
    for (let i = 1; i < ks.length; i++) {
      if (lt <= ks[i].t) {
        const u = smoother((lt - ks[i - 1].t) / (ks[i].t - ks[i - 1].t));
        return ks[i - 1][field].map((v, j) => v + (ks[i][field][j] - v) * u);
      }
    }
    return ks[ks.length - 1][field];
  };
  return {
    root, local: inner.root,
    update(lt) {
      inner.update(lt);
      if (o.type === 'arrow') return;
      if (keys.length) {
        root.position.set(...keyed(lt, 'pos', pos));
        root.rotation.set(...keyed(lt, 'rot', rot));
        if (o.appear_at === undefined) root.scale.set(...keyed(lt, 'scale', sc));
      }
      if (o.float) {
        root.position.y = (keys.length ? root.position.y : pos[1]) + Math.sin(lt * 1.4) * 0.035;
        root.rotation.y = (keys.length ? root.rotation.y : rot[1]) + Math.sin(lt * 0.6) * (o.float_swing ?? 0.22);
      }
      if (o.appear_at !== undefined) {
        const k = easeOutBack(ramp(lt, o.appear_at, 0.4));
        root.scale.set(sc[0] * k || 1e-4, sc[1] * k || 1e-4, sc[2] * k || 1e-4);
      }
    },
  };
}
