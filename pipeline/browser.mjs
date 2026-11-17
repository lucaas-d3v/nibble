// Abre o Chrome sem janela no melhor caminho até a GPU que a máquina aceitar.
import { existsSync, readdirSync, accessSync, constants } from 'node:fs';
import { chromium } from 'playwright-core';

export function chromePath() {
  const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const hit = candidates.find((p) => p && existsSync(p));
  if (!hit) throw new Error('Chrome/Chromium não encontrado; defina CHROME_PATH');
  return hit;
}

// Sem CZ_GPU, renderiza no SwiftShader (CPU): mais lento, mas dá o mesmo pixel em qualquer máquina.
// Se o Chrome não trouxer SwiftShader (o Chromium do Void não traz), usa a GPU, com aviso, em vez de parar.
// CZ_GPU=1 vai direto pra GPU. Chrome sem janela (headless) não tem superfície de tela, e cada combinação
// de driver aceita um caminho diferente até a GPU. Então testa os backends do ANGLE em ordem e fica com
// o primeiro que entrega WebGL2 numa GPU de verdade. CZ_ANGLE=vulkan|gl-egl|gl força um.
const BASE = ['--hide-scrollbars', '--force-color-profile=srgb', '--disable-lcd-text', '--ignore-gpu-blocklist'];
export const BACKENDS = {
  vulkan: ['--enable-gpu', '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface', '--disable-vulkan-fallback-to-gl-for-testing'],
  'gl-egl': ['--enable-gpu', '--use-gl=angle', '--use-angle=gl-egl'],
  gl: ['--enable-gpu', '--use-gl=angle', '--use-angle=gl'],
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};
export const SOFTWARE = /swiftshader|llvmpipe|softpipe|software/i;
const GPU_ORDER = ['vulkan', 'gl-egl', 'gl'];

export async function probeGL(b) {
  const page = await b.newPage();
  try {
    return await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return null;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    });
  } finally { await page.close(); }
}

// Abre o Chrome num backend e pergunta o renderizador do WebGL2: { browser, renderer } ou { problem }.
async function open(exe, name) {
  let b = null;
  try {
    b = await chromium.launch({ executablePath: exe, headless: true, args: [...BASE, ...BACKENDS[name]] });
    const renderer = await probeGL(b);
    if (renderer) return { browser: b, renderer };
    await b.close();
    return { problem: 'sem WebGL2' };
  } catch (e) {
    await b?.close().catch(() => {});
    return { problem: e.message.split('\n')[0] };
  }
}

// Primeiro backend que dá WebGL2 numa GPU de verdade, ou null.
async function openGpu(exe) {
  const order = process.env.CZ_ANGLE ? [process.env.CZ_ANGLE] : GPU_ORDER;
  for (const name of order) {
    if (!BACKENDS[name]) throw new Error(`CZ_ANGLE=${name} não existe (use ${Object.keys(BACKENDS).join(', ')})`);
    const r = await open(exe, name);
    if (r.renderer && !SOFTWARE.test(r.renderer)) { console.log(`GPU: ${r.renderer}  (ANGLE ${name})`); return r.browser; }
    console.log(`  ANGLE ${name}: ${r.renderer ? `caiu no software (${r.renderer})` : r.problem}`);
    await r.browser?.close();
  }
  return null;
}

export async function launchBrowser() {
  const exe = chromePath();
  if (!process.env.CZ_GPU) {
    const sw = await open(exe, 'swiftshader');
    if (sw.renderer) return sw.browser;
    console.warn(`Aviso: este Chrome não tem SwiftShader (${sw.problem}); renderizando na GPU. Com CZ_GPU=1 este teste é pulado.`);
    const gpu = await openGpu(exe);
    if (gpu) return gpu;
    throw new Error('Nem o SwiftShader nem a GPU deram WebGL2 neste Chrome. Rode `make gpu-check` pra ver o que travou cada caminho.');
  }
  const gpu = await openGpu(exe);
  if (gpu) return gpu;
  console.warn('Nenhum caminho até a GPU funcionou; renderizando no SwiftShader (CPU). Rode `make gpu-check` pra ver o porquê.');
  const sw = await open(exe, 'swiftshader');
  if (sw.renderer) return sw.browser;
  throw new Error(`Nem a GPU nem o SwiftShader (${sw.problem}) deram WebGL2 neste Chrome. Rode \`make gpu-check\` pra ver o que travou cada caminho.`);
}

/** Nome do renderizador se este Chrome tem SwiftShader com WebGL2, senão null (a regressão visual depende dele). */
export async function swiftShaderRenderer() {
  const r = await open(chromePath(), 'swiftshader');
  await r.browser?.close();
  return r.renderer && /swiftshader/i.test(r.renderer) ? r.renderer : null;
}

// Diagnóstico: `make gpu-check` testa cada backend e diz o que impede cada um.
export async function gpuCheck() {
  const nodes = existsSync('/dev/dri') ? readdirSync('/dev/dri').filter((f) => f.startsWith('renderD')) : [];
  if (!nodes.length) console.log('✗ /dev/dri/renderD* não existe: driver da GPU não carregou (amdgpu?)');
  for (const n of nodes) {
    try { accessSync(`/dev/dri/${n}`, constants.R_OK | constants.W_OK); console.log(`✓ /dev/dri/${n} acessível`); }
    catch { console.log(`✗ /dev/dri/${n} sem permissão: entre no grupo dono do arquivo (ls -l /dev/dri) e faça login de novo`); }
  }
  const exe = chromePath();
  console.log(`Chrome: ${exe}`);
  for (const [name, flags] of Object.entries(BACKENDS)) {
    let b = null;
    try {
      b = await chromium.launch({ executablePath: exe, headless: true, args: [...BASE, ...flags] });
      const r = await probeGL(b);
      console.log(`${r && !SOFTWARE.test(r) ? '✓' : '✗'} ${name.padEnd(12)} ${r ?? 'sem WebGL2'}`);
    } catch (e) { console.log(`✗ ${name.padEnd(12)} ${e.message.split('\n')[0]}`); }
    await b?.close();
  }
  console.log('\nO primeiro ✓ entre vulkan, gl-egl e gl é o que o CZ_GPU=1 vai usar; sem CZ_GPU, é o swiftshader, ou essa GPU se ele der ✗.');
}

if (import.meta.url === `file://${process.argv[1]}`) await gpuCheck();
