import * as THREE from 'three';
import { smooth, lerp } from '../util.js';

// Enquadramentos pensados para 9:16. `n` = posição do Nibble, `f` = foco (objeto principal).
// Cada preset devolve [posição inicial, alvo, posição final]; a câmera desliza de uma para a outra.
const PRESETS = {
  hero:    (n, f) => [[0.0, 1.55, 7.4], [0.0, 1.08, 0.0], [0.0, 1.5, 6.9]],
  closeup: (n, f) => [[n.x + 0.75, 0.95, n.z + 3.3], [n.x + 0.02, 0.68, n.z], [n.x + 0.55, 0.9, n.z + 2.9]],
  prop:    (n, f) => [[f.x + 0.9, f.y + 0.55, f.z + 3.6], [f.x, f.y, f.z], [f.x + 0.55, f.y + 0.4, f.z + 3.2]],
  macro:   (n, f) => [[f.x + 0.9, f.y + 0.35, f.z + 3.1], [f.x, f.y, f.z], [f.x + 0.55, f.y + 0.25, f.z + 2.7]],
  top:     (n, f) => [[f.x + 0.2, f.y + 3.4, f.z + 2.6], [f.x, f.y - 0.1, f.z], [f.x, f.y + 3.0, f.z + 2.3]],
  low:     (n, f) => [[-0.5, 0.35, 5.6], [0.1, 1.25, 0.0], [-0.3, 0.4, 5.2]],
};

const a = new THREE.Vector3(), b = new THREE.Vector3(), tgt = new THREE.Vector3();

export function applyCamera(camera, preset, lt, dur, nibblePos, focus) {
  const [p0, look, p1] = (PRESETS[preset] ?? PRESETS.hero)(nibblePos, focus);
  const k = smooth(lt / Math.max(dur, 0.001));
  a.set(...p0); b.set(...p1); tgt.set(...look);
  camera.position.lerpVectors(a, b, k);
  // respiração de câmera na mão, bem sutil
  camera.position.x += Math.sin(lt * 0.9) * 0.012;
  camera.position.y += Math.sin(lt * 1.3 + 1.7) * 0.008;
  camera.userData.target = tgt.clone();
  camera.lookAt(tgt);
}

export const FOV = { hero: 30, closeup: 26, prop: 30, macro: 28, top: 32, low: 34 };
