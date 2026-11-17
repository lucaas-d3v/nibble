#!/usr/bin/env node
// Gera schema/episode.schema.json a partir do catálogo (shared/catalog.js), para o editor
// autocompletar e marcar erro enquanto se escreve o roteiro. Rode depois de mexer no catálogo.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as C from '../shared/catalog.js';
import { ROOT } from './common.mjs';

const vec3 = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
const anchor = { oneOf: [vec3, { type: 'object', required: ['obj'], properties: { obj: { type: 'string' }, local: vec3 } }] };
const schema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'Episódio do Camada Zero',
  type: 'object',
  required: ['episode_id', 'title', 'scenes'],
  properties: {
    $schema: { type: 'string' },
    episode_id: { type: 'string', pattern: '^ep\\d{2}_[a-z0-9_]+$', description: 'ex.: ep02_ram' },
    title: { type: 'string' },
    outfit: { enum: C.OUTFITS },
    hook: { oneOf: [{ type: 'string' }, { type: 'object', required: ['text'], properties: { text: { type: 'string' }, until: { type: 'number' } } }], description: 'título grande no início; *trecho* em âmbar' },
    teaser: { type: 'object', required: ['scene'], properties: { scene: { type: 'string' }, at: { type: 'number' }, dur: { type: 'number' } }, description: 'relance de uma cena futura antes do gancho' },
    loop: { type: 'boolean', description: 'o fim emenda no começo com um chicote (rever sem perceber)' },
    thumb_title: { type: 'string' },
    scenes: {
      type: 'array', minItems: 1,
      items: {
        type: 'object', required: ['id', 'narration'],
        properties: {
          id: { type: 'string' },
          tone: { enum: C.TONES },
          environment: { enum: C.ENVIRONMENTS },
          layer: { type: 'string', description: '"camada N · nome" (a transição auto usa o N)' },
          narration: { type: 'string', description: '|| = pausa (tamanho pela pontuação); *palavra* = ênfase: legenda própria, pancada de câmera e som' },
          voice: { type: 'object', properties: { speed: { type: 'number', minimum: 0.7, maximum: 1.2 }, stability: { type: 'number' }, style: { type: 'number' } } },
          hud_text: { type: 'string', maxLength: C.LIMITS.hudCharsMax },
          camera: { enum: C.CAMERAS },
          camera_move: { enum: C.MOVES },
          transition: { enum: C.TRANSITIONS },
          focus: { oneOf: [{ type: 'string' }, vec3] },
          shots: { type: 'array', items: { type: 'object', required: ['at'], properties: { at: { type: 'number' }, camera: { enum: C.CAMERAS }, camera_move: { enum: C.MOVES }, focus: { oneOf: [{ type: 'string' }, vec3] }, blend: { type: 'boolean' } } } },
          nibble: {
            type: 'object',
            properties: {
              pos: vec3, rotY: { type: 'number' }, anim: { enum: C.ANIMS }, mood: { enum: C.MOODS }, look: { enum: C.LOOKS },
              visible: { type: 'boolean' }, scale: { type: 'number' },
              target: { type: 'object', required: ['obj'], properties: { obj: { type: 'string' }, local: vec3, at: { type: 'number' }, hold: { type: 'number' } } },
            },
          },
          labels: { type: 'array', items: { type: 'object', required: ['text', 'anchor'], properties: { text: { type: 'string' }, anchor, side: { enum: ['left', 'right'] }, at: { type: 'number' }, lift: { type: 'number' } } } },
          overlays: { type: 'array', items: { type: 'object', required: ['type'], properties: { type: { enum: ['counter', 'code'] }, at: { type: 'number' }, dur: { type: 'number' }, from: { type: 'number' }, to: { type: 'number' }, format: { enum: ['dec', 'hex', 'bin'] }, digits: { type: 'integer' }, label: { type: 'string' }, text: { type: 'string' }, char_time: { type: 'number' }, pos: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 } } } },
          objects: {
            type: 'array',
            items: {
              type: 'object', required: ['id', 'type'],
              properties: {
                id: { type: 'string' }, type: { enum: C.PREFABS }, pos: vec3, rot: vec3,
                scale: { oneOf: [{ type: 'number' }, vec3] }, float: { type: 'boolean' }, appear_at: { type: 'number' },
                kind: { enum: C.PARTICLE_KINDS },
                keys: { type: 'array', items: { type: 'object', required: ['t'], properties: { t: { type: 'number' }, pos: vec3, rot: vec3, scale: { oneOf: [{ type: 'number' }, vec3] } } } },
              },
            },
          },
        },
      },
    },
  },
};
writeFileSync(join(ROOT, 'schema', 'episode.schema.json'), JSON.stringify(schema, null, 2) + '\n');
console.log('schema/episode.schema.json');
