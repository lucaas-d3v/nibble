import { hash, smooth, clamp01, lerp, easeOutCubic } from '../util.js';

/**
 * Movimento do Nibble.
 *
 * Cada animação descreve só ALVOS (para onde o corpo quer ir) em função do tempo.
 * Molas amortecidas perseguem esses alvos: é isso que dá peso, atraso entre as
 * partes (o corpo vira, a cabeça vem depois), e o leve passar-do-ponto dos gestos.
 *
 * A simulação roda a passo fixo desde o início da cena e fica em cache, então
 * renderAtTime(t) continua determinístico e pode ser chamado em qualquer ordem.
 */

export const HZ = 120;
const DT = 1 / HZ;

// Medidas do boneco (em unidades locais, antes da escala do root)
export const RIG = {
  scale: 0.88,
  ride: 0.5,          // altura do centro do tronco em pé
  ballR: 0.44,        // raio quando vira bola
  pelvisDrop: 0.3,    // pivô da inclinação, abaixo do centro do tronco
  headPivot: [0, 0.98, 0.13],
  shoulder: [0.235, 0.62, 0.2],
};

// [frequência angular (rad/s), amortecimento]
const SPRING = {
  pelvisPitch: [8, 0.75], pelvisRoll: [6, 0.55], pelvisYaw: [6.5, 0.85],
  headYaw: [10, 0.72], headPitch: [11, 0.62], headRoll: [8, 0.6],
  aLx: [10, 0.6], aLy: [10, 0.6], aLz: [10, 0.6], aLtw: [10, 0.75], aLel: [12, 0.56],
  aRx: [10, 0.6], aRy: [10, 0.6], aRz: [10, 0.6], aRtw: [10, 0.75], aRel: [12, 0.56],
  browL: [16, 0.7], browR: [16, 0.7], browTilt: [14, 0.75],
  lid: [20, 0.85], lower: [14, 0.8], pupil: [10, 0.75], jaw: [38, 0.85],
  squash: [15, 0.3], earL: [12, 0.2], earR: [12, 0.2], tail: [7, 0.28], glow: [7, 0.9],
};
export const CHANNELS = Object.keys(SPRING);

// Suavização do alvo antes da mola (segundos). Mola sozinha arranca com aceleração
// máxima no primeiro quadro; com o alvo filtrado o movimento entra em curva S.
const EASE_IN = {
  pelvisPitch: 0.1, pelvisRoll: 0.12, pelvisYaw: 0.1, headYaw: 0.06, headPitch: 0.06, headRoll: 0.08,
  aLx: 0.07, aLy: 0.07, aLz: 0.07, aLtw: 0.08, aLel: 0.07, aRx: 0.07, aRy: 0.07, aRz: 0.07, aRtw: 0.08, aRel: 0.07,
  browL: 0.04, browR: 0.04, browTilt: 0.05, lid: 0.025, lower: 0.05, pupil: 0.06, glow: 0.05,
};
const CI = Object.fromEntries(CHANNELS.map((k, i) => [k, i]));

