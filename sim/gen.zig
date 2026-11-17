//! Gerador procedural de placas do Camada Zero.
//!
//! Roteia trilhas de verdade numa grade (caminho mínimo com custo de curva:
//! só ângulos de 45° e 90°, trilhas se desviam umas das outras e dos componentes)
//! e rasteriza com antialias em quatro mapas de material:
//!   0 cor (sRGB)   1 normal (tangente)   2 AO/rugosidade/metal (R/G/B)   3 emissão (sRGB)
//!
//! Estilo 0: placa verde com máscara de solda, pads dourados, vias e serigrafia.
//! Estilo 1: interconexão de silício escura com trilhas acesas (fundo do cenário "chip").
//!
//! A grade dá a volta nas bordas, então a textura repete sem costura.
//! Mesma semente, mesmo resultado. Build: `make wasm`.

const std = @import("std");
const A = std.heap.wasm_allocator;

// ---------------------------------------------------------------- aleatório
var rng: u32 = 1;
fn rnd() u32 {
    rng ^= rng << 13;
    rng ^= rng >> 17;
    rng ^= rng << 5;
    return rng;
}
fn rndf() f32 {
    return @as(f32, @floatFromInt(rnd() & 0xFFFFFF)) / 16777216.0;
}
fn rndi(n: u32) u32 {
    return if (n == 0) 0 else rnd() % n;
}
fn hash2(x: u32, y: u32) f32 {
    var h: u32 = x *% 374761393 +% y *% 668265263;
    h = (h ^ (h >> 13)) *% 1274126177;
    return @as(f32, @floatFromInt((h ^ (h >> 16)) & 0xFFFF)) / 65535.0;
}

// ---------------------------------------------------------------- estado
var size: u32 = 0; // pixels por lado
var G: u32 = 0; // células por lado
var cell: f32 = 0; // pixels por célula
var style: u32 = 0;

// máscaras de cobertura (0..255) no tamanho da imagem
const M_COPPER = 0;
const M_EXPOSED = 1;
const M_HOLE = 2;
const M_SILK = 3; // estilo 1: blocos de lógica
const M_GLOW_A = 4;
const M_GLOW_C = 5;
const NMASK = 6;
var masks: [NMASK][]u8 = .{ &.{}, &.{}, &.{}, &.{}, &.{}, &.{} };
var maps: [4][]u8 = .{ &.{}, &.{}, &.{}, &.{} };

// grade de roteamento
const FREE: u16 = 0;
const BODY: u16 = 0xFFFF;
const PAD: u16 = 0xFFFE;
var occ: []u16 = &.{};
var dist: []u32 = &.{};
var prev: []u32 = &.{};
var heap: []u64 = &.{};
var heap_len: usize = 0;

const Pad = struct { x: u32, y: u32, comp: u32, used: bool };
var pads: []Pad = &.{};
var npads: u32 = 0;

const DX = [8]i32{ 1, 1, 0, -1, -1, -1, 0, 1 };
const DY = [8]i32{ 0, 1, 1, 1, 0, -1, -1, -1 };

fn wrapc(v: i32) u32 {
    const g: i32 = @intCast(G);
    return @intCast(@mod(v, g));
}
fn ci(x: u32, y: u32) u32 {
    return y * G + x;
}

// ---------------------------------------------------------------- rasterização
fn plot(m: []u8, x: i32, y: i32, c: f32) void {
    if (c <= 0) return;
    const s: i32 = @intCast(size);
    const ux: usize = @intCast(@mod(x, s));
    const uy: usize = @intCast(@mod(y, s));
    const i = uy * size + ux;
    const v: u8 = @intFromFloat(@min(c, 1.0) * 255.0);
    if (v > m[i]) m[i] = v;
}

