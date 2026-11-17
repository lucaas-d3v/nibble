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

// CZ_GPU=1 usa a GPU de verdade; sem isso cai no SwiftShader (CPU), bem mais lento.
// Chrome sem janela (headless) não tem superfície de tela, e cada combinação de driver aceita
// um caminho diferente até a GPU. Então testa os backends do ANGLE em ordem e fica com o primeiro
// que entrega WebGL2 numa GPU de verdade. CZ_ANGLE=vulkan|gl-egl|gl força um.
const BASE = ['--hide-scrollbars', '--force-color-profile=srgb', '--disable-lcd-text', '--ignore-gpu-blocklist'];
export const BACKENDS = {
  vulkan: ['--enable-gpu', '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface', '--disable-vulkan-fallback-to-gl-for-testing'],
  'gl-egl': ['--enable-gpu', '--use-gl=angle', '--use-angle=gl-egl'],
  gl: ['--enable-gpu', '--use-gl=angle', '--use-angle=gl'],
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};
export const SOFTWARE = /swiftshader|llvmpipe|softpipe|software/i;

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

export async function launchBrowser() {
  const exe = chromePath();
  if (!process.env.CZ_GPU) return chromium.launch({ executablePath: exe, headless: true, args: [...BASE, ...BACKENDS.swiftshader] });
  const order = process.env.CZ_ANGLE ? [process.env.CZ_ANGLE] : ['vulkan', 'gl-egl', 'gl'];
  for (const name of order) {
    if (!BACKENDS[name]) throw new Error(`CZ_ANGLE=${name} não existe (use ${Object.keys(BACKENDS).join(', ')})`);
    let b = null;
    try {
      b = await chromium.launch({ executablePath: exe, headless: true, args: [...BASE, ...BACKENDS[name]] });
      const renderer = await probeGL(b);
      if (renderer && !SOFTWARE.test(renderer)) { console.log(`GPU: ${renderer}  (ANGLE ${name})`); return b; }
      console.log(`  ANGLE ${name}: ${renderer ? `caiu no software (${renderer})` : 'sem WebGL2'}`);
    } catch (e) {
      console.log(`  ANGLE ${name}: ${e.message.split('\n')[0]}`);
    }
    await b?.close();
  }
  console.warn('Nenhum caminho até a GPU funcionou; renderizando no SwiftShader (CPU). Rode `make gpu-check` pra ver o porquê.');
  return chromium.launch({ executablePath: exe, headless: true, args: [...BASE, ...BACKENDS.swiftshader] });
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
  console.log('\nO primeiro ✓ entre vulkan, gl-egl e gl é o que o CZ_GPU=1 vai usar.');
}

if (import.meta.url === `file://${process.argv[1]}`) await gpuCheck();
