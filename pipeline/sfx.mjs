// Efeitos sonoros do Camada Zero: sintetizados com o ffmpeg (sem arquivos de terceiros, sem licença)
// e posicionados automaticamente a partir do roteiro e da linha do tempo.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveTransitions } from '../engine/src/stage/camera.js';

const SR = 48000;

// Cada som: expressão do aevalsrc (t em segundos) + filtros. Tudo mono, 48 kHz.
const SOUNDS = {
  // chicote de câmera: ruído rosa com envelope que cresce até o corte e some
  whoosh: { src: 'anoisesrc=d=0.62:c=pink:a=0.9:seed=3', af: "bandpass=f=1400:w=1.6,volume='if(lt(t,0.38),pow(t/0.38,2.5),pow(max(0,(0.62-t)/0.24),2))':eval=frame" },
  // mergulho: subida de tom antes do corte...
  riser: { src: "aevalsrc='0.5*pow(t/0.7,2)*sin(2*PI*(180*t+900*t*t*t))':d=0.7", af: 'highpass=f=120,aecho=0.6:0.4:30:0.25' },
  // ...e impacto grave com clarão no corte
  boom: { src: "aevalsrc='0.95*exp(-t*5)*sin(2*PI*(70-30*t)*t)+0.25*exp(-t*14)*(random(0)*2-1)':d=1.2", af: 'lowpass=f=900' },
  // subida de camada: tom descendo
  fall: { src: "aevalsrc='0.45*pow(1-t/0.7,1.5)*sin(2*PI*(1100*t-500*t*t))':d=0.7", af: 'highpass=f=150' },
  // pulo / pop
  pop: { src: "aevalsrc='0.8*exp(-t*16)*sin(2*PI*(720-900*t)*t)':d=0.3", af: 'highpass=f=200' },
  // pouso: baque curto
  thud: { src: "aevalsrc='0.9*exp(-t*22)*sin(2*PI*(110-60*t)*t)+0.2*exp(-t*40)*(random(0)*2-1)':d=0.3", af: 'lowpass=f=1200' },
  // clique de tecla mecânica
  click: { src: "aevalsrc='0.9*exp(-t*260)*sin(2*PI*2600*t)+0.6*exp(-t*500)*(random(0)*2-1)+0.4*exp(-max(0,t-0.012)*300)*gt(t,0.012)*sin(2*PI*1500*t)':d=0.09", af: 'highpass=f=400' },
  // digitação leve
  tick: { src: "aevalsrc='0.5*exp(-t*400)*(random(0)*2-1)+0.3*exp(-t*300)*sin(2*PI*3200*t)':d=0.05", af: 'highpass=f=900' },
  // faíscas: estalos aleatórios
  crackle: { src: "aevalsrc='0.9*gt(random(1),0.992)*(random(2)*2-1)*exp(-t*2.2)':d=1.6", af: 'highpass=f=1800,volume=1.4' },
  // bola rolando: ronco grave com tremolo
  roll: { src: 'anoisesrc=d=0.95:c=brown:a=0.9:seed=5', af: "lowpass=f=260,tremolo=f=11:d=0.6,volume='min(1,t/0.1)*min(1,(0.95-t)/0.2)':eval=frame" },
  // fundos (em loop por baixo de cada cena)
  amb_bancada: { src: 'anoisesrc=d=8:c=pink:a=0.25:seed=9', af: 'lowpass=f=700,highpass=f=60,volume=0.5' },
  amb_chip: { src: "aevalsrc='0.06*sin(2*PI*60*t)+0.035*sin(2*PI*120*t)+0.02*sin(2*PI*180.5*t)':d=8", af: 'volume=1.0' },
  amb_memoria: { src: "aevalsrc='0.045*sin(2*PI*50*t)+0.02*sin(2*PI*100*t)+0.012*sin(2*PI*1800*t)*gt(sin(2*PI*7*t),0.97)':d=8", af: 'volume=1.0' },
  amb_vazio: { src: "aevalsrc='0.05*sin(2*PI*55*t)*(0.8+0.2*sin(2*PI*0.2*t))+0.03*sin(2*PI*82.5*t)':d=8", af: 'volume=1.0' },
};

export function ensureSfx(dir) {
  mkdirSync(dir, { recursive: true });
  for (const [name, { src, af }] of Object.entries(SOUNDS)) {
    const out = join(dir, `${name}.wav`);
    if (existsSync(out)) continue;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', src, '-af', `${af},aresample=${SR}`, '-ac', '1', '-ar', String(SR), out]);
  }
  return Object.fromEntries(Object.keys(SOUNDS).map((n) => [n, join(dir, `${n}.wav`)]));
}

/** Lista de eventos sonoros: { sound, t (s), gain (dB) }. Ambientes vêm à parte, com início/fim. */
export function sfxEvents(episode, timeline) {
  const ev = [], beds = [];
  const add = (sound, t, gain = 0) => { if (t >= 0) ev.push({ sound, t, gain }); };
  const trs = resolveTransitions(episode.scenes);
  timeline.scenes.forEach((ts, i) => {
    const sc = episode.scenes[i], at = (x) => ts.start + x;
    beds.push({ sound: `amb_${sc.environment ?? 'bancada'}`, start: ts.start, end: ts.end });
    // transições (entrada desta cena)
    if (i > 0) {
      if (trs[i] === 'whip') add('whoosh', ts.start - 0.38, -4);
      if (trs[i] === 'dive') { add('riser', ts.start - 0.7, -6); add('boom', ts.start - 0.02, -3); }
      if (trs[i] === 'rise') { add('fall', ts.start - 0.6, -6); add('pop', ts.start, -10); }
    }
    // personagem
    const anim = sc.nibble?.anim;
    if (anim === 'roll_in') { add('roll', at(0), -6); add('pop', at(0.86), -6); add('thud', at(1.26), -8); }
    if (anim === 'shock') { add('pop', at(0.16), -4); add('thud', at(0.54), -8); }
    if (anim === 'celebrate') for (const h of [0.22, 0.78, 1.34]) { add('pop', at(h), -7); add('thud', at(h + 0.36), -12); }
    // objetos
    for (const o of sc.objects ?? []) {
      if (o.type === 'key') { const p = o.press_at ?? 1.0; add('click', at(p), -3); add('click', at(p + (o.hold ?? 0.9)), -9); }
      if (o.type === 'particles' && (o.kind ?? 'sparks') === 'sparks') add('crackle', at(o.start_at ?? 0), -8);
      if (o.type === 'screen') { const n = (o.text ?? 'A').length; for (let k = 0; k < n; k++) add('tick', at((o.type_at ?? 1) + k * (o.char_time ?? 0.12)), -10); }
    }
  });
  return { events: ev.sort((a, b) => a.t - b.t), beds };
}