/// Segmento com pontas redondas, raio r, antialias de 1 pixel.
fn capsule(m: []u8, ax: f32, ay: f32, bx: f32, by: f32, r: f32) void {
    const x0: i32 = @intFromFloat(@floor(@min(ax, bx) - r - 2));
    const x1: i32 = @intFromFloat(@ceil(@max(ax, bx) + r + 2));
    const y0: i32 = @intFromFloat(@floor(@min(ay, by) - r - 2));
    const y1: i32 = @intFromFloat(@ceil(@max(ay, by) + r + 2));
    const vx = bx - ax;
    const vy = by - ay;
    const ll = vx * vx + vy * vy;
    var y = y0;
    while (y <= y1) : (y += 1) {
        var x = x0;
        while (x <= x1) : (x += 1) {
            const px = @as(f32, @floatFromInt(x)) + 0.5 - ax;
            const py = @as(f32, @floatFromInt(y)) + 0.5 - ay;
            const t = if (ll > 0) @max(0.0, @min(1.0, (px * vx + py * vy) / ll)) else 0.0;
            const dx = px - vx * t;
            const dy = py - vy * t;
            const d = @sqrt(dx * dx + dy * dy);
            plot(m, x, y, r - d + 0.5);
        }
    }
}

fn disc(m: []u8, cx: f32, cy: f32, r: f32) void {
    capsule(m, cx, cy, cx, cy, r);
}

/// Retângulo de cantos arredondados centrado em (cx, cy), meia-largura hw/hh.
fn rrect(m: []u8, cx: f32, cy: f32, hw: f32, hh: f32, rad: f32) void {
    const x0: i32 = @intFromFloat(@floor(cx - hw - 2));
    const x1: i32 = @intFromFloat(@ceil(cx + hw + 2));
    const y0: i32 = @intFromFloat(@floor(cy - hh - 2));
    const y1: i32 = @intFromFloat(@ceil(cy + hh + 2));
    var y = y0;
    while (y <= y1) : (y += 1) {
        var x = x0;
        while (x <= x1) : (x += 1) {
            const qx = @abs(@as(f32, @floatFromInt(x)) + 0.5 - cx) - (hw - rad);
            const qy = @abs(@as(f32, @floatFromInt(y)) + 0.5 - cy) - (hh - rad);
            const ox = @max(qx, 0.0);
            const oy = @max(qy, 0.0);
            const d = @sqrt(ox * ox + oy * oy) + @min(@max(qx, qy), 0.0) - rad;
            plot(m, x, y, 0.5 - d);
        }
    }
}

fn center(c: u32) f32 {
    return (@as(f32, @floatFromInt(c)) + 0.5) * cell;
}

// ---------------------------------------------------------------- componentes
fn placeComponents(count: u32, wmin: u32, wmax: u32) void {
    var placed: u32 = 0;
    var tries: u32 = 0;
    while (placed < count and tries < 400) : (tries += 1) {
        const w = wmin + rndi(wmax - wmin + 1);
        const h = wmin + rndi(wmax - wmin + 1);
        if (w + 6 >= G or h + 6 >= G) continue;
        const x0 = 3 + rndi(G - w - 6);
        const y0 = 3 + rndi(G - h - 6);
        // área com margem precisa estar livre
        var ok = true;
        var y = y0 - 2;
        while (y < y0 + h + 2 and ok) : (y += 1) {
            var x = x0 - 2;
            while (x < x0 + w + 2) : (x += 1) {
                if (occ[ci(x, y)] != FREE) {
                    ok = false;
                    break;
                }
            }
        }
        if (!ok) continue;
        y = y0;
        while (y < y0 + h) : (y += 1) {
            var x = x0;
            while (x < x0 + w) : (x += 1) occ[ci(x, y)] = BODY;
        }
        // pads em volta do corpo, um sim um não
        var k: u32 = 1;
        while (k + 1 < w) : (k += 2) {
            addPad(x0 + k, y0 - 1, placed);
            addPad(x0 + k, y0 + h, placed);
        }
        k = 1;
        while (k + 1 < h) : (k += 2) {
            addPad(x0 - 1, y0 + k, placed);
            addPad(x0 + w, y0 + k, placed);
        }
        const fx = @as(f32, @floatFromInt(x0)) * cell;
        const fy = @as(f32, @floatFromInt(y0)) * cell;
        const fw = @as(f32, @floatFromInt(w)) * cell;
        const fh = @as(f32, @floatFromInt(h)) * cell;
        if (style == 0) {
            // serigrafia: contorno e marca do pino 1
            const lw = @max(1.0, cell * 0.07);
            const m = masks[M_SILK];
            capsule(m, fx, fy, fx + fw, fy, lw);
            capsule(m, fx + fw, fy, fx + fw, fy + fh, lw);
            capsule(m, fx + fw, fy + fh, fx, fy + fh, lw);
            capsule(m, fx, fy + fh, fx, fy, lw);
            disc(m, fx + cell * 0.9, fy + cell * 0.9, cell * 0.22);
        } else {
            // bloco de lógica: retângulo elevado com grade interna (aparência de SRAM)
            rrect(masks[M_SILK], fx + fw / 2, fy + fh / 2, fw / 2 - cell * 0.15, fh / 2 - cell * 0.15, cell * 0.2);
        }
        placed += 1;
    }
}

