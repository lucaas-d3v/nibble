// O ffmpeg muda de máquina pra máquina (pacote da distro, compilado à mão, estático, sem libx264...).
// Este módulo pergunta ao ffmpeg desta máquina o que ele tem e escolhe com base nisso, em vez de
// assumir libx264 e morrer com "Unrecognized option 'preset'... Option not found".
//
// FFMPEG=/caminho/do/ffmpeg usa outro binário (FFPROBE idem; sem ele, pega o ffprobe ao lado).
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join } from 'node:path';

export const FFMPEG = process.env.FFMPEG || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE
  || (isAbsolute(FFMPEG) && existsSync(join(dirname(FFMPEG), 'ffprobe')) ? join(dirname(FFMPEG), 'ffprobe') : 'ffprobe');

const cache = {};

function run(args) {
  const r = spawnSync(FFMPEG, ['-hide_banner', ...args], { encoding: 'utf8', maxBuffer: 32 << 20 });
  if (r.error?.code === 'ENOENT') throw new Error(`ffmpeg não encontrado (${FFMPEG}): instale o ffmpeg ou defina FFMPEG=/caminho/do/ffmpeg`);
  if (r.error) throw r.error;
  return `${r.stdout}\n${r.stderr}`;
}

function which(cmd) {
  if (cmd.includes('/')) return cmd;
  for (const d of (process.env.PATH ?? '').split(delimiter)) {
    try { accessSync(join(d, cmd), constants.X_OK); return join(d, cmd); } catch { /* próximo */ }
  }
  return cmd;
}

/** "caminho (versão)" do ffmpeg em uso, pras mensagens de erro. */
export function ffmpegName() {
  return (cache.name ??= `${which(FFMPEG)} (${/ffmpeg version (\S+)/.exec(run(['-version']))?.[1] ?? 'versão ?'})`);
}

const listed = (key, args, re) => (cache[key] ??= new Set(run(args).split('\n').map((l) => re.exec(l)?.[1]).filter(Boolean)));
export const hasEncoder = (name) => listed('encoders', ['-encoders'], /^\s[A-Z.]{6}\s+(\w[\w.-]*)/).has(name);
export const hasFilter = (name) => listed('filters', ['-filters'], /^\s[A-Z.]{2,3}\s+(\w+)\s+\S*->/).has(name);
export const hasDemuxer = (name) => (cache[`dmx_${name}`] ??= new RegExp(`^Demuxer ${name}\\b`, 'm').test(run(['-h', `demuxer=${name}`])));

// Flag do ./configure que traz cada coisa. Os filtros nativos vêm ligados por padrão: só somem se a
// compilação usou --disable-filters, --disable-avfilter ou --disable-filter=<nome>.
const FILTER_FLAG = {
  aresample: 'precisa da libswresample: tire --disable-swresample (e --disable-filter=aresample, se houver)',
  scale: 'precisa da libswscale: tire --disable-swscale (e --disable-filter=scale, se houver)',
  hwupload: '--enable-filter=hwupload (vem ligado; tire --disable-filter=hwupload)',
  zscale: '--enable-libzimg', rubberband: '--enable-librubberband', drawtext: '--enable-libfreetype',
  subtitles: '--enable-libass', ass: '--enable-libass', libplacebo: '--enable-libplacebo', ladspa: '--enable-ladspa',
};
const filterFlag = (f) => FILTER_FLAG[f] ?? `--enable-filter=${f} (vem ligado por padrão; tire --disable-filters, --disable-avfilter ou --disable-filter=${f})`;
const ENCODER_FLAG = {
  libx264: '--enable-gpl --enable-libx264 (e o pacote x264-devel)',
  libx265: '--enable-gpl --enable-libx265 (e o pacote x265-devel)',
  h264_vaapi: '--enable-vaapi (e o pacote libva-devel)', hevc_vaapi: '--enable-vaapi (e o pacote libva-devel)',
  prores_ks: '--enable-encoder=prores_ks (vem ligado por padrão)', aac: '--enable-encoder=aac (vem ligado por padrão)',
};
const encoderFlag = (e) => ENCODER_FLAG[e] ?? `--enable-encoder=${e}`;

/** Nomes dos filtros de uma cadeia ou grafo do ffmpeg (pula rótulos [x] e vírgulas dentro de aspas). */
export function filterNames(graph) {
  const names = [];
  let quoted = false, seg = '';
  for (const ch of `${graph},`) {
    if (ch === "'") quoted = !quoted;
    if (!quoted && (ch === ',' || ch === ';')) {
      const m = /^\s*(?:\[[^\]]*\]\s*)*([A-Za-z]\w*)/.exec(seg);
      if (m) names.push(m[1]);
      seg = '';
    } else seg += ch;
  }
  return names;
}

