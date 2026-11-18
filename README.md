# Camada Zero

Canal de vídeos curtos sobre o que acontece de verdade dentro do computador, do app até o silício.
Quem apresenta é o **Nibble**, um tatu-bola que se enrola quando o assunto aperta.

Este repositório é o motor que faz os vídeos. Cada episódio é um `script.json` com o texto e a encenação;
o motor monta a cena em 3D, renderiza quadro a quadro e entrega um mp4 vertical com voz, efeitos e legenda.

```
script.json ─► validador ─► nota de retenção ─► linha do tempo ─► Three.js ─► PNG ─► ffmpeg ─► mp4
                                                                     ▲
                                                 Zig (WASM): placas, desgaste e partículas
```

## Rodar

Precisa de Node 22+, ffmpeg 6 ou mais novo (de preferência com libx264) e Chrome (ou Chromium).
Zig só se for mexer nos geradores.

```bash
make install
make dev                         # http://127.0.0.1:5173/?ep=ep01_tecla  (&t=12.5 congela num instante)
make stills    EP=ep01_tecla     # 3 PNGs por cena pra conferir enquadramento
make retention EP=ep01_tecla     # nota do roteiro e o que corrigir
CZ_GPU=1 make render EP=ep01_tecla
```

**GPU.** Sem `CZ_GPU=1` o Chrome renderiza no SwiftShader (CPU). Funciona, mas o render final leva horas
em vez de minutos. Com ele, o motor testa os caminhos até a GPU (EGL, GL, Vulkan) e usa o primeiro que
funcionar; a linha `GPU: ...` no começo do render diz qual, e `CZ_ANGLE=vulkan` (ou `gl-egl`, `gl`) força
um. O GL vem antes porque numa RX 5500 XT o Vulkan deu a mesma imagem uns 16% mais devagar. Se o
SwiftShader não der WebGL2, o render sem `CZ_GPU` avisa e vai pra GPU do mesmo jeito. `make gpu-check`
mostra o que travou cada caminho. Se o Chrome não estiver num caminho padrão, defina `CHROME_PATH`.

No Void, o pacote `chromium` não traz o `libvulkan.so.1` que o ANGLE procura na pasta do próprio Chrome,
e sem ele caem o Vulkan e o SwiftShader (que roda sobre Vulkan). O `make gpu-check` detecta e mostra o
conserto: `sudo ln -s /usr/lib/libvulkan.so.1 /usr/lib/chromium/libvulkan.so.1`, ou, sem root,
`CHROME_PATH` apontando pro Chrome que o Playwright baixa em `~/.cache/ms-playwright`.

**ffmpeg.** O render pergunta ao ffmpeg o que ele tem e usa o primeiro destes que funcionar de verdade:
`libx264` (CRF 14, tune animation, BT.709: é a qualidade final), `libx265`, e por último `h264_vaapi` ou
`hevc_vaapi` na GPU (`/dev/dri/renderD128`), que é só reserva. A linha `Encoder: ...` diz qual foi e, no
VAAPI, qual modo de qualidade o driver aceitou (o radeonsi da AMD só tem CQP, CBR e VBR). `--codec
x264|x265|h264_vaapi|hevc_vaapi|prores` força um; se o ffmpeg não tiver, o erro diz qual flag de
compilação falta, e o `make video` faz o mesmo com os filtros de áudio. `FFMPEG=/caminho/do/ffmpeg` usa
outro binário. Quem compila o ffmpeg à mão precisa de `--enable-gpl --enable-libx264` (e
`--enable-libx265`), mais os pacotes `x264-devel` e `x265-devel`; confira com
`ffmpeg -hide_banner -encoders | grep -E 'libx26|vaapi'`.

**Regressão visual.** `node pipeline/golden.mjs` só compara no SwiftShader, onde as referências de
`tests/golden` foram feitas. Num Chrome sem ele, pula e manda rodar no CI.

## Um episódio, do zero

```bash
make new       EP=ep02_ram TITLE="Por que a RAM esquece"   # esqueleto válido; o editor autocompleta pelo schema/
make validate  EP=ep02_ram                                  # o roteiro está certo?
make retention EP=ep02_ram                                  # o roteiro segura? (mire em 85+)
make stills    EP=ep02_ram                                  # o quadro está bonito?
make voice     EP=ep02_ram                                  # narração na ElevenLabs
CZ_GPU=1 make render EP=ep02_ram
make video     EP=ep02_ram                                  # voz + efeitos + trilha + .srt, em -14 LUFS
make thumb     EP=ep02_ram SCENE=1 AT=2
```

Como escrever o roteiro (ou pedir pra uma LLM escrever) está em [`docs/roteiro.md`](docs/roteiro.md).
Lá tem o catálogo completo, as regras de enquadramento e, principalmente, como não soar como IA.

## Retenção

`pipeline/retention.mjs` lê o roteiro e a linha do tempo e dá uma nota de 0 a 100. Ele confere:
duração, se a primeira frase abre uma pergunta em até 9 palavras, se o primeiro quadro já se mexe,
se tem título de gancho, se aparece algo novo na tela a cada ~3 s (e onde não aparece), ritmo da fala
quando já tem áudio, silêncio morto, se o fim responde o gancho e emenda no começo, pedido de inscrição
no fim e frases com cara de texto gerado.

