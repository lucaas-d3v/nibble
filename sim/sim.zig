//! Simulador de partículas determinístico do Camada Zero.
//!
//! O motor renderiza por acesso aleatório (`renderAtTime(t)`), então qualquer
//! efeito com estado precisa ser re-simulado do zero até `t` a cada salto.
//! Passo fixo + PRNG com semente = o mesmo quadro sempre, em qualquer máquina.
//!
//! Build: `make wasm` (wasm32-freestanding, ReleaseSmall).

const MAX: usize = 4096;
const STEP: f32 = 1.0 / 120.0;

pub const Kind = enum(u32) { sparks = 0, flow = 1, dust = 2 };

/// x, y, z, vida (0..1) por partícula — lido direto pelo JS como Float32Array.
var out: [MAX * 4]f32 = undefined;
var vel: [MAX * 3]f32 = undefined;
var phase: [MAX]f32 = undefined;

var count: usize = 0;
var kind: Kind = .sparks;
var seed0: u32 = 1;
var rng: u32 = 1;
var time: f32 = 0;

// Parâmetros livres (significado depende do tipo).
var p_speed: f32 = 1;
var p_spread: f32 = 1;
var p_length: f32 = 2;
var p_floor: f32 = 0;

fn rand() f32 {
    rng ^= rng << 13;
    rng ^= rng >> 17;
    rng ^= rng << 5;
    return @as(f32, @floatFromInt(rng & 0xFFFFFF)) / 16777216.0;
}

fn reset() void {
    rng = if (seed0 == 0) 0x9E3779B9 else seed0;
    time = 0;
    var i: usize = 0;
    while (i < count) : (i += 1) {
        const o = i * 4;
        const v = i * 3;
        phase[i] = rand();
        switch (kind) {
            .sparks => {
                const a = rand() * 6.2831853;
                const up = 0.35 + rand() * 0.65;
                const r = @sqrt(1.0 - up * up) * p_spread;
                const s = p_speed * (0.4 + rand() * 0.9);
                out[o + 0] = 0;
                out[o + 1] = 0;
                out[o + 2] = 0;
                out[o + 3] = 1;
                vel[v + 0] = @cos(a) * r * s;
                vel[v + 1] = up * s;
                vel[v + 2] = @sin(a) * r * s;
            },
            .flow => {
                out[o + 0] = rand() * p_length;
                out[o + 1] = (rand() - 0.5) * p_spread;
                out[o + 2] = (rand() - 0.5) * p_spread;
                out[o + 3] = 1;
                vel[v + 0] = p_speed * (0.75 + rand() * 0.5);
                vel[v + 1] = 0;
                vel[v + 2] = 0;
            },
            .dust => {
                out[o + 0] = (rand() - 0.5) * p_length;
                out[o + 1] = rand() * p_spread;
                out[o + 2] = (rand() - 0.5) * p_length;
                out[o + 3] = 0.3 + rand() * 0.7;
                vel[v + 0] = (rand() - 0.5) * p_speed;
                vel[v + 1] = (rand() - 0.2) * p_speed * 0.5;
                vel[v + 2] = (rand() - 0.5) * p_speed;
            },
        }
    }
}

fn step() void {
    var i: usize = 0;
    while (i < count) : (i += 1) {
        const o = i * 4;
        const v = i * 3;
        switch (kind) {
            .sparks => {
                if (out[o + 3] <= 0) continue;
                vel[v + 1] -= 6.5 * STEP;
                out[o + 0] += vel[v + 0] * STEP;
                out[o + 1] += vel[v + 1] * STEP;
                out[o + 2] += vel[v + 2] * STEP;
                if (out[o + 1] < p_floor and vel[v + 1] < 0) {
                    out[o + 1] = p_floor;
                    vel[v + 1] *= -0.42;
                    vel[v + 0] *= 0.7;
                    vel[v + 2] *= 0.7;
                }
                out[o + 3] -= STEP / (0.7 + phase[i] * 0.9);
                if (out[o + 3] < 0) out[o + 3] = 0;
            },
            .flow => {
                out[o + 0] += vel[v + 0] * STEP;
                if (out[o + 0] > p_length) out[o + 0] -= p_length;
                const w = time * 3.0 + phase[i] * 6.2831853;
                out[o + 1] += @sin(w) * 0.02 * p_spread * STEP * 4.0;
                out[o + 2] += @cos(w * 1.3) * 0.02 * p_spread * STEP * 4.0;
                // some nas pontas para não "estourar" ao reciclar
                const u = out[o + 0] / p_length;
                const edge = if (u < 0.5) u else 1.0 - u;
                out[o + 3] = if (edge < 0.08) edge / 0.08 else 1.0;
            },
            .dust => {
                const w = time * 0.6 + phase[i] * 6.2831853;
                out[o + 0] += (vel[v + 0] + @sin(w) * 0.05) * STEP;
                out[o + 1] += (vel[v + 1] + @cos(w * 0.7) * 0.03) * STEP;
                out[o + 2] += (vel[v + 2] + @sin(w * 1.1) * 0.05) * STEP;
                const half = p_length * 0.5;
                if (out[o + 0] > half) out[o + 0] -= p_length;
                if (out[o + 0] < -half) out[o + 0] += p_length;
                if (out[o + 2] > half) out[o + 2] -= p_length;
                if (out[o + 2] < -half) out[o + 2] += p_length;
                if (out[o + 1] > p_spread) out[o + 1] -= p_spread;
                if (out[o + 1] < 0) out[o + 1] += p_spread;
            },
        }
    }
    time += STEP;
}

export fn sim_init(k: u32, n: u32, seed: u32, speed: f32, spread: f32, length: f32, floor: f32) void {
    kind = switch (k) {
        1 => .flow,
        2 => .dust,
        else => .sparks,
    };
    count = if (n > MAX) MAX else n;
    seed0 = seed;
    p_speed = speed;
    p_spread = spread;
    p_length = if (length <= 0) 1 else length;
    p_floor = floor;
    reset();
}

/// Leva a simulação até `t` segundos. Voltar no tempo re-simula do zero.
export fn sim_advance_to(t: f32) void {
    if (t < time) reset();
    while (time + STEP <= t) step();
}

export fn sim_buffer() [*]f32 {
    return &out;
}

export fn sim_count() u32 {
    return @intCast(count);
}
