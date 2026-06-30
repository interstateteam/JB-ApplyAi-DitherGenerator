import { getPixelData } from "./three_imageLogic.js";

// --- LIVE GRID SHIFT (used by three_gridLogic.js applyImageToGrid) ---

/**
 * Computes the per-cell positional gravity shift for the main grid build pipeline.
 * This is the version actually wired into rendering — moved here from an inline
 * duplicate that previously lived in three_gridLogic.js. The "RESOLVED PIXEL"
 * helpers further down (getResolvedPixelData / calculateOriginalGravityShift) are a
 * separate, currently unused outline-aware variant and are left untouched.
 */
export const calculateGravityShift = (
  col,
  row,
  cols,
  rows,
  imgData,
  minBright,
  maxBright,
  alpha,
  smallnessInfluence,
  pixelGravity,
  spacing,
  alignmentScale,
) => {
  let shiftX = 0;
  let shiftY = 0;

  if (alpha <= 0.01) return { shiftX, shiftY };

  const getSafe = (c, r) =>
    getPixelData(
      imgData,
      Math.max(0, Math.min(cols - 1, c)),
      Math.max(0, Math.min(rows - 1, r)),
      cols,
      rows,
      minBright,
      maxBright,
    );

  const neighbors = {
    left: getSafe(col - 1, row),
    right: getSafe(col + 1, row),
    up: getSafe(col, row - 1),
    down: getSafe(col, row + 1),
  };

  if (Object.values(neighbors).some((n) => n.alpha <= 0.01)) {
    return { shiftX, shiftY };
  }

  const maxShift = spacing * 5.0;
  const calcShift = (grad) => {
    const val = -grad * pixelGravity * spacing * 0.25;
    return Math.max(-maxShift, Math.min(maxShift, val));
  };

  const alignmentFactor = document.getElementById("alignmentScale")
    ? alignmentScale / 100
    : 1.0;

  shiftX =
    calcShift(neighbors.right.brightness - neighbors.left.brightness) *
    smallnessInfluence *
    alignmentFactor;
  shiftY =
    calcShift(neighbors.down.brightness - neighbors.up.brightness) *
    smallnessInfluence *
    alignmentFactor;

  return { shiftX, shiftY };
};

// --- PIXEL RESOLUTION ---

/**
 * Evaluates whether a coordinate belongs to the active image foreground or background.
 */
export const getResolvedPixelData = (
  c,
  r,
  cols,
  rows,
  imgData,
  minBright,
  maxBright,
) => {
  const initialCols = cols - 2;
  const initialRows = rows - 2;
  const innerC = c - 1;
  const innerR = r - 1;

  const getRaw = (cc, rr) => {
    if (
      cc < 0 ||
      cc >= initialCols ||
      rr < 0 ||
      rr >= initialRows ||
      !imgData
    ) {
      return { brightness: 1.0, alpha: 0 };
    }
    return getPixelData(
      imgData,
      cc,
      rr,
      initialCols,
      initialRows,
      minBright,
      maxBright,
    );
  };

  const self = getRaw(innerC, innerR);
  const selfIsBg = self.alpha <= 0.05;

  if (selfIsBg) {
    const neighbors = [
      getRaw(innerC - 1, innerR),
      getRaw(innerC + 1, innerR),
      getRaw(innerC, innerR - 1),
      getRaw(innerC, innerR + 1),
    ];

    const foregroundNeighbors = neighbors.filter((n) => n.alpha > 0.05);

    if (foregroundNeighbors.length > 0) {
      const avgBrightness =
        foregroundNeighbors.reduce((sum, n) => sum + n.brightness, 0) /
        foregroundNeighbors.length;
      return { brightness: avgBrightness, alpha: 1.0, isOutline: true };
    }
  }

  return { ...self, isOutline: false };
};

// --- GRAVITY PHYSICS ---

/**
 * Determines positional shifts mimicking gravity based on surrounding pixel brightness constraints.
 */
export const calculateOriginalGravityShift = (params) => {
  const {
    col,
    row,
    cols,
    rows,
    imgData,
    minBright,
    maxBright,
    alpha,
    smallnessInfluence,
    pixelGravity,
    spacing,
    alignmentScale,
  } = params;

  let shiftX = 0;
  let shiftY = 0;

  if (alpha > 0.01 && imgData) {
    const getSafe = (c, r) =>
      getResolvedPixelData(c, r, cols, rows, imgData, minBright, maxBright);

    const neighbors = {
      left: getSafe(col - 1, row),
      right: getSafe(col + 1, row),
      up: getSafe(col, row - 1),
      down: getSafe(col, row + 1),
    };

    if (!Object.values(neighbors).some((n) => n.alpha <= 0.01)) {
      const maxShift = spacing * 5.0;
      const subtleGravity = pixelGravity * 0.2;
      const rawShiftX = -(
        (neighbors.right.brightness - neighbors.left.brightness) *
        subtleGravity *
        spacing *
        0.25
      );
      const rawShiftY = -(
        (neighbors.down.brightness - neighbors.up.brightness) *
        subtleGravity *
        spacing *
        0.25
      );
      const alignmentFactor = document.getElementById("alignmentScale")
        ? alignmentScale / 100
        : 1.0;

      shiftX =
        Math.max(-maxShift, Math.min(maxShift, rawShiftX)) *
        smallnessInfluence *
        alignmentFactor;
      shiftY =
        Math.max(-maxShift, Math.min(maxShift, rawShiftY)) *
        smallnessInfluence *
        alignmentFactor;
    }
  }

  return { shiftX, shiftY };
};

/**
 * Calculates a dynamic overflow dot count based on darkness values.
 */
export const getExtraDotCount = (brightness, alpha, pixelGravity) => {
  if (alpha <= 0.05 || brightness > 0.75) return 0;
  const darkness = 1.0 - brightness;
  const maxExtraDots = 4;
  const gravityFactor = pixelGravity / 500;

  return Math.floor(Math.pow(darkness, 2) * maxExtraDots * gravityFactor);
};