// Gestos de fala: [para fora, para cima, para frente, torção, cotovelo] por braço.
// "para fora" e torção são espelhados para o braço direito.
const REST = [0.3, -1, 0.16, 0, 0.3];
const GESTURES = {
  rest: { L: REST, R: REST },
  open: { L: [0.8, -0.38, 0.7, 0.25, 0.85], R: [0.8, -0.38, 0.7, 0.25, 0.85], lean: 0.035 },
  offer: { L: [0.72, -0.12, 0.85, 0.35, 0.5], R: [0.28, -0.95, 0.35, 0, 0.75], glance: true, sway: 0.035 },
  beat: { L: [0.32, -0.9, 0.3, 0, 0.8], R: [0.22, -0.3, 1, 0, 1.45], lean: 0.05, beat: 'R' },
  count: { L: [0.12, -0.5, 1, 0, 1.55], R: [0.28, -0.12, 0.95, 0, 1.9], beat: 'R' },
  shrug: { L: [0.9, -0.28, 0.42, 0.7, 1.45], R: [0.9, -0.28, 0.42, 0.7, 1.45], headRoll: 0.12, brow: 0.02 },
  both: { L: [0.5, -0.18, 0.95, 0.1, 1.15], R: [0.5, -0.18, 0.95, 0.1, 1.15], beat: 'LR', lean: 0.04 },
};
const TALK_POOL = ['open', 'offer', 'beat', 'count', 'both', 'offer', 'beat', 'shrug', 'open'];
const HAPPY_POOL = ['open', 'both', 'open', 'offer', 'both'];

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
// Pulo com velocidade contínua: agacha antes, arco no ar, comprime ao pousar.
// Todas as junções têm derivada zero, então não há tranco nem a 60 fps.
// (Parábola crua sai do chão já em velocidade: a 60 fps isso vira um quadro de salto.)
// sin^4 nas dobras: aceleração também começa e termina em zero (sem tranco nem no 1º quadro).
const HOP_PRE = 0.15, HOP_POST = 0.18;
const hop = (t, t0, d, h) => {
  if (t <= t0 - HOP_PRE || t >= t0 + d + HOP_POST) return 0;
  if (t < t0) return -0.2 * h * Math.sin(Math.PI * (t - (t0 - HOP_PRE)) / HOP_PRE) ** 4;
  if (t <= t0 + d) return h * Math.sin(Math.PI * (t - t0) / d) ** 2;
  return -0.25 * h * Math.sin(Math.PI * (t - t0 - d) / HOP_POST) ** 4;
};
const step = (t, t0) => (t >= t0 ? 1 : 0);

function setArm(T, side, g, k = 1) {
  const s = side === 'L' ? 1 : -1;
  const p = `a${side}`;
  T[`${p}x`] = lerp(T[`${p}x`], g[0] * s, k);
  T[`${p}y`] = lerp(T[`${p}y`], g[1], k);
  T[`${p}z`] = lerp(T[`${p}z`], g[2], k);
  T[`${p}tw`] = lerp(T[`${p}tw`], g[3] * s, k);
  T[`${p}el`] = lerp(T[`${p}el`], g[4], k);
}

export class MotionTrack {
  /**
   * cfg: { pos, rotY, anim } do roteiro
   * ctx: { dur, seed, camAt(t) -> [x,y,z] mundo, focus: [x,y,z] | null, mouth(t) -> 0..1, speaking(t) -> bool }
   */
  constructor(cfg, ctx) {
    this.cfg = cfg;
    this.ctx = ctx;
    this.anim = cfg.anim ?? 'idle';
    this.px = cfg.pos?.[0] ?? -0.5;
    this.pz = cfg.pos?.[2] ?? 0.6;
    this.rotY = cfg.rotY ?? 0.4;
    this.S = RIG.scale * (cfg.scale ?? 1);
    this.seed = ctx.seed ?? 1;
    this._schedules(Math.max(ctx.dur ?? 10, 1) + 3);
    // braço do lado da câmera: é o que aparece quando ele aponta ou apresenta algo
    const cam0 = ctx.camAt ? this._local(ctx.camAt(0), this.px, this.pz) : [1, 1, 5];
    this.near = cam0[0] < 0 ? 'R' : 'L';
    this.far = this.near === 'L' ? 'R' : 'L';
    // braço que apresenta/aponta: o do lado do alvo, que fica na borda da silhueta
    const f0 = ctx.focus ? this._local(ctx.focus, this.px, this.pz) : null;
    this.present = f0 ? (f0[0] >= 0 ? 'L' : 'R') : this.near;
    this.other = this.present === 'L' ? 'R' : 'L';
    this.N = CHANNELS.length;
    this.buf = new Float32Array(this.N * 1024);
    this.n = 0;
    this.x = new Float64Array(this.N);
    this.v = new Float64Array(this.N);
    this.ts = new Float64Array(this.N);
    this.ease = CHANNELS.map((k) => (EASE_IN[k] ? 1 - Math.exp(-DT / EASE_IN[k]) : 1));
    this.prev = { jump: 0, jumpV: 0, hpV: 0, prV: 0, pyV: 0 };
    this.out = {};
  }

  rnd(i, k = 0) { return hash(this.seed * 17.17 + i * 7.31 + k * 131.7); }

