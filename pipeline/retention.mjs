#!/usr/bin/env node
// Avaliador de retenção: mede o roteiro contra o que segura gente em vídeo curto e diz o que corrigir.
//
//   node pipeline/retention.mjs ep01_tecla        (make retention EP=ep01_tecla)
//
// A nota é sobre o roteiro e o ritmo, antes de gastar render. Ela não prevê a retenção real:
// isso depende do tema, da voz, da thumbnail e de quem o algoritmo mostra o vídeo. O que ela faz
// é garantir que nenhum dos motivos clássicos de abandono esteja no vídeo.
import { resolveEpisode, loadEpisode, timelineFor, parseArgs } from './common.mjs';

// Frases que denunciam texto de IA (ou de roteiro genérico). Ninguém fala assim numa conversa.
export const CLICHES = [
  'imagine', 'você sabia', 'neste vídeo', 'nesse vídeo', 'hoje vamos', 'hoje eu vou', 'vamos explorar', 'mergulhar', 'mergulho profundo',
  'fascinante', 'incrível', 'surpreendente', 'desvendar', 'desvenda', 'jornada', 'no mundo de hoje', 'nos dias de hoje', 'em resumo',
  'em suma', 'crucial', 'fundamental', 'essencial', 'revolucion', 'magia', 'mágica', 'não é apenas', 'muito mais do que',
  'prepare-se', 'sem mais delongas', 'e não para por aí', 'basicamente', 'literalmente', 'de forma eficiente', 'robusto',
  'poderoso', 'universo de', 'o mundo da tecnologia', 'por trás das cenas', 'nos bastidores', 'segredo', 'curiosidade:',
];
const CTA = ['inscreva', 'se inscreve', 'curte o', 'curta o', 'deixa o like', 'deixe o like', 'comenta', 'compartilha', 'sininho', 'segue o canal', 'me segue'];
const GAP = /\?|\bpor que\b|\bcomo\b|\bnão\b|\bnunca\b|\bninguém\b|\berrad|\bmentira|\bna verdade\b|\bmas\b|\bsó que\b|\d/i;

// siglas que qualquer um entende sem explicação
const KNOWN = new Set(['PC', 'USB', 'TV', 'LED', 'OK', 'HD', 'WIFI']);
const clean = (s) => s.replaceAll('||', ' ').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
const wordsOf = (s) => clean(s).split(' ').filter(Boolean);

