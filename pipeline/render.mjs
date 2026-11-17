#!/usr/bin/env node
// Renderiza um episódio quadro a quadro, sem perdas, direto para o ffmpeg.
//
//   node pipeline/render.mjs ep01_tecla                 # final: 1080x1920, 30 fps, 16 amostras
//   node pipeline/render.mjs ep01_tecla --preview       # rápido: 540x960, 15 fps, 1 amostra
//   node pipeline/render.mjs ep01_tecla --scene 3       # só a cena 3
//   node pipeline/render.mjs ep01_tecla --stills        # 3 PNGs por cena, para conferir enquadramento
//   node pipeline/render.mjs ep01_tecla --stills --scene 2 --at 1.5   # um quadro só
//   node pipeline/render.mjs ep01_tecla --codec prores  # master ProRes 4444 para editar depois
//
// Opções: --samples N  --fps N  --scale 0.5  --from s  --to s  --aperture 0.02  --crf 14
//         --clean (sem HUD: para thumbnail e foto de perfil)  --aspect 16:9 (vídeo longo)
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { ROOT, resolveEpisode, loadEpisode, timelineFor, parseArgs } from './common.mjs';
import { validate } from './validate.mjs';

const args = parseArgs(process.argv.slice(2));
const dir = resolveEpisode(args._[0]);
const episode = loadEpisode(dir);

const { errors, warns } = validate(episode);
warns.forEach((m) => console.warn(`aviso  ${m}`));
if (errors.length) { errors.forEach((m) => console.error(`ERRO   ${m}`)); process.exit(1); }

const thumb = !!args.thumb;
if (thumb) { args.stills = true; args.clean = true; args.scale ??= 1; args.samples ??= 16; }
const preview = !!args.preview, stills = !!args.stills;
const fps = Number(args.fps ?? (preview ? 15 : 30));
const scale = Number(args.scale ?? (preview || stills ? 0.5 : 1));
// --aspect 16:9 para vídeo longo (1920x1080); padrão 9:16 (1080x1920)
const wide = args.aspect === '16:9';
const width = Math.round((wide ? 1920 : 1080) * scale / 2) * 2, height = Math.round((wide ? 1080 : 1920) * scale / 2) * 2;
const samples = Number(args.samples ?? (preview ? 1 : stills ? 8 : 16));
const aperture = Number(args.aperture ?? (preview ? 0 : 0.012));
const codec = args.codec ?? 'x264';

const { timeline } = timelineFor(dir, episode, fps);
let from = Number(args.from ?? 0), to = Number(args.to ?? timeline.total_duration);
if (args.scene) {
  // com --scene, --from/--to contam a partir do início da cena
  // --scene conta as cenas do roteiro (o teaser de abertura não entra na contagem)
  const s = timeline.scenes.filter((x) => !x.teaser)[Number(args.scene) - 1];
  if (!s) throw new Error(`cena ${args.scene} não existe (1..${timeline.scenes.filter((x) => !x.teaser).length})`);
  from = s.start + Number(args.from ?? 0);
  to = Math.min(s.end, s.start + Number(args.to ?? s.end - s.start));
}

const outDir = join(dir, 'output');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'timeline.json'), JSON.stringify(timeline, null, 2));

function chromePath() {
  const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const hit = candidates.find((p) => p && existsSync(p));
  if (!hit) throw new Error('Chrome/Chromium não encontrado; defina CHROME_PATH');
  return hit;
}

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: Number(args.port ?? 5173) } });
await server.listen();
const url = server.resolvedUrls.local[0];

