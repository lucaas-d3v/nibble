#!/usr/bin/env node
// Monta o áudio final e junta ao vídeo renderizado:
//   narração (audio/<scene_id>.mp3|wav, opcional) + efeitos sonoros automáticos + fundo de cada cenário
//   + trilha opcional (audio/music.* no episódio ou music.* na raiz) que abaixa sozinha sob a voz.
// Normaliza em -14 LUFS (alvo das plataformas de vídeo curto) e grava a legenda em .srt.
//
//   node pipeline/assemble.mjs ep01_tecla [--video video.mp4] [--no-sfx] [--no-voice] [--music caminho]
//   --peak -6 (padrão): normaliza pelo pico, teto em -6 dBFS · --lufs -14: normaliza pela loudness
//   (os dois juntos: loudness alvo com o limitador segurando os picos no teto dado)
//   --no-voice: versão sem narração (só efeitos e fundo), com os tempos do áudio real; sai como <ep>_sem_voz.mp4
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, resolveEpisode, loadEpisode, timelineFor, parseArgs } from './common.mjs';
import { ensureSfx, sfxEvents } from './sfx.mjs';
import { FFMPEG, filterNames, requireEncoder, requireFilters } from './ffmpeg.mjs';
import { VOICE_OFFSET } from '../shared/timeline.js';

const args = parseArgs(process.argv.slice(2));
// o que falta no ffmpeg sai como mensagem, sem stack trace por cima
const orExit = (fn) => { try { return fn(); } catch (e) { console.error(`ERRO   ${e.message}`); process.exit(1); } };
const dir = resolveEpisode(args._[0]);
const episode = loadEpisode(dir);
const { timeline, audioFiles } = timelineFor(dir, episode);
const video = join(dir, 'output', args.video ?? 'video.mp4');
if (!existsSync(video)) throw new Error(`renderize primeiro: falta ${video}`);
const total = timeline.total_duration;

