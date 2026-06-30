const sampleCanvas = document.createElement("canvas");
const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });

export const sampleImage = (img, cols, rows) => {
  sampleCanvas.width = cols;
  sampleCanvas.height = rows;
  sampleCtx.clearRect(0, 0, cols, rows);

  let drawWidth = cols;
  let drawHeight = rows;
  let drawX = 0;
  let drawY = 0;

  if (img && img.width && img.height) {
    const imgAspect = img.width / img.height;
    const gridAspect = cols / rows;

    if (imgAspect > gridAspect) {
      drawWidth = cols;
      drawHeight = cols / imgAspect;
      drawY = (rows - drawHeight) / 2;
    } else {
      drawHeight = rows;
      drawWidth = rows * imgAspect;
      drawX = (cols - drawWidth) / 2;
    }
  }

  sampleCtx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
  return sampleCtx.getImageData(0, 0, cols, rows);
};

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
  // A fixed virtual 3D space. This guarantees the exact same amount of dots
  // for every image, entirely independent of the user's screen resolution.
  const VIRTUAL_SIZE = 1000;

  const cols = Math.floor(VIRTUAL_SIZE / gridSize);
  const rows = Math.floor(VIRTUAL_SIZE / gridSize);

  return { cols, rows };
};
