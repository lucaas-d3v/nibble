// Fonte única do que existe no motor. O validador e o roteirista (LLM) leem daqui.
export const ANIMS = ['idle', 'talk', 'point', 'think', 'shock', 'celebrate', 'roll_in'];
export const OUTFITS = ['none', 'esd', 'hoodie', 'goggles'];
export const CAMERAS = ['hero', 'closeup', 'prop', 'macro', 'top', 'low'];
export const ENVIRONMENTS = ['bancada', 'chip', 'vazio'];
export const TONES = ['hook', 'curious', 'explain', 'payoff', 'outro'];
export const PREFABS = [
  'cpu', 'ram', 'chip', 'key', 'key_matrix', 'cable', 'bit_grid', 'transistor', 'screen',
  'particles', 'box', 'sphere', 'cylinder', 'arrow',
];
export const PARTICLE_KINDS = ['sparks', 'flow', 'dust'];

export const LIMITS = {
  xMin: -0.9, xMax: 0.9,        // faixa segura horizontal em 9:16
  durMin: 40, durMax: 80,       // segundos
  hudWordsMax: 5,
  hudCharsMax: 24,              // acima disso a pílula encosta na borda
  sceneWordsMax: 38,
};