fn addPad(x: u32, y: u32, comp: u32) void {
    if (npads >= pads.len) return;
    if (occ[ci(x, y)] != FREE) return;
    occ[ci(x, y)] = PAD;
    pads[npads] = .{ .x = x, .y = y, .comp = comp, .used = false };
    npads += 1;
    const cx = center(x);
    const cy = center(y);
    rrect(masks[M_COPPER], cx, cy, cell * 0.36, cell * 0.36, cell * 0.12);
    rrect(masks[M_EXPOSED], cx, cy, cell * 0.3, cell * 0.3, cell * 0.1);
}

fn addVia(x: u32, y: u32) void {
    const cx = center(x);
    const cy = center(y);
    disc(masks[M_COPPER], cx, cy, cell * 0.38);
    disc(masks[M_EXPOSED], cx, cy, cell * 0.33);
    disc(masks[M_HOLE], cx, cy, cell * 0.16);
}

// ---------------------------------------------------------------- fila de prioridade
fn hpush(v: u64) void {
    if (heap_len >= heap.len) return; // cheio: descarta (rota fica mais longa, nunca quebra)
    var i = heap_len;
    heap[i] = v;
    heap_len += 1;
    while (i > 0) {
        const p = (i - 1) / 2;
        if (heap[p] <= heap[i]) break;
        const t = heap[p];
        heap[p] = heap[i];
        heap[i] = t;
        i = p;
    }
}
fn hpop() u64 {
    const top = heap[0];
    heap_len -= 1;
    heap[0] = heap[heap_len];
    var i: usize = 0;
    while (true) {
        const l = 2 * i + 1;
        const r = l + 1;
        var m = i;
        if (l < heap_len and heap[l] < heap[m]) m = l;
        if (r < heap_len and heap[r] < heap[m]) m = r;
        if (m == i) break;
        const t = heap[m];
        heap[m] = heap[i];
        heap[i] = t;
        i = m;
    }
    return top;
}

fn passable(c: u32, goal: u32) bool {
    return occ[c] == FREE or c == goal;
}

/// Roteia de a até b. Devolve o número de células do caminho (0 = falhou), caminho em path_buf.
var path_buf: []u32 = &.{};
fn route(a: u32, b: u32, max_cost: u32) u32 {
    const n_states = G * G * 8;
    @memset(dist[0..n_states], 0xFFFFFFFF);
    heap_len = 0;
    var d: u32 = 0;
    while (d < 8) : (d += 1) {
        dist[a * 8 + d] = 0;
        prev[a * 8 + d] = 0xFFFFFFFF;
        hpush(@as(u64, a * 8 + d));
    }
    const ax: i32 = @intCast(a % G);
    const ay: i32 = @intCast(a / G);
    _ = ax;
    _ = ay;
    var found: u32 = 0xFFFFFFFF;
    while (heap_len > 0) {
        const top = hpop();
        const st: u32 = @intCast(top & 0xFFFFFFFF);
        const cost: u32 = @intCast(top >> 32);
        if (cost > dist[st]) continue;
        if (cost > max_cost) break;
        const c = st / 8;
        const dir = st % 8;
        if (c == b) {
            found = st;
            break;
        }
        const cx: i32 = @intCast(c % G);
        const cy: i32 = @intCast(c / G);
        var nd: u32 = 0;
        while (nd < 8) : (nd += 1) {
            const diff = if (nd > dir) nd - dir else dir - nd;
            const turn = @min(diff, 8 - diff);
            if (turn > 2) continue;
            const nx = wrapc(cx + DX[nd]);
            const ny = wrapc(cy + DY[nd]);
            const n = ci(nx, ny);
            if (!passable(n, b)) continue;
            if (nd % 2 == 1) {
                // diagonal: não passa espremida entre duas ocupações
                const o1 = ci(wrapc(cx + DX[nd]), @intCast(cy));
                const o2 = ci(@intCast(cx), wrapc(cy + DY[nd]));
                if (!(passable(o1, b) or o1 == a) or !(passable(o2, b) or o2 == a)) continue;
            }
            const step: u32 = if (nd % 2 == 1) 14 else 10;
            const pen: u32 = switch (turn) {
                0 => 0,
                1 => 6,
                else => 22,
            };
            const ncost = cost + step + pen;
            const ns = n * 8 + nd;
            if (ncost < dist[ns]) {
                dist[ns] = ncost;
                prev[ns] = st;
                hpush((@as(u64, ncost) << 32) | ns);
            }
        }
    }
    if (found == 0xFFFFFFFF) return 0;
    var len: u32 = 0;
    var s = found;
    while (s != 0xFFFFFFFF and len < path_buf.len) {
        path_buf[len] = s / 8;
        len += 1;
        s = prev[s];
    }
    return len;
}

