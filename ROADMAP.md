# Roadmap

Ordem por impacto no vídeo final. ✅ feito · 🔶 parcial · ⬜ a fazer · 🖥️ precisa da máquina do Lucas (GPU / chave real)

## Prioridade alta

| | Item | Estado |
|---|---|---|
| 1 | Áudio: narração com tempo por letra (legenda e boca exatas), efeitos sonoros automáticos, fundo por cenário, trilha com ducking, `.srt` | ✅ testado com servidor falso · 🖥️ testar com a ElevenLabs real |
| 2 | Render na GPU | 🖥️ nunca rodou numa placa de vídeo |
| 2b | Captura de quadro ~23x mais rápida (CDP, PNG sem perdas) | ✅ |
| 3 | Coreografia no roteiro: quadros-chave em objetos, vários planos por cena, humor do Nibble | ✅ |
| 4 | Nibble interage com objetos (apertar, tocar) com cinemática inversa | ✅ |
| 5 | Catálogo: SSD, cooler, HD, porta lógica, célula de memória, pacote, terminal, GPU; planta do chip gerada no Zig | ✅ (`ep90_catalogo`) |

## Visual
| | Item | Estado |
|---|---|---|
| 6 | Boca escondida sob o focinho | ✅ decidido: boca maior + nariz mexe por sílaba + filete pulsa com a voz |
| 7 | Troca bola → corpo é corte de 1 quadro | ✅ bola encolhe dentro do corpo |
| 8 | Campo `mood` no roteiro | ✅ |
| 9 | Cenários por camada | 🔶 `memoria` (corredor de DRAM) feito; kernel, rede, disco a fazer |
| 10 | Neblina volumétrica e feixes de luz | ⬜ pesa sem GPU |
| 11 | HUD: contadores (dec/hex/bin), código digitando, `*ênfase*` | ✅ (setas: as etiquetas já fazem esse papel) |
| 12 | Gradação de cor por cenário | ✅ |

## Câmera
| | Item | Estado |
|---|---|---|
| 13 | Transição `rise` mais marcante | ✅ |
| 14 | Verificador de fluidez medir rotação da câmera | ✅ |

## Engenharia
| | Item | Estado |
|---|---|---|
| 15 | CI: validar, compilar Zig, esquema em dia, fluidez, regressão visual, quadros de conferência | ✅ (regressão só avisa até as referências serem geradas no próprio CI) |
| 16 | Esquema JSON do roteiro (autocompletar no editor) | ✅ `schema/`, `.vscode/` |
| 17 | Cache em disco das texturas geradas | ❌ não compensa: cada render abre um navegador novo, e gerar leva ~3 s contra minutos de render |
| 18 | Quebrar `environments.js` e `prefabs/index.js` em arquivos | ✅ `stage/env/`, `prefabs/{hardware,signal,display,fx,common}.js` |
| 19 | `make new EP=...` | ✅ |

## Canal
| | Item | Estado |
|---|---|---|
| 20 | Nome | ✅ canal e perfis: Camada Zero; personagem: Nibble |
| 21 | Thumbnail automática (`make thumb`) | ✅ |
| 22 | Legenda `.srt` | ✅ |
| 23 | Versão 16:9 para vídeo longo | ✅ `--aspect 16:9` (enquadramento é o mesmo; composição própria para o horizontal ainda é manual) |

## Segurança
| | Item | Estado |
|---|---|---|
| 24 | Revogar o token do GitHub e a chave da ElevenLabs que passaram pelo chat | 🖥️ |
