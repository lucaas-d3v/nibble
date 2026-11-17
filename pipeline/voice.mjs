#!/usr/bin/env node
// Gera a narração de cada cena com a ElevenLabs.
//
//   ELEVENLABS_API_KEY=... node pipeline/voice.mjs ep01_tecla
//   node pipeline/voice.mjs --voices                  # lista as vozes da tua conta (com o ID)
//
// A chave vem SEMPRE da variável de ambiente. Nunca coloque a chave em arquivo do repositório.
// A voz vem de --voice, da variável ELEVENLABS_VOICE_ID, ou de voice.json na raiz:
//   { "voice_id": "...", "model_id": "eleven_multilingual_v2", "stability": 0.45, "similarity_boost": 0.8, "style": 0.15 }
//
// Cada cena vira episodes/<ep>/audio/<scene_id>.mp3. Há cache: só gera de novo a cena
// cujo texto ou configuração mudou, para não gastar crédito à toa. --force ignora o cache.
// Depois: `make render` (as durações passam a vir do áudio) e `make video`.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, resolveEpisode, loadEpisode, parseArgs } from './common.mjs';
import { BEAT, BEAT_PAUSE } from '../shared/timeline.js';

const args = parseArgs(process.argv.slice(2));
const API = process.env.ELEVENLABS_BASE_URL ?? 'https://api.elevenlabs.io';
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error('Defina ELEVENLABS_API_KEY no ambiente (ex.: export ELEVENLABS_API_KEY=sk_...).');
  process.exit(1);
}

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { 'xi-api-key': KEY, ...(init.headers ?? {}) } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ElevenLabs ${res.status} em ${path}: ${body.slice(0, 300)}`);
  }
  return res;
}

if (args.voices) {
  const { voices } = await (await api('/v1/voices')).json();
  for (const v of voices) console.log(`${v.voice_id}  ${v.name}  (${v.category ?? ''})`);
  process.exit(0);
}

const cfgFile = join(ROOT, 'voice.json');
const cfg = {
  model_id: 'eleven_multilingual_v2', stability: 0.45, similarity_boost: 0.8, style: 0.15, speed: 1.0,
  ...(existsSync(cfgFile) ? JSON.parse(readFileSync(cfgFile, 'utf8')) : {}),
};
const voiceId = args.voice ?? process.env.ELEVENLABS_VOICE_ID ?? cfg.voice_id;
if (!voiceId) {
  console.error('Falta a voz: use --voice <id>, ELEVENLABS_VOICE_ID ou voice.json. Veja os IDs com --voices.');
  process.exit(1);
}

const dir = resolveEpisode(args._[0]);
const episode = loadEpisode(dir);
const audioDir = join(dir, 'audio');
mkdirSync(audioDir, { recursive: true });
const cacheFile = join(audioDir, '.cache.json');
const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};

// "||" do roteiro vira pausa real na fala
const toSpeech = (s) => s.split(BEAT).map((p) => p.trim()).filter(Boolean).join(` <break time="${BEAT_PAUSE + 0.15}s" /> `);
const plain = (s) => s.replaceAll(BEAT, ' ').replace(/\s+/g, ' ').trim();

const only = args.scene ? [episode.scenes[Number(args.scene) - 1]] : episode.scenes;
let spent = 0;
for (const scene of only) {
  const i = episode.scenes.indexOf(scene);
  const text = toSpeech(scene.narration);
  const settings = { stability: cfg.stability, similarity_boost: cfg.similarity_boost, style: cfg.style, use_speaker_boost: true, speed: cfg.speed };
  const key = createHash('sha256').update(JSON.stringify([voiceId, cfg.model_id, text, settings])).digest('hex').slice(0, 16);
  const out = join(audioDir, `${scene.id}.mp3`);
  if (!args.force && cache[scene.id] === key && existsSync(out)) {
    console.log(`cache  ${scene.id}`);
    continue;
  }
  const body = {
    text, model_id: cfg.model_id, voice_settings: settings,
    // contexto das cenas vizinhas: mantém entonação contínua entre os cortes
    previous_text: i > 0 ? plain(episode.scenes[i - 1].narration) : undefined,
    next_text: i < episode.scenes.length - 1 ? plain(episode.scenes[i + 1].narration) : undefined,
  };
  // with-timestamps: além do áudio, devolve o tempo de cada caractere (legenda e boca exatas)
  const res = await api(`/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const json = await res.json();
  writeFileSync(out, Buffer.from(json.audio_base64, 'base64'));
  const al = json.alignment ?? json.normalized_alignment;
  if (al?.characters) writeFileSync(join(audioDir, `${scene.id}.align.json`), JSON.stringify(al));
  cache[scene.id] = key;
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  spent += plain(scene.narration).length;
  console.log(`gerado ${scene.id}  (${plain(scene.narration).length} caracteres)`);
}
console.log(`~${spent} créditos gastos nesta rodada. Próximo: make render EP=${episode.episode_id} && make video EP=${episode.episode_id}`);