/** Para com um erro que diz quais filtros faltam e qual flag de build traz cada um. */
export function requireFilters(names, what) {
  const missing = [...new Set(names)].filter((f) => !hasFilter(f));
  if (!missing.length) return;
  throw new Error(`${what}: o ffmpeg ${ffmpegName()} não tem ${missing.length > 1 ? 'os filtros' : 'o filtro'} ${missing.join(', ')}.\n` +
    missing.map((f) => `  ${f}: ${filterFlag(f)}`).join('\n') +
    '\nRecompile o ffmpeg com isso ou aponte FFMPEG=/caminho/de/um/ffmpeg que tenha.');
}

export function requireEncoder(name, what) {
  if (hasEncoder(name)) return;
  throw new Error(`${what}: o ffmpeg ${ffmpegName()} não tem o encoder ${name}. Compile com ${encoderFlag(name)} ` +
    'ou aponte FFMPEG=/caminho/de/um/ffmpeg que tenha.');
}

export function requireDemuxer(name, what, flag) {
  if (hasDemuxer(name)) return;
  throw new Error(`${what}: o ffmpeg ${ffmpegName()} não tem a entrada -f ${name}. Compile com ${flag}.`);
}

// ---------------------------------------------------------------------------------------------
// Encoder de vídeo do render

// RGB->YUV explícito em BT.709 (sem isso as cores lavam em alguns players). O setparams marca a cor
// no próprio quadro: os encoders de hardware gravam a cor que vem no quadro, não a das opções de saída.
export const TO_BT709 = 'scale=in_range=full:out_range=tv:out_color_matrix=bt709:flags=lanczos+accurate_rnd+full_chroma_int,' +
  'setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709';
export const BT709_TAGS = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
export const VAAPI_DEVICE = '/dev/dri/renderD128';

