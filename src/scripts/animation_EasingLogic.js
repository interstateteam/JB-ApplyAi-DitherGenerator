// === EASING CURVES ===
// Pure easing functions, each taking progress in [0, 1] and returning an eased value.
// Extracted from the individual animation handlers in three_animationLogic.js, where
// these were previously redefined locally inside each handler function.

export const easeInOutQuad = (x) =>
  x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

export const easeInOutCubic = (x) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

export const easeInOutQuintic = (x) =>
  x < 0.5 ? 16 * Math.pow(x, 5) : 1 - Math.pow(-2 * x + 2, 5) / 2;

export const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;

export const easeInQuint = (x) => x * x * x * x * x;

export const easeOutQuint = (x) => 1 - Math.pow(1 - x, 5);

export const easeOutExpo = (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x));

// === PSEUDO-RANDOM HELPERS ===
// Shared deterministic "noise" used to scatter instances by index. Several animation
// handlers used these same magic constants (12.9898 / 78.233 / 39.346) independently.

/**
 * Returns three deterministic sine values for a given instance index, optionally
 * offset (e.g. by an animated time value to make the noise drift over time).
 */
export const pseudoRandom3 = (i, offset = 0) => ({
  x: Math.sin(i * 12.9898 + offset),
  y: Math.sin(i * 78.233 + offset),
  z: Math.sin(i * 39.346 + offset),
});

/**
 * Same as pseudoRandom3 but rescaled into a fractional [0, 1) spread, matching the
 * scatter-position formula used by the break-apart animation.
 */
export const pseudoRandomFrac3 = (i) => ({
  x: (Math.sin(i * 12.9898) * 43758.5453) % 1,
  y: (Math.sin(i * 78.233) * 43758.5453) % 1,
  z: (Math.sin(i * 39.346) * 43758.5453) % 1,
});
