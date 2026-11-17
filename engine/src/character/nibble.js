import * as THREE from 'three';
import { PALETTE, mat, metal, glow, mesh, lerp, smooth, ramp, hash, clamp01, easeOutBack } from '../util.js';

const BODY_R = 0.42;
const BODY_SCALE = [1.0, 1.0, 1.15];

/**
 * Nibble, o tatu-bola. Rig procedural: tudo é função do tempo da cena,
 * então qualquer quadro pode ser renderizado isoladamente.
 */
export class Nibble {
  constructor() {
    this.root = new THREE.Group();
    this.m = {
      body: mat(PALETTE.graphite, { roughness: 0.62 }),
      skin: mat(PALETTE.graphiteLight, { roughness: 0.7 }),
      snout: mat(PALETTE.snout, { roughness: 0.75 }),
      copper: metal(PALETTE.copper, { roughness: 0.38 }),
      band: new THREE.MeshStandardMaterial({ color: 0x3a2408, emissive: PALETTE.amber, emissiveIntensity: 2.2, roughness: 0.4 }),
      white: mat(0xd9dee6, { roughness: 0.3 }),
      iris: glow(PALETTE.amber, 0.9),
      dark: mat(0x0b0f16, { roughness: 0.3 }),
      claw: mat(0xe2e8f0, { roughness: 0.4 }),
      cloth: mat(0x1f2937, { roughness: 0.9 }),
      strap: glow(PALETTE.cyan, 1.2),
    };
    this._build();
    this.setOutfit('none');
  }

  _build() {
    const { m } = this;
    // roll: gira o corpo inteiro no modo bola; pivot no centro do corpo
    this.roll = new THREE.Group();
    this.roll.position.y = 0.5;
    this.root.add(this.roll);

    this.body = new THREE.Group();
    this.roll.add(this.body);

    const shell = mesh(new THREE.SphereGeometry(BODY_R, 48, 32), m.body, { scale: BODY_SCALE });
    this.shell = shell;
    this.body.add(shell);

    // barriga mais clara
    this.body.add(mesh(new THREE.SphereGeometry(BODY_R * 0.86, 32, 24), m.skin, { pos: [0, -0.1, 0.05], scale: [0.96, 0.86, 1.08] }));

    // três bandas da carapaça; a do meio é a assinatura âmbar
    this.bands = [];
    [-0.17, 0, 0.17].forEach((z, i) => {
      const k = Math.sqrt(1 - (z / (BODY_R * BODY_SCALE[2])) ** 2);
      const band = mesh(new THREE.TorusGeometry(BODY_R * k * 1.015, 0.046, 14, 72, Math.PI * 1.12), i === 1 ? m.band : m.copper,
        { pos: [0, 0, z], scale: [1, BODY_SCALE[1], 1], rot: [0, 0, -Math.PI * 0.06] });
      this.bands.push(band);
      this.body.add(band);
    });

    // cauda
    this.tail = mesh(new THREE.ConeGeometry(0.07, 0.3, 12), m.skin, { pos: [0, -0.12, -0.5], rot: [-1.9, 0, 0] });
    this.body.add(this.tail);

    // cabeça
    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.2, 0.4);
    this.body.add(this.neck);
    this.head = new THREE.Group();
    this.neck.add(this.head);

    this.head.add(mesh(new THREE.SphereGeometry(0.25, 40, 28), m.skin, { scale: [1, 0.95, 1.05] }));
    // placa da cabeça (escudo de cobre)
    this.head.add(mesh(new THREE.SphereGeometry(0.262, 40, 16, 0, Math.PI * 2, 0, 0.95), m.copper, { pos: [0, 0.004, 0.0], rot: [0.5, 0, 0], scale: [0.9, 1, 1.05] }));
    // focinho comprido
    this.head.add(mesh(new THREE.CylinderGeometry(0.058, 0.125, 0.38, 24), m.snout, { pos: [0, -0.075, 0.31], rot: [1.42, 0, 0] }));
    this.head.add(mesh(new THREE.SphereGeometry(0.06, 20, 16), m.snout, { pos: [0, -0.103, 0.495] }));
    this.head.add(mesh(new THREE.SphereGeometry(0.036, 16, 12), m.dark, { pos: [0, -0.085, 0.545], scale: [1.2, 0.8, 0.8] }));