fn drawPath(len: u32, r: f32, glow: u32) void {
    // percorre em coordenadas "desembrulhadas" para atravessar a borda sem riscar a imagem
    var px = center(path_buf[0] % G);
    var py = center(path_buf[0] / G);
    var i: u32 = 1;
    while (i < len) : (i += 1) {
        const c0 = path_buf[i - 1];
        const c1 = path_buf[i];
        var dx: i32 = @as(i32, @intCast(c1 % G)) - @as(i32, @intCast(c0 % G));
        var dy: i32 = @as(i32, @intCast(c1 / G)) - @as(i32, @intCast(c0 / G));
        const g: i32 = @intCast(G);
        if (dx > 1) dx -= g;
        if (dx < -1) dx += g;
        if (dy > 1) dy -= g;
        if (dy < -1) dy += g;
        const qx = px + @as(f32, @floatFromInt(dx)) * cell;
        const qy = py + @as(f32, @floatFromInt(dy)) * cell;
        capsule(masks[M_COPPER], px, py, qx, qy, r);
        if (glow == 1) capsule(masks[M_GLOW_A], px, py, qx, qy, r * 0.55);
        if (glow == 2) capsule(masks[M_GLOW_C], px, py, qx, qy, r * 0.55);
        px = qx;
        py = qy;
    }
}

/// Tenta até concluir `target` trilhas (ou esgotar 6x esse número de tentativas).
fn routeNets(target: u32) void {
    var net: u16 = 1;
    var k: u32 = 0;
    var done: u32 = 0;
    while (k < target * 6 and done < target and npads > 0) : (k += 1) {
        const ia = rndi(npads);
        if (pads[ia].used) continue;
        const a = ci(pads[ia].x, pads[ia].y);
        var b: u32 = 0;
        var ib: u32 = 0xFFFFFFFF;
        var via = false;
        if (rndf() < 0.7) {
            // outro componente
            var t: u32 = 0;
            while (t < 20) : (t += 1) {
                const j = rndi(npads);
                if (!pads[j].used and pads[j].comp != pads[ia].comp) {
                    ib = j;
                    break;
                }
            }
        }
        if (ib != 0xFFFFFFFF) {
            b = ci(pads[ib].x, pads[ib].y);
        } else {
            // via numa célula livre a uma distância razoável
            var t: u32 = 0;
            var ok = false;
            while (t < 40) : (t += 1) {
                const r = 4 + rndi(G / 4);
                const ang = rndf() * 6.2831853;
                const vx = wrapc(@as(i32, @intCast(pads[ia].x)) + @as(i32, @intFromFloat(@cos(ang) * @as(f32, @floatFromInt(r)))));
                const vy = wrapc(@as(i32, @intCast(pads[ia].y)) + @as(i32, @intFromFloat(@sin(ang) * @as(f32, @floatFromInt(r)))));
                if (occ[ci(vx, vy)] == FREE) {
                    b = ci(vx, vy);
                    ok = true;
                    break;
                }
            }
            if (!ok) continue;
            via = true;
        }
        const len = route(a, b, G * 30);
        if (len < 2) continue;
        var i: u32 = 0;
        while (i < len) : (i += 1) {
            const c = path_buf[i];
            if (occ[c] == FREE) occ[c] = net;
        }
        pads[ia].used = true;
        if (ib != 0xFFFFFFFF) pads[ib].used = true;
        if (via) {
            occ[b] = PAD;
            addVia(b % G, b / G);
        }
        const power = rndf() < 0.15;
        const r = cell * (if (power) @as(f32, 0.3) else @as(f32, 0.2));
        var glow: u32 = 0;
        if (style == 1) {
            const g = rndf();
            glow = if (g < 0.3) 1 else if (g < 0.52) 2 else 0;
        }
        drawPath(len, r, glow);
        done += 1;
        net +%= 1;
        if (net >= PAD) net = 1;
    }
}

