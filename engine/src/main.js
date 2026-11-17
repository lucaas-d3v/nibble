import * as THREE from 'three';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import { RenderPipeline } from './render/pipeline.js';
import { Nibble } from './character/nibble.js';
import { buildEnvironment } from './stage/environments.js';
import { applyCamera, cameraPose, FOV } from './stage/camera.js';
import { buildObject } from './prefabs/index.js';
import { Hud } from './hud/hud.js';
import { loadSim } from './sim/sim.js';
import { loadGen } from './sim/gen.js';
import { buildTimeline } from '../../shared/timeline.js';
import { hash } from './util.js';

const params = new URLSearchParams(location.search);
const stageEl = document.getElementById('stage');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 9 / 16, 0.1, 60);
const pipeline = new RenderPipeline(document.getElementById('gl'), scene, camera);
const hud = new Hud(document.getElementById('hud'));
const nibble = new Nibble();
scene.add(nibble.root);

const state = { episode: null, timeline: null, scenes: [], envs: new Map(), current: -1, loads: 0 };
const quality = { shadowSize: Number(params.get('shadow') ?? 2048) };
const tmp = new THREE.Vector3();

function resize() {
  pipeline.setSize(stageEl.clientWidth, stageEl.clientHeight);
}

function focusOf(cfg, built) {
  const f = cfg.focus ?? cfg.objects?.[0]?.id;
  if (Array.isArray(f)) return new THREE.Vector3(...f);
  const obj = built.objects[f];
  return obj ? obj.root.position.clone() : new THREE.Vector3(0.2, 1.6, 0);
}

// Boca: abre e fecha por sílaba dentro de cada trecho de legenda; fechada nas pausas.
const VOWELS = /[aeiouáéíóúâêôãõàü]+/gi;
function makeSpeech(entry) {
  const caps = entry.captions.map((c) => ({
    s: c.start - entry.start, e: c.end - entry.start,
    syl: Math.max(1, (c.text.match(VOWELS) || []).length), seed: c.start * 13.7,
  }));
  return {
    mouth(lt) {
      for (const c of caps) {
        if (lt < c.s || lt >= c.e) continue;
        const u = ((lt - c.s) / (c.e - c.s)) * c.syl, i = Math.floor(u);
        return (0.5 + 0.5 * hash(i * 7.3 + c.seed)) * Math.sin(Math.PI * (u - i)) ** 0.8;
      }
      return 0;
    },
    speaking: (lt) => caps.some((c) => lt >= c.s - 0.15 && lt < c.e + 0.35),
  };
}

function load(episode, timeline) {
  for (const s of state.scenes) scene.remove(s.group);
  for (const e of state.envs.values()) scene.remove(e.group);
  state.envs.clear();
  state.episode = episode;
  state.timeline = timeline ?? buildTimeline(episode);
  nibble.setOutfit(episode.outfit ?? 'none');
  nibble.resetMotion();
  state.loads++;

  state.scenes = episode.scenes.map((cfg) => {
    const envName = cfg.environment ?? 'bancada';
    if (!state.envs.has(envName)) {
      const env = buildEnvironment(envName, quality);
      env.group.visible = false;
      scene.add(env.group);
      state.envs.set(envName, env);
    }
    const group = new THREE.Group();
    group.visible = false;
    const objects = {};
    for (const o of cfg.objects ?? []) {
      const built = buildObject(o);
      objects[o.id] = built;
      group.add(built.root);
    }
    scene.add(group);
    const built = { cfg, group, objects, env: envName };
    built.focus = focusOf(cfg, built);
    built.hasFocus = !!(cfg.focus ?? cfg.objects?.length);
    return built;
  });
  state.current = -1;
  renderAtTime(0);
}

function sceneAt(t) {
  const list = state.timeline.scenes;
  let i = list.findIndex((s) => t >= s.start && t < s.end);
  if (i < 0) i = t < 0 ? 0 : list.length - 1;
  return i;
}

