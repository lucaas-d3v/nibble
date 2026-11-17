// Ponte para o simulador em Zig (sim/sim.zig -> engine/public/sim.wasm).
// Um módulo compilado, uma instância por emissor: cada um tem sua memória e sua semente.

const KINDS = { sparks: 0, flow: 1, dust: 2 };
let wasmModule = null;

export async function loadSim() {
  const res = await fetch('/sim.wasm');
  wasmModule = await WebAssembly.compile(await res.arrayBuffer());
}

export function createEmitter(kind, count, { seed = 7, speed = 2.4, spread = 0.8, length = 2, floor = 0 } = {}) {
  if (!wasmModule) throw new Error('sim.wasm não carregado; chame loadSim() antes de montar as cenas');
  const { exports: e } = new WebAssembly.Instance(wasmModule, {});
  e.sim_init(KINDS[kind] ?? 0, count, seed, speed, spread, length, floor);
  const n = e.sim_count();
  return {
    count: n,
    /** Estado das partículas no tempo t: Float32Array [x, y, z, vida] * n. */
    at(t) {
      e.sim_advance_to(t);
      return new Float32Array(e.memory.buffer, e.sim_buffer(), n * 4);
    },
  };
}
