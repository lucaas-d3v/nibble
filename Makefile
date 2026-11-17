EP ?= ep01_tecla
ZIG ?= zig

.PHONY: help install dev validate stills preview render render60 smooth master voice voices video wasm

help:
	@echo "make install             instala dependências"
	@echo "make dev                 prévia no navegador: http://127.0.0.1:5173/?ep=$(EP)&fps=1"
	@echo "make validate EP=...     confere o roteiro"
	@echo "make stills EP=... [SCENE=n]   3 PNGs por cena"
	@echo "make preview EP=... [SCENE=n]  vídeo rápido (540x960, 15 fps)"
	@echo "make render EP=...       vídeo final (1080x1920, 30 fps, 16 amostras)"
	@echo "make render60 EP=...     vídeo final a 60 fps (o dobro do tempo de render)"
	@echo "make smooth EP=...       procura trancos quadro a quadro a 30 e 60 fps"
	@echo "make master EP=...       master ProRes 4444"
	@echo "make voices              lista as vozes da ElevenLabs (precisa ELEVENLABS_API_KEY)"
	@echo "make voice EP=...        gera a narração de cada cena (ElevenLabs, com cache)"
	@echo "make video EP=...        mixa voz, efeitos, fundo e trilha, gera o mp4 final e o .srt"
	@echo "make wasm                recompila os módulos Zig (partículas e gerador de placas)"
	@echo "Use CZ_GPU=1 para renderizar na GPU."

install:
	npm install

dev:
	npx vite

validate:
	node pipeline/validate.mjs $(EP)

stills:
	node pipeline/render.mjs $(EP) --stills $(if $(SCENE),--scene $(SCENE),)

preview:
	node pipeline/render.mjs $(EP) --preview $(if $(SCENE),--scene $(SCENE),)

render:
	node pipeline/render.mjs $(EP) $(if $(SCENE),--scene $(SCENE),)

render60:
	node pipeline/render.mjs $(EP) --fps 60 $(if $(SCENE),--scene $(SCENE),)

smooth:
	node pipeline/smoothness.mjs $(EP)

master:
	node pipeline/render.mjs $(EP) --codec prores

voices:
	node pipeline/voice.mjs --voices

voice:
	node pipeline/voice.mjs $(EP) $(if $(SCENE),--scene $(SCENE),)

video:
	node pipeline/assemble.mjs $(EP)

wasm:
	$(ZIG) build-exe sim/sim.zig -target wasm32-freestanding -O ReleaseSmall -fno-entry -rdynamic -femit-bin=engine/public/sim.wasm
	$(ZIG) build-exe sim/gen.zig -target wasm32-freestanding -O ReleaseFast -fstrip -fno-entry -rdynamic -femit-bin=engine/public/gen.wasm