// ---------------------------------------------------------------- composição dos mapas
fn mval(m: usize, x: u32, y: u32) f32 {
    return @as(f32, @floatFromInt(masks[m][(y % size) * size + (x % size)])) / 255.0;
}

fn heightAt(x: u32, y: u32) f32 {
    const cu = mval(M_COPPER, x, y);
    const ex = mval(M_EXPOSED, x, y);
    const ho = mval(M_HOLE, x, y);
    const sk = mval(M_SILK, x, y);
    var h = 0.5 * cu + 0.15 * ex - 0.9 * ho;
    if (style == 0) {
        h += 0.22 * sk;
        // trama da fibra de vidro sob a máscara
        const fx = @as(f32, @floatFromInt(x)) * 0.55;
        const fy = @as(f32, @floatFromInt(y)) * 0.55;
        h += 0.03 * @sin(fx) * @sin(fy) + 0.02 * hash2(x, y);
    } else {
        h += 0.35 * sk;
        // grade das células de memória dentro dos blocos
        if (sk > 0.5) {
            const gx = (x / 6) % 2;
            const gy = (y / 6) % 2;
            h += if (gx == gy) 0.04 else 0.0;
        }
        h += 0.015 * hash2(x, y);
    }
    return h;
}

fn put(m: []u8, i: usize, r: f32, g: f32, b: f32, a: f32) void {
    m[i * 4 + 0] = @intFromFloat(@max(0.0, @min(255.0, r)));
    m[i * 4 + 1] = @intFromFloat(@max(0.0, @min(255.0, g)));
    m[i * 4 + 2] = @intFromFloat(@max(0.0, @min(255.0, b)));
    m[i * 4 + 3] = @intFromFloat(@max(0.0, @min(255.0, a)));
}

fn mix(a: f32, b: f32, t: f32) f32 {
    return a + (b - a) * t;
}

fn compose(normal_strength: f32) void {
    var y: u32 = 0;
    while (y < size) : (y += 1) {
        var x: u32 = 0;
        while (x < size) : (x += 1) {
            const i: usize = y * size + x;
            const cu = mval(M_COPPER, x, y);
            const ex = mval(M_EXPOSED, x, y);
            const ho = mval(M_HOLE, x, y);
            const sk = mval(M_SILK, x, y);
            const n = hash2(x, y) * 10.0 - 5.0;
            var r: f32 = 0;
            var g: f32 = 0;
            var b: f32 = 0;
            var rough: f32 = 0;
            var metal: f32 = 0;
            if (style == 0) {
                r = mix(12, 34, cu) + n;
                g = mix(66, 118, cu) + n;
                b = mix(42, 70, cu) + n;
                r = mix(r, 232, sk);
                g = mix(g, 230, sk);
                b = mix(b, 218, sk);
                r = mix(r, 222, ex);
                g = mix(g, 180, ex);
                b = mix(b, 82, ex);
                rough = mix(mix(0.42, 0.7, sk), 0.26, ex);
                metal = ex;
            } else {
                r = mix(18, 30, sk) + n * 0.6;
                g = mix(25, 40, sk) + n * 0.6;
                b = mix(39, 60, sk) + n * 0.6;
                r = mix(r, 66, cu);
                g = mix(g, 82, cu);
                b = mix(b, 108, cu);
                r = mix(r, 160, ex);
                g = mix(g, 170, ex);
                b = mix(b, 186, ex);
                rough = mix(mix(0.42, 0.3, cu), 0.22, ex);
                metal = mix(mix(0.45, 0.85, cu), 1.0, ex);
            }
            r = mix(r, 10, ho);
            g = mix(g, 10, ho);
            b = mix(b, 12, ho);
            put(maps[0], i, r, g, b, 255);

            // normal a partir da altura (diferença central, com volta nas bordas)
            const xl = (x + size - 1) % size;
            const xr = (x + 1) % size;
            const yu = (y + size - 1) % size;
            const yd = (y + 1) % size;
            const nx = -(heightAt(xr, y) - heightAt(xl, y)) * normal_strength;
            const ny = -(heightAt(x, yd) - heightAt(x, yu)) * normal_strength;
            const inv = 1.0 / @sqrt(nx * nx + ny * ny + 1.0);
            put(maps[1], i, (nx * inv * 0.5 + 0.5) * 255, (ny * inv * 0.5 + 0.5) * 255, (inv * 0.5 + 0.5) * 255, 255);

            put(maps[2], i, (1.0 - 0.6 * ho) * 255, rough * 255, metal * 255, 255);

            if (style == 1) {
                const ga = mval(M_GLOW_A, x, y);
                const gc = mval(M_GLOW_C, x, y);
                put(maps[3], i, 255 * ga + 56 * gc, 176 * ga + 214 * gc, 32 * ga + 255 * gc, 255);
            } else {
                put(maps[3], i, 0, 0, 0, 255);
            }
        }
    }
}

