# Contrato de roteiro — Camada Zero

Use este arquivo como instrução de sistema para uma LLM gerar episódios, ou como referência ao escrever à mão.
A saída é **um único objeto JSON** salvo em `episodes/<episode_id>/script.json`. Rode `make validate` antes de renderizar.

## O canal

**Camada Zero**: vídeos verticais 9:16 de **25 a 40 s** que respondem "o que acontece de verdade quando você…",
descendo camada por camada até o hardware. Quem apresenta é o **Nibble**, um tatu-bola.

Regras editoriais:

- Toda afirmação técnica precisa ser verdadeira. Simplificar pode; inventar não. Na dúvida, corte a frase.
- Uma ideia por cena. Estrutura: gancho → 3 ou 4 camadas → fechamento que volta ao gancho.
- `hud_text`: até 5 palavras e 24 caracteres. `layer`: "camada N · nome" (a numeração desce ao longo do vídeo).

## Escrever como gente

O texto vai ser falado por uma voz sintética, e o público de vídeo curto reconhece texto de IA em
duas frases. O que mais denuncia não é a voz, é o roteiro. Então:

- **Fale como fala.** "pra", "tá", "aí", "a gente". Frase curta. Nada de "dessa forma", "através de", "realiza".
- **Número no lugar de adjetivo.** "mil vezes por segundo" em vez de "extremamente rápido";
  "menos que uma piscada" em vez de "em frações de segundo".
- **Uma imagem concreta por cena**, de coisa que a pessoa já viu: a letra na tela, o cabo, a tecla afundando.
- **Proibido** (o `make retention` acusa): "imagine", "você sabia", "neste vídeo", "hoje vamos", "vamos explorar",
  "mergulhar", "fascinante", "incrível", "desvendar", "jornada", "no mundo de hoje", "em resumo", "crucial",
  "fundamental", "essencial", "a magia de", "não é apenas… é", "por trás das cenas", "basicamente".
- **Sem lista de três** ("rápido, eficiente e seguro"). É o tique mais reconhecível de texto gerado.
- **Sem travessão** pra emendar frase. Ponto final resolve.
- **Pode ter graça**, desde que seja verdade: "e o teclado? Continua quieto, esperando o PC perguntar".
- **Siglas**: só as que todo mundo usa (PC, USB, TV). O resto vira palavra ("o processador", não "CPU").

## Retenção

Ninguém garante uma porcentagem de retenção: ela depende do tema, da thumbnail, da voz e de pra quem o
algoritmo mostra. O que dá pra garantir é que o vídeo não tenha nenhum dos motivos clássicos de abandono.
`make retention EP=...` dá uma nota de 0 a 100 e diz o que corrigir primeiro. Mire em 85 ou mais.

- **Primeira frase com até 9 palavras**, abrindo uma pergunta, uma contradição ou um número.
  "Seu teclado nunca avisa que você apertou." é melhor que "Hoje vamos ver como funciona o teclado."
- **A voz entra de cara** (até 0,35 s), ou até 1 s se tiver título de gancho na tela.
- **`hook`** no episódio: título grande nos primeiros ~2,5 s, até 7 palavras, `*trecho*` em âmbar.
  Metade das pessoas assiste sem som; é o título que segura essas.
- **`teaser`** no episódio: `{ "scene": "sc05_cpu", "at": 1.3, "dur": 0.8 }` abre o vídeo com um relance
  de 0,8 s de uma cena futura (sem voz, com o título por cima) e entra no gancho com chicote.
  O primeiro quadro já está em movimento.
- **Algo novo na tela a cada ~3 s**: ênfase, `shots`, `overlays`, `labels`, `keys`, `appear_at`, ação do Nibble.
  O avaliador aponta os trechos parados com o horário.
- **Ênfase** (`*palavra*`): vira legenda própria, a lente fecha um pouco e soa um impacto grave.
  Uma ou duas por cena; mais que três vira barulho.
- **25 a 40 s.** Passou disso, corte uma ideia inteira, não acelere a fala.
- **Feche respondendo o gancho** (cena `payoff`) e **emende no começo**: `"loop": true` faz a última cena
  sair em chicote e a última frase deve levar de volta à primeira. Quem não percebe o corte assiste de novo.
- **Sem "se inscreve" no fim.** Entrega que acabou e quebra o loop.
- **Pausas**: `||` vira um respiro do tamanho que a pontuação pede (vírgula curta, ponto médio,
  pergunta mais longa). Não use pra drama em toda frase.

## Enquadramento

