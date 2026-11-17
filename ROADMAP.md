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
| 6 | Boca escondida sob o focinho | ⬜ decidir: mover/aumentar ou assumir olhos + filete como "voz" |
| 7 | Troca bola → corpo é corte de 1 quadro | ⬜ |
| 8 | Campo `mood` no roteiro | ✅ |
| 9 | `vazio` fraco; cenários por camada (kernel, RAM, rede, disco) | ⬜ |
| 10 | Neblina volumétrica e feixes de luz | ⬜ pesa sem GPU |
| 11 | HUD: contadores (dec/hex/bin), código digitando, `*ênfase*` | ✅ (setas: as etiquetas já fazem esse papel) |
| 12 | Gradação de cor por cenário | ✅ |

## Câmera
| | Item | Estado |
|---|---|---|
| 13 | Transição `rise` mais marcante | ⬜ |
| 14 | Verificador de fluidez medir rotação da câmera | ⬜ |

## Engenharia
| | Item | Estado |
|---|---|---|
| 15 | CI: validar, compilar Zig, esquema em dia, fluidez, quadros de conferência | ✅ (comparação automática com imagem de referência: ⬜) |
| 16 | Esquema JSON do roteiro (autocompletar no editor) | ✅ `schema/`, `.vscode/` |
| 17 | Cache em disco das texturas geradas, compressão KTX2 | ⬜ |
| 18 | Quebrar `environments.js` e `prefabs/index.js` em arquivos | ⬜ |
| 19 | `make new EP=...` | ✅ |

## Canal
| | Item | Estado |
|---|---|---|
| 20 | Nome: repositório `nibble` × motor "Camada Zero" | 🖥️ decisão do Lucas |
| 21 | Thumbnail automática (`make thumb`) | ✅ |
| 22 | Legenda `.srt` | ✅ |
| 23 | Versão 16:9 para vídeo longo | ⬜ |

## Segurança
| | Item | Estado |
|---|---|---|
| 24 | Revogar o token do GitHub e a chave da ElevenLabs que passaram pelo chat | 🖥️ |
