#!/usr/bin/env node
// Valida um roteiro antes de gastar tempo de render.
import { ANIMS, MOODS, LOOKS, MOVES, TRANSITIONS, OUTFITS, CAMERAS, ENVIRONMENTS, TONES, PREFABS, PARTICLE_KINDS, LIMITS } from '../shared/catalog.js';
import { buildTimeline } from '../shared/timeline.js';
import { resolveEpisode, loadEpisode, parseArgs } from './common.mjs';

export function validate(ep) {
  const errors = [], warns = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  const oneOf = (where, field, value, list) => { if (value !== undefined && !list.includes(value)) err(where, `${field} "${value}" não existe (use: ${list.join(', ')})`); };

  if (!/^ep\d{2}_[a-z0-9_]+$/.test(ep.episode_id ?? '')) err('episódio', 'episode_id deve ser como "ep01_nome"');
  if (!ep.title) err('episódio', 'falta title');
  oneOf('episódio', 'outfit', ep.outfit, OUTFITS);
  if (!Array.isArray(ep.scenes) || !ep.scenes.length) { err('episódio', 'sem cenas'); return { errors, warns }; }
  if (ep.teaser && !ep.scenes.some((s) => s.id === ep.teaser.scene)) err('episódio', `teaser.scene "${ep.teaser.scene}" não é uma cena`);
  const hook = typeof ep.hook === 'string' ? ep.hook : ep.hook?.text;
  if (hook && hook.replace(/\*/g, '').split(/\s+/).length > 7) warns.push('hook com mais de 7 palavras: no celular ninguém lê');

  const ids = new Set();
  for (const s of ep.scenes) {
    const w = s.id ?? '(cena sem id)';
    if (!s.id) err(w, 'falta id'); else if (ids.has(s.id)) err(w, 'id repetido'); else ids.add(s.id);
    if (!s.narration?.trim()) err(w, 'falta narration');
    oneOf(w, 'tone', s.tone, TONES);
    oneOf(w, 'environment', s.environment, ENVIRONMENTS);
    oneOf(w, 'camera', s.camera, CAMERAS);
    oneOf(w, 'nibble.anim', s.nibble?.anim, ANIMS);
    oneOf(w, 'nibble.look', s.nibble?.look, LOOKS);
    oneOf(w, 'camera_move', s.camera_move, MOVES);
    oneOf(w, 'nibble.mood', s.nibble?.mood, MOODS);
    if (s.nibble?.anim === 'press' && !s.nibble?.target?.obj) err(w, 'anim "press" precisa de nibble.target: { obj, local?, at, hold? }');
    if (s.nibble?.target?.obj && !(s.objects ?? []).some((o) => o.id === s.nibble.target.obj)) err(w, `nibble.target.obj "${s.nibble.target.obj}" não é um objeto da cena`);
    for (const sh of s.shots ?? []) { oneOf(w, 'shots[].camera', sh.camera, CAMERAS); oneOf(w, 'shots[].camera_move', sh.camera_move, MOVES); if (sh.at === undefined) err(w, 'shot sem "at"'); }
    oneOf(w, 'transition', s.transition, TRANSITIONS);
    const words = (s.narration ?? '').replaceAll('||', ' ').trim().split(/\s+/).length;
    if (words > LIMITS.sceneWordsMax) warns.push(`${w}: ${words} palavras na cena (máx. recomendado ${LIMITS.sceneWordsMax})`);
    if (s.hud_text && (s.hud_text.split(/\s+/).length > LIMITS.hudWordsMax || s.hud_text.length > LIMITS.hudCharsMax)) warns.push(`${w}: hud_text longo demais (máx. ${LIMITS.hudWordsMax} palavras / ${LIMITS.hudCharsMax} caracteres)`);
    const nx = s.nibble?.pos?.[0];
    if (nx !== undefined && (nx < LIMITS.xMin || nx > LIMITS.xMax)) err(w, `nibble.pos[0]=${nx} fora de ${LIMITS.xMin}..${LIMITS.xMax}`);

    const objIds = new Set();
    for (const o of s.objects ?? []) {
      const ow = `${w} › ${o.id ?? '(objeto sem id)'}`;
      if (!o.id) err(ow, 'falta id'); else if (objIds.has(o.id)) err(ow, 'id repetido na cena'); else objIds.add(o.id);
      oneOf(ow, 'type', o.type, PREFABS);
      if (o.type === 'particles') oneOf(ow, 'kind', o.kind, PARTICLE_KINDS);
      const x = o.pos?.[0];
      if (x !== undefined && o.type !== 'particles' && (x < LIMITS.xMin || x > LIMITS.xMax)) warns.push(`${ow}: pos[0]=${x} pode sair do quadro vertical`);
    }
    for (const l of s.labels ?? []) {
      if (!l.text) err(w, 'label sem text');
      if (!Array.isArray(l.anchor) && !objIds.has(l.anchor?.obj)) err(w, `label "${l.text}" aponta para objeto inexistente "${l.anchor?.obj}"`);
    }
    if (typeof s.focus === 'string' && !objIds.has(s.focus)) err(w, `focus "${s.focus}" não é um objeto da cena`);
  }

  const total = buildTimeline(ep).total_duration;
  if (total < LIMITS.durMin || total > LIMITS.durMax) warns.push(`duração estimada ${total.toFixed(1)}s fora de ${LIMITS.durMin}–${LIMITS.durMax}s`);
  return { errors, warns, total };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const ep = loadEpisode(resolveEpisode(args._[0]));
  const { errors, warns, total } = validate(ep);
  warns.forEach((m) => console.warn(`aviso  ${m}`));
  errors.forEach((m) => console.error(`ERRO   ${m}`));
  if (errors.length) process.exit(1);
  console.log(`ok     ${ep.episode_id}: ${ep.scenes.length} cenas, ~${total.toFixed(1)}s`);
}