- Eixo X visível: de **-0.9 a 0.9**. Chão em `y = 0`.
- Nibble fica embaixo à esquerda: `pos` perto de `[-0.5, 0, 0.7]`, `rotY` entre 0.4 e 0.7.
  Virado para a direita, o focinho aparece em 3/4, que é o que faz ele ler como tatu. De frente
  (`rotY` perto de 0) o focinho aponta para a lente e encurta.
- O objeto em exibição fica no alto: `y` entre 1.5 e 2.0, `x` entre 0 e 0.35, inclinado para a câmera (`rot[0]` ≈ 1.0 para peças planas).
- A legenda ocupa a faixa de baixo; não ponha nada importante com `y < 0.3` na frente do Nibble.

## Catálogo

| Campo | Valores |
|---|---|
| `outfit` | `none`, `esd` (pulseira antiestática), `hoodie`, `goggles` |
| `environment` | `bancada` (oficina à noite, cheia de objetos; bom para hardware físico), `chip` (cidade de lógica dentro do silício; bom para o que acontece eletricamente), `vazio` (estúdio escuro; bom para conceito abstrato e software), `memoria` (corredor de bancos de DRAM; RAM, cache, armazenamento) |
| `tone` | `hook`, `curious`, `explain`, `payoff`, `outro` |
| `camera` | `hero` (plano geral, padrão), `closeup` (Nibble da cintura para cima), `face` (rosto; bom para reação e thumbnail), `prop` e `macro` (no objeto de `focus`), `top`, `low` |
| `nibble.anim` | ver tabela abaixo |
| `nibble.look` | opcional: `camera` ou `focus` fixa o olhar a cena toda |
| `camera_move` | opcional: `push`, `pull`, `orbit`, `crane`, `drift`, `static` (padrão `auto`, escolhe pelo `tone`) |
| `voice` | opcional, ajuste da voz na cena: `{ "speed": 0.95, "stability": 0.5 }` (padrão: gancho 1,05, payoff 0,95) |
| `transition` | opcional, transição de entrada da cena: `whip`, `dive`, `rise`, `cut` (padrão `auto`: `whip` no mesmo cenário, `dive`/`rise` ao descer/subir de camada). Para `auto` funcionar, use `layer` como "camada N · nome". |

### Animações do Nibble

Todas são procedurais e reagem à narração: enquanto há fala, a boca mexe por sílaba, a cabeça
marca o ritmo, o filete âmbar da carapaça pulsa com a voz e os braços fazem gestos sorteados
(abrir, apresentar, contar, dar de ombros). Nas pausas (`||`) ele volta ao repouso.

| anim | O que faz |
|---|---|
| `roll_in` | Entra rolando como bola, desenrola com um pulinho e abre os braços. Use na primeira cena. |
| `talk` | Apresentador: gestos de fala, olha para a câmera, de vez em quando olha o objeto. |
| `point` | Aponta para o objeto de `focus` com o braço do lado dele, olha, depois volta para a câmera. Após ~3 s vira `talk`. |
| `think` | Mão sob o focinho, cabeça inclinada, olhar para o alto; o filete pisca como se estivesse processando. |
| `shock` | Pulo de susto com as mãos para cima, pupilas pequenas. Depois de ~2,5 s volta a falar ainda surpreso. |
| `celebrate` | Três pulinhos com os braços para cima e olhos sorrindo, depois fala animado. |
| `wave` | Acena com o braço do lado da câmera. Bom para abertura ou encerramento. |
| `press` | Estica o braço e aperta um objeto (ver Coreografia). |
| `idle` | Respira, troca o peso de perna, olha em volta. |

### Coreografia

- **Humor**: `nibble.mood`: `happy`, `excited`, `serious`, `confused`, `sad` (viés de expressão por cima da animação).
- **Apertar/tocar**: `nibble.anim: "press"` com `nibble.target: { "obj": "<id>", "local": [x,y,z], "at": 1.4, "hold": 0.6 }`.
  O braço chega no ponto por cinemática inversa, o corpo inclina e a cabeça acompanha. Numa `key`, a tecla
  afunda sozinha quando a mão chega. O objeto precisa estar ao alcance (uns 0,3 do ombro): mesa, perto dos pés.
- **Quadros-chave** em qualquer objeto: `"keys": [{ "t": 0, "pos": [...] }, { "t": 3, "pos": [...], "rot": [...], "scale": 1.2 }]`
  (curva suave, sai e chega parado; combina com `float`).
- **Vários planos na cena**: `"shots": [{ "at": 2.4, "camera": "prop", "focus": "<id>", "camera_move": "push", "blend": true }]`.
  O primeiro plano é o `camera` da cena; `blend` faz a câmera ir suave do plano anterior em vez de cortar.

### Objetos (`objects[].type`)

