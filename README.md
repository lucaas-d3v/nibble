# Camada Zero

Motor de vídeos explicativos verticais sobre tecnologia, do aplicativo até o silício.
Cada episódio é um `script.json`; o motor renderiza em 3D, quadro a quadro, com o **Nibble** (um tatu-bola) apresentando.

```
episodes/ep01_tecla/script.json ──► validador ──► linha do tempo ──► Three.js (renderAtTime) ──► PNG ──► ffmpeg ──► mp4
                                                                        ▲
                                                             sim.wasm (Zig): partículas
```

## Começar

Requisitos: Node 22+, ffmpeg (6 ou mais novo; testado com flags que valem até o 9), Google Chrome ou Chromium. Zig só se for mexer no simulador.

```bash
make install
make dev                      # http://127.0.0.1:5173/?ep=ep01_tecla  (prévia em loop; &t=12.5 congela)
make stills  EP=ep01_tecla    # 3 PNGs por cena: confira o enquadramento antes de renderizar
make preview EP=ep01_tecla SCENE=3
CZ_GPU=1 make render EP=ep01_tecla
```

Sem `CZ_GPU=1` o Chrome renderiza por software (SwiftShader). Funciona, mas o render final leva horas;
com GPU leva minutos. Se o Chrome não estiver num caminho padrão, defina `CHROME_PATH`.

## De onde vem a qualidade

| Etapa | Como é feito |
|---|---|
| Antialiasing, motion blur, profundidade de campo | Acumulação: cada quadro é a média de 16 sub-quadros em HDR linear, com jitter de subpixel, de tempo (obturador 180°) e de lente. Nada de blur falso em pós. |
| Iluminação | PBR com mapa de ambiente, luz principal com sombra suave, contraluz âmbar, preenchimento ciano |
| Pós | Oclusão de ambiente (GTAO), bloom só no que emite luz, tone mapping ACES, vinheta, aberração cromática leve e grão depois da média |
| Captura | PNG sem perdas direto para o ffmpeg (nada de JPEG intermediário) |
| Codificação | x264 CRF 14 `-tune animation`, conversão BT.709 explícita; `--codec prores` gera master 4444 10 bits; `--codec x265` gera 10 bits |
| Determinismo | Tudo é função de `t`. O mesmo quadro sai idêntico em qualquer ordem, então dá para renderizar só uma cena |

Ajustes por linha de comando: `--samples`, `--aperture`, `--fps`, `--scale`, `--crf`, `--from`, `--to`, `--scene`,
`--clean` (sem HUD) e `--at` (um quadro só, com `--stills`). Thumbnail ou foto de perfil:

```bash
node pipeline/render.mjs ep00_nibble --stills --scene 8 --at 2.2 --scale 1 --samples 16 --clean
```

## Fluidez (30 e 60 fps)

Tudo no motor é função contínua do tempo, então o mesmo episódio sai a 30 ou 60 fps sem mudar nada:

```bash
make render   EP=ep01_tecla      # 30 fps
make render60 EP=ep01_tecla      # 60 fps, o dobro de quadros e de tempo de render
make smooth   EP=ep01_tecla      # verificador: procura trancos quadro a quadro
```

- **Verificador** (`pipeline/smoothness.mjs`): percorre o episódio sem renderizar, mede a aceleração
  de câmera, cabeça, mãos, pés, objetos e partículas, e aponta picos isolados fora dos cortes de cena.
  Rode depois de mexer em animação.
- **Motion blur real**: obturador de 180° (metade do intervalo do quadro) com 16 sub-amostras.
- **Partículas** são simuladas a 120 Hz e interpoladas no resto do passo, então as sub-amostras do
  motion blur formam rastro contínuo, e não cópias.
- **Pulos** agacham antes e comprimem ao pousar, com velocidade e aceleração contínuas.
- **Prévia ao vivo**: `make dev` e abra `/?ep=ep01_tecla&fps=1`. O tempo segue o relógio (quadro
  atrasado não desacelera a animação) e a resolução interna se ajusta para segurar `&target=60`.
  `&fast=1` desliga a oclusão de ambiente. O JavaScript gasta menos de 0,3 ms por quadro; o resto é GPU.

