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

Ajustes por linha de comando: `--samples`, `--aperture`, `--fps`, `--scale`, `--crf`, `--from`, `--to`, `--scene`.

## Onde entra o Zig

`sim/sim.zig` é o simulador de partículas (faíscas, fluxo, poeira), compilado para `wasm32-freestanding` (9 KB).
Como o motor salta para qualquer instante, efeitos com estado precisam ser re-simulados do zero até `t`;
passo fixo de 1/120 s e PRNG com semente garantem o mesmo resultado sempre. O `.wasm` já vem compilado em
`engine/public/`; `make wasm` recompila (testado com Zig 0.17).

O resto fica em JavaScript de propósito: quem desenha é a GPU, e passar a montagem de cena para WASM não deixaria nada mais bonito nem mais rápido.

## Narração

O motor não gera voz. Sem áudio, a duração de cada cena é estimada pela contagem de palavras.
Quando tiver a narração, salve um arquivo por cena em `episodes/<ep>/audio/<scene_id>.wav` e rode:

```bash
make render EP=ep01_tecla    # as durações passam a vir do áudio
make video  EP=ep01_tecla    # mixa, normaliza em -14 LUFS e gera <ep>_final.mp4
```

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
mais prefabs (SSD, placa-mãe, pilha de memória), e transição entre cenas além do corte seco.

Licença MIT.