Comuns a todos: `id`, `pos`, `rot`, `scale`, `float` (flutua e gira devagar), `appear_at` (entra com pop).

| type | Opções |
|---|---|
| `key` | `label`, `press_at`, `hold`, `cutaway` (carcaça transparente, mostra os contatos) |
| `key_matrix` | `rows`, `cols`, `hit: [linha, coluna]`, `hit_at`, `scan_period` |
| `chip` | `label`, `on_at`, `color` |
| `cpu` | `label`, `cutaway` (a tampa abre e mostra o silício, planta gerada no Zig), `open_at`, `active`, `seed` |
| `ram` | `active` |
| `cable` | `from`, `to` (locais), `sag`, `pulses`, `speed`, `start_at`, `pulse_color`, `loop` |
| `bit_grid` | `pattern` ("01000001"), `cols`, `start_at`, `stagger` |
| `transistor` | `on_at`, `period` (liga e desliga) |
| `screen` | `text`, `type_at`, `char_time` |
| `particles` | `kind`: `sparks`, `flow`, `dust`; `count`, `speed`, `spread`, `length`, `floor`, `size`, `color`, `start_at` |
| `ssd` | `active` (chips piscam) |
| `fan` | `rpm`, `spin_at`, `blades`, `glow` (cor do anel; 0 desliga) |
| `gpu` | `rpm`, `spin_at`, `glow` |
| `hdd` | `rpm`, `seek_at` (o braço passa a buscar trilhas) |
| `gate` | `gate`: `and`, `or`, `xor`, `nand`, `nor`, `not`; `inputs` (ex.: `["00","01","10","11"]`), `step`, `start_at` |
| `mem_cells` | `rows`, `cols`, `pattern`, `write_at`, `row_time`, `leak` (carga vaza; DRAM), `refresh` |
| `packet` | `label`, `color` (use `keys` para mover) |
| `terminal` | `lines` (`$` verde, `!` vermelho), `type_at`, `char_time` |
| `box`, `sphere`, `cylinder`, `arrow` | `color`, `metal`, `emissive`, `intensity` |

### Ênfase e sobreposições

- `*palavra*` ou `*várias palavras*` na narração: legenda própria em âmbar, pancada de lente e som de impacto
  (os asteriscos não vão para a voz). Ver Retenção.
- `overlays[]` na cena:
  - `{ "type": "counter", "at": 6.2, "dur": 0.9, "from": 0, "to": 4, "format": "hex", "digits": 2, "label": "código da tecla A", "pos": [0.5, 0.27] }`
    (`format`: `dec`, `hex`, `bin`; `pos` em fração da tela)
  - `{ "type": "code", "at": 1.0, "text": "if (tecla) {\n  envia(0x04);\n}", "char_time": 0.035, "pos": [0.5, 0.3] }`
  Não ponha sobreposição e etiqueta no mesmo lugar: a sobreposição substitui a etiqueta.
  `until` (segundos na cena) tira a sobreposição antes do fim da cena, pra dar lugar à próxima. Vale para `labels` também.

### Etiquetas (`labels[]`)

`text`, `side` (`left`/`right`), `at` (segundos na cena), `lift` (altura relativa, padrão 0.07) e `anchor`:
`[x, y, z]` no mundo ou, de preferência, `{ "obj": "<id>", "local": [x, y, z] }` para acompanhar a peça.

## Esqueleto

```json
{
  "episode_id": "ep02_exemplo",
  "title": "Título curto",
  "hook": { "text": "Sua RAM *esquece* tudo", "until": 2.6 },
  "teaser": { "scene": "sc04_vazamento", "at": 1.0, "dur": 0.8 },
  "loop": true,
  "outfit": "esd",
  "scenes": [
    {
      "id": "sc01_hook",
      "tone": "hook",
      "environment": "bancada",
      "layer": "camada 4 · você",
      "narration": "Frase curta que abre uma pergunta. || Continuação depois do respiro?",
      "hud_text": "Até cinco palavras",
      "camera": "closeup",
      "shots": [{ "at": 3.0, "camera": "face", "blend": true }],
      "nibble": { "pos": [-0.45, 0, 0.7], "rotY": 0.5, "anim": "talk", "mood": "confused" },
      "labels": [{ "text": "PEÇA", "anchor": { "obj": "peca", "local": [0, 0.1, 0] }, "side": "right", "at": 1.5 }],
      "objects": [{ "id": "peca", "type": "cpu", "pos": [0.2, 1.6, 0], "rot": [1.05, -0.25, 0], "float": true }]
    }
  ]
}
```

Antes de renderizar: `make validate EP=...` (o roteiro está certo) e `make retention EP=...` (o roteiro segura).