  _schedules(end) {
    const pick = (pool, i, prev) => { let g = pool[Math.floor(this.rnd(i, 1) * pool.length)]; if (g === prev) g = pool[(pool.indexOf(g) + 1) % pool.length]; return g; };
    const pool = this.anim === 'celebrate' ? HAPPY_POOL : TALK_POOL;
    this.gestures = [];
    for (let t = 0, i = 0, prev = ''; t < end; i++) {
      const d = 1.0 + this.rnd(i, 2) * 1.1;
      const g = pick(pool, i, prev);
      this.gestures.push({ t0: t, t1: t + d, g });
      prev = g; t += d;
    }
    this.blinks = [];
    for (let t = 0.5 + this.rnd(0, 3) * 1.5, i = 0; t < end; i++) {
      this.blinks.push(t);
      if (this.rnd(i, 4) < 0.25) this.blinks.push(t + 0.24);
      t += 2.0 + this.rnd(i, 5) * 2.6;
    }
    this.saccades = [];
    for (let t = 0, i = 0; t < end; i++) {
      this.saccades.push({ t, yaw: (this.rnd(i, 6) - 0.5) * 0.12, pitch: (this.rnd(i, 7) - 0.5) * 0.08 });
      t += 0.45 + this.rnd(i, 8) * 1.3;
    }
    this.sways = [];
    for (let t = 0, i = 0, s = this.rnd(0, 9) > 0.5 ? 1 : -1; t < end; i++, s = -s) {
      this.sways.push({ t, v: s * (0.018 + this.rnd(i, 10) * 0.02) });
      t += 2.0 + this.rnd(i, 11) * 1.8;
    }
    this.twitches = [];
    for (let t = 1.5 + this.rnd(0, 12) * 2, i = 0; t < end; i++) {
      this.twitches.push({ t, ear: this.rnd(i, 13) > 0.5 ? 'earL' : 'earR' });
      t += 3 + this.rnd(i, 14) * 4;
    }
  }

  _at(list, t) { let r = list[0]; for (const e of list) { if (e.t > t) break; r = e; } return r; }
  _gesture(t) { for (const g of this.gestures) if (t >= g.t0 && t < g.t1) return g; return this.gestures[this.gestures.length - 1]; }

  /** Converte um ponto do mundo para o espaço local do Nibble. */
  _local(w, x, z) {
    const dx = w[0] - x, dy = w[1], dz = w[2] - z;
    const c = Math.cos(this.rotY), s = Math.sin(this.rotY);
    return [(dx * c - dz * s) / this.S, dy / this.S, (dx * s + dz * c) / this.S];
  }

  _blink(t) {
    let b = 0;
    for (const tb of this.blinks) {
      const u = t - tb;
      if (u < 0) break;
      if (u < 0.06) b = Math.max(b, smooth(u / 0.06));
      else if (u < 0.17) b = Math.max(b, 1 - smooth((u - 0.06) / 0.11));
    }
    return b;
  }

