import * as THREE from 'three';
import { smooth, lerp } from '../util.js';
import {
  HEAD_H1, hexScutes, slatScutes, headGeometry, paintHead, headFrame, headPoint, shieldGeometry, shieldOutline,
  shellSlice, sliceOutline, latitudeCurve, torsoGeometry,
} from './geometry.js';
import { MotionTrack, RIG } from './motion.js';

const COLORS = {
  shell: 0x2f3947, copper: 0xc27237, amber: 0xffb020, cyan: 0x38d6ff,
  skin: 0x8c7d74, belly: 0xa99a8e, snout: 0x9c7b73, chin: 0xa69488,
  earIn: 0x5e4744, nose: 0x1d1416, claw: 0xeee4d2, mouth: 0x3b1418, liner: 0x1a1d24, cloth: 0x1f2937,
};

const LOWER_CAP = 1.15;
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1), DOWN = new THREE.Vector3(0, -1, 0);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();

const SEGMENTS = [
  { t0: 0.26, t1: 1.03, kind: 'shield', inf: 1.045, rep: [2.2, 0.8] },
  { t0: 0.99, t1: 1.3, kind: 'band', inf: 1.035, rep: [3, 1] },
  { t0: 1.26, t1: 1.57, kind: 'band', inf: 1.025, rep: [3, 1], seam: true },
  { t0: 1.53, t1: 1.84, kind: 'band', inf: 1.015, rep: [3, 1] },
  { t0: 1.8, t1: 2.62, kind: 'shield', inf: 1.005, rep: [2.8, 0.85] },
];

function mesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

function basis(x, y, z) {
  return new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(x, y, z));
}