// CZ_GPU=1 usa a GPU de verdade (Vulkan via ANGLE); sem isso cai no SwiftShader (CPU), bem mais lento.
const gpuFlags = process.env.CZ_GPU
  ? ['--enable-gpu', '--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ executablePath: chromePath(), headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb', '--disable-lcd-text', ...gpuFlags] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('[página]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });

let ffmpeg = null;
try {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.CZ?.ready, null, { timeout: 60_000 });
  await page.evaluate(([ep, tl, cfg]) => { window.CZ.configure(cfg); window.CZ.load(ep, tl); }, [episode, timeline, { samples, aperture, fps, hud: !args.clean, aspect: wide ? 16 / 9 : undefined }]);

  // Captura direto pelo protocolo do Chrome em modo rápido: PNG sem perdas, idêntico pixel a pixel
  // ao print do Playwright, mas ~20x mais rápido (0,14 s contra 3,4 s em 1080x1920).
  const cdp = await page.context().newCDPSession(page);
  const shot = async (t) => {
    await page.evaluate((tt) => window.CZ.renderAtTime(tt), t);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
    return Buffer.from(data, 'base64');
  };

  if (stills) {
    const sdir = join(outDir, 'stills'); mkdirSync(sdir, { recursive: true });
    const list = args.scene ? [timeline.scenes.filter((x) => !x.teaser)[Number(args.scene) - 1]] : timeline.scenes;
    // --at t: um quadro só, no tempo t (segundos desde o início da cena se --scene, senão do episódio)
    const times = args.at !== undefined
      ? [(() => { const t = (args.scene ? list[0].start : 0) + Number(args.at);
          return { s: timeline.scenes.find((x) => t >= x.start && t < x.end) ?? list[0], t }; })()]
      : list.flatMap((s) => [0.2, 0.55, 0.9].map((k) => ({ s, t: s.start + (s.end - s.start) * k })));
    if (thumb) {
      await page.evaluate((title) => {
        const d = document.createElement('div');
        d.style.cssText = 'position:absolute;left:6%;right:6%;top:9%;font-family:"Space Grotesk",sans-serif;font-weight:700;' +
          'font-size:calc(var(--h) * 0.062);line-height:1.02;color:#fff;text-transform:uppercase;letter-spacing:-0.01em;' +
          '-webkit-text-stroke:calc(var(--h) * 0.006) #05070b;paint-order:stroke fill;text-shadow:0 0.6vh 2.4vh rgba(0,0,0,.6)';
        document.getElementById('stage').style.setProperty('--h', `${document.getElementById('stage').clientHeight}px`);
        d.innerHTML = title.replace(/\*(.+?)\*/g, '<span style="color:#ffb020">$1</span>');
        document.getElementById('stage').appendChild(d);
      }, args.title ?? episode.thumb_title ?? episode.title);
    }
    for (const { s, t } of times) {
      const f = thumb ? join(outDir, `${episode.episode_id}_thumb.png`) : join(sdir, `${s.id}_${t.toFixed(2)}s${wide ? "_16x9" : ""}.png`);
      writeFileSync(f, await shot(t));
      console.log(f);
    }
  } else {
    const total = Math.ceil((to - from) * fps);
    const suffix = (preview ? '_preview' : '') + (wide ? '_16x9' : '') + (args.scene ? `_cena${String(args.scene).padStart(2, '0')}` : '');
    const out = join(outDir, `video${suffix}.${codec === 'prores' ? 'mov' : 'mp4'}`);
    const enc = {
      // CRF baixo + tune animation: gradientes limpos, sem blocagem nas áreas escuras
      x264: ['-c:v', 'libx264', '-preset', preview ? 'veryfast' : 'slow', '-crf', String(args.crf ?? (preview ? 20 : 14)), '-tune', 'animation', '-pix_fmt', 'yuv420p', '-profile:v', 'high'],
      x265: ['-c:v', 'libx265', '-preset', 'slow', '-crf', String(args.crf ?? 16), '-pix_fmt', 'yuv420p10le', '-tag:v', 'hvc1'],
      prores: ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuv444p10le', '-vendor', 'apl0'],
    }[codec];
    if (!enc) throw new Error(`codec desconhecido: ${codec} (x264, x265, prores)`);
    ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(fps), '-i', '-',
      // conversão RGB->YUV explícita em BT.709: sem isso as cores lavam em alguns players
      '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709:flags=lanczos+accurate_rnd+full_chroma_int',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      ...enc, '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => ffmpeg.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg saiu com código ${c}`)))));
    const t0 = Date.now();
    for (let f = 0; f < total; f++) {
      const png = await shot(from + f / fps);
      if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
      if (f % 10 === 0 || f === total - 1) {
        const el = (Date.now() - t0) / 1000, eta = (el / (f + 1)) * (total - f - 1);
        process.stdout.write(`\rquadro ${f + 1}/${total}  ${((f + 1) / el).toFixed(2)} qps  faltam ${Math.ceil(eta)}s   `);
      }
    }
    ffmpeg.stdin.end();
    await done;
    console.log(`\n${out}  (${width}x${height}, ${fps} fps, ${samples} amostras/quadro, ${codec})`);
  }
} finally {
  if (ffmpeg && !ffmpeg.killed && ffmpeg.exitCode === null) ffmpeg.kill();
  await browser.close();
  await server.close();
}