O motor tem as peças pra isso:

- **`hook`**: título grande nos primeiros segundos, pra quem assiste sem som.
- **`teaser`**: o vídeo abre com um relance de uma cena futura e entra no gancho com chicote.
- **`loop`**: a última cena sai em chicote e emenda no começo; a última frase leva de volta à primeira.
- **`*ênfase*`**: legenda própria em âmbar, a lente fecha um pouco e soa um impacto grave.
- **Legenda por frase**: quebra na pontuação e antes de conectivo, nunca deixa artigo pendurado.

O `ep01_tecla` foi reescrito com isso: de 54 para 96 pontos, de 55 para ~40 s.

Uma nota alta não garante 70% de retenção, nem nenhum número. Ela garante que o roteiro não tem os
erros que derrubam vídeo curto. O resto é tema, thumbnail, voz e sorte com o algoritmo. Depois de
publicar, compare a curva de retenção do YouTube com os horários que o avaliador apontou.

## Por dentro

**Imagem.** Cada quadro é a média de 16 sub-quadros em HDR, com jitter de subpixel, de tempo e de lente:
antialiasing, motion blur de obturador 180° e profundidade de campo de verdade, sem blur falso em pós.
Depois vem oclusão de ambiente, bloom no que emite luz, ACES, vinheta, grão e correção de cor por cenário.
Tudo é função de `t`, então qualquer quadro sai idêntico em qualquer ordem.

**Nibble** (`engine/src/character/`). Modelado inteiro em código. Cada animação só define alvos; molas a
120 Hz perseguem esses alvos, orelhas, cauda e achatamento reagem à aceleração, e o braço alcança objetos
por cinemática inversa de dois ossos. Com o áudio da ElevenLabs, a boca abre em cada vogal no instante certo.

**Câmera** (`engine/src/stage/camera.js`). Enquadramentos, movimentos com início e fim parados, câmera na mão,
reações, vários planos por cena e transições (`whip`, `dive`, `rise`) que casam a velocidade no corte.

**Cenários** (`engine/src/stage/env/`). `bancada` (oficina à noite), `chip` (dentro do silício),
`vazio` (estúdio escuro) e `memoria` (corredor de bancos de DRAM). Toda superfície tem desgaste e
toda luz vem de algo que existe na cena.

**Zig** (`sim/`, compilado pra `wasm32-freestanding`). `gen.zig` roteia trilhas de placa de verdade
(caminho mínimo com curvas de 45° e 90°, ladrilhável) e gera os mapas de desgaste de madeira, tinta e
borracha. `sim.zig` simula partículas a passo fixo de 1/120 s com semente, então o motor pode saltar
pra qualquer instante e o resultado é sempre o mesmo. Os `.wasm` já vêm compilados em `engine/public/`.

**Fluidez.** O mesmo episódio sai a 30 ou 60 fps (`make render60`). `make smooth` percorre o episódio
sem renderizar e aponta picos de aceleração fora dos cortes.

## Voz

```bash
export ELEVENLABS_API_KEY=sk_...      # só no ambiente, nunca em arquivo do repositório
make voices                           # lista as vozes da conta
echo '{ "voice_id": "SEU_ID" }' > voice.json
make voice EP=ep01_tecla
```

Os padrões puxam pro lado humano: estabilidade 0,35 (a entonação varia entre frases), style 0,3, gancho
um pouco mais rápido e fechamento mais calmo. O `||` do roteiro vira uma pausa do tamanho que a pontuação
pede. Uma cena pode ajustar a própria voz com `"voice": { "speed": 0.95 }`.

Há cache por cena: mudou uma frase, só aquela cena é gerada de novo. Cada caractere custa ~1 crédito;
um episódio de 40 s gasta uns 550. Dá pra usar a própria voz: salve `audio/<cena>.wav` e pule o `make voice`.

A voz passa por uma cadeia de masterização no `make video`: corte de grave, de-esser, -3 dB na faixa de
6,5 kHz (onde o pt-BR sintético fica estridente), um pouco de corpo em 180 Hz e compressão leve. Se a voz
escolhida ainda soar aguda ou ficar abafada, ajuste no `voice.json`, sem mexer no código:
`"eq": { "deess": 0.5, "harsh": -4, "air": -1.5, "body": 2 }`. O volume final é medido em duas passadas
e fica em -14 LUFS.

O `make video` sintetiza os efeitos no ffmpeg (chicote, impacto da ênfase, clique, faísca, pulo), põe o
fundo de cada cenário, abaixa a trilha (`music.mp3`, opcional) quando há voz e gera a legenda `.srt`.

## Estrutura

```
shared/      catálogo e linha do tempo (navegador e Node usam os mesmos)
engine/src/  render/  character/  prefabs/  stage/ (cenários, câmera)  hud/  sim/ (ponte WASM)
sim/         geradores em Zig
pipeline/    validate, retention, render, voice, sfx, assemble, smoothness, golden
episodes/    um diretório por episódio (ep00 é o rolo de teste do Nibble, ep90 o catálogo de objetos)
docs/        roteiro.md
tests/       referências de imagem pra regressão visual
```

O CI compila o Zig, confere o esquema, valida os episódios, roda o verificador de fluidez e a
regressão visual. O que ainda falta está no [`ROADMAP.md`](ROADMAP.md).

Licença MIT.
