#!/usr/bin/env node
// Verifica a fluidez de um episódio sem renderizar: percorre a linha do tempo quadro a quadro,
// mede a aceleração de tudo que se move (câmera, cabeça, mãos, pés, objetos, partículas)
// e aponta trancos — picos de aceleração isolados que o olho lê como "pulo" no vídeo.
//
//   node pipeline/smoothness.mjs ep01_tecla            # 30 e 60 fps
//   node pipeline/smoothness.mjs ep01_tecla --fps 60
//
// Cortes de cena são ignorados (ali o salto é intencional). Sai com código 1 se achar tranco.
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { ROOT, resolveEpisode, loadEpisode, timelineFor, parseArgs } from './common.mjs';

const args = parseArgs(process.argv.slice(2));
const dir = resolveEpisode(args._[0]);
const episode = loadEpisode(dir);
const rates = args.fps ? [Number(args.fps)] : [30, 60];
// Limite: um quadro cuja aceleração passa de RATIO vezes a mediana local (e de um piso absoluto)
const RATIO = Number(args.ratio ?? 6);

const chrome = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .find((p) => p && existsSync(p));
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: Number(args.port ?? 5174) } });
await server.listen();
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 270, height: 480 } });
page.on('pageerror', (e) => console.error('[página]', e.message));

let problems = 0;
try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'load' });
  await page.waitForFunction(() => window.CZ?.ready, null, { timeout: 60_000 });
  for (const fps of rates) {
    const { timeline } = timelineFor(dir, episode, fps);
    await page.evaluate(([ep, tl]) => window.CZ.load(ep, tl), [episode, timeline]);
    const n = Math.floor(timeline.total_duration * fps);
    const frames = await page.evaluate(([n, fps]) => { const out = []; for (let f = 0; f < n; f++) out.push(window.CZ.probe(f / fps)); return out; }, [n, fps]);

    const keys = new Set(); frames.forEach((fr) => Object.keys(fr).forEach((k) => Array.isArray(fr[k]) && keys.add(k)));
    const flagged = [];
    for (const key of keys) {
      const acc = new Array(n).fill(null);
      for (let f = 1; f < n - 1; f++) {
        const a = frames[f - 1], b = frames[f], c = frames[f + 1];
        if (!a[key] || !b[key] || !c[key] || a.scene !== b.scene || b.scene !== c.scene) continue;
        acc[f] = Math.hypot(...b[key].map((v, i) => c[key][i] - 2 * v + a[key][i])) * fps * fps; // unidades/s²
      }
      for (let f = 0; f < n; f++) {
        if (acc[f] === null) continue;
        const win = acc.slice(Math.max(0, f - fps / 2), f + fps / 2).filter((v) => v !== null).sort((x, y) => x - y);
        const med = win[Math.floor(win.length / 2)] ?? 0;
        if (acc[f] > Math.max(RATIO * med, 8) && acc[f] > 2 * Math.max(acc[f - 1] ?? 0, acc[f + 1] ?? 0)) {
          flagged.push({ key, f, t: f / fps, acc: acc[f], med, scene: timeline.scenes[frames[f].scene].id });
        }
      }
    }
    flagged.sort((a, b) => b.acc / (b.med + 1) - a.acc / (a.med + 1));
    console.log(`\n${fps} fps — ${n} quadros, ${keys.size} pontos rastreados, ${flagged.length} trancos`);
    for (const p of flagged.slice(0, Number(args.top ?? 25))) {
      console.log(`  ${p.t.toFixed(3)}s  ${p.scene.padEnd(14)} ${p.key.padEnd(14)} acel ${p.acc.toFixed(1).padStart(7)}  (mediana local ${p.med.toFixed(1)})`);
    }
    problems += flagged.length;
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(problems ? 1 : 0);