// legenda .srt (para as legendas da própria plataforma)
const ts = (x) => { const ms = Math.round(x * 1000); const h = Math.floor(ms / 3.6e6), m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
const caps = timeline.scenes.flatMap((s) => s.captions);
writeFileSync(join(dir, 'output', `${episode.episode_id}.srt`), caps.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n'));

function voiceChain() {
  let eq = {};
  try { eq = JSON.parse(readFileSync(join(ROOT, 'voice.json'), 'utf8')).eq ?? {}; } catch {}
  const c = {
    highpass: 80,        // Hz: abaixo disso é só ronco
    deess: 0.4,          // 0..1: intensidade do de-esser (não linear: 0,6 já abafa)
    harsh: -3,           // dB em ~6,5 kHz (a faixa que soa "aguda demais")
    air: -1,             // dB acima de 10 kHz
    body: 2,             // dB em ~180 Hz (corpo da voz)
    ...eq,
  };
  return [
    `highpass=f=${c.highpass}`,
    `deesser=i=${c.deess}:m=0.5:f=0.5:s=o`,
    `equalizer=f=6500:t=q:w=1.0:g=${c.harsh}`,
    `highshelf=f=10000:g=${c.air}`,
    `lowshelf=f=180:g=${c.body}`,
    'acompressor=threshold=-20dB:ratio=3:attack=8:release=80:makeup=2',
  ].join(',');
}

const inputs = [], filters = [], voice = [], fx = [];
const input = (f, loop = false) => { inputs.push(...(loop ? ['-stream_loop', '-1'] : []), '-i', f); return inputs.filter((x) => x === '-i').length; };

// narração
timeline.scenes.forEach((s) => {
  const f = audioFiles[s.id];
  if (!f || args['no-voice']) return;
  const k = input(f);
  filters.push(`[${k}:a]aresample=48000,aformat=channel_layouts=mono,adelay=${Math.round((s.start + VOICE_OFFSET) * 1000)}:all=1[v${k}]`);
  voice.push(`[v${k}]`);
});

// efeitos e fundos
if (!args['no-sfx']) {
  const lib = orExit(() => ensureSfx(join(ROOT, '.cache', 'sfx')));
  const { events, beds } = sfxEvents(episode, timeline);
  for (const e of events) {
    const k = input(lib[e.sound]);
    filters.push(`[${k}:a]volume=${e.gain}dB,adelay=${Math.round(e.t * 1000)}:all=1[f${k}]`);
    fx.push(`[f${k}]`);
  }
  for (const b of beds) {
    const k = input(lib[b.sound], true);
    const d = (b.end - b.start).toFixed(3);
    filters.push(`[${k}:a]atrim=0:${d},afade=t=in:d=0.25,afade=t=out:st=${Math.max(0, b.end - b.start - 0.25).toFixed(3)}:d=0.25,volume=-20dB,adelay=${Math.round(b.start * 1000)}:all=1[f${k}]`);
    fx.push(`[f${k}]`);
  }
}

// trilha opcional, com ducking pela voz
const music = args.music ?? ['mp3', 'wav', 'flac', 'm4a', 'ogg'].flatMap((e) => [join(dir, 'audio', `music.${e}`), join(ROOT, `music.${e}`)]).find(existsSync);

const mix = [];
if (voice.length) {
  // Cadeia da voz (aplicada depois de juntar as cenas, pra soar igual do começo ao fim):
  // corta grave inútil, tira o "s" e o "x" estridentes (o pt-BR tem muito sibilante e a
  // ElevenLabs entrega brilho demais), abaixa a faixa que cansa (5–8 kHz), devolve corpo
  // no grave-médio e segura a dinâmica. Ajustável por voice.json → "eq".
  filters.push(`${voice.join('')}amix=inputs=${voice.length}:normalize=0,${voiceChain()}[voice]`);
  if (music) filters.push('[voice]asplit=2[voice][vkey]');
  mix.push('[voice]');
}
// efeitos sintetizados têm ruído branco (faísca, chicote, impacto): sem teto, viram chiado
if (fx.length) { filters.push(`${fx.join('')}amix=inputs=${fx.length}:normalize=0,lowpass=f=9000,highshelf=f=5000:g=-3[fx]`); mix.push('[fx]'); }
if (music) {
  const k = input(music, true);
  filters.push(`[${k}:a]aresample=48000,aformat=channel_layouts=mono,atrim=0:${total.toFixed(3)},afade=t=out:st=${Math.max(0, total - 1.5).toFixed(3)}:d=1.5,volume=-16dB[mus]`);
  if (voice.length) { filters.push('[mus][vkey]sidechaincompress=threshold=0.03:ratio=6:attack=30:release=400[musd]'); mix.push('[musd]'); }
  else mix.push('[mus]');
}
if (!mix.length) { console.log('Nada para mixar (sem voz, sem efeitos, sem trilha). Vídeo mudo em', video); process.exit(0); }
// Loudness em duas passadas: a primeira mede, a segunda aplica o ganho exato.
// Numa passada só o loudnorm age como compressor e, em vídeo curto, fica 2–3 LU abaixo do alvo.
const pre = `${mix.join('')}amix=inputs=${mix.length}:normalize=0,apad,atrim=0:${total.toFixed(3)}`;
const LN = 'I=-14:TP=-1.5:LRA=11';
let ln = `loudnorm=${LN}`;
orExit(() => { requireFilters(filterNames(filters.join(';') + ',loudnorm,apad,atrim,amix'), 'make video (mixagem)'); requireEncoder('aac', 'make video (áudio do mp4)'); });
const measure = (tail) => {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-nostdin', '-i', video, ...inputs, '-filter_complex', [...filters, `${pre}${tail},loudnorm=${LN}:print_format=json[m]`].join(';'),
    '-map', '[m]', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const js = /\{[^{}]*"input_i"[^{}]*\}/.exec(r.stderr ?? '');
  if (!js) return null;
  const m = JSON.parse(js[0]);
  return { i: Number(m.input_i), tp: Number(m.input_tp) };
};
// Padrão: normaliza pelo pico, com teto em -6 dBFS (folga pra quem for editar ou mixar depois).
// --lufs -14 troca pra normalizar pela loudness (o alvo do YouTube), com limitador nos picos.
const PEAK = Number(args.peak ?? -6);
const lim = (g, ceilDb) => `,volume=${g.toFixed(2)}dB,alimiter=limit=${(10 ** (ceilDb / 20)).toFixed(4)}:attack=2:release=60:level=0`;
const m0 = measure('');
if (m0 && Number.isFinite(m0.i)) {
  if (args.lufs !== undefined) {
    const target = Number(args.lufs);
    let gain = target - m0.i;
    const ceil = args.peak !== undefined ? PEAK : -1.6;
    // o limitador trabalha por amostra; o pico verdadeiro (entre amostras, e depois do AAC) passa
    // um pouco. Ajusta até 3 vezes: o teto manda, a loudness chega o mais perto que o teto deixa.
    let lc = ceil - 0.5;
    for (let k = 0; k < 3; k++) {
      const m1 = measure(lim(gain, lc));
      if (!m1 || !Number.isFinite(m1.i)) break;
      const over = m1.tp - (ceil - 0.2);
      if (over > 0) lc -= over;
      else gain += Math.max(-3, Math.min(3, target - m1.i));
      if (over <= 0 && Math.abs(target - m1.i) < 0.3) break;
    }
    ln = lim(gain, lc).slice(1);
  } else {
    // ganho até o pico verdadeiro bater no teto; o limitador só segura o que escapar entre amostras
    let g = PEAK - m0.tp;
    const m1 = measure(lim(g, PEAK - 0.3));
    if (m1 && m1.tp > PEAK - 0.2) g -= m1.tp - (PEAK - 0.2);
    ln = lim(g, PEAK - 0.3).slice(1);
  }
} else console.warn('aviso: medição de loudness falhou; usando uma passada só');
filters.push(`${pre},${ln}[out]`);

const out = join(dir, 'output', `${episode.episode_id}_${args['no-voice'] ? 'sem_voz' : 'final'}.mp4`);
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', video, ...inputs, '-filter_complex', filters.join(';'),
  '-map', '0:v', '-map', '[out]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
console.log(`${out}\n  voz: ${voice.length} cenas · efeitos: ${fx.length} · trilha: ${music ? 'sim (com ducking)' : 'não'} · legenda: ${episode.episode_id}.srt`);
