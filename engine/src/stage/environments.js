// Cenários. Regras de composição para o quadro 9:16:
//  - o centro alto (x -0.6..0.6, y 1.2..2.4) fica calmo: é onde flutua o objeto do episódio;
//  - detalhe vai para as laterais e para o fundo, onde a profundidade de campo desfoca;
//  - toda superfície tem desgaste (gen.zig): cor e brilho nunca são uniformes;
//  - cada cenário tem fontes de luz que existem na cena (luminária, monitor, LEDs) e atmosfera.

import { bancada } from './env/bancada.js';
import { chip } from './env/chip.js';
import { vazio } from './env/vazio.js';
import { memoria } from './env/memoria.js';

const ENVS = { bancada, chip, vazio, memoria };

export function buildEnvironment(name, quality) {
  return (ENVS[name] ?? ENVS.bancada)(quality);
}
