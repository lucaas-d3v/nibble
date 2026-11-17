import * as THREE from 'three';
import { smooth, lerp } from '../util.js';

// Enquadramentos pensados para 9:16. `n` = posição do Nibble, `f` = foco (objeto principal).
// closeup e face ficam à esquerda do Nibble: ele olha para a direita, então o focinho aparece em 3/4.
// Cada preset devolve [posição inicial, alvo, posição final]; a câmera desliza de uma para a outra.
const PRESETS = {
  hero:    (n, f) => [[0.0, 1.55, 7.4], [0.0, 1.08, 0.0], [0.0, 1.5, 6.9]],
  closeup: (n, f) => [[n.x - 0.25, 1.05, n.z + 3.9], [n.x + 0.08, 0.72, n.z], [n.x - 0.12, 1.0, n.z + 3.5]],
  prop:    (n, f) => [[f.x + 0.9, f.y + 0.55, f.z + 3.6], [f.x, f.y, f.z], [f.x + 0.55, f.y + 0.4, f.z + 3.2]],
  macro:   (n, f) => [[f.x + 0.9, f.y + 0.35, f.z + 3.1], [f.x, f.y, f.z], [f.x + 0.55, f.y + 0.25, f.z + 2.7]],
  top:     (n, f) => [[f.x + 0.2, f.y + 3.4, f.z + 2.6], [f.x, f.y - 0.1, f.z], [f.x, f.y + 3.0, f.z + 2.3]],
  low:     (n, f) => [[-0.5, 0.35, 5.6], [0.1, 1.25, 0.0], [-0.3, 0.4, 5.2]],
  face:    (n, f) => [[n.x - 0.6, 1.06, n.z + 3.05], [n.x + 0.02, 0.8, n.z], [n.x - 0.52, 1.04, n.z + 2.9]],
};

const a = new THREE.Vector3(), b = new THREE.Vector3(), tgt = new THREE.Vector3();

/** Posição e alvo da câmera no tempo lt. Pura: o Nibble usa para saber onde olhar. */
export function cameraPose(preset, lt, dur, nibblePos, focus) {
  const [p0, look, p1] = (PRESETS[preset] ?? PRESETS.hero)(nibblePos, focus);
  const k = smooth(lt / Math.max(dur, 0.001));
  a.set(...p0); b.set(...p1);
  const pos = a.lerp(b, k).toArray();
  // respiração de câmera na mão, bem sutil
  pos[0] += Math.sin(lt * 0.9) * 0.012;
  pos[1] += Math.sin(lt * 1.3 + 1.7) * 0.008;
  return { pos, target: look };
}

export function applyCamera(camera, preset, lt, dur, nibblePos, focus) {
  const { pos, target } = cameraPose(preset, lt, dur, nibblePos, focus);
  camera.position.set(...pos);
  tgt.set(...target);
  camera.userData.target = tgt.clone();
  camera.lookAt(tgt);
}

export const FOV = { hero: 30, closeup: 26, prop: 30, macro: 28, top: 32, low: 34, face: 26 };
