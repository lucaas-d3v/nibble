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

// Pausa de respiro depende de como o trecho termina: pergunta pede tempo pra pensar,
// vírgula e dois-pontos são só um fôlego. Pausa sempre igual é o que deixa voz sintética com cara de robô.
export function pauseAfter(segment) {
  const end = segment.trim().replace(/\*+$/, '').slice(-1);
  return end === '?' ? 0.5 : end === '…' ? 0.55 : end === ',' || end === ':' ? 0.18 : end === '!' ? 0.3 : BEAT_PAUSE;
}
const pausesOf = (segs) => segs.slice(0, -1).reduce((a, s) => a + pauseAfter(s), 0);

export function estimateSceneDuration(scene) {
  const segs = scene.narration.split(BEAT);
  const n = words(scene.narration.replaceAll(BEAT, ' ')).length;
  return Math.max(2.4, n / WORDS_PER_SEC + pausesOf(segs) + SCENE_PAD);
}

// Legenda por frase, não por contagem fixa: quebra na pontuação e antes de conectivos,
// e a palavra de ênfase ganha legenda própria. Ritmo de legenda feita por gente, não de 3 em 3.
const CONNECT = new Set(['e', 'mas', 'que', 'porque', 'quando', 'pra', 'para', 'com', 'sem', 'se', 'ou', 'até', 'como', 'então']);
// palavras que não fecham legenda: artigo e preposição pendurados no fim leem como corte errado
const WEAK = new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'pro', 'pra', 'é', 'se', 'que', 'e']);
const isEm = (w) => w.includes('*');
const PUNCT = /[.!?…,;:]$/;
export function phraseChunks(ws, max = 4) {
  const out = [];
  let cur = [];
  const flush = () => { if (cur.length) out.push(cur); cur = []; };
  const bare = (w) => w.text.replace(/[*.,!?…;:]/g, '').toLowerCase();
  let inEm = false;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i], next = ws[i + 1];
    // ênfase (pode ter várias palavras: *poucos milissegundos*) vira legenda própria;
    // uma palavra solta logo antes vai junto ("se *encostam*") em vez de piscar sozinha
    if (isEm(w.text) || inEm) {
      const opens = w.text.startsWith('*'), closes = /\*[.,!?…;:]*$/.test(w.text) && !(opens && w.text.length === 1);
      if (opens && !inEm && !(cur.length <= 2 && cur.reduce((a, x) => a + x.text.length, 0) <= 10)) flush();
      cur.push(w);
      inEm = opens && !closes ? true : inEm && !closes;
      if (!inEm) flush();
      continue;
    }
    // quebra antes de conectivo, menos quando a legenda terminaria pendurada ("O PC é | que...")
    if (cur.length >= 2 && CONNECT.has(bare(w)) && !WEAK.has(cur[cur.length - 1].text.toLowerCase())) flush();
    cur.push(w);
    if (PUNCT.test(w.text)) { flush(); continue; }
    if (cur.length >= max) {
      // estica uma palavra se a quebra deixaria artigo no fim ou a última palavra da frase sozinha
      const nextCloses = next && !isEm(next.text) && PUNCT.test(next.text);
      // (caixa importa: "A" maiúsculo no meio da frase é a letra, não o artigo)
      if (cur.length === max && (WEAK.has(w.text.replace(/[*.,!?…;:]/g, '')) || nextCloses)) continue;
      flush();
    }
  }
  flush();
  return out;
}

function chunk(segment) {
  return phraseChunks(words(segment).map((text) => ({ text }))).map((c) => c.map((w) => w.text).join(' '));
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
  const teaser = episode.teaser ? { ...episode.teaser, dur: episode.teaser.dur ?? 1.2 } : null;
  if (teaser) cursor = teaser.dur;
  const scenes = episode.scenes.map((scene) => {
    const dur = audioDurations[scene.id] ?? estimateSceneDuration(scene);
    const raw = scene.narration.split(BEAT);
    const segs = raw.map(chunk);
    const pauses = pausesOf(raw);
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
      if (i < segs.length - 1) t += pauseAfter(raw[i]);
    });
    // com alinhamento real, as legendas saem dos tempos de cada palavra
    let visemes = null;
    if (alignments[scene.id]) {
      const { words, vowels } = wordsFromAlignment(alignments[scene.id]);
      const marked = scene.narration.replaceAll(BEAT, ' ').trim().split(/\s+/);
      if (marked.length === words.length) words.forEach((w, k) => { if (marked[k].includes('*')) w.text = marked[k]; });
      const at = (x) => cursor + VOICE_OFFSET + x;
      captions.length = 0;
      for (const c of phraseChunks(words)) captions.push({ text: c.map((w) => w.text).join(' '), start: at(c[0].start), end: at(c[c.length - 1].end) });
      // legenda fica na tela até a próxima começar (sem piscar entre palavras)
      for (let k = 0; k < captions.length - 1; k++) captions[k].end = Math.max(captions[k].end, Math.min(captions[k + 1].start, captions[k].end + 0.4));
      visemes = vowels.map(([a, b]) => [at(a), at(b)]);
    }
    // instantes das palavras de ênfase (pancada de câmera e efeito sonoro)
    const emphasis = captions.filter((c) => c.text.includes('*')).map((c) => c.start + 0.04);
    const entry = { id: scene.id, start: cursor, end: cursor + dur, captions, visemes, emphasis };
    cursor += dur;
    return entry;
  });
  if (teaser) {
    const ref = episode.scenes.findIndex((sc) => sc.id === teaser.scene);
    scenes.unshift({ id: '__teaser', teaser: true, ref: ref < 0 ? episode.scenes.length - 1 : ref, offset: teaser.at ?? 1, start: 0, end: teaser.dur, captions: [], visemes: null, emphasis: [] });
  }
  return { episode_id: episode.episode_id, fps, total_duration: cursor, scenes };
}