export function retention(episode, timeline) {
  const checks = [];
  const add = (name, got, max, msg) => checks.push({ name, got: Math.max(0, Math.min(max, got)), max, msg });
  const scenes = timeline.scenes.filter((s) => !s.teaser);
  const byId = Object.fromEntries(episode.scenes.map((s) => [s.id, s]));
  const total = timeline.total_duration;

  // 1. duração: em vídeo curto, cada segundo a mais derruba a porcentagem assistida
  add('Duração', total <= 35 ? 15 : total <= 45 ? 11 : total <= 60 ? 6 : 2, 15,
    total <= 35 ? `${total.toFixed(0)} s: bom` : `${total.toFixed(0)} s: corte para 35 s ou menos (uma ideia a menos, não frases mais rápidas)`);

  // 2. primeira fala
  const first = scenes[0], firstCap = first.captions[0];
  const firstLine = clean(episode.scenes[0].narration).split(/(?<=[.!?…])\s/)[0] ?? '';
  const n1 = firstLine.split(' ').length;
  let g = 0; const why = [];
  // conta do quadro 0 do vídeo (teaser incluído). Com título na tela desde o início, dá pra
  // segurar a voz até 1 s: a pessoa está lendo. Sem título, a voz tem que entrar quase de cara.
  const hasHook = !!(episode.hook && (typeof episode.hook === 'string' || episode.hook.text));
  const speechAt = firstCap ? firstCap.start : 99, limit = hasHook ? 1.0 : 0.35;
  if (speechAt <= limit) g += 4; else why.push(`a voz só entra em ${speechAt.toFixed(1)} s (máx. ${limit} s)`);
  if (n1 <= 9) g += 4; else why.push(`primeira frase com ${n1} palavras (use até 9)`);
  if (GAP.test(firstLine)) g += 4; else why.push('a primeira frase não abre pergunta, contradição nem número');
  add('Primeira fala', g, 12, why.join('; ') || `"${firstLine}"`);

  // 3. movimento no primeiro quadro
  const a0 = episode.scenes[0].nibble?.anim;
  const moving = !!episode.teaser || !!episode.loop || ['roll_in', 'press', 'shock'].includes(a0) || (episode.scenes[0].objects ?? []).some((o) => o.keys || o.appear_at !== undefined);
  add('Movimento no quadro 0', moving ? 8 : 0, 8, moving ? 'o vídeo começa se mexendo' : 'o primeiro quadro está parado: use teaser, loop, roll_in ou um objeto entrando');

  // 4. título de gancho na tela
  const hook = typeof episode.hook === 'string' ? episode.hook : episode.hook?.text;
  const hw = hook ? wordsOf(hook).length : 0;
  add('Título de gancho', hook ? (hw <= 7 ? 5 : 2) : 0, 5, hook ? (hw <= 7 ? `"${clean(hook)}"` : 'título com mais de 7 palavras') : 'sem "hook": quem assiste sem som não sabe por que ficar');

  // 5. interrupções de padrão: algo novo na tela a cada ~3 s
  const ev = [];
  for (const ts of timeline.scenes) {
    ev.push(ts.start);
    if (ts.teaser) continue;
    const sc = byId[ts.id], at = (x) => ts.start + x;
    (ts.emphasis ?? []).forEach((e) => ev.push(e));
    (sc.shots ?? []).forEach((s) => ev.push(at(s.at)));
    (sc.overlays ?? []).forEach((o) => ev.push(at(o.at ?? 0.5)));
    (sc.labels ?? []).forEach((l) => ev.push(at(l.at ?? 0.4)));
    for (const o of sc.objects ?? []) {
      if (o.appear_at !== undefined) ev.push(at(o.appear_at));
      (o.keys ?? []).forEach((k) => ev.push(at(k.t)));
      for (const f of ['press_at', 'start_at', 'type_at', 'open_at', 'hit_at', 'seek_at', 'spin_at', 'write_at', 'on_at']) if (o[f] !== undefined) ev.push(at(o[f]));
    }
    const an = sc.nibble?.anim;
    const animEv = { roll_in: [0.86, 1.3], shock: [0.16], celebrate: [0.22, 0.78, 1.34], point: [0.2], press: [sc.nibble?.target?.at ?? 1], wave: [0.2] }[an] ?? [];
    animEv.forEach((x) => ev.push(at(x)));
  }
  ev.push(total);
  ev.sort((a, b) => a - b);
  const gaps = [];
  for (let k = 1; k < ev.length; k++) if (ev[k] - ev[k - 1] > 3.5) gaps.push([ev[k - 1], ev[k]]);
  const maxGap = Math.max(...ev.slice(1).map((v, k) => v - ev[k]));
  add('Novidade a cada ~3 s', 20 * (1 - Math.max(0, maxGap - 3) / 4), 20,
    gaps.length ? `trechos parados: ${gaps.map(([a, b]) => `${a.toFixed(1)}–${b.toFixed(1)} s`).join(', ')} (ênfase, overlay, shot, keys ou label)` : `maior intervalo ${maxGap.toFixed(1)} s`);

  // 6. ritmo da fala
  const nWords = episode.scenes.reduce((a, s) => a + wordsOf(s.narration).length, 0);
  const speech = scenes.reduce((a, s) => a + s.captions.reduce((b, c) => b + (c.end - c.start), 0), 0) || 1;
  const wps = nWords / speech;
  // sem áudio real o ritmo é o próprio chute da estimativa (2,7 palavras/s): não dá pra medir ainda
  const hasAudio = scenes.some((s) => s.visemes);
  if (hasAudio) add('Ritmo da fala', wps >= 2.7 && wps <= 3.6 ? 10 : wps >= 2.3 && wps <= 4 ? 6 : 2, 10,
    `${wps.toFixed(1)} palavras/s ${wps < 2.7 ? '(lento: corte palavras, não acelere a voz)' : wps > 3.6 ? '(rápido demais para legenda)' : '(bom)'}`);
  else checks.push({ name: 'Ritmo da fala', got: 0, max: 0, pending: true, msg: 'sem áudio ainda: medido depois do make voice' });

  // 7. silêncio morto dentro das cenas
  const dead = [];
  for (const s of scenes) for (let k = 1; k < s.captions.length; k++) if (s.captions[k].start - s.captions[k - 1].end > 0.9) dead.push(s.captions[k - 1].end);
  add('Sem silêncio morto', 5 - dead.length * 2, 5, dead.length ? `pausas longas em ${dead.map((x) => `${x.toFixed(1)} s`).join(', ')}` : 'ok');

  // 8. pergunta aberta, resposta e emenda
  const hasPayoff = episode.scenes.some((s) => s.tone === 'payoff');
  const lastLine = clean(episode.scenes[episode.scenes.length - 1].narration).toLowerCase();
  const firstWords = new Set(wordsOf(episode.scenes[0].narration).map((w) => w.toLowerCase().replace(/[^\p{L}\d]/gu, '')).filter((w) => w.length >= 4));
  const ties = wordsOf(lastLine).some((w) => firstWords.has(w.replace(/[^\p{L}\d]/gu, ''))) || /[?…]$/.test(lastLine);
  add('Resposta e emenda', (hasPayoff ? 3 : 0) + (episode.loop ? 4 : 0) + (ties ? 3 : 0), 10,
    [hasPayoff ? null : 'falta cena de payoff', episode.loop ? null : 'sem "loop": o fim não emenda no começo', ties ? null : 'a última frase não retoma o gancho'].filter(Boolean).join('; ') || 'fecha e emenda no começo');

  // 9. sem pedido de inscrição no fim (quebra o loop e entrega que acabou)
  const cta = CTA.filter((c) => lastLine.includes(c));
  add('Sem pedido no fim', cta.length ? 0 : 5, 5, cta.length ? `tire "${cta[0]}" do fim` : 'ok');

  // 10. sem cara de IA
  const all = episode.scenes.map((s) => clean(s.narration).toLowerCase()).join(' ') + ' ' + (hook ?? '').toLowerCase();
  const found = CLICHES.filter((c) => all.includes(c));
  if (/—|–/.test(all)) found.push('travessão');
  add('Sem cara de IA', 10 - found.length * 2.5, 10, found.length ? `clichês: ${found.map((f) => `"${f}"`).join(', ')}` : 'ok');

  const warns = [];
  for (const s of episode.scenes) {
    for (const sent of clean(s.narration).split(/(?<=[.!?…])\s/)) if (sent.split(' ').length > 18) warns.push(`${s.id}: frase longa (${sent.split(' ').length} palavras)`);
    // "rápido, barato e confiável": lista de três é o tique mais reconhecível de texto gerado
    const tri = clean(s.narration).match(/\b[\p{L}]+, [\p{L}]+,? e [\p{L}]+\b/u);
    if (tri) warns.push(`${s.id}: lista de três ("${tri[0]}") — tem certeza que precisa dos três?`);
    const em = (s.narration.match(/\*[^*]+\*/g) ?? []).length;
    if (em > 3) warns.push(`${s.id}: ${em} ênfases (mais de 3 vira barulho)`);
    for (const ac of new Set(clean(s.narration).match(/\b[A-Z]{2,5}\b/g) ?? [])) if (!KNOWN.has(ac)) warns.push(`${s.id}: sigla "${ac}" — explique ou troque por palavra`);
  }
  // nota sobre o que deu pra medir (o que depende do áudio fica de fora até ele existir)
  const max = checks.reduce((a, c) => a + c.max, 0);
  const score = Math.round((checks.reduce((a, c) => a + c.got, 0) / max) * 100);
  return { score, checks, warns, estimated: !hasAudio };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const dir = resolveEpisode(args._[0]);
  const episode = loadEpisode(dir);
  const { timeline } = timelineFor(dir, episode);
  const { score, checks, warns, estimated } = retention(episode, timeline);
  console.log(`\nRetenção do roteiro: ${score}/100  (${episode.episode_id}, ${timeline.total_duration.toFixed(1)} s${estimated ? ' estimados, sem áudio' : ''})\n`);
  for (const c of checks) {
    if (c.pending) { console.log(`  · ${c.name.padEnd(24)}   –    ${c.msg}`); continue; }
    console.log(`  ${c.got === c.max ? '✓' : c.got === 0 ? '✗' : '~'} ${c.name.padEnd(24)} ${String(Math.round(c.got)).padStart(2)}/${c.max}  ${c.msg}`);
  }
  if (warns.length) { console.log('\n  avisos:'); warns.forEach((w) => console.log(`    - ${w}`)); }
  const fix = checks.filter((c) => !c.pending && c.got < c.max).sort((a, b) => (b.max - b.got) - (a.max - a.got)).slice(0, 3);
  if (fix.length) console.log(`\n  Corrigir primeiro: ${fix.map((c) => c.name).join(' · ')}`);
  console.log('\n  A nota mede o roteiro contra os motivos clássicos de abandono; não prevê a retenção real.\n');
}
