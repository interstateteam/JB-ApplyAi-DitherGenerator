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
  const data = imgData.data;
  const brightnessValues = [];

  // 1. Gather brightness for visible pixels only
  for (let p = 0; p < data.length; p += 4) {
    const alpha = data[p + 3] / 255;

    // Synced with gridLogic's background threshold (alpha > 0.05)
    // This stops empty canvas borders from messing up your contrast math
    if (alpha > 0.05) {
      const r = data[p] / 255;
      const g = data[p + 1] / 255;
      const b = data[p + 2] / 255;

      let brightness = 0.299 * r + 0.587 * g + 0.114 * b;

      // ==========================================
      // NEW: ALPHA FLATTENING
      // ==========================================
      // Treat semi-transparent edge pixels as if they are blending into a white background.
      // This stops anti-aliased edge pixels from artificially registering as deep blacks.
      brightness = brightness * alpha + 1.0 * (1.0 - alpha);

      brightnessValues.push(brightness);
    }
  }

  // Fallback if the image is completely blank/transparent
  if (brightnessValues.length === 0) {
    return { minBright: 0.0, maxBright: 1.0 };
  }

  // 2. Sort values from darkest to lightest
  brightnessValues.sort((a, b) => a - b);

  // 3. Extract the 1st and 99th percentiles instead of absolute min/max.
  // This filters out noise and forces low-contrast images to expand across the full dot-scale range.
  const minIndex = Math.floor(brightnessValues.length * 0.01);
  const maxIndex = Math.floor(brightnessValues.length * 0.99);

  let minBright = brightnessValues[minIndex];
  let maxBright = brightnessValues[maxIndex];

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

  // 1. Calculate standard perceptual brightness
  let brightness = 0.299 * r + 0.587 * g + 0.114 * b;

  // ==========================================
  // NEW: ALPHA FLATTENING
  // ==========================================
  // If an edge pixel is 10% opaque, this math forces it to be 90% white.
  // This naturally creates a flawless dot-size gradient at the edge of shapes!
  brightness = brightness * alpha + 1.0 * (1.0 - alpha);

  // 2. Normalize based on our 1st/99th percentiles
  brightness = (brightness - minBright) / (maxBright - minBright);
  brightness = Math.max(0.0, Math.min(1.0, brightness));

  const SHADOW_DETAIL_CURVE = 0.6;

  // Apply the curve to bend the brightness values
  brightness = Math.pow(brightness, SHADOW_DETAIL_CURVE);

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