/** Olho com íris desenhada no shader: o globo gira para olhar, a pupila dilata por uniform. */
function eyeMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04 });
  const u = {
    uIris: { value: 0.5 }, uPupil: { value: 0.21 }, uGlow: { value: 0.4 },
    uIrisA: { value: new THREE.Color(0xffc640) }, uIrisB: { value: new THREE.Color(0x9a3c08) },
  };
  m.userData.u = u;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEyeP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEyeP = position;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEyeP;\nuniform float uIris, uPupil, uGlow;\nuniform vec3 uIrisA, uIrisB;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 ed = normalize(vEyeP);
        float ea = acos(clamp(ed.z, -1.0, 1.0));
        float aa = max(fwidth(ea) * 1.2, 0.004);
        float irisM = 1.0 - smoothstep(uIris - aa, uIris + aa, ea);
        float pupM = 1.0 - smoothstep(uPupil - aa, uPupil + aa, ea);
        float rr = ea / uIris;
        float ang = atan(ed.y, ed.x);
        float stri = 0.86 + 0.14 * sin(ang * 21.0) * sin(ang * 6.0 + 1.3);
        vec3 irisCol = mix(uIrisA, uIrisB, smoothstep(0.3, 1.0, rr)) * stri;
        irisCol *= 1.0 - 0.6 * smoothstep(0.86, 1.0, rr);
        vec3 sclera = vec3(0.93, 0.94, 0.96) * (1.0 - 0.22 * smoothstep(0.9, 1.7, ea));
        vec3 eyeCol = mix(sclera, irisCol, irisM);
        eyeCol = mix(eyeCol, vec3(0.012), pupM);
        diffuseColor.rgb = eyeCol;
        float eyeGlowM = irisM * (1.0 - pupM);`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += irisCol * eyeGlowM * uGlow;');
  };
  m.customProgramCacheKey = () => 'cz-eye-v1';
  return m;
}

/**
 * Nibble, o tatu-bola. Em pé, carapaça de cinco segmentos nas costas
 * (escudo, três bandas de cobre, escudo), a banda do meio com um filete âmbar aceso.
 */
export class Nibble {
  constructor() {
    this.tracks = new Map();
    this._materials();
    this.root = new THREE.Group();
    this.roll = new THREE.Group();
    this.root.add(this.roll);
    this.pelvis = new THREE.Group();
    this.pelvis.position.y = -RIG.pelvisDrop;
    this.pelvis.rotation.order = 'YXZ';
    this.roll.add(this.pelvis);
    this.torso = new THREE.Group();
    this.torso.position.y = RIG.pelvisDrop;
    this.pelvis.add(this.torso);

    this._body();
    this._shell();
    this._head();
    this._arms();
    this._legs();
    this._tail();
    this._ball();
    this._outfits();
    this.setOutfit('none');
  }

  _materials() {
    const hex = hexScutes(), slat = slatScutes();
    this.tex = { hex, slat };
    const phys = (o) => new THREE.MeshPhysicalMaterial(o);
    this.m = {
      skin: phys({ color: 0xffffff, vertexColors: true, roughness: 0.68, sheen: 0.6, sheenColor: 0xd9c8bd, sheenRoughness: 0.55 }),
      skinFlat: phys({ color: COLORS.skin, roughness: 0.68, sheen: 0.6, sheenColor: 0xd9c8bd, sheenRoughness: 0.55 }),
      lid: phys({ color: COLORS.skin, roughness: 0.62, sheen: 0.5, sheenColor: 0xd9c8bd, side: THREE.DoubleSide }),
      earIn: phys({ color: COLORS.earIn, roughness: 0.75, sheen: 0.4, sheenColor: 0xffd0c8 }),
      shellPlain: phys({ color: COLORS.shell, roughness: 0.42, metalness: 0.15, clearcoat: 0.7, clearcoatRoughness: 0.3 }),
      copperPlain: phys({ color: COLORS.copper, roughness: 0.34, metalness: 0.9, clearcoat: 0.35, clearcoatRoughness: 0.25 }),
      seam: new THREE.MeshStandardMaterial({ color: 0x2a1500, emissive: COLORS.amber, emissiveIntensity: 2.2, roughness: 0.4 }),
      eye: eyeMaterial(),
      highlight: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      liner: phys({ color: COLORS.liner, roughness: 0.45, clearcoat: 0.6 }),
      nose: phys({ color: COLORS.nose, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 }),
      claw: phys({ color: COLORS.claw, roughness: 0.35, clearcoat: 0.6 }),
      mouth: phys({ color: COLORS.mouth, roughness: 0.6 }),
      cloth: phys({ color: COLORS.cloth, roughness: 0.92, sheen: 0.8, sheenColor: 0x6b7a90 }),
      strap: new THREE.MeshStandardMaterial({ color: 0x0a2530, emissive: COLORS.cyan, emissiveIntensity: 1.3, roughness: 0.4 }),
      lens: new THREE.MeshPhysicalMaterial({ color: 0x9fe8ff, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.5, emissive: COLORS.cyan, emissiveIntensity: 0.25 }),
    };
  }

  _scuteMat(kind, rep) {
    const src = kind === 'band' ? this.tex.slat : this.tex.hex;
    const map = src.color.clone(), bump = src.bump.clone();
    for (const t of [map, bump]) { t.repeat.set(...rep); t.needsUpdate = true; }
    const base = kind === 'band'
      ? { color: COLORS.copper, roughness: 0.42, metalness: 0.78, clearcoat: 0.3, clearcoatRoughness: 0.3 }
      : { color: COLORS.shell, roughness: 0.44, metalness: 0.12, clearcoat: 0.75, clearcoatRoughness: 0.32 };
    return new THREE.MeshPhysicalMaterial({ ...base, map, bumpMap: bump, bumpScale: kind === 'band' ? 1.6 : 2.0, side: THREE.DoubleSide });
  }

  _body() {
    this.core = mesh(torsoGeometry([0.33, 0.405, 0.31], COLORS.skin, COLORS.belly), this.m.skin);
    this.torso.add(this.core);
  }

  _shell() {
    this.shell = new THREE.Group();
    this.seams = [];
    for (const s of SEGMENTS) {
      this.shell.add(mesh(shellSlice(s.t0, s.t1, s.inf), this._scuteMat(s.kind, s.rep)));
      const rimMat = s.kind === 'band' ? this.m.copperPlain : this.m.shellPlain;
      this.shell.add(mesh(new THREE.TubeGeometry(sliceOutline(s.t0, s.t1, s.inf), 260, 0.0105, 8, true), rimMat));
      if (s.seam) {
        const seam = mesh(new THREE.TubeGeometry(latitudeCurve((s.t0 + s.t1) / 2, s.inf + 0.022), 140, 0.0125, 10, false), this.m.seam, false);
        this.shell.add(seam);
      }
    }
    this.torso.add(this.shell);
  }

  _head() {
    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.31, 0.09);
    this.neck.rotation.order = 'YXZ';
    this.torso.add(this.neck);
    this.head = new THREE.Group();
    this.head.position.set(0, 0.16, 0.04);
    this.head.scale.setScalar(1.1);
    this.neck.add(this.head);

    this.head.add(mesh(paintHead(headGeometry(), COLORS.skin, COLORS.snout, COLORS.chin), this.m.skin));
    this.head.add(mesh(shieldGeometry(), this._scuteMat('shield', [1.0, 1.5])));
    this.head.add(mesh(new THREE.TubeGeometry(shieldOutline(), 220, 0.0095, 8, true), this.m.shellPlain));

    // nariz
    const tz = HEAD_H1 - 0.012, tip = headPoint(tz, 0);
    const nose = mesh(new THREE.SphereGeometry(1, 28, 20), this.m.nose);
    nose.scale.set(0.042, 0.031, 0.024);
    nose.position.set(0, tip[1] - 0.004, tz - 0.004);
    nose.rotation.x = 0.35;
    this.head.add(nose);
    for (const s of [-1, 1]) {
      const n = mesh(new THREE.SphereGeometry(0.0072, 12, 8), this.m.mouth, false);
      n.position.set(s * 0.016, tip[1] - 0.012, tz + 0.016);
      n.scale.set(1, 0.7, 0.5);
      this.head.add(n);
    }

    // boca: um sorriso fechado que abre em oval quando fala
    const mf = headFrame(HEAD_H1 - 0.05, Math.PI, 0.003);
    this.mouth = new THREE.Group();
    this.mouth.position.copy(mf.pos);
    const mz = mf.normal.clone().multiplyScalar(0.55).add(new THREE.Vector3(0, 0, 0.45)).normalize();
    const mx = new THREE.Vector3(1, 0, 0), my = new THREE.Vector3().crossVectors(mz, mx).normalize();
    this.mouth.quaternion.copy(basis(mx, my, mz));
    this.smile = mesh(new THREE.TorusGeometry(0.022, 0.0045, 8, 24, Math.PI * 0.75), this.m.liner, false);
    this.smile.rotation.z = Math.PI + Math.PI * 0.125;
    this.smile.position.y = 0.012;
    this.mouthOpen = mesh(new THREE.SphereGeometry(1, 20, 14), this.m.mouth, false);
    this.mouthOpen.scale.set(0.02, 0.001, 0.008);
    this.mouth.add(this.smile, this.mouthOpen);
    this.head.add(this.mouth);

    // olhos
    this.eyes = [-1, 1].map((s) => {
      const f = headFrame(0.085, s * 0.86, -0.046);
      const g = new THREE.Group();
      g.position.copy(f.pos);
      const fwd = f.normal.clone().multiplyScalar(0.3).add(new THREE.Vector3(0, 0.02, 0.7)).normalize();
      const ex = new THREE.Vector3().crossVectors(Y, fwd).normalize();
      const ey = new THREE.Vector3().crossVectors(fwd, ex).normalize();
      g.quaternion.copy(basis(ex, ey, fwd));
      const R = 0.08;
      const ball = mesh(new THREE.SphereGeometry(R, 48, 32), this.m.eye, false);
      g.add(ball);
      for (const [p, r] of [[[0.36, 0.44, 0.82], 0.013], [[-0.28, -0.3, 0.91], 0.0065]]) {
        const h = mesh(new THREE.SphereGeometry(r, 12, 8), this.m.highlight, false);
        h.position.copy(new THREE.Vector3(...p).normalize().multiplyScalar(R * 1.012));
        g.add(h);
      }
      const upper = new THREE.Group();
      upper.add(mesh(new THREE.SphereGeometry(R * 1.07, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), this.m.lid, false));
      const liner = mesh(new THREE.TorusGeometry(R * 1.07, 0.0085, 8, 48), this.m.liner, false);
      liner.rotation.x = Math.PI / 2;
      upper.add(liner);
      // pálpebra de baixo: calota menor que meia esfera. Inclinada para a frente,
      // a borda vira um arco para cima: o olho sorridente (^^).
      const lower = new THREE.Group();
      lower.add(mesh(new THREE.SphereGeometry(R * 1.06, 40, 16, 0, Math.PI * 2, Math.PI - LOWER_CAP, LOWER_CAP), this.m.lid, false));
      const lrim = mesh(new THREE.TorusGeometry(R * 1.06 * Math.sin(LOWER_CAP), 0.0065, 8, 48), this.m.skinFlat, false);
      lrim.rotation.x = Math.PI / 2;
      lrim.position.y = -R * 1.06 * Math.cos(LOWER_CAP);
      lower.add(lrim);
      upper.rotation.order = lower.rotation.order = 'ZXY';
      g.add(upper, lower);
      this.head.add(g);
      return { g, ball, upper, lower, s, inv: g.quaternion.clone().invert() };
    });

    // sobrancelhas: duas plaquinhas da armadura
    this.brows = [-1, 1].map((s) => {
      const f = headFrame(0.112, s * 0.62, 0.012);
      const b = mesh(new THREE.CapsuleGeometry(0.0115, 0.048, 4, 12), this.m.shellPlain);
      const by = f.tPsi.clone().multiplyScalar(s).normalize();
      const bz = f.normal.clone();
      const bx = new THREE.Vector3().crossVectors(by, bz).normalize();
      b.quaternion.copy(basis(bx, by, bz));
      b.position.copy(f.pos);
      this.head.add(b);
      return { b, s, base: f.pos.clone(), q: b.quaternion.clone(), n: f.normal.clone() };
    });

    // orelhas
    this.ears = [-1, 1].map((s) => {
      const f = headFrame(-0.14, s * 1.0, -0.012);
      const pivot = new THREE.Group();
      pivot.position.copy(f.pos);
      const up = f.normal.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, 0.95, -0.2)).normalize();
      const face = new THREE.Vector3(s * 0.55, 0, 1).normalize();
      const ex = new THREE.Vector3().crossVectors(up, face).normalize();
      const ez = new THREE.Vector3().crossVectors(ex, up).normalize();
      pivot.quaternion.copy(basis(ex, up, ez));
      const flop = new THREE.Group();
      const leaf = mesh(new THREE.SphereGeometry(1, 28, 20), this.m.skinFlat);
      leaf.scale.set(0.05, 0.1, 0.022);
      leaf.position.y = 0.082;
      const inner = mesh(new THREE.SphereGeometry(1, 24, 16), this.m.earIn, false);
      inner.scale.set(0.031, 0.07, 0.01);
      inner.position.set(0, 0.088, 0.014);
      flop.add(leaf, inner);
      pivot.add(flop);
      this.head.add(pivot);
      return flop;
    });
  }

  _arms() {
    this.arms = [-1, 1].map((s) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * RIG.shoulder[0], RIG.shoulder[1] - RIG.ride, RIG.shoulder[2]);
      const upper = mesh(new THREE.CapsuleGeometry(0.05, 0.11, 6, 16), this.m.skinFlat);
      upper.position.y = -0.078;
      const elbow = new THREE.Group();
      elbow.position.y = -0.158;
      const fore = mesh(new THREE.CapsuleGeometry(0.046, 0.09, 6, 16), this.m.skinFlat);
      fore.position.y = -0.068;
      const hand = new THREE.Group();
      hand.position.y = -0.145;
      const palm = mesh(new THREE.SphereGeometry(0.054, 20, 16), this.m.skinFlat);
      palm.scale.set(1, 0.85, 0.92);
      hand.add(palm);
      for (const k of [-1, 0, 1]) {
        const c = mesh(new THREE.ConeGeometry(0.0115, 0.055, 10), this.m.claw);
        c.position.set(k * 0.026, -0.05, 0.016);
        c.rotation.set(Math.PI + 0.35, 0, k * 0.15);
        hand.add(c);
      }
      elbow.add(fore, hand);
      shoulder.add(upper, elbow);
      this.torso.add(shoulder);
      return { shoulder, elbow, s };
    });
  }

  _legs() {
    this.legs = [-1, 1].map((s) => {
      const leg = mesh(new THREE.CylinderGeometry(0.074, 0.07, 1, 18), this.m.skinFlat);
      const foot = new THREE.Group();
      const sole = mesh(new THREE.SphereGeometry(1, 24, 16), this.m.skinFlat);
      sole.scale.set(0.085, 0.05, 0.12);
      foot.add(sole);
      for (const k of [-1, 0, 1]) {
        const c = mesh(new THREE.ConeGeometry(0.012, 0.05, 10), this.m.claw);
        c.position.set(k * 0.03, -0.01, 0.115);
        c.rotation.set(Math.PI / 2 + 0.25, 0, 0);
        foot.add(c);
      }
      this.root.add(leg, foot);
      return { leg, foot, s, hip: new THREE.Vector3(s * 0.15, -0.31, 0.06) };
    });
  }

  _tail() {
    this.tail = new THREE.Group();
    this.tail.position.set(0, -0.28, -0.25);
    this.tail.rotation.order = 'YXZ';
    let parent = this.tail;
    const N = 6;
    for (let i = 0; i < N; i++) {
      const r0 = lerp(0.062, 0.02, i / N), r1 = lerp(0.062, 0.02, (i + 1) / N), len = 0.068;
      const seg = new THREE.Group();
      if (i > 0) { seg.position.z = -len; seg.rotation.x = 0.11; }
      const cyl = mesh(new THREE.CylinderGeometry(r1, r0, len, 16), i % 2 ? this.m.shellPlain : this.m.copperPlain);
      cyl.rotation.x = -Math.PI / 2;
      cyl.position.z = -len / 2;
      seg.add(cyl);
      const lip = mesh(new THREE.TorusGeometry(r0, 0.007, 6, 18), this.m.shellPlain);
      seg.add(lip);
      parent.add(seg);
      parent = seg;
    }
    const tip = mesh(new THREE.SphereGeometry(0.02, 12, 8), this.m.shellPlain);
    tip.position.z = -0.068;
    parent.add(tip);
    this.torso.add(this.tail);
  }

  _ball() {
    // bola: as bandas viram meridianos em volta do eixo X, então o giro (em Z) aparece
    this.ball = new THREE.Group();
    const R = RIG.ballR;
    this.ball.add(mesh(new THREE.SphereGeometry(R, 64, 48), this._scuteMat('shield', [4, 2])));
    for (const [t0, t1, seam] of [[1.02, 1.3, false], [1.43, 1.71, true], [1.84, 2.12, false]]) {
      const g = new THREE.SphereGeometry(R * 1.025, 72, 8, 0, Math.PI * 2, t0, t1 - t0);
      g.rotateZ(-Math.PI / 2);
      this.ball.add(mesh(g, this._scuteMat('band', [5, 1])));
      if (seam) {
        const ring = mesh(new THREE.TorusGeometry(R * 1.04 * Math.sin((t0 + t1) / 2), 0.013, 10, 96), this.m.seam, false);
        ring.rotation.y = Math.PI / 2;
        ring.position.x = R * 1.04 * Math.cos((t0 + t1) / 2);
        this.ball.add(ring);
      }
    }
    this.ball.visible = false;
    this.roll.add(this.ball);
  }

  _outfits() {
    const esd = new THREE.Group();
    const band = mesh(new THREE.TorusGeometry(0.05, 0.013, 10, 28), this.m.strap, false);
    band.rotation.x = Math.PI / 2;
    band.position.y = -0.09;
    esd.add(band);
    this.arms[1].elbow.add(esd);

    const goggles = new THREE.Group();
    for (const s of [-1, 1]) {
      const f = headFrame(0.0, s * 0.38, 0.035);
      const g = new THREE.Group();
      g.position.copy(f.pos);
      g.quaternion.setFromUnitVectors(Z, f.normal);
      const ring = mesh(new THREE.TorusGeometry(0.052, 0.013, 10, 28), this.m.copperPlain);
      const lens = mesh(new THREE.CircleGeometry(0.05, 28), this.m.lens, false);
      lens.position.z = 0.004;
      g.add(ring, lens);
      goggles.add(g);
    }
    this.head.add(goggles);

    const hoodie = new THREE.Group();
    const cowl = mesh(new THREE.TorusGeometry(0.2, 0.055, 14, 40), this.m.cloth);
    cowl.rotation.x = Math.PI / 2 - 0.25;
    cowl.position.set(0, 0.33, 0.02);
    const hood = mesh(new THREE.SphereGeometry(0.2, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), this.m.cloth);
    hood.position.set(0, 0.3, -0.22);
    hood.rotation.x = -1.1;
    hood.scale.set(1.1, 0.8, 1);
    hoodie.add(cowl, hood);
    this.torso.add(hoodie);

    this.outfits = { esd, goggles, hoodie };
  }

  setOutfit(name) {
    for (const [k, g] of Object.entries(this.outfits)) g.visible = k === name;
  }

  /** Descarta as simulações em cache (chamar ao carregar outro episódio). */
  resetMotion() { this.tracks.clear(); }

  /**
   * @param lt  tempo local da cena
   * @param cfg bloco "nibble" do roteiro
   * @param ctx { key, seed, camAt(t), focus, mouth(t), speaking(t) }
   */
  update(lt, dur, cfg, ctx = {}) {
    const key = ctx.key ?? 'default';
    let track = this.tracks.get(key);
    if (!track) { track = new MotionTrack(cfg, { ...ctx, dur }); this.tracks.set(key, track); }
    const { S, Q } = track.sample(lt);

    const curl = Q.curl, standing = curl < 0.6;
    const limbs = Math.max(1e-4, 1 - smooth(curl / 0.6));
    this.root.position.set(Q.x, 0, Q.z);
    this.root.rotation.y = Q.rotY;
    this.root.scale.setScalar(Q.S);
    this.roll.position.y = lerp(RIG.ride, RIG.ballR, curl) + Q.jump;
    this.ball.visible = !standing;
    this.ball.rotation.z = Q.spin;
    this.pelvis.visible = standing;

    const sq = Math.max(0.7, S.squash);
    this.pelvis.rotation.set(S.pelvisPitch, S.pelvisYaw, S.pelvisRoll);
    this.pelvis.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    this.neck.rotation.set(S.headPitch, S.headYaw, S.headRoll);

    // braços: direção (mola por componente) + torção + cotovelo
    for (const a of this.arms) {
      const p = a.s > 0 ? 'aL' : 'aR';
      _v.set(S[`${p}x`], S[`${p}y`], S[`${p}z`]);
      if (_v.lengthSq() < 1e-6) _v.copy(DOWN);
      _v.normalize();
      if (_v.y > 0.985) _v.set(_v.x, 0.985, _v.z + 0.05).normalize();
      _q.setFromUnitVectors(DOWN, _v);
      _q2.setFromAxisAngle(Y, S[`${p}tw`]);
      a.shoulder.quaternion.copy(_q).multiply(_q2);
      a.elbow.rotation.x = -Math.max(0, S[`${p}el`]);
      a.shoulder.scale.setScalar(limbs);
    }

    // olhos: o globo aponta para o alvo; o que a cabeça não girou, o olho compensa
    const yaw = THREE.MathUtils.clamp(Q.lookYaw - (S.pelvisYaw + S.headYaw), -0.5, 0.5) + Q.sacYaw;
    const elev = THREE.MathUtils.clamp(Q.lookElev + S.headPitch + S.pelvisPitch * 0.5, -0.35, 0.35) + Q.sacPitch;
    _v.set(Math.sin(yaw) * Math.cos(elev), Math.sin(elev), Math.cos(yaw) * Math.cos(elev));
    const open = Math.max(0, S.lid) * (1 - Q.blink);
    const eLo = lerp(-0.86, -0.04, THREE.MathUtils.clamp(S.lower, 0, 1)) + 0.2 * elev;
    const eUp = Math.max(eLo + 0.03, lerp(-0.95, 0.62, Math.min(open, 1.3)) + 0.45 * elev);
    for (const e of this.eyes) {
      const d = _v.clone().applyQuaternion(e.inv);
      e.ball.quaternion.setFromUnitVectors(Z, d);
      e.upper.rotation.set(-eUp, 0, e.s * S.browTilt * 0.6);
      e.lower.rotation.set(-(eLo - LOWER_CAP + Math.PI / 2), 0, 0);
    }
    this.m.eye.userData.u.uPupil.value = 0.21 * THREE.MathUtils.clamp(S.pupil, 0.4, 1.4);
    this.m.eye.userData.u.uGlow.value = 0.3 + 0.12 * S.glow;

    for (const b of this.brows) {
      const raise = THREE.MathUtils.clamp(b.s > 0 ? S.browL : S.browR, -0.012, 0.026);
      b.b.position.copy(b.base).addScaledVector(Y, raise);
      _q.setFromAxisAngle(Z, b.s * (S.browTilt + (b.s > 0 ? 1 : -1) * 0));
      b.b.quaternion.copy(_q).multiply(b.q);
    }
    this.ears[0].rotation.x = S.earR;
    this.ears[1].rotation.x = S.earL;

    this.tail.rotation.set(-0.55 + S.tail, -S.pelvisRoll * 3, 0);
    this.tail.scale.setScalar(limbs);

    const jaw = THREE.MathUtils.clamp(S.jaw, 0, 1);
    this.mouthOpen.scale.y = 0.001 + 0.02 * jaw;
    this.mouthOpen.scale.x = 0.018 + 0.006 * jaw;
    this.smile.visible = jaw < 0.25;
    this.m.seam.emissiveIntensity = 2.2 * Math.max(0.3, S.glow);

    // pernas: ligam o quadril (que acompanha o corpo) ao pé (que fica no chão)
    this.root.updateMatrixWorld(true);
    for (const l of this.legs) {
      l.leg.visible = l.foot.visible = standing;
      if (!standing) continue;
      const hip = this.root.worldToLocal(this.torso.localToWorld(l.hip.clone()));
      const foot = new THREE.Vector3(l.s * 0.17, 0.05 + Math.max(0, Q.jump), 0.13);
      l.foot.position.copy(foot);
      l.foot.scale.setScalar(limbs);
      const d = hip.clone().sub(foot);
      const len = Math.max(0.01, d.length());
      l.leg.position.copy(foot).addScaledVector(d, 0.5);
      l.leg.quaternion.setFromUnitVectors(Y, d.normalize());
      l.leg.scale.set(limbs, len, limbs);
    }
  }
}
