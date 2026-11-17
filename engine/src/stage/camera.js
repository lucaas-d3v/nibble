import * as THREE from 'three';
import { clamp01, lerp } from '../util.js';
import { rollInX } from '../character/motion.js';

// Câmera do Camada Zero. Tudo é função pura do tempo (determinístico, qualquer quadro isolado).
//
// Camadas, de baixo para cima:
//   1. enquadramento (preset) -> âncora: posição, alvo e lente
//   2. movimento da cena (push, pull, orbit, crane, drift, static), com curva C2
//   3. reações ao personagem (soco de zoom no susto, acompanhar a bola rolando)
//   4. câmera na mão: ruído suave de posição e rotação
//   5. transições nas bordas da cena (whip, dive, rise), casando a velocidade no corte

export const MOVES = ['auto', 'static', 'push', 'pull', 'orbit', 'crane', 'drift'];
export const TRANSITIONS = ['auto', 'cut', 'whip', 'dive', 'rise'];

// Enquadramentos para 9:16. n = posição do Nibble, f = foco (objeto principal).
// closeup e face ficam à esquerda do Nibble: ele olha para a direita, então o focinho aparece em 3/4.
// Cada preset devolve [posição, alvo]; o movimento é aplicado em volta do alvo.
const PRESETS = {
  hero:    (n, f) => [[0.0, 1.52, 7.15], [0.0, 1.08, 0.0]],
  closeup: (n, f) => [[n.x - 0.18, 1.02, n.z + 3.7], [n.x + 0.08, 0.72, n.z]],
  prop:    (n, f) => [[f.x + 0.72, f.y + 0.48, f.z + 3.4], [f.x, f.y, f.z]],
  macro:   (n, f) => [[f.x + 0.72, f.y + 0.3, f.z + 2.9], [f.x, f.y, f.z]],
  top:     (n, f) => [[f.x + 0.1, f.y + 3.2, f.z + 2.45], [f.x, f.y - 0.1, f.z]],
  low:     (n, f) => [[-0.4, 0.38, 5.4], [0.1, 1.25, 0.0]],
  face:    (n, f) => [[n.x - 0.56, 1.05, n.z + 2.98], [n.x + 0.02, 0.8, n.z]],
};
export const FOV = { hero: 30, closeup: 26, prop: 30, macro: 28, top: 32, low: 34, face: 26 };

// curva C2 (velocidade e aceleração zero nas pontas)
const smoother = (t) => { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); };
const easeIn3 = (t) => clamp01(t) ** 3;
const easeOut3 = (t) => 1 - (1 - clamp01(t)) ** 3;
// ruído suave: soma de senos com frequências incomensuráveis
const wobble = (t, s) => 0.5 * Math.sin(t * 1.31 + s) + 0.3 * Math.sin(t * 2.87 + s * 1.7) + 0.2 * Math.sin(t * 5.03 + s * 2.3);

const MOVE_BY_TONE = { hook: 'push', explain: 'orbit', curious: 'drift', payoff: 'pull', outro: 'pull' };
const ENERGY_BY_TONE = { hook: 1.4, explain: 0.9, curious: 0.8, payoff: 1.2, outro: 0.7 };

/** Converte posição em coordenadas esféricas em volta do alvo. */
function toSph(p, t) {
  const dx = p[0] - t[0], dy = p[1] - t[1], dz = p[2] - t[2];
  const r = Math.hypot(dx, dy, dz);
  return { r, az: Math.atan2(dx, dz), el: Math.asin(dy / r) };
}
function fromSph({ r, az, el }, t) {
  return [t[0] + r * Math.cos(el) * Math.sin(az), t[1] + r * Math.sin(el), t[2] + r * Math.cos(el) * Math.cos(az)];
}

/**
 * Pose de base (sem câmera na mão nem transição). Pura: o Nibble usa para olhar para a lente.
 * shot: { preset, lt, dur, n, f, move, tone, index, anim, px }
 */
