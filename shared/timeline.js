// Linha do tempo do episódio. Sem dependências: roda no navegador e no Node.
//
// Sem áudio, a duração de cada cena é estimada pela contagem de palavras.
// Com áudio (episodes/<ep>/audio/<scene_id>.wav), a pipeline passa a duração
// real e as legendas se redistribuem dentro dela.

export const WORDS_PER_SEC = 2.7;
export const BEAT = '||';
export const BEAT_PAUSE = 0.35;
export const SCENE_PAD = 0.45;
export const MAX_WORDS_PER_CHUNK = 3;

const words = (s) => s.trim().split(/\s+/).filter(Boolean);

export function estimateSceneDuration(scene) {
  const segs = scene.narration.split(BEAT);
  const n = words(scene.narration.replaceAll(BEAT, ' ')).length;
  return Math.max(2.4, n / WORDS_PER_SEC + (segs.length - 1) * BEAT_PAUSE + SCENE_PAD);
}

function chunk(segment) {
  const out = [];
  let cur = [];
  for (const w of words(segment)) {
    cur.push(w);
    if (cur.length >= MAX_WORDS_PER_CHUNK || /[.!?…,;:]$/.test(w)) {
      out.push(cur.join(' '));
      cur = [];
    }
  }
  if (cur.length) out.push(cur.join(' '));
  return out;
}

const VOWEL = /[aeiouáéíóúâêôãõàüy]/i;

/**
 * Palavras com tempo a partir do alinhamento por caractere da ElevenLabs
 * ({ characters, character_start_times_seconds, character_end_times_seconds }).
 * Ignora o que estiver dentro de tags (<break .../>). Devolve também os intervalos das vogais (boca).
 */
export function wordsFromAlignment(al) {
  const words = [], vowels = [];
  let cur = null, inTag = false;
  al.characters.forEach((ch, i) => {
    const s = al.character_start_times_seconds[i], e = al.character_end_times_seconds[i];
    if (ch === '<') { inTag = true; return; }
    if (inTag) { if (ch === '>') inTag = false; return; }
    if (/\s/.test(ch)) { if (cur) words.push(cur); cur = null; return; }
    if (!cur) cur = { text: '', start: s, end: e };
    cur.text += ch; cur.end = e;
    if (VOWEL.test(ch)) vowels.push([s, e]);
  });
  if (cur) words.push(cur);
  return { words, vowels };
}

/** Atraso da fala dentro da cena (o mesmo usado na mixagem). */
export const VOICE_OFFSET = 0.1;

export function buildTimeline(episode, audioDurations = {}, fps = 30, alignments = {}) {
  let cursor = 0;
  const scenes = episode.scenes.map((scene) => {
    const dur = audioDurations[scene.id] ?? estimateSceneDuration(scene);
    const segs = scene.narration.split(BEAT).map(chunk);
    const pauses = (segs.length - 1) * BEAT_PAUSE;
    const speech = Math.max(0.5, dur - SCENE_PAD - pauses);
    const totalChars = segs.flat().reduce((a, c) => a + c.length + 1, 0) || 1;
    const captions = [];
    let t = 0.1;
    segs.forEach((seg, i) => {
      for (const text of seg) {
        const d = speech * ((text.length + 1) / totalChars);
        captions.push({ text, start: cursor + t, end: cursor + t + d });
        t += d;
      }
      if (i < segs.length - 1) t += BEAT_PAUSE;
    });
    // com alinhamento real, as legendas saem dos tempos de cada palavra
    let visemes = null;
    if (alignments[scene.id]) {
      const { words, vowels } = wordsFromAlignment(alignments[scene.id]);
      const marked = scene.narration.replaceAll(BEAT, ' ').trim().split(/\s+/);
      if (marked.length === words.length) words.forEach((w, k) => { if (marked[k].includes('*')) w.text = marked[k]; });
      const at = (x) => cursor + VOICE_OFFSET + x;
      captions.length = 0;
      let cur = [];
      const flush = () => { if (cur.length) captions.push({ text: cur.map((w) => w.text).join(' '), start: at(cur[0].start), end: at(cur[cur.length - 1].end) }); cur = []; };
      for (const w of words) { cur.push(w); if (cur.length >= MAX_WORDS_PER_CHUNK || /[.!?…,;:]$/.test(w.text)) flush(); }
      flush();
      // legenda fica na tela até a próxima começar (sem piscar entre palavras)
      for (let k = 0; k < captions.length - 1; k++) captions[k].end = Math.max(captions[k].end, Math.min(captions[k + 1].start, captions[k].end + 0.4));
      visemes = vowels.map(([a, b]) => [at(a), at(b)]);
    }
    const entry = { id: scene.id, start: cursor, end: cursor + dur, captions, visemes };
    cursor += dur;
    return entry;
  });
  return { episode_id: episode.episode_id, fps, total_duration: cursor, scenes };
}
