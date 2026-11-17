import * as THREE from 'three';
import { PALETTE, mat, metal, glow, mesh, canvasTexture, lerp, smooth, ramp, clamp01, hash, easeOutBack } from '../util.js';
import { createEmitter } from '../sim/sim.js';
import { boardMaterial } from '../sim/gen.js';
import { pcb, labelTexture, nandLabel } from './common.js';

export function screen(o) {
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

export function terminal(o) {
  const root = new THREE.Group();
  root.add(mesh(new THREE.BoxGeometry(1.6, 1.0, 0.05), mat(0x0c0f14, { roughness: 0.35 })));
  const cv = document.createElement('canvas'); cv.width = 800; cv.height = 500;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  root.add(mesh(new THREE.PlaneGeometry(1.52, 0.95), new THREE.MeshStandardMaterial({ color: 0x000000, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.4, roughness: 0.2 }), { pos: [0, 0, 0.026], shadow: false }));
  const lines = o.lines ?? ['$ make render', 'ok'], ct = o.char_time ?? 0.05, at = o.type_at ?? 0.8;
  let last = '';
  return {
    root,
    update(lt) {
      let n = Math.max(0, Math.floor((lt - at) / ct));
      const shown = lines.map((l) => { const k = Math.min(l.length, n); n -= l.length + 4; return n + l.length + 4 >= 0 ? l.slice(0, k) : null; }).filter((l) => l !== null);
      const cursor = Math.floor(lt * 2.5) % 2 === 0;
      const key = shown.join('|') + cursor;
      if (key === last) return; last = key;
      ctx.fillStyle = '#05080c'; ctx.fillRect(0, 0, 800, 500);
      ctx.fillStyle = '#111a24'; ctx.fillRect(0, 0, 800, 40);
      ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(26 + i * 28, 20, 8, 0, 7); ctx.fill(); });
      ctx.font = '500 34px "JetBrains Mono", monospace'; ctx.textBaseline = 'top';
      shown.forEach((l, i) => { ctx.fillStyle = l.startsWith('$') ? '#7CFFB2' : l.startsWith('!') ? '#ff8a80' : '#d8e1ec'; ctx.fillText(l, 24, 64 + i * 46); });
      if (cursor) { const l = shown[shown.length - 1] ?? ''; ctx.fillStyle = '#38d6ff'; ctx.fillRect(24 + ctx.measureText(l).width + 4, 64 + Math.max(0, shown.length - 1) * 46, 18, 36); }
      tex.needsUpdate = true;
    },
  };
}
