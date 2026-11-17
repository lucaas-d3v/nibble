#!/usr/bin/env node
// Cria um episódio novo, já válido, para começar a escrever: make new EP=ep02_ram TITLE="Por que a RAM esquece"
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, parseArgs } from './common.mjs';

const args = parseArgs(process.argv.slice(2));
const id = args._[0];
if (!/^ep\d{2}_[a-z0-9_]+$/.test(id ?? '')) { console.error('uso: make new EP=ep02_nome TITLE="Título"'); process.exit(1); }
const dir = join(ROOT, 'episodes', id);
if (existsSync(join(dir, 'script.json'))) { console.error(`já existe: ${dir}/script.json`); process.exit(1); }
mkdirSync(dir, { recursive: true });
const ep = {
  $schema: '../../schema/episode.schema.json',
  episode_id: id,
  title: args.title ?? 'Título do episódio',
  outfit: 'esd',
  scenes: [
    { id: 'sc01_hook', tone: 'hook', environment: 'bancada', layer: 'camada 4 · você', narration: 'Frase de impacto. || A pergunta que o vídeo responde.', hud_text: 'Até cinco palavras', camera: 'hero', nibble: { pos: [-0.45, 0, 0.7], rotY: 0.5, anim: 'roll_in' }, objects: [{ id: 'peca', type: 'cpu', pos: [0.2, 1.6, 0], rot: [1.0, -0.25, 0], float: true }] },
    { id: 'sc02_explica', tone: 'explain', environment: 'chip', layer: 'camada 1 · por dentro', narration: 'O que acontece de verdade, numa ideia só. || Com uma palavra em *destaque*.', hud_text: 'Uma ideia por cena', camera: 'hero', nibble: { pos: [-0.5, 0, 0.75], rotY: 0.5, anim: 'point' }, objects: [{ id: 'peca', type: 'cpu', pos: [0.2, 1.7, 0], rot: [1.0, -0.25, 0], float: true, cutaway: true }] },
    { id: 'sc03_fecha', tone: 'payoff', environment: 'bancada', layer: 'camada 4 · de volta', narration: 'O fechamento que volta ao gancho.', hud_text: 'Fechamento', camera: 'closeup', nibble: { pos: [0, 0, 0.4], rotY: 0.55, anim: 'celebrate', mood: 'happy' } },
  ],
};
writeFileSync(join(dir, 'script.json'), JSON.stringify(ep, null, 2) + '\n');
console.log(`${dir}/script.json  (próximo: make stills EP=${id})`);
