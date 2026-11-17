#!/usr/bin/env node
// Monta o áudio final e junta ao vídeo renderizado:
//   narração (audio/<scene_id>.mp3|wav, opcional) + efeitos sonoros automáticos + fundo de cada cenário
//   + trilha opcional (audio/music.* no episódio ou music.* na raiz) que abaixa sozinha sob a voz.
// Normaliza em -14 LUFS (alvo das plataformas de vídeo curto) e grava a legenda em .srt.
//
//   node pipeline/assemble.mjs ep01_tecla [--video video.mp4] [--no-sfx] [--music caminho]
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
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

const inputs = [], filters = [], voice = [], fx = [];
const input = (f, loop = false) => { inputs.push(...(loop ? ['-stream_loop', '-1'] : []), '-i', f); return inputs.filter((x) => x === '-i').length; };

// narração
timeline.scenes.forEach((s) => {
  const f = audioFiles[s.id];
  if (!f) return;
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
  filters.push(`${voice.join('')}amix=inputs=${voice.length}:normalize=0[voice]`);
  if (music) filters.push('[voice]asplit=2[voice][vkey]');
  mix.push('[voice]');
}
if (fx.length) { filters.push(`${fx.join('')}amix=inputs=${fx.length}:normalize=0[fx]`); mix.push('[fx]'); }
if (music) {
  const k = input(music, true);
  filters.push(`[${k}:a]aresample=48000,aformat=channel_layouts=mono,atrim=0:${total.toFixed(3)},afade=t=out:st=${Math.max(0, total - 1.5).toFixed(3)}:d=1.5,volume=-16dB[mus]`);
  if (voice.length) { filters.push('[mus][vkey]sidechaincompress=threshold=0.03:ratio=6:attack=30:release=400[musd]'); mix.push('[musd]'); }
  else mix.push('[mus]');
}
if (!mix.length) { console.log('Nada para mixar (sem voz, sem efeitos, sem trilha). Vídeo mudo em', video); process.exit(0); }
filters.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0,apad,atrim=0:${total.toFixed(3)},loudnorm=I=-14:TP=-1.5:LRA=11[out]`);

orExit(() => { requireFilters(filterNames(filters.join(';')), 'make video (mixagem)'); requireEncoder('aac', 'make video (áudio do mp4)'); });
const out = join(dir, 'output', `${episode.episode_id}_final.mp4`);
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', video, ...inputs, '-filter_complex', filters.join(';'),
  '-map', '0:v', '-map', '[out]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
console.log(`${out}\n  voz: ${voice.length} cenas · efeitos: ${fx.length} · trilha: ${music ? 'sim (com ducking)' : 'não'} · legenda: ${episode.episode_id}.srt`);
