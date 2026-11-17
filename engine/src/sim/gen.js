import * as THREE from 'three';

// Ponte para o gerador de placas em Zig (sim/gen.zig -> engine/public/gen.wasm).
// Uma instância só; cada placa é gerada uma vez e fica em cache pela configuração.

let gen = null;
const cache = new Map();

export async function loadGen() {
  const res = await fetch('/gen.wasm');
  gen = (await WebAssembly.instantiate(await res.arrayBuffer(), {})).instance.exports;
}

function texture(data, size, srgb) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * Mapas de uma placa gerada. style 0 = placa verde, 1 = silício (com trilhas acesas).
 * Devolve { map, normalMap, rm (R=AO, G=rugosidade, B=metal), emissiveMap }.
 */
export function boardMaps({ size = 1024, grid = 48, seed = 1, style = 0, components = 5, nets = 50 } = {}) {
  if (!gen) throw new Error('gen.wasm não carregado; chame loadGen() antes de montar as cenas');
  const key = [size, grid, seed, style, components, nets].join(':');
  if (cache.has(key)) return cache.get(key);
  if (!gen.gen_board(size, grid, seed, style, components, nets)) throw new Error('gen_board falhou (memória?)');
  const read = (i) => new Uint8Array(gen.memory.buffer, gen.gen_map(i), size * size * 4).slice();
  const maps = { map: texture(read(0), size, true), normalMap: texture(read(1), size, false), rm: texture(read(2), size, false), emissiveMap: texture(read(3), size, true) };
  maps.routes = parseRoutes(new Float32Array(gen.memory.buffer, gen.gen_routes(), gen.gen_routes_len()).slice(), size);
  gen.gen_release();
  cache.set(key, maps);
  return maps;
}

/** Material PBR completo de placa. repeat: [u, v] para faces não quadradas. */
export function boardMaterial(opts = {}, { repeat, emissive = 0, normalScale = 1, ...extra } = {}) {
  const m = boardMaps(opts);
  const rep = (t) => {
    if (!repeat) return t;
    const c = t.clone();
    c.repeat.set(...repeat);
    c.needsUpdate = true;
    return c;
  };
  return new THREE.MeshStandardMaterial({
    map: rep(m.map), normalMap: rep(m.normalMap), normalScale: new THREE.Vector2(normalScale, normalScale),
    roughnessMap: rep(m.rm), metalnessMap: rep(m.rm), roughness: 1, metalness: 1,
    ...(emissive ? { emissiveMap: rep(m.emissiveMap), emissive: 0xffffff, emissiveIntensity: emissive } : {}),
    ...extra,
  });
}

/** Trilhas roteadas: [{ glow: 0|1|2, pts: [[u, v], ...] }] em coordenadas de textura (podem passar de 0..1). */
function parseRoutes(f, size) {
  const out = [];
  for (let i = 0; i < f.length;) {
    const n = f[i], glow = f[i + 1], pts = [];
    for (let k = 0; k < n; k++) pts.push([f[i + 2 + k * 2] / size, f[i + 3 + k * 2] / size]);
    out.push({ glow, pts });
    i += 2 + n * 2;
  }
  return out;
}

const surfCache = new Map();
/** Mapas de desgaste. kind: 'wood' | 'paint' | 'rubber'. */
export function surfaceMaps(kind, seed = 1, size = 1024) {
  const k = { wood: 0, paint: 1, rubber: 2 }[kind] ?? 2;
  const key = [k, seed, size].join(':');
  if (surfCache.has(key)) return surfCache.get(key);
  if (!gen.gen_surface(size, seed, k)) throw new Error('gen_surface falhou');
  const read = (i) => new Uint8Array(gen.memory.buffer, gen.gen_map(i), size * size * 4).slice();
  const maps = { map: texture(read(0), size, true), normalMap: texture(read(1), size, false), rm: texture(read(2), size, false) };
  gen.gen_release();
  surfCache.set(key, maps);
  return maps;
}

/**
 * Material com desgaste: a cor base é multiplicada pela variação gerada,
 * a rugosidade varia (manchas brilham, riscos ficam foscos) e o relevo vem do mapa normal.
 * map: substitui a cor (ex.: textura com desenho), mantendo rugosidade/relevo do desgaste.
 */
export function wornMaterial(color, kind, { seed = 1, repeat = [1, 1], normalScale = 1, metalness = 0, map, roughness = 1, ...extra } = {}) {
  const m = surfaceMaps(kind, seed);
  const rep = (t) => { const c = t.clone(); c.repeat.set(...repeat); c.needsUpdate = true; return c; };
  return new THREE.MeshStandardMaterial({
    color, map: map ?? rep(m.map), normalMap: rep(m.normalMap), normalScale: new THREE.Vector2(normalScale, normalScale),
    roughnessMap: rep(m.rm), roughness, metalnessMap: metalness ? rep(m.rm) : null, metalness, ...extra,
  });
}
