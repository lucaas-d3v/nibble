# Contrato de roteiro — Camada Zero

Use este arquivo como instrução de sistema para uma LLM gerar episódios, ou como referência ao escrever à mão.
A saída é **um único objeto JSON** salvo em `episodes/<episode_id>/script.json`. Rode `make validate` antes de renderizar.

## O canal

Vídeos verticais 9:16 de 45 a 75 s que respondem "o que acontece de verdade quando você…", descendo
camada por camada até o hardware. Apresentador: **Nibble**, um tatu-bola.

Regras editoriais:

- Toda afirmação técnica precisa ser verdadeira. Simplificar pode; inventar não. Na dúvida, corte a frase.
- Segunda pessoa, frases curtas, tom de conversa. Sem siglas não explicadas.
- Uma ideia por cena. Estrutura: gancho → 3 ou 4 camadas → fechamento que volta ao gancho.
- `||` marca uma pausa dramática (~0,35 s) dentro da narração.
- `hud_text`: até 5 palavras e 24 caracteres. `layer`: "camada N · nome" (a numeração desce ao longo do vídeo).

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
| `environment` | `bancada` (oficina), `chip` (dentro do silício), `vazio` (estúdio escuro) |
| `tone` | `hook`, `curious`, `explain`, `payoff`, `outro` |
| `camera` | `hero` (plano geral, padrão), `closeup` (Nibble da cintura para cima), `face` (rosto; bom para reação e thumbnail), `prop` e `macro` (no objeto de `focus`), `top`, `low` |
| `nibble.anim` | ver tabela abaixo |
| `nibble.look` | opcional: `camera` ou `focus` fixa o olhar a cena toda |

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
| `idle` | Respira, troca o peso de perna, olha em volta. |

### Objetos (`objects[].type`)

Comuns a todos: `id`, `pos`, `rot`, `scale`, `float` (flutua e gira devagar), `appear_at` (entra com pop).

| type | Opções |
|---|---|
| `key` | `label`, `press_at`, `hold`, `cutaway` (carcaça transparente, mostra os contatos) |
| `key_matrix` | `rows`, `cols`, `hit: [linha, coluna]`, `hit_at`, `scan_period` |
| `chip` | `label`, `on_at`, `color` |
| `cpu` | `label`, `cutaway` (a tampa abre e mostra o silício), `open_at`, `active` |
| `ram` | `active` |
| `cable` | `from`, `to` (locais), `sag`, `pulses`, `speed`, `start_at`, `pulse_color`, `loop` |
| `bit_grid` | `pattern` ("01000001"), `cols`, `start_at`, `stagger` |
| `transistor` | `on_at`, `period` (liga e desliga) |
| `screen` | `text`, `type_at`, `char_time` |
| `particles` | `kind`: `sparks`, `flow`, `dust`; `count`, `speed`, `spread`, `length`, `floor`, `size`, `color`, `start_at` |
| `box`, `sphere`, `cylinder`, `arrow` | `color`, `metal`, `emissive`, `intensity` |

### Etiquetas (`labels[]`)

`text`, `side` (`left`/`right`), `at` (segundos na cena), `lift` (altura relativa, padrão 0.07) e `anchor`:
`[x, y, z]` no mundo ou, de preferência, `{ "obj": "<id>", "local": [x, y, z] }` para acompanhar a peça.

## Esqueleto

```json
{
  "episode_id": "ep02_exemplo",
  "title": "Título curto",
  "outfit": "esd",
  "scenes": [
    {
      "id": "sc01_hook",
      "tone": "hook",
      "environment": "bancada",
      "layer": "camada 4 · você",
      "narration": "Frase de impacto. || Continuação depois da pausa.",
      "hud_text": "Até cinco palavras",
      "camera": "hero",
      "nibble": { "pos": [-0.45, 0, 0.7], "rotY": 0.3, "anim": "roll_in" },
      "labels": [{ "text": "PEÇA", "anchor": { "obj": "peca", "local": [0, 0.1, 0] }, "side": "right", "at": 1.5 }],
      "objects": [{ "id": "peca", "type": "cpu", "pos": [0.2, 1.6, 0], "rot": [1.05, -0.25, 0], "float": true }]
    }
  ]
}
```