// ---------------------------------------------------------------- API exportada
export fn gen_release() void {
    for (&masks) |*m| {
        if (m.len > 0) A.free(m.*);
        m.* = &.{};
    }
    for (&maps) |*m| {
        if (m.len > 0) A.free(m.*);
        m.* = &.{};
    }
    if (occ.len > 0) A.free(occ);
    if (dist.len > 0) A.free(dist);
    if (prev.len > 0) A.free(prev);
    if (heap.len > 0) A.free(heap);
    if (pads.len > 0) A.free(pads);
    if (path_buf.len > 0) A.free(path_buf);
    occ = &.{};
    dist = &.{};
    prev = &.{};
    heap = &.{};
    pads = &.{};
    path_buf = &.{};
}

/// Gera uma placa. size: lado em pixels (múltiplo de grid). Devolve 1 se deu certo.
export fn gen_board(px: u32, grid: u32, seed: u32, st: u32, components: u32, nets: u32) u32 {
    gen_release();
    size = px;
    G = grid;
    cell = @as(f32, @floatFromInt(px)) / @as(f32, @floatFromInt(grid));
    style = st;
    rng = if (seed == 0) 0x9E3779B9 else seed *% 2654435761 +% 1;
    const npx: usize = @as(usize, px) * px;
    for (&masks) |*m| {
        m.* = A.alloc(u8, npx) catch return 0;
        @memset(m.*, 0);
    }
    for (&maps) |*m| m.* = A.alloc(u8, npx * 4) catch return 0;
    const ncells: usize = @as(usize, grid) * grid;
    occ = A.alloc(u16, ncells) catch return 0;
    @memset(occ, FREE);
    dist = A.alloc(u32, ncells * 8) catch return 0;
    prev = A.alloc(u32, ncells * 8) catch return 0;
    heap = A.alloc(u64, ncells * 16) catch return 0;
    pads = A.alloc(Pad, 4096) catch return 0;
    path_buf = A.alloc(u32, ncells) catch return 0;
    npads = 0;

    const wmin: u32 = @max(4, grid / 14);
    const wmax: u32 = @max(wmin + 2, grid / 6);
    placeComponents(components, wmin, wmax);
    routeNets(nets);
    // vias soltas de costura, comuns em placa de verdade
    var v: u32 = 0;
    while (v < grid / 3) : (v += 1) {
        const x = rndi(grid);
        const y = rndi(grid);
        if (occ[ci(x, y)] == FREE) {
            occ[ci(x, y)] = PAD;
            addVia(x, y);
        }
    }
    compose(if (st == 0) 5.0 else 6.0);
    return 1;
}

export fn gen_map(i: u32) [*]u8 {
    return maps[i].ptr;
}