  /** Alvos (T) e valores diretos (Q) no tempo t. Função pura. */
  pose(t) {
    const { ctx, anim } = this;
    const mouth = ctx.mouth ? ctx.mouth(t) : 0;
    const speaking = ctx.speaking ? ctx.speaking(t) : false;
    const T = {
      pelvisPitch: 0, pelvisRoll: this._at(this.sways, t).v, pelvisYaw: 0,
      headYaw: 0, headPitch: 0, headRoll: 0,
      aLx: REST[0], aLy: REST[1], aLz: REST[2], aLtw: 0, aLel: REST[4],
      aRx: -REST[0], aRy: REST[1], aRz: REST[2], aRtw: 0, aRel: REST[4],
      browL: 0, browR: 0, browTilt: 0, lid: 0.94, lower: 0.2, pupil: 1.05, jaw: mouth,
      squash: 1 + 0.012 * Math.sin((t / 3.3) * Math.PI * 2), earL: 0, earR: 0, tail: 0,
      glow: 0.85 + 0.25 * Math.sin(t * 2.2) + 0.9 * mouth,
    };
    const sac = this._at(this.saccades, t);
    const Q = { x: this.px, z: this.pz, rotY: this.rotY, S: this.S, jump: 0, curl: 0, spin: 0, blink: this._blink(t), sacYaw: sac.yaw, sacPitch: sac.pitch };

    // Truque de câmera: o objeto costuma ficar atrás do Nibble (ele está mais perto da lente).
    // Apontar/olhar para trás esconderia o braço e encurtaria o focinho, então o alvo
    // é trazido para a frente do rosto: na tela a direção continua a mesma.
    let focusL = ctx.focus ? this._local(ctx.focus, Q.x, Q.z) : null;
    if (focusL) focusL = [focusL[0], focusL[1], Math.max(focusL[2], 0.55)];
    let look = 'camera';

    // Camada de fala: gestos sorteados enquanto há narração
    const talk = (k = 1, pool = null) => {
      const g = this._gesture(t);
      const name = speaking ? g.g : 'rest';
      const G = GESTURES[name];
      const beat = mouth * 0.32;
      // gestos são escritos para o braço esquerdo apresentar; espelha se a câmera está do outro lado
      const near = G.L, far = G.R, bNear = G.beat?.includes('L'), bFar = G.beat?.includes('R');
      const withBeat = (g, b) => (b ? [g[0], g[1] + beat * 0.5, g[2], g[3], g[4] + beat] : g);
      setArm(T, this.present, withBeat(near, bNear), k);
      setArm(T, this.other, withBeat(far, bFar), k);
      T.pelvisPitch += (G.lean ?? 0) * k;
      T.pelvisRoll += (G.sway ?? 0) * k;
      T.headRoll += (G.headRoll ?? 0) * k;
      T.browL += ((G.brow ?? 0) + 0.012 * mouth) * k;
      T.browR += ((G.brow ?? 0) + 0.012 * mouth) * k;
      T.headPitch += 0.04 * mouth * k;
      if (G.glance && focusL && t - g.t0 < 0.9) look = 'focus';
    };

    switch (anim) {
      case 'talk': talk(); break;

      case 'idle': {
        const phase = Math.floor(t / 3.2);
        look = this.rnd(phase, 20) > 0.55 ? 'wander' : 'camera';
        T.lid = 0.92; T.lower = 0.3; T.browL = T.browR = 0.006;
        talk(speaking ? 0.6 : 0);
        break;
      }

      case 'point': {
        const side = this.present;
        const anticip = t > 0.05 && t < 0.2;
        const pointing = t >= 0.2 && t < 3.4;
        if (anticip) { setArm(T, side, [0.45, -0.9, -0.25, 0, 0.7]); T.pelvisPitch = -0.04; }
        if (pointing && focusL) {
          const s = side === 'L' ? 1 : -1;
          const sh = [RIG.shoulder[0] * s, RIG.shoulder[1], RIG.shoulder[2]];
          T.pelvisYaw = 0.1 * Math.atan2(focusL[0], focusL[2]);
          // direção no espaço do Nibble, puxada para a câmera para o braço não sumir atrás do corpo
          let d = [focusL[0] - sh[0], focusL[1] - sh[1], focusL[2] - sh[2] + 0.45];
          const n = Math.hypot(...d) || 1; d = d.map((v) => v / n);
          // para o espaço do tronco (que gira junto com a bacia)
          const yawT = T.pelvisYaw + clamp(0.2 * Math.atan2(focusL[0], focusL[2] - RIG.headPivot[2]), -0.25, 0.25);
          const c = Math.cos(yawT), sn = Math.sin(yawT);
          d = [d[0] * c - d[2] * sn, d[1], d[0] * sn + d[2] * c];
          const p = `a${side}`;
          T[`${p}x`] = d[0]; T[`${p}y`] = d[1]; T[`${p}z`] = d[2]; T[`${p}tw`] = 0; T[`${p}el`] = 0.08 + mouth * 0.15;
          setArm(T, this.other, [0.3, -0.95, 0.3, 0, 0.75]);
          T.pelvisPitch = 0.05;
          T.browL = T.browR = 0.015;
          // olha para o objeto, depois volta para quem está assistindo
          look = t < 1.3 || (t > 2.4 && t < 2.9) ? 'focus' : 'camera';
        }
        if (t >= 3.4) { talk(); if (this.rnd(Math.floor(t / 2), 21) > 0.6 && focusL) look = 'focus'; }
        T.glow += 0.3;
        break;
      }

      case 'think': {
        setArm(T, this.near, [-0.22, 0.0, 1, 0, 2.15]);  // mão sob o focinho
        setArm(T, this.far, [0.14, -0.78, 0.85, -0.9, 1.7]); // braço cruzado na barriga
        T.headRoll = 0.17 + 0.03 * Math.sin(t * 1.3);
        T.browL = 0.03; T.browR = -0.006; T.browTilt = 0.15; T.lid = 0.8;
        T.earL = 0.22;
        T.tail = 0.14 * Math.max(0, Math.sin(t * Math.PI * 2 * 1.4)) ** 2;
        T.glow = 0.7 + 1.1 * Math.max(0, Math.sin(t * 7.5)) ** 6;
        T.pelvisRoll += 0.02 * Math.sin(t * 0.9);
        look = speaking && Math.floor(t / 1.8) % 2 === 1 ? 'camera' : 'thought';
        if (speaking) { T[`a${this.near}el`] += mouth * 0.15; T.headPitch += 0.03 * mouth; }
        break;
      }

      case 'shock': {
        Q.jump = hop(t, 0.16, 0.38, 0.17);
        if (t >= 0.06 && t < 1.4) {
          setArm(T, 'L', [0.95, 0.4, 0.35, 1.3, 1.25]);
          setArm(T, 'R', [0.95, 0.4, 0.35, 1.3, 1.25]);
          T.pelvisPitch = -0.17; T.headPitch = -0.12;
          T.earL = T.earR = -0.45;
        } else if (t >= 1.4 && t < 2.4) {
          setArm(T, 'L', [0.75, -0.3, 0.55, 0.6, 1.0]);
          setArm(T, 'R', [0.75, -0.3, 0.55, 0.6, 1.0]);
          T.pelvisPitch = -0.05;
        } else if (t >= 2.4) talk();
        T.browL = T.browR = t < 2.5 ? 0.04 : 0.018;
        T.lid = t < 1.6 ? 1.25 : 1.06;
        T.pupil = t < 1.2 ? 0.55 : 0.85;
        T.glow = 1 + 3 * Math.exp(-t * 2.5) * step(t, 0.06);
        break;
      }

      case 'celebrate': {
        Q.jump = hop(t, 0.22, 0.34, 0.13) + hop(t, 0.78, 0.34, 0.13) + hop(t, 1.34, 0.38, 0.15);
        if (t < 1.6) {
          const w = Math.sin(t * 15);
          setArm(T, 'L', [0.55, 0.95, 0.15, 0.4, 0.45 + 0.3 * w]);
          setArm(T, 'R', [0.55, 0.95, 0.15, 0.4, 0.45 - 0.3 * w]);
          T.pelvisRoll += 0.06 * Math.sin(t * 5.5);
          T.headRoll = 0.08 * Math.sin(t * 5.5 + 0.6);
        } else talk();
        T.lower = 0.85; T.browL = T.browR = 0.022; T.lid = 1.05;
        T.jaw = Math.max(mouth, speaking ? 0 : 0.35);
        T.glow = 1.6 + 0.9 * Math.max(0, Math.sin(t * 9));
        break;
      }

      case 'wave': {
        if (t < 2.6) {
          setArm(T, this.near, [0.62, 0.82, 0.35, 1.3, 0.85 + 0.45 * Math.sin(t * Math.PI * 2 * 2.3)]);
          T.headRoll = -0.1; T.lower = 0.5; T.pelvisRoll += 0.03;
        } else talk();
        T.browL = T.browR = 0.02;
        break;
      }

      case 'roll_in': {
        const u = clamp01(t / 0.8);
        Q.x = this.px - 2.4 * (1 - easeOutCubic(u));
        Q.curl = t < 0.8 ? 1 : 1 - smooth((t - 0.8) / 0.32);
        Q.spin = -(Q.x - this.px) / RIG.ballR;
        Q.jump = hop(t, 0.86, 0.4, 0.15);
        if (t >= 1.0 && t < 1.9) {
          setArm(T, 'L', [0.75, 0.45, 0.45, 0.8, 0.5]);
          setArm(T, 'R', [0.75, 0.45, 0.45, 0.8, 0.5]);
          T.lower = 0.45; T.browL = T.browR = 0.025;
        } else if (t >= 1.9) talk();
        T.glow = t < 1.1 ? 2.2 : T.glow;
        break;
      }

      default: talk(speaking ? 1 : 0);
    }

    // Para onde olhar (o roteiro pode fixar com nibble.look)
    if (this.cfg.look === 'camera' || (this.cfg.look === 'focus' && focusL)) look = this.cfg.look;
    let L;
    if (look === 'focus' && focusL) L = focusL;
    else if (look === 'thought') L = [-0.9, 1.35, 1.1];
    else if (look === 'wander') L = focusL ?? [0.9 * (this.rnd(Math.floor(t / 3.2), 22) - 0.5), 1.05, 1.5];
    else L = ctx.camAt ? this._local(ctx.camAt(t), Q.x, Q.z) : [0, 1.0, 5];
    const hp = RIG.headPivot;
    const dx = L[0] - hp[0], dy = L[1] - hp[1], dz = L[2] - hp[2];
    Q.lookYaw = clamp(Math.atan2(dx, dz), -1.2, 1.2);
    Q.lookElev = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.45, 0.55);
    // cabeça vira só metade: o olho completa. Mantém o focinho em 3/4, que é o que lê "tatu".
    T.pelvisYaw += clamp(0.2 * Q.lookYaw, -0.25, 0.25);
    T.headYaw += clamp(0.5 * Q.lookYaw, -0.7, 0.7);
    T.headPitch += -0.8 * Q.lookElev;

