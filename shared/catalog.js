// Fonte única do que existe no motor. O validador e o roteirista (LLM) leem daqui.
export const ANIMS = ['idle', 'talk', 'point', 'think', 'shock', 'celebrate', 'wave', 'press', 'roll_in'];
export const MOODS = ['neutral', 'happy', 'excited', 'serious', 'confused', 'sad'];
export const OUTFITS = ['none', 'esd', 'hoodie', 'goggles'];
export const CAMERAS = ['hero', 'closeup', 'face', 'prop', 'macro', 'top', 'low'];
export const ENVIRONMENTS = ['bancada', 'chip', 'vazio'];
export const LOOKS = ['camera', 'focus'];
export const MOVES = ['auto', 'static', 'push', 'pull', 'orbit', 'crane', 'drift'];
export const TRANSITIONS = ['auto', 'cut', 'whip', 'dive', 'rise'];
export const TONES = ['hook', 'curious', 'explain', 'payoff', 'outro'];
export const PREFABS = [
  'cpu', 'ram', 'chip', 'key', 'key_matrix', 'cable', 'bit_grid', 'transistor', 'screen',
  'particles', 'box', 'sphere', 'cylinder', 'arrow',
  'ssd', 'fan', 'gpu', 'hdd', 'gate', 'mem_cells', 'packet', 'terminal',
];
export const PARTICLE_KINDS = ['sparks', 'flow', 'dust'];

export const LIMITS = {
  xMin: -0.9, xMax: 0.9,        // faixa segura horizontal em 9:16
  durMin: 40, durMax: 80,       // segundos
  hudWordsMax: 5,
  hudCharsMax: 24,              // acima disso a pílula encosta na borda
  sceneWordsMax: 38,
};
