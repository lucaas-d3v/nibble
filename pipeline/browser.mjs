// Abre o Chrome sem janela no melhor caminho até a GPU que a máquina aceitar.
import { existsSync, readdirSync, realpathSync, accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright-core';

export function chromePath() {
  const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const hit = candidates.find((p) => p && existsSync(p));
  if (!hit) throw new Error('Chrome/Chromium não encontrado; defina CHROME_PATH');
  return hit;
}

// Sem CZ_GPU, renderiza no SwiftShader (CPU): mais lento, mas dá o mesmo pixel em qualquer máquina.
// Se o SwiftShader do Chrome não der WebGL2 (veja chromeVulkanGap), usa a GPU, com aviso, em vez de parar.
// CZ_GPU=1 vai direto pra GPU. Chrome sem janela (headless) não tem superfície de tela, e cada combinação
// de driver aceita um caminho diferente até a GPU. Então testa os backends do ANGLE em ordem e fica com
// o primeiro que entrega WebGL2 numa GPU de verdade. CZ_ANGLE=gl-egl|gl|vulkan força um.
const BASE = ['--hide-scrollbars', '--force-color-profile=srgb', '--disable-lcd-text', '--ignore-gpu-blocklist'];
export const BACKENDS = {
  vulkan: ['--enable-gpu', '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface', '--disable-vulkan-fallback-to-gl-for-testing'],
  'gl-egl': ['--enable-gpu', '--use-gl=angle', '--use-angle=gl-egl'],
  gl: ['--enable-gpu', '--use-gl=angle', '--use-angle=gl'],
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};
export const SOFTWARE = /swiftshader|llvmpipe|softpipe|software/i;
// GL antes do Vulkan: numa RX 5500 XT (Mesa 26.2) o render final deu 2,53 qps no gl-egl contra 2,13 no
// Vulkan, com imagem igual (PSNR 48 dB entre os dois). O Vulkan fica de reserva ou com CZ_ANGLE=vulkan.
const GPU_ORDER = ['gl-egl', 'gl', 'vulkan'];

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
    const why = sw.problem === 'sem WebGL2' ? '' : ` (${sw.problem})`;
    console.warn(`Aviso: o SwiftShader deste Chrome não deu WebGL2${why}; renderizando na GPU. \`make gpu-check\` explica.`);
    const gpu = await openGpu(exe);
    if (gpu) return gpu;
    throw new Error('Nem o SwiftShader nem a GPU deram WebGL2 neste Chrome. Rode `make gpu-check` pra ver o que travou cada caminho.');
  }
  const gpu = await openGpu(exe);
  if (gpu) return gpu;
  console.warn('Nenhum caminho até a GPU funcionou; renderizando no SwiftShader (CPU). Rode `make gpu-check` pra ver o porquê.');
  const sw = await open(exe, 'swiftshader');
  if (sw.renderer) return sw.browser;
  throw new Error('Nem a GPU nem o SwiftShader deram WebGL2 neste Chrome. Rode `make gpu-check` pra ver o que travou cada caminho.');
}

/** Nome do renderizador se este Chrome tem SwiftShader com WebGL2, senão null (a regressão visual depende dele). */
export async function swiftShaderRenderer() {
  const r = await open(chromePath(), 'swiftshader');
  await r.browser?.close();
  return r.renderer && /swiftshader/i.test(r.renderer) ? r.renderer : null;
}

// O ANGLE do Chrome carrega o Vulkan só da pasta do próprio Chrome (o Chrome oficial e o do Playwright
// levam um libvulkan.so.1 ali). O pacote chromium do Void não leva, então o ANGLE não acha o Vulkan, e
// caem juntos o backend vulkan e o swiftshader (que é o ANGLE sobre um Vulkan feito em CPU). Link
// simbólico numa pasta à parte não resolve: o ANGLE acha a pasta pelo caminho real do executável.
// Devolve a pasta do Chrome se faltar o libvulkan.so.1 nela, senão null.
export function chromeVulkanGap(exe = chromePath()) {
  let real = exe;
  try { real = realpathSync(exe); } catch { /* fica o caminho dado */ }
  // /usr/bin/chromium costuma ser um script que chama o binário de verdade em /usr/lib/chromium
  const dir = [dirname(real), '/usr/lib/chromium', '/usr/lib64/chromium', '/usr/lib/chromium-browser']
    .find((d) => existsSync(join(d, 'resources.pak')));
  if (!dir || process.platform !== 'linux') return null;
  return ['libvulkan.so.1', 'libvulkan.so'].some((f) => existsSync(join(dir, f))) ? null : dir;
}

// Chrome for Testing que o Playwright já baixou (traz libvulkan.so.1 e SwiftShader), o mais novo.
function playwrightChrome() {
  const base = join(homedir(), '.cache', 'ms-playwright');
  if (!existsSync(base)) return null;
  return readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
    .map((d) => join(base, d, 'chrome-linux64', 'chrome')).find(existsSync) ?? null;
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
  const failed = [];
  for (const name of [...GPU_ORDER, 'swiftshader']) {
    const r = await open(exe, name);
    await r.browser?.close();
    // nos backends de GPU, software não conta; no swiftshader, software é justamente o esperado
    const ok = name === 'swiftshader' ? /swiftshader/i.test(r.renderer ?? '') : !!r.renderer && !SOFTWARE.test(r.renderer);
    if (!ok) failed.push(name);
    console.log(`${ok ? '✓' : '✗'} ${name.padEnd(12)} ${r.renderer ?? r.problem}${ok && name === 'swiftshader' ? '  (CPU)' : ''}`);
  }
  const gap = failed.some((n) => n === 'vulkan' || n === 'swiftshader') ? chromeVulkanGap(exe) : null;
  if (gap) {
    const sys = ['/usr/lib/libvulkan.so.1', '/usr/lib64/libvulkan.so.1', '/usr/lib/x86_64-linux-gnu/libvulkan.so.1'].find(existsSync) ?? '/usr/lib/libvulkan.so.1';
    const pw = playwrightChrome();
    console.log(`\n✗ falta libvulkan.so.1 em ${gap}: o ANGLE deste Chrome só procura o Vulkan ali, por isso vulkan e swiftshader falham.`);
    console.log(`  conserto (uma vez, como root):  sudo ln -s ${sys} ${join(gap, 'libvulkan.so.1')}`);
    if (pw) console.log(`  ou, sem root, use o Chrome que o Playwright já baixou:  export CHROME_PATH=${pw}`);
  }
  console.log(`\nO primeiro ✓ entre ${GPU_ORDER.join(', ')} é o que o CZ_GPU=1 vai usar (CZ_ANGLE=<nome> força um).`);
  console.log('Sem CZ_GPU, o render vai no swiftshader; se ele der ✗, vai nessa mesma GPU.');
}

if (import.meta.url === `file://${process.argv[1]}`) await gpuCheck();