export function cameraPose(preset, lt, dur, n, f, shot = {}) {
  const [p, target] = (PRESETS[preset] ?? PRESETS.hero)(n, f);
  const move = shot.move && shot.move !== 'auto' ? shot.move : MOVE_BY_TONE[shot.tone] ?? 'drift';
  const k = smoother(lt / Math.max(dur, 0.001)) - 0.5; // -0.5 .. 0.5 ao longo da cena
  const side = (shot.index ?? 0) % 2 ? -1 : 1;
  const s = toSph(p, target);
  let fov = FOV[preset] ?? 30;
  switch (move) {
    case 'push': s.r *= 1 - 0.13 * k; fov -= 1.2 * k; break;          // aproxima: tensão
    case 'pull': s.r *= 1 + 0.12 * k; s.el += 0.03 * k; break;       // afasta: revela
    case 'orbit': s.az += side * 0.24 * k; break;                    // paralaxe com o fundo
    case 'crane': s.el += 0.1 * k; s.r *= 1 - 0.04 * k; break;       // grua subindo
    case 'drift': s.az += side * 0.08 * k; s.el += 0.02 * k; break;  // quase parada, viva
    default: break;
  }
  const pos = fromSph(s, target);
  const tgt = [...target];
  // acompanha a bola entrando: o alvo vai junto com ela e chega no personagem
  if (shot.anim === 'roll_in') {
    const off = rollInX(lt) * 0.55;
    tgt[0] += off; pos[0] += off * 0.8;
  }
  return { pos, target: tgt, fov, move };
}

/** Resolve as transições de entrada de cada cena: auto vira dive/rise ao trocar de camada, whip no resto. */
export function resolveTransitions(scenes) {
  const layer = (sc) => { const m = /camada\s*(\d+)/i.exec(sc.layer ?? ''); return m ? Number(m[1]) : null; };
  return scenes.map((sc, i) => {
    if (i === 0) return 'cut';
    const want = sc.transition ?? 'auto';
    if (want !== 'auto') return want;
    const prev = scenes[i - 1];
    const env = (x) => x.environment ?? 'bancada';
    if (env(prev) === env(sc)) return 'whip';
    const a = layer(prev), b = layer(sc);
    return a !== null && b !== null && b > a ? 'rise' : 'dive';
  });
}

const OUT = 0.26, IN = 0.3; // duração das metades da transição (s)

/**
 * Pose final da câmera no tempo lt da cena: base + reação + mão + transição.
 * shot.trIn / shot.trOut: transição na entrada desta cena e na saída (= entrada da próxima).
 * Devolve também exposure (multiplicador) e focus (ponto de foco).
 */