    // orelhas
    this.ears = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(0.17 * s, 0.15, -0.07);
      const ear = mesh(new THREE.SphereGeometry(0.1, 20, 16), m.skin, { pos: [0, 0.12, 0], scale: [0.62, 1.35, 0.3] });
      const inner = mesh(new THREE.SphereGeometry(0.1, 20, 16), m.copper, { pos: [0, 0.115, 0.016], scale: [0.4, 1.05, 0.2] });
      pivot.add(ear, inner);
      pivot.rotation.z = -0.55 * s;
      this.head.add(pivot);
      return pivot;
    });

    // olhos
    this.eyes = [-1, 1].map((s) => {
      const eye = new THREE.Group();
      eye.position.set(0.108 * s, 0.045, 0.2);
      eye.rotation.y = 0.28 * s;
      eye.add(mesh(new THREE.SphereGeometry(0.078, 24, 20), m.white, { shadow: false }));
      const pupil = new THREE.Group();
      pupil.add(mesh(new THREE.SphereGeometry(0.05, 20, 16), m.iris, { pos: [0, 0, 0.045], scale: [1, 1, 0.45], shadow: false }));
      pupil.add(mesh(new THREE.SphereGeometry(0.026, 16, 12), m.dark, { pos: [0, 0, 0.064], scale: [1, 1, 0.45], shadow: false }));
      pupil.add(mesh(new THREE.SphereGeometry(0.009, 8, 8), m.white, { pos: [0.014, 0.016, 0.077], shadow: false }));
      eye.add(pupil);
      eye.userData.pupil = pupil;
      // pálpebra: casca que desce no piscar
      const lid = mesh(new THREE.SphereGeometry(0.082, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), m.skin, { shadow: false });
      lid.rotation.x = -1.5;
      eye.add(lid);
      eye.userData.lid = lid;
      this.head.add(eye);
      return eye;
    });

    // sobrancelhas (dão a expressão)
    this.brows = [-1, 1].map((s) => {
      const b = mesh(new THREE.CapsuleGeometry(0.011, 0.075, 4, 10), m.dark, { pos: [0.11 * s, 0.165, 0.2], rot: [0, 0, Math.PI / 2], shadow: false });
      b.userData.side = s;
      this.head.add(b);
      return b;
    });

    // braços (patas da frente) e pernas
    this.arms = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(0.33 * s, -0.02, 0.24);
      pivot.add(mesh(new THREE.CapsuleGeometry(0.058, 0.17, 6, 14), m.skin, { pos: [0, -0.12, 0] }));
      for (let i = -1; i <= 1; i++) pivot.add(mesh(new THREE.ConeGeometry(0.016, 0.06, 8), m.claw, { pos: [i * 0.028, -0.255, 0.01], rot: [Math.PI, 0, 0] }));
      pivot.userData.side = s;
      this.body.add(pivot);
      return pivot;
    });
    this.legs = [-1, 1].map((s) => {
      const leg = mesh(new THREE.CapsuleGeometry(0.075, 0.1, 6, 14), m.skin, { pos: [0.2 * s, -0.36, -0.14] });
      this.body.add(leg);
      return leg;
    });
    this.feet = [-1, 1].map((s) => {
      const f = mesh(new THREE.SphereGeometry(0.085, 16, 12), m.skin, { pos: [0.2 * s, -0.43, -0.08], scale: [1, 0.5, 1.4] });
      this.body.add(f);
      return f;
    });

    // figurinos
    this.outfits = {
      esd: (() => {
        const g = new THREE.Group();
        g.add(mesh(new THREE.TorusGeometry(0.066, 0.02, 10, 24), this.m.strap, { pos: [0, -0.2, 0], rot: [Math.PI / 2, 0, 0] }));
        this.arms[1].add(g);
        return g;
      })(),
      hoodie: (() => {
        const g = new THREE.Group();
        g.add(mesh(new THREE.SphereGeometry(0.3, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.62), this.m.cloth, { pos: [0, 0.0, -0.06], rot: [-0.5, 0, 0], scale: [1.02, 1.02, 1.08] }));
        this.head.add(g);
        return g;
      })(),
      goggles: (() => {
        const g = new THREE.Group();
        [-1, 1].forEach((s) => {
          g.add(mesh(new THREE.TorusGeometry(0.07, 0.016, 10, 28), this.m.copper, { pos: [0.108 * s, 0.2, 0.13], rot: [-0.9, 0.2 * s, 0] }));
          g.add(mesh(new THREE.CircleGeometry(0.066, 24), glow(PALETTE.cyan, 0.9, { transparent: true, opacity: 0.55 }), { pos: [0.108 * s, 0.2, 0.13], rot: [-0.9, 0.2 * s, 0], shadow: false }));
        });
        this.head.add(g);
        return g;
      })(),
    };
  }

  setOutfit(name) {
    for (const [k, g] of Object.entries(this.outfits)) g.visible = k === name;
  }

  /**
   * @param lt   tempo local da cena (s)
   * @param cfg  { pos, rotY, anim, look } do roteiro
   * @param cam  posição da câmera (para olhar para a lente)
   */
  update(lt, dur, cfg, cam) {
    const anim = cfg.anim ?? 'idle';
    const [px, py, pz] = cfg.pos ?? [-0.5, 0, 0.5];
    const rotY = cfg.rotY ?? 0.45;
    const P = { // pose neutra
      x: px, y: py, z: pz, rotY, curl: 0, spin: 0,
      bob: Math.sin(lt * 2.1) * 0.012, squash: 1 + Math.sin(lt * 2.1) * 0.012,
      lean: 0, headYaw: 0, headPitch: 0, headRoll: 0,
      armL: [0.25, 0, 0.12], armR: [0.25, 0, -0.12],
      brow: 0, browTilt: 0, eyeOpen: 1, pupil: 1, ear: 0, glow: 2.2 + Math.sin(lt * 2.4) * 0.5, jump: 0,
    };

    // piscar: uma vez a cada ~3s, com instante variado por hash
    const cyc = Math.floor(lt / 3.1), tb = lt - cyc * 3.1 - (0.8 + hash(cyc + 3) * 1.8);
    if (tb > 0 && tb < 0.16) P.eyeOpen = Math.abs(tb - 0.08) / 0.08;
    // fala: cabeça marca o ritmo
    const talk = Math.sin(lt * 9.5) * 0.5 + Math.sin(lt * 5.3) * 0.5;

    switch (anim) {
      case 'talk': {
        P.lean = 0.08; P.headPitch = talk * 0.035 - 0.03; P.headRoll = Math.sin(lt * 1.7) * 0.05;
        P.armR = [0.1 + Math.sin(lt * 3.1) * 0.25, 0, -0.75 + Math.sin(lt * 2.3) * 0.2];
        P.armL = [0.2, 0, 0.3 + Math.sin(lt * 2.7 + 1) * 0.12];
        P.brow = 0.012; P.look = 'camera';
        break;
      }
      case 'point': {
        const k = easeOutBack(ramp(lt, 0.15, 0.45));
        P.headYaw = -0.5 * k; P.headPitch = -0.12 * k + talk * 0.02; P.lean = 0.05;
        P.armL = [lerp(0.25, -0.5, k), 0, lerp(0.12, 2.05 + Math.sin(lt * 4) * 0.05, k)];
        P.brow = 0.015 * k; P.rotY = rotY + 0.25 * k;
        break;
      }
      case 'think': {
        const k = ramp(lt, 0.1, 0.5);
        P.headRoll = 0.2 * k + Math.sin(lt * 1.3) * 0.03; P.headPitch = -0.18 * k; P.headYaw = 0.25 * k;
        P.armR = [lerp(0.25, -1.9, k), 0, lerp(-0.12, 0.55, k)];
        P.brow = 0.01; P.browTilt = 0.35 * k; P.ear = Math.sin(lt * 5) * 0.08; P.glow = 1.2 + Math.sin(lt * 6) * 0.6;
        break;
      }
      case 'shock': {
        const k = ramp(lt, 0.0, 0.14), settle = Math.exp(-lt * 2.2);
        P.jump = Math.max(0, Math.sin(Math.min(lt, 0.42) / 0.42 * Math.PI)) * 0.2;
        P.lean = -0.16 * k; P.squash = 1 + 0.1 * settle * Math.cos(lt * 22);
        P.armL = [0, 0, 1.5 * k + Math.sin(lt * 26) * 0.12 * settle]; P.armR = [0, 0, -1.5 * k - Math.sin(lt * 26) * 0.12 * settle];
        P.brow = 0.045 * k; P.pupil = 0.55; P.ear = 0.3 * k; P.eyeOpen = 1; P.glow = 5 * settle + 1.5; P.look = 'camera';
        break;
      }
      case 'celebrate': {
        const hop = Math.abs(Math.sin(lt * 5.2));
        P.jump = hop * 0.16; P.squash = 1 + (0.5 - hop) * 0.07; P.spin = 0;
        P.armL = [0, 0, 2.5 + Math.sin(lt * 10) * 0.25]; P.armR = [0, 0, -2.5 - Math.sin(lt * 10 + 1) * 0.25];
        P.headRoll = Math.sin(lt * 5.2) * 0.12; P.brow = 0.03; P.glow = 3.5 + Math.sin(lt * 10) * 1.2; P.look = 'camera';
        P.eyeOpen = Math.min(P.eyeOpen, 0.75);
        break;
      }
      case 'roll_in': {
        // entra rolando como bola e desenrola: a transição-assinatura do canal
        const travel = clamp01(lt / 0.75), open = ramp(lt, 0.7, 0.4);
        const e = 1 - (1 - travel) ** 3;
        P.x = lerp(px - 2.2, px, e); P.curl = 1 - open; P.spin = (1 - e) * -9.5;
        P.jump = Math.sin(travel * Math.PI) * 0.05 + Math.max(0, Math.sin(open * Math.PI)) * 0.1;
        P.brow = 0.03 * open; P.look = 'camera';
        if (lt > 1.2) { P.headPitch = talk * 0.03; P.armR = [0.1, 0, -0.6 + Math.sin(lt * 2.5) * 0.15]; }
        break;
      }
      default: {
        P.headYaw = Math.sin(lt * 0.7) * 0.12; P.headRoll = Math.sin(lt * 0.9 + 1) * 0.04; P.ear = Math.sin(lt * 1.9) * 0.05;
      }
    }

    // ---- aplica a pose ----
    const c = P.curl;
    this.root.position.set(P.x, P.y, P.z);
    this.root.rotation.y = P.rotY;
    this.roll.position.y = lerp(0.5, BODY_R, c) + P.bob * (1 - c) + P.jump;
    this.roll.rotation.x = P.spin;
    this.body.rotation.x = P.lean;
    // na bola o corpo fica esférico
    this.shell.scale.set(lerp(BODY_SCALE[0], 1, c), lerp(BODY_SCALE[1], 1, c) * P.squash, lerp(BODY_SCALE[2], 1, c) / Math.sqrt(P.squash));
    this.bands.forEach((b) => b.scale.set(1, lerp(BODY_SCALE[1], 1, c) * P.squash, 1));

    const tuck = smooth(1 - c);
    this.neck.scale.setScalar(lerp(0.25, 0.86, tuck));
    this.neck.position.set(0, lerp(-0.05, 0.03, tuck), lerp(0.18, 0.46, tuck));
    this.neck.rotation.x = lerp(1.4, 0, tuck);
    this.head.rotation.set(P.headPitch, P.headYaw, P.headRoll);
    [...this.arms, ...this.legs, ...this.feet, this.tail].forEach((o) => o.scale.setScalar(Math.max(0.001, tuck)));

    this.arms[0].rotation.set(...(P.armR)); // lado -x (direita do personagem na tela quando de frente)
    this.arms[1].rotation.set(...(P.armL));
    this.ears.forEach((e, i) => { e.rotation.x = -P.ear; e.rotation.z = (i ? -1 : 1) * (0.55 + P.ear * 0.6); });
    this.brows.forEach((b) => {
      b.position.y = 0.165 + P.brow;
      b.rotation.z = Math.PI / 2 + b.userData.side * (0.18 - P.browTilt * (b.userData.side > 0 ? 1 : -0.4));
    });

    // olhar: para a câmera (em espaço local da cabeça) ou para frente
    let gx = 0, gy = 0;
    if (P.look === 'camera' && cam) {
      const local = this.head.worldToLocal(cam.clone());
      gx = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -0.5, 0.5);
      gy = THREE.MathUtils.clamp(Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.35, 0.35);
    }
    this.eyes.forEach((eye) => {
      eye.userData.pupil.rotation.set(-gy, gx - eye.rotation.y * 0.5, 0);
      eye.userData.pupil.scale.setScalar(P.pupil);
      eye.userData.lid.rotation.x = lerp(0.1, -1.5, P.eyeOpen);
    });

    this.m.band.emissiveIntensity = P.glow;
  }
}
