// === MODULE STATE ===

const sampleCanvas = document.createElement("canvas");
const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });

// === CORE LOGIC ===

/**
 * Draws an image to a canvas and extracts its pixel data.
 */
export const sampleImage = (img, cols, rows) => {
  sampleCanvas.width = cols;
  sampleCanvas.height = rows;
  sampleCtx.drawImage(img, 0, 0, cols, rows);
  return sampleCtx.getImageData(0, 0, cols, rows);
};

/**
 * Analyzes image data to find the minimum and maximum brightness values.
 */
export const getBrightnessRange = (imgData) => {
  let minBright = 1.0;
  let maxBright = 0.0;
  const data = imgData.data;

  for (let p = 0; p < data.length; p += 4) {
    const alpha = data[p + 3] / 255;
    if (alpha > 0) {
      const r = data[p] / 255;
      const g = data[p + 1] / 255;
      const b = data[p + 2] / 255;
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

      if (brightness < minBright) minBright = brightness;
      if (brightness > maxBright) maxBright = brightness;
    }
  }

  if (maxBright === minBright) maxBright += 0.001;
  return { minBright, maxBright };
};

/**
 * Calculates the normalized brightness and alpha for a specific pixel coordinate.
 */
export const getPixelData = (
  imgData,
  col,
  row,
  cols,
  rows,
  minBright,
  maxBright,
) => {
  const pixelIndex = ((rows - 1 - row) * cols + col) * 4;
  const r = imgData.data[pixelIndex] / 255;
  const g = imgData.data[pixelIndex + 1] / 255;
  const b = imgData.data[pixelIndex + 2] / 255;
  const alpha = imgData.data[pixelIndex + 3] / 255;

  let brightness = 0.299 * r + 0.587 * g + 0.114 * b;
  brightness = (brightness - minBright) / (maxBright - minBright);
  brightness = Math.max(0.0, Math.min(1.0, brightness));

  return { brightness, alpha };
};

/**
 * Determines the optimal grid dimensions to fit an image within the screen bounds.
 */
export const getGridDimensions = (img, gridSize) => {
  const maxCols = Math.floor(window.innerWidth / gridSize);
  const maxRows = Math.floor(window.innerHeight / gridSize);

  if (!img || !img.width || !img.height) {
    return { cols: maxCols, rows: maxRows };
  }

  const imgAspect = img.width / img.height;
  const screenAspect = window.innerWidth / window.innerHeight;

  if (imgAspect > screenAspect) {
    return { cols: maxCols, rows: Math.floor(maxCols / imgAspect) };
  }

  return { cols: Math.floor(maxRows * imgAspect), rows: maxRows };
};
