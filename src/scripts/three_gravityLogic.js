import { getPixelData } from "./three_imageLogic.js";

/**
 * Computes the per-cell positional gravity shift for the main grid build pipeline.
 * This is the version actually wired into rendering — moved here from an inline
 * duplicate that previously lived in three_gridLogic.js. The "RESOLVED PIXEL"
 * helpers further down (getResolvedPixelData / calculateOriginalGravityShift) are a
 * separate, currently unused outline-aware variant and are left untouched.
 */
const edgeLaneDepth = 5;
const edgePullStrength = 0.75;
const gravityMaxShift = 5.0;
const gravityCalcMultiplier = 0.25;
const maxLeapMultiplier = 0.9;
const gravityGradientDeadzone = 0.05;

// --- LIVE GRID SHIFT (used by three_gridLogic.js applyImageToGrid) ---

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
  let edgeProximity = 0;

  if (alpha <= 0.01) return { shiftX, shiftY, edgeProximity: 1.0 };

  const self = getPixelData(
    imgData,
    col,
    row,
    cols,
    rows,
    minBright,
    maxBright,
  );

  const getSafe = (c, r) => {
    const pixel = getPixelData(
      imgData,
      Math.max(0, Math.min(cols - 1, c)),
      Math.max(0, Math.min(rows - 1, r)),
      cols,
      rows,
      minBright,
      maxBright,
    );

    if (pixel.alpha <= 0.01) {
      return { brightness: self.brightness, alpha: 0 };
    }
    return pixel;
  };

  let distanceToVoid = edgeLaneDepth + 1;
  let edgeDirX = 0;
  let edgeDirY = 0;

  for (let d = 1; d <= edgeLaneDepth; d++) {
    let found = false;

    if (getSafe(col - d, row).alpha <= 0.01) {
      edgeDirX = -1;
      found = true;
    } else if (getSafe(col + d, row).alpha <= 0.01) {
      edgeDirX = 1;
      found = true;
    }

    if (getSafe(col, row - d).alpha <= 0.01) {
      edgeDirY = -1;
      found = true;
    } else if (getSafe(col, row + d).alpha <= 0.01) {
      edgeDirY = 1;
      found = true;
    }

    if (found) {
      edgeProximity = 1.0 - (d - 1) / edgeLaneDepth;
      distanceToVoid = d;
      break;
    }
  }

  if (pixelGravity === 0) {
    return { shiftX, shiftY, edgeProximity };
  }

  const neighbors = {
    left: getSafe(col - 1, row),
    right: getSafe(col + 1, row),
    up: getSafe(col, row - 1),
    down: getSafe(col, row + 1),
  };

  const leapLimit = Math.max(
    0,
    (distanceToVoid - 1) * spacing * maxLeapMultiplier,
  );
  const maxShift = Math.min(spacing * gravityMaxShift, leapLimit);

  const calcShift = (grad) => {
    const val = -grad * pixelGravity * spacing * gravityCalcMultiplier;
    return Math.max(-maxShift, Math.min(maxShift, val));
  };

  const alignmentFactor = document.getElementById("alignmentScale")
    ? alignmentScale / 100
    : 1.0;

  const rawGradX = neighbors.right.brightness - neighbors.left.brightness;
  const rawGradY = neighbors.down.brightness - neighbors.up.brightness;

  const gradX = Math.abs(rawGradX) < gravityGradientDeadzone ? 0 : rawGradX;
  const gradY = Math.abs(rawGradY) < gravityGradientDeadzone ? 0 : rawGradY;

  shiftX = calcShift(gradX) * smallnessInfluence * alignmentFactor;
  shiftY = calcShift(gradY) * smallnessInfluence * alignmentFactor;

  if (edgeProximity > 0 && distanceToVoid > 1) {
    const pullStrength =
      edgeProximity *
      spacing *
      (Math.max(0, pixelGravity) / 100) *
      edgePullStrength;
    shiftX += edgeDirX * pullStrength;
    shiftY += edgeDirY * pullStrength;
  }

  if (neighbors.left.alpha <= 0.01 && shiftX < 0) shiftX = 0;
  if (neighbors.right.alpha <= 0.01 && shiftX > 0) shiftX = 0;
  if (neighbors.up.alpha <= 0.01 && shiftY < 0) shiftY = 0;
  if (neighbors.down.alpha <= 0.01 && shiftY > 0) shiftY = 0;

  shiftX = Math.max(-leapLimit, Math.min(leapLimit, shiftX));
  shiftY = Math.max(-leapLimit, Math.min(leapLimit, shiftY));

  return { shiftX, shiftY, edgeProximity };
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
