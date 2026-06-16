// --- Module-Level State ---
const sampleCanvas = document.createElement("canvas");
const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });

// ---  Core Exports ---
export const sampleImage = (img, cols, rows) => {
  sampleCanvas.width = cols;
  sampleCanvas.height = rows;
  sampleCtx.drawImage(img, 0, 0, cols, rows);

  return sampleCtx.getImageData(0, 0, cols, rows);
};

// Normalise brightness of an image to a standard range
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

// Call to get the brightness and alpha of a pixel in an image
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

export const getGridDimensions = (img, gridSize) => {
  const maxCols = Math.floor(window.innerWidth / gridSize);
  const maxRows = Math.floor(window.innerHeight / gridSize);

  if (!img) return { cols: maxCols, rows: maxRows };
  if (!img.width || !img.height || img.width === 0 || img.height === 0) {
    alert(
      "Image Invalid: Either the image is too small, wrong format or doesn't exist",
    );
    return { cols: maxCols, rows: maxRows };
  }

  const imgAspect = img.width / img.height;
  const screenAspect = window.innerWidth / window.innerHeight;

  // Fit the grid to the image bounds
  if (imgAspect > screenAspect) {
    // Image is wider than the screen
    return {
      cols: maxCols,
      rows: Math.floor(maxCols / imgAspect),
    };
  } else {
    // Image is taller than the screen
    return {
      cols: Math.floor(maxRows * imgAspect),
      rows: maxRows,
    };
  }
};