    // achata agachado/ao pousar, estica no ar (puro, sem impulso)
    T.squash += Q.jump < 0 ? Q.jump * 1.6 : Q.jump * 0.35;

    // Enrolar: corpo se curva e cabeça entra antes de virar bola
    if (Q.curl > 0) {
      T.pelvisPitch += Q.curl * 1.1;
      T.headPitch += Q.curl * 1.0;
    }
    return { T, Q };
  }

  _step() {
    const { T, Q } = this.pose(this.n * DT);
    const x = this.x, v = this.v;
    if (this.n === 0) {
      CHANNELS.forEach((k, i) => { x[i] = T[k]; v[i] = 0; this.ts[i] = T[k]; });
      this.prev.jump = Q.jump;
    } else {
      // impulsos de ação secundária (orelhas, cauda, achatamento ao pousar)
      const jumpV = (Q.jump - this.prev.jump) / DT;
      const dJumpV = jumpV - this.prev.jumpV;
      const hpV = v[CI.headPitch], prV = v[CI.pelvisRoll], pyV = v[CI.pelvisYaw];
      v[CI.earL] += -3.2 * dJumpV - 1.1 * (hpV - this.prev.hpV);
      v[CI.earR] += -3.2 * dJumpV - 1.1 * (hpV - this.prev.hpV);
      v[CI.tail] += -1.6 * (prV - this.prev.prV) - 1.0 * (pyV - this.prev.pyV) + 1.2 * dJumpV;
      // contração de orelha: força espalhada em 80 ms (impulso instantâneo vira salto a 60 fps)
      const now = this.n * DT;
      for (const tw of this.twitches) if (now >= tw.t && now < tw.t + 0.08) v[CI[tw.ear]] -= 4.5 * DT / 0.08;
      this.prev = { jump: Q.jump, jumpV, hpV, prV, pyV };

      for (let i = 0; i < this.N; i++) {
        const [w, z] = SPRING[CHANNELS[i]];
        const ts = (this.ts[i] += (T[CHANNELS[i]] - this.ts[i]) * this.ease[i]);
        v[i] += (w * w * (ts - x[i]) - 2 * z * w * v[i]) * DT;
        x[i] += v[i] * DT;
      }
    }
    if ((this.n + 1) * this.N > this.buf.length) {
      const nb = new Float32Array(this.buf.length * 2); nb.set(this.buf); this.buf = nb;
    }
    this.buf.set(x, this.n * this.N);
    this.n++;
  }

  /** Estado das molas (interpolado) e valores diretos no tempo t. */
  sample(t) {
    t = Math.max(0, t);
    const k = t * HZ, i = Math.floor(k), f = k - i;
    while (this.n <= i + 1) this._step();
    const a = i * this.N, b = a + this.N, o = this.out;
    for (let c = 0; c < this.N; c++) o[CHANNELS[c]] = this.buf[a + c] + (this.buf[b + c] - this.buf[a + c]) * f;
    return { S: o, Q: this.pose(t).Q };
  }
}
