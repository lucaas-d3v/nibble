#!/usr/bin/env node
// Regressão visual: renderiza quadros fixos e compara com tests/golden/*.png (PSNR via ffmpeg).
//   node pipeline/golden.mjs            # compara (falha abaixo do limite)
//   node pipeline/golden.mjs --update   # regrava as referências depois de uma mudança visual intencional
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, parseArgs } from './common.mjs';

const args = parseArgs(process.argv.slice(2));
const LIMIT = Number(args.psnr ?? 28); // dB; abaixo disso a imagem mudou de verdade
const SHOTS = [['ep01_tecla', 1, 4.0], ['ep01_tecla', 3, 5.0], ['ep00_nibble', 9, 1.3], ['ep00_nibble', 11, 3.0], ['ep90_catalogo', 6, 2.0]];
const dir = join(ROOT, 'tests', 'golden');
mkdirSync(dir, { recursive: true });
let bad = 0;
for (const [ep, sc, at] of SHOTS) {
  const out = execFileSync('node', [join(ROOT, 'pipeline/render.mjs'), ep, '--stills', '--scene', String(sc), '--at', String(at), '--samples', '1', '--scale', '0.25', '--aperture', '0', '--clean'], { encoding: 'utf8' });
  const png = out.trim().split('\n').filter((l) => l.endsWith('.png')).pop();
  const ref = join(dir, `${ep}_s${sc}_${at}.png`);
  if (args.update || !existsSync(ref)) { copyFileSync(png, ref); console.log(`referência  ${ref}`); continue; }
  const r = spawnSync('ffmpeg', ['-i', png, '-i', ref, '-lavfi', 'psnr', '-f', 'null', '-'], { encoding: 'utf8' });
  const log = r.stderr;
  const m = /average:([\d.inf]+)/.exec(log) ?? [];
  const psnr = m[1] === 'inf' ? Infinity : Number(m[1]);
  const ok = psnr >= LIMIT;
  if (!ok) bad++;
  console.log(`${ok ? 'ok   ' : 'MUDOU'}  ${ep} cena ${sc} @${at}s  PSNR ${psnr.toFixed?.(1) ?? psnr} dB`);
}
process.exit(bad ? 1 : 0);
