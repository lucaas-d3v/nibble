import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { buildTimeline } from '../shared/timeline.js';
import { FFPROBE } from './ffmpeg.mjs';

export const ROOT = resolve(import.meta.dirname, '..');

/** Aceita "ep01_tecla", "1" ou "01" e devolve o diretório do episódio. */
export function resolveEpisode(arg) {
  if (!arg) throw new Error('informe o episódio: ex. ep01_tecla');
  const base = join(ROOT, 'episodes');
  if (existsSync(join(base, arg, 'script.json'))) return join(base, arg);
  const num = String(arg).replace(/^ep/i, '').padStart(2, '0');
  const hits = readdirSync(base).filter((d) => d.startsWith(`ep${num}_`));
  if (hits.length !== 1) throw new Error(`episódio "${arg}" não encontrado ou ambíguo (${hits.join(', ') || 'nenhum'})`);
  return join(base, hits[0]);
}

export const loadEpisode = (dir) => JSON.parse(readFileSync(join(dir, 'script.json'), 'utf8'));

/** Duração real de cada cena, se existir episodes/<ep>/audio/<scene_id>.(wav|mp3|flac|m4a). */
export function audioDurations(dir, episode) {
  const out = {}, files = {};
  for (const scene of episode.scenes) {
    for (const ext of ['wav', 'flac', 'mp3', 'm4a']) {
      const f = join(dir, 'audio', `${scene.id}.${ext}`);
      if (!existsSync(f)) continue;
      const d = Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
      out[scene.id] = d + 0.1 + 0.3; // atraso da fala + respiro entre cenas
      files[scene.id] = f;
      break;
    }
  }
  return { durations: out, files };
}

/** Alinhamentos salvos pelo voice.mjs (audio/<scene_id>.align.json). */
export function audioAlignments(dir, episode) {
  const out = {};
  for (const scene of episode.scenes) {
    const f = join(dir, 'audio', `${scene.id}.align.json`);
    if (existsSync(f)) out[scene.id] = JSON.parse(readFileSync(f, 'utf8'));
  }
  return out;
}

export function timelineFor(dir, episode, fps = 30) {
  const { durations, files } = audioDurations(dir, episode);
  return { timeline: buildTimeline(episode, durations, fps, audioAlignments(dir, episode)), audioFiles: files };
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      out[k] = v ?? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true);
    } else out._.push(a);
  }
  return out;
}