/** Posiciona tudo no tempo t. Puro em relação a t: nada depende do quadro anterior. */
function updateWorld(t) {
  const i = sceneAt(t), entry = state.timeline.scenes[i], sc = state.scenes[i];
  const lt = Math.max(0, t - entry.start), dur = entry.end - entry.start;
  if (i !== state.current) {
    state.scenes.forEach((s, j) => { s.group.visible = j === i; });
    for (const [name, env] of state.envs) env.group.visible = name === sc.env;
    const env = state.envs.get(sc.env);
    scene.background = new THREE.Color(env.background);
    scene.fog = new THREE.Fog(...env.fog);
    state.current = i;
  }
  state.envs.get(sc.env).update?.(t);
  const cam = sc.cfg.camera ?? 'hero';
  camera.fov = FOV[cam] ?? 30;
  camera.updateProjectionMatrix();
  const ncfg = sc.cfg.nibble ?? {};
  const np = ncfg.pos ?? [-0.5, 0, 0.5];
  const nPos = { x: np[0], y: np[1], z: np[2] };
  applyCamera(camera, cam, lt, dur, nPos, sc.focus);
  nibble.root.visible = ncfg.visible !== false;
  if (!sc.speech) sc.speech = makeSpeech(entry);
  nibble.update(lt, dur, ncfg, {
    key: `${state.loads}:${i}`,
    seed: 1 + i * 3.17 + (state.episode.episode_id.length % 7),
    camAt: (t) => cameraPose(cam, t, dur, nPos, sc.focus).pos,
    focus: sc.hasFocus ? sc.focus.toArray() : null,
    mouth: sc.speech.mouth,
    speaking: sc.speech.speaking,
  });
  for (const o of Object.values(sc.objects)) o.update(lt);
  return { i, entry, sc, lt };
}

function project(anchor, sc) {
  if (Array.isArray(anchor)) tmp.set(...anchor);
  else {
    const obj = sc.objects[anchor.obj];
    if (!obj) return null;
    tmp.set(...(anchor.local ?? [0, 0, 0]));
    obj.root.updateWorldMatrix(true, false);
    obj.root.localToWorld(tmp);
  }
  camera.updateMatrixWorld();
  tmp.project(camera);
  if (tmp.z > 1) return null;
  return { x: (tmp.x + 1) / 2, y: (1 - tmp.y) / 2 };
}

function renderAtTime(t) {
  const { entry, sc, lt } = updateWorld(t);
  hud.update({ t, lt, total: state.timeline.total_duration, scene: sc.cfg, entry, project: (a) => project(a, sc) });
  pipeline.render(t, updateWorld);
}

async function boot() {
  await Promise.all([loadSim(), loadGen(), document.fonts.load('700 10px "Space Grotesk"'), document.fonts.load('600 10px "JetBrains Mono"')]);
  await document.fonts.ready;
  resize();
  window.addEventListener('resize', () => { resize(); if (state.episode) renderAtTime(window.CZ.time); });

  window.CZ = {
    time: 0,
    load,
    renderAtTime(t) { this.time = t; renderAtTime(t); },
    configure({ samples, shutter, aperture, fps, hud }) {
      if (hud !== undefined) document.getElementById('hud').style.display = hud ? '' : 'none';
      if (samples) pipeline.samples = samples;
      if (shutter !== undefined) pipeline.shutter = shutter;
      if (aperture !== undefined) pipeline.aperture = aperture;
      if (fps) pipeline.fps = fps;
    },
    get duration() { return state.timeline?.total_duration ?? 0; },
    ready: true,
  };

  // Modo prévia: ?ep=ep01_tecla toca em loop no navegador. &t=12.5 congela num instante.
  const ep = params.get('ep');
  if (!ep) return;
  const episode = await (await fetch(`/episodes/${ep}/script.json`)).json();
  window.CZ.configure({ samples: Number(params.get('samples') ?? 1), aperture: Number(params.get('aperture') ?? 0) });
  load(episode);
  if (params.has('t')) { window.CZ.renderAtTime(Number(params.get('t'))); return; }
  const t0 = performance.now();
  const loop = (now) => {
    window.CZ.renderAtTime(((now - t0) / 1000) % window.CZ.duration);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot();