const CODECS = {
  // CRF baixo + tune animation: gradientes limpos, sem blocagem nas áreas escuras
  x264: { encoder: 'libx264', make: (o) => {
    const crf = o.crf ?? (o.preview ? 20 : 14), preset = o.preview ? 'veryfast' : 'slow';
    return { label: `libx264, CRF ${crf}, preset ${preset}, tune animation, BT.709`,
      args: ['-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-tune', 'animation', '-pix_fmt', 'yuv420p', '-profile:v', 'high'] };
  } },
  x265: { encoder: 'libx265', make: (o) => {
    const crf = o.crf ?? (o.preview ? 22 : 16), preset = o.preview ? 'veryfast' : 'slow';
    return { label: `libx265, CRF ${crf}, preset ${preset}, 10 bits, BT.709`,
      args: ['-c:v', 'libx265', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv420p10le', '-tag:v', 'hvc1', '-x265-params', 'log-level=error'] };
  } },
  // Reserva pela GPU: bem mais rápido de codificar, mas com menos qualidade por bit que o x264.
  h264_vaapi: { encoder: 'h264_vaapi', vaapi: { fmt: 'nv12', args: ['-profile:v', 'high'] } },
  hevc_vaapi: { encoder: 'hevc_vaapi', vaapi: { fmt: 'p010', args: ['-profile:v', 'main10', '-tag:v', 'hvc1'] } },
  prores: { encoder: 'prores_ks', ext: 'mov', make: () => ({ label: 'prores_ks, ProRes 4444, 10 bits',
    args: ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuv444p10le', '-vendor', 'apl0'] }) },
};
const ALIASES = { libx264: 'x264', h264: 'x264', libx265: 'x265', h265: 'x265', hevc: 'x265', vaapi: 'h264_vaapi', prores_ks: 'prores' };
const AUTO = ['x264', 'x265', 'h264_vaapi', 'hevc_vaapi'];

// Modos de qualidade do VAAPI, do melhor pro pior. Cada driver aceita um pedaço: o radeonsi (AMD)
// só tem CQP, CBR e VBR; o da Intel tem ICQ e QVBR. Testa um a um e fica com o primeiro que passa.
function vaapiModes(o) {
  const q = o.qp ?? (o.preview ? 24 : 16), mb = o.preview ? 8 : 40, max = `${mb * 1.5}M`;
  return [
    ['ICQ', `ICQ ${q}`, ['-rc_mode', 'ICQ', '-global_quality', String(q)]],
    ['QVBR', `QVBR ${q}, até ${max}b/s`, ['-rc_mode', 'QVBR', '-global_quality', String(q), '-b:v', `${mb}M`, '-maxrate', max]],
    ['CQP', `CQP qp ${q}`, ['-rc_mode', 'CQP', '-qp', String(q)]],
    ['VBR', `VBR ${mb} Mb/s`, ['-rc_mode', 'VBR', '-b:v', `${mb}M`, '-maxrate', max]],
  ];
}

// Codifica 3 quadros cinza com os mesmos filtros e opções do render. Devolve null se passou ou o erro.
function tryEncode(pre, vf, args) {
  const W = 256, H = 256, N = 3;
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...pre, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`,
    '-framerate', '30', '-i', '-', '-vf', vf, ...BT709_TAGS, ...args, '-f', 'null', '-'],
  { input: Buffer.alloc(W * H * 3 * N, 96), encoding: 'utf8', timeout: 30_000 });
  if (r.status === 0) return null;
  const line = (r.stderr ?? '').split('\n').map((l) => l.replace(/^(\[[^\]]*\]\s*)+/, '').trim()).find(Boolean);
  return line ?? r.error?.message ?? `saiu com código ${r.status}`;
}

function build(key, o) {
  const c = CODECS[key];
  if (!hasEncoder(c.encoder)) return { error: `não está neste ffmpeg (compile com ${encoderFlag(c.encoder)})` };
  if (c.vaapi) {
    if (!existsSync(VAAPI_DEVICE)) return { error: `${VAAPI_DEVICE} não existe (o driver da GPU carregou?)` };
    try { accessSync(VAAPI_DEVICE, constants.R_OK | constants.W_OK); } catch { return { error: `sem permissão em ${VAAPI_DEVICE} (entre no grupo dono dele: ls -l /dev/dri)` }; }
    const pre = ['-vaapi_device', VAAPI_DEVICE], vf = `${TO_BT709},format=${c.vaapi.fmt},hwupload`;
    const base = ['-c:v', c.encoder, ...c.vaapi.args, ...(o.preview ? [] : ['-compression_level', '1'])];
    const refused = [];
    for (const [mode, desc, rc] of vaapiModes(o)) {
      const err = tryEncode(pre, vf, [...base, ...rc]);
      if (!err) {
        return { key, encoder: c.encoder, pre, vf, args: [...base, ...rc], ext: 'mp4',
          label: `${c.encoder} na GPU (${VAAPI_DEVICE}), ${desc}${refused.length ? `; o driver recusou ${refused.join(', ')}` : ''}` };
      }
      refused.push(mode);
      if (!/RC mode|rc_mode|not support/i.test(err)) return { error: `falhou no teste (${mode}): ${err}` };
    }
    return { error: `o driver recusou todos os modos de qualidade (${refused.join(', ')})` };
  }
  const { args, label } = c.make(o);
  const err = tryEncode([], TO_BT709, args);
  if (err) return { error: `falhou no teste: ${err}` };
  return { key, encoder: c.encoder, pre: [], vf: TO_BT709, args, label, ext: c.ext ?? 'mp4' };
}

/**
 * Escolhe o encoder de vídeo. Sem `codec`, testa libx264, libx265, h264_vaapi e hevc_vaapi, nessa ordem,
 * e fica com o primeiro que funciona de verdade neste ffmpeg. Com `codec`, usa só aquele ou para com um
 * erro que diz o que falta. Devolve { encoder, label, pre (antes do -i), vf, args, ext, skipped }.
 */
export function videoEncoder({ codec, preview = false, crf, qp } = {}) {
  const o = { preview, crf, qp };
  if (codec !== undefined && codec !== true) {
    const key = ALIASES[codec] ?? codec;
    if (!CODECS[key]) throw new Error(`--codec ${codec} não existe; use ${Object.keys(CODECS).join(', ')} (ou deixe sem --codec pra escolher sozinho)`);
    const r = build(key, o);
    if (r.error) throw new Error(`--codec ${codec}: ${CODECS[key].encoder} ${r.error}. Ffmpeg em uso: ${ffmpegName()}`);
    return { ...r, skipped: [] };
  }
  const skipped = [];
  for (const key of AUTO) {
    const r = build(key, o);
    if (!r.error) return { ...r, skipped };
    skipped.push(`${CODECS[key].encoder} ${r.error}`);
  }
  throw new Error(`Nenhum encoder de vídeo funciona no ffmpeg ${ffmpegName()}:\n${skipped.map((s) => `  ✗ ${s}`).join('\n')}\n` +
    'O certo é o libx264: recompile o ffmpeg com --enable-gpl --enable-libx264 (README, seção Rodar) ' +
    'ou aponte FFMPEG=/caminho/de/um/ffmpeg que tenha.');
}