export function cameraShot(preset, lt, dur, n, f, shot = {}) {
  const base = cameraPose(preset, lt, dur, n, f, shot);
  const pos = [...base.pos], tgt = [...base.target];
  let fov = base.fov, exposure = 1, roll = 0, yaw = 0, pitch = 0;
  const energy = ENERGY_BY_TONE[shot.tone] ?? 1;
  const seed = (shot.index ?? 0) * 2.31 + 0.7;

  // reação: soco de zoom e tremida curta no pulo de susto
  if (shot.anim === 'shock') {
    const u = lt - 0.16;
    if (u > 0) {
      fov -= 3.2 * easeOut3(u / 0.18) * (1 - smoother((u - 0.5) / 1.4));
      const sh = Math.exp(-u * 5) * Math.sin(u * 38);
      pitch += 0.012 * sh; roll += 0.01 * Math.exp(-u * 5) * Math.sin(u * 29 + 1);
    }
  }

  // câmera na mão (rotação pequena: lê como operador, não como terremoto)
  yaw += 0.0035 * energy * wobble(lt * 0.9, seed);
  pitch += 0.0028 * energy * wobble(lt * 0.8, seed + 4.1);
  roll += 0.0022 * energy * wobble(lt * 0.7, seed + 9.3);
  pos[0] += 0.008 * energy * wobble(lt * 0.6, seed + 2.2);
  pos[1] += 0.006 * energy * wobble(lt * 0.7, seed + 6.6);

  // transições
  const right = new THREE.Vector3().subVectors(new THREE.Vector3(...tgt), new THREE.Vector3(...pos)).cross(new THREE.Vector3(0, 1, 0)).normalize();
  const fwd = new THREE.Vector3(...tgt).sub(new THREE.Vector3(...pos)).normalize();
  const dir = (shot.index ?? 0) % 2 ? -1 : 1;
  const apply = (kind, u, entering) => {
    // u: 0 longe do corte -> 1 no corte (saída) ; 1 no corte -> 0 assentado (entrada)
    if (kind === 'whip') {
      // giro rápido: sai girando para um lado, a próxima cena entra vindo do lado oposto
      // giro de ~24°: o borrão vem da velocidade; girar mais olha para fora do cenário (quadro preto)
      const sgn = entering ? -dir : dir;
      yaw += sgn * 0.42 * u;
      roll -= sgn * 0.06 * u;
      pos[0] += right.x * 0.45 * u * sgn;
      pos[2] += right.z * 0.45 * u * sgn;
    } else if (kind === 'dive') {
      // descer de camada: mergulha para a frente e para baixo; a próxima cena chega caindo de cima
      if (!entering) {
        pos[0] += fwd.x * 2.2 * u; pos[1] += fwd.y * 2.2 * u - 0.9 * u; pos[2] += fwd.z * 2.2 * u;
        pitch -= 0.45 * u; fov += 10 * u;
      } else {
        pos[1] += 2.6 * u; pitch -= 0.5 * u; fov += 10 * u;
      }
      exposure *= 1 + 2.2 * u ** 2;
    } else if (kind === 'rise') {
      // subir de camada: o inverso, sobe e recua; a próxima cena chega subindo de baixo
      // sobe de grua rápido, inclinando para cima até estourar no clarão;
      // a próxima cena surge de baixo, com a câmera ainda inclinada, e assenta
      if (!entering) { pos[1] += 2.4 * u; pos[0] -= fwd.x * 1.2 * u; pos[2] -= fwd.z * 1.2 * u; pitch += 0.7 * u; roll += 0.08 * u * dir; fov += 12 * u; }
      else { pos[1] -= 1.1 * u; pos[0] -= fwd.x * 0.8 * u; pos[2] -= fwd.z * 0.8 * u; pitch += 0.6 * u; roll -= 0.06 * u * dir; fov += 10 * u; }
      exposure *= 1 + 2.4 * u ** 2;
    }
  };
  if (shot.trIn && shot.trIn !== 'cut' && lt < IN) apply(shot.trIn, 1 - easeOut3(lt / IN), true);
  if (shot.trOut && shot.trOut !== 'cut' && dur - lt < OUT) apply(shot.trOut, easeIn3(1 - (dur - lt) / OUT), false);

  // foco: rosto do Nibble nos planos de personagem; no apontar, o foco passa para o objeto e volta
  const head = [n.x + 0.02, 0.85, n.z];
  let focus = ['closeup', 'face'].includes(preset) ? head : tgt;
  if (shot.anim === 'point' && f) {
    const k = smoother((lt - 0.35) / 0.5) * (1 - smoother((lt - 3.4) / 0.6));
    focus = [lerp(head[0], f.x, k), lerp(head[1], f.y, k), lerp(head[2], f.z, k)];
  }
  return { pos, target: tgt, fov, exposure, yaw, pitch, roll, focus };
}

const _t = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _q = new THREE.Quaternion();
// no 16:9 o quadro é baixo: sobe um pouco o enquadramento para os objetos do alto não cortarem
let wideLift = 0;
export function setWide(wide) { wideLift = wide ? 0.24 : 0; }
export function applyShot(camera, shot) {
  camera.position.set(shot.pos[0], shot.pos[1] + wideLift, shot.pos[2]);
  _t.set(shot.target[0], shot.target[1] + wideLift, shot.target[2]);
  camera.lookAt(_t);
  _e.set(shot.pitch, shot.yaw, shot.roll);
  camera.quaternion.multiply(_q.setFromEuler(_e));
  if (camera.fov !== shot.fov) { camera.fov = shot.fov; camera.updateProjectionMatrix(); }
  camera.userData.target = _t.clone();
  camera.userData.focus = new THREE.Vector3(...shot.focus);
  camera.userData.exposure = shot.exposure;
}
