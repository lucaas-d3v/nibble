import * as THREE from 'three';
import { PALETTE, mat, metal, glow, mesh, canvasTexture, lerp, smooth, ramp, clamp01, hash, easeOutBack } from '../util.js';
import { cpu, ram, chip, key, key_matrix, ssd, fan, gpu, hdd } from './hardware.js';
import { cable, bit_grid, transistor, gate, mem_cells, packet } from './signal.js';
import { screen, terminal } from './display.js';
import { particles, simple, arrow } from './fx.js';

// Um arquivo por família: hardware.js (peças físicas), signal.js (sinais e dados),
// display.js (telas), fx.js (partículas, setas, primitivas), common.js (placa, etiquetas).
// Para criar um objeto: escreva a função na família certa, registre aqui e em shared/catalog.js.

const REGISTRY = {
  cpu, ram, chip, key, key_matrix, cable, bit_grid, transistor, screen, particles, arrow,
  ssd, fan, gpu, hdd, gate, mem_cells, packet, terminal,
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
