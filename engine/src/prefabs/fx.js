import * as THREE from 'three';
import { PALETTE, mat, metal, glow, mesh, canvasTexture, lerp, smooth, ramp, clamp01, hash, easeOutBack } from '../util.js';
import { createEmitter } from '../sim/sim.js';
import { boardMaterial } from '../sim/gen.js';
import { pcb, labelTexture, nandLabel } from './common.js';

export function particles(o) {
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

export const simple = (geoFn) => (o) => ({
  root: mesh(geoFn(o), o.emissive ? glow(o.emissive, o.intensity ?? 3) : (o.metal ? metal(o.color ?? PALETTE.steel) : mat(o.color ?? PALETTE.graphiteLight))),
  update() {},
});

export function arrow(o) {
  const root = new THREE.Group(), m = glow(o.color ?? PALETTE.amber, 3.5);
  root.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 12), m, { pos: [0, 0.25, 0], shadow: false }));
  root.add(mesh(new THREE.ConeGeometry(0.07, 0.16, 16), m, { pos: [0, 0.58, 0], shadow: false }));
  return { root, update(lt) { root.position.y = (o.pos?.[1] ?? 0) + Math.sin(lt * 4) * 0.03; root.scale.setScalar(easeOutBack(ramp(lt, o.at ?? 0, 0.35)) * (o.scale?.[0] ?? 1) || 0.0001); } };
}
