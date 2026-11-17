#!/usr/bin/env node
// Junta a narração ao vídeo renderizado.
// Coloque um arquivo por cena em episodes/<ep>/audio/<scene_id>.wav (ou flac/mp3/m4a),
// rode o render de novo (as durações passam a vir do áudio) e depois este script.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveEpisode, loadEpisode, timelineFor, parseArgs } from './common.mjs';

const args = parseArgs(process.argv.slice(2));
const dir = resolveEpisode(args._[0]);
const episode = loadEpisode(dir);
const { timeline, audioFiles } = timelineFor(dir, episode);
const video = join(dir, 'output', args.video ?? 'video.mp4');
if (!existsSync(video)) throw new Error(`renderize primeiro: falta ${video}`);

const missing = episode.scenes.filter((s) => !audioFiles[s.id]).map((s) => s.id);
if (missing.length === episode.scenes.length) {
  console.log('Nenhum áudio em audio/. O vídeo sem som já está em', video);
  process.exit(0);
}
if (missing.length) console.warn('aviso  cenas sem áudio (ficam em silêncio):', missing.join(', '));

// Cada narração entra no instante em que a cena começa.
const inputs = [], filters = [], labels = [];
timeline.scenes.forEach((s) => {
  const f = audioFiles[s.id];
  if (!f) return;
  const i = inputs.length / 2 + 1;
  inputs.push('-i', f);
  filters.push(`[${i}:a]aresample=48000,adelay=${Math.round((s.start + 0.1) * 1000)}:all=1[a${i}]`);
  labels.push(`[a${i}]`);
});
// loudnorm: -14 LUFS, o alvo das plataformas de vídeo curto
filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[mix]`);

const out = join(dir, 'output', `${episode.episode_id}_final.mp4`);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, ...inputs, '-filter_complex', filters.join(';'),
  '-map', '0:v', '-map', '[mix]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', out], { stdio: 'inherit' });
console.log(out);
