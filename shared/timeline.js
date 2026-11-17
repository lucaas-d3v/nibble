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

export function buildTimeline(episode, audioDurations = {}, fps = 30) {
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
    const entry = { id: scene.id, start: cursor, end: cursor + dur, captions };
    cursor += dur;
    return entry;
  });
  return { episode_id: episode.episode_id, fps, total_duration: cursor, scenes };
}
