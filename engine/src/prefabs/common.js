import * as THREE from 'three';
import { PALETTE, mat, metal, glow, mesh, canvasTexture, lerp, smooth, ramp, clamp01, hash, easeOutBack } from '../util.js';
import { createEmitter } from '../sim/sim.js';
import { boardMaterial } from '../sim/gen.js';

// Placa gerada em Zig (trilhas roteadas). Placas pequenas usam grade menos densa para ler de longe.
export const pcb = (seed, opts = {}) => boardMaterial({ size: 1024, grid: 40, seed, style: 0, components: 4, nets: 45 }, opts);

export const labelTexture = (text, { fg = '#cbd5e1', bg = '#11161e', size = 256, font = 64 } = {}) => canvasTexture(size, (c, s) => {
  c.fillStyle = bg; c.fillRect(0, 0, s, s);
  c.fillStyle = fg; c.font = `600 ${font}px "JetBrains Mono", monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
  text.split('\n').forEach((line, i, a) => c.fillText(line, s / 2, s / 2 + (i - (a.length - 1) / 2) * font * 1.15));
});

// ---------------------------------------------------------------- objetos novos
export const nandLabel = (txt) => labelTexture(txt, { fg: '#9aa6b8', bg: '#121821', font: 54 });
