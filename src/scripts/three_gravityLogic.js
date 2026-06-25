import { getPixelData } from "./three_imageLogic.js";

/**
 * Evaluates whether a coordinate belongs to the image foreground, background,
 * or is an outer edge pixel directly wrapping the inner shape silhouette.
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

  // Helper to safely fetch raw image data or return empty background if out of bounds
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

    // Identify real active shape pixels immediately next to this boundary coordinate
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
/**
 * Original gravity physics where heavy items stay static.
 * Now reads through the shape-resolved pixel interpreter.
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

export const getExtraDotCount = (brightness, alpha, pixelGravity) => {
  if (alpha <= 0.05 || brightness > 0.75) return 0;
  const darkness = 1.0 - brightness;
  const maxExtraDots = 4;
  const gravityFactor = pixelGravity / 500;
  return Math.floor(Math.pow(darkness, 2) * maxExtraDots * gravityFactor);
};