30 fps com motion blur lê como cinema e é o padrão. 60 fps vale para cenas com câmera rápida,
partículas e pulsos de dados, a um custo de render dobrado.

## Câmera

`engine/src/stage/camera.js`, tudo função pura do tempo, em camadas:

1. **Enquadramento** (`camera`): `hero`, `closeup`, `face`, `prop`, `macro`, `top`, `low`.
2. **Movimento da cena** (`camera_move`), com curva C2 (começa e termina parado): `push` (aproxima, tensão),
   `pull` (afasta, revela), `orbit` (paralaxe com o fundo), `crane` (grua subindo), `drift` (quase parada),
   `static`. Em `auto` sai do tom: gancho aproxima, explicação orbita, curiosidade deriva, fechamento afasta.
3. **Reações**: soco de zoom e tremida curta no pulo de susto; no `roll_in` a câmera acompanha a bola.
4. **Câmera na mão**: ruído suave de posição e rotação, mais forte em gancho e fechamento.
5. **Transições** (`transition`, na cena que entra): `whip` (chicote de ~24° com motion blur), `dive`
   (mergulha na mesa, clarão, chega caindo no cenário novo: descer de camada), `rise` (o inverso),
   `cut`. Em `auto`: mesmo cenário vira `whip`; troca de cenário vira `dive` ou `rise` conforme o número
   da camada desce ou sobe. A saída de uma cena e a entrada da próxima casam a velocidade no corte.

**Foco**: a lente tem ponto de foco próprio (o recorte da imagem se desloca para manter o plano de foco,
em vez de reapontar a câmera). Em `closeup` e `face` o foco fica no rosto do Nibble; no `point`, o foco
passa para o objeto e volta. Ajuste a força com `--aperture` (padrão 0,012).

## Cenários

`engine/src/stage/environments.js`. Regras: o centro alto do quadro (onde flutua o objeto) fica calmo,
o detalhe vai para as laterais e para o fundo, toda superfície tem desgaste, e a luz vem de fontes que
existem na cena.

- **`bancada`**: oficina de eletrônica à noite. Mesa de madeira com riscos e anéis de caneca, manta
  antiestática, chapa perfurada com pintura lascada, ferramentas, post-its, gaveteiro de componentes,
  bobinas de fio, osciloscópio, monitor com código, caneca, protoboard com jumpers, multímetro,
  resistores, cabos, planta, cordão de lâmpadas (vira bokeh com profundidade de campo) e luminária
  articulada fora do quadro com poeira no feixe.
- **`chip`**: dentro do silício. Chão de interconexão roteada (gen.zig) com pulsos de dados correndo
  pelas próprias trilhas acesas, torres de lógica com células de memória acesas, capacitores,
  pilares de vias, barramento suspenso, elétrons à deriva e céu com brilho quente no horizonte.
- **`vazio`**: estúdio com fundo infinito, halo atrás do personagem, pontos de luz e poeira.

O desgaste vem de `gen_surface` em `gen.zig` (madeira, metal pintado, borracha): ruído ladrilhável,
riscos, manchas, lascas e poeira, em mapas de cor, relevo e rugosidade. Use `wornMaterial(cor, tipo)`
de `engine/src/sim/gen.js` em qualquer objeto novo.

## O Nibble

Tatu-bola em pé, modelado inteiro em código (`engine/src/character/`):

- **Forma** (`geometry.js`): cabeça é uma superfície de revolução com o focinho caído; escudo cefálico
  e carapaça são fatias de elipsoide com escamas em textura procedural (relevo + sulcos). Carapaça em
  cinco segmentos sobrepostos: escudo, três bandas de cobre, escudo; a banda do meio tem o filete âmbar.
- **Olhos**: íris e pupila desenhadas no shader do globo ocular, então o olho gira de verdade e a pupila
  dilata. Pálpebras são calotas; inclinar a de baixo para a frente faz o olho sorridente.
- **Movimento** (`motion.js`): cada animação só define alvos. Molas amortecidas perseguem os alvos a
  120 Hz, com o alvo suavizado antes (entrada em curva S). Orelhas, cauda e o achatamento ao pousar são
  ação secundária: reagem à aceleração da cabeça e do corpo. A simulação fica em cache por cena, então
  `renderAtTime(t)` continua determinístico em qualquer ordem.
- **Fala**: a boca abre por sílaba estimada a partir das legendas; com áudio real, as durações
  passam a vir dos arquivos e a sincronia acompanha.

`episodes/ep00_nibble` é o rolo de teste: uma cena por animação, mais o retrato.

## Onde entra o Zig

Dois módulos em `sim/`, compilados para `wasm32-freestanding` (`make wasm`, testado com Zig 0.17.1).
Os `.wasm` já vêm compilados em `engine/public/`.

**`gen.zig` (27 KB): gerador de placas.** Roteia trilhas de verdade numa grade: caminho mínimo com custo
de curva (só 45° e 90°), trilhas que se desviam dos componentes e umas das outras, barramentos,
vias de costura. Rasteriza com antialias em quatro mapas de material (cor, normal, AO/rugosidade/metal,
emissão) e a grade dá a volta nas bordas, então a textura repete sem costura. Dois estilos: placa verde
com máscara de solda, pads dourados e serigrafia (objetos `cpu`, `ram`, `key`, `key_matrix`), e silício
escuro com blocos de memória e trilhas acesas em âmbar e ciano (chão do cenário `chip`). Mesma semente,
mesma placa. Gera uma vez por cena, ~0,3 s (1024 px) e ~1 s (2048 px).

**`sim.zig` (9 KB): partículas** (faíscas, fluxo, poeira). Como o motor salta para qualquer instante,
efeitos com estado são re-simulados do zero até `t`; passo fixo de 1/120 s e PRNG com semente garantem o
mesmo resultado sempre.

O resto fica em JavaScript de propósito: quem desenha é a GPU, e passar a montagem de cena para WASM não
deixaria nada mais bonito nem mais rápido.

## Narração

Sem áudio, a duração de cada cena é estimada pela contagem de palavras. A narração sai da ElevenLabs:

```bash
export ELEVENLABS_API_KEY=sk_...      # só no ambiente; nunca em arquivo do repositório
make voices                           # lista as vozes da conta, com o ID
echo '{ "voice_id": "SEU_ID" }' > voice.json
make voice  EP=ep01_tecla             # um mp3 por cena em audio/; "||" vira pausa
make render EP=ep01_tecla             # as durações passam a vir do áudio
make video  EP=ep01_tecla             # mixa, normaliza em -14 LUFS e gera <ep>_final.mp4
```

Há cache por cena: mudou uma frase, só aquela cena é gerada de novo (`--force` refaz tudo).
Cada caractere custa ~1 crédito; um episódio de ~55 s gasta uns 750. `voice.json` também aceita
`model_id`, `stability`, `similarity_boost`, `style` e `speed`. Também dá para gravar a própria
voz: salve `audio/<scene_id>.wav` e pule o `make voice`.

## Estrutura

```
shared/      catálogo e linha do tempo (usados pelo navegador e pelo Node)
engine/src/  render/ (acumulação e pós)  character/ (Nibble)  prefabs/  stage/ (cenários, câmera)  hud/  sim/ (ponte WASM)
sim/         simulador em Zig
pipeline/    validate, render, assemble
episodes/    um diretório por episódio
docs/        roteiro.md: contrato para escrever (ou pedir a uma LLM) novos episódios
```

Para criar um objeto novo: adicione a função em `engine/src/prefabs/index.js`, registre em `REGISTRY`
e inclua o nome em `shared/catalog.js`.

## Estado

Funciona de ponta a ponta com o episódio de exemplo. Falta: narração, trilha e efeitos sonoros,
mais prefabs (SSD, placa-mãe, pilha de memória), transição entre cenas além do corte seco, e boca
sincronizada com fonemas do áudio real (hoje é por sílaba estimada do texto).

Licença MIT.
