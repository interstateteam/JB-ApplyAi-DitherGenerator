// Offscreen canvas used solely for downsampling the source image to grid resolution.
// Drawing and reading pixels here avoids touching the visible DOM.
const sampleCanvas = document.createElement("canvas");
const sampleCtx = sampleCanvas.getContext("2d");

// Downsamples img to cols×rows and returns the raw pixel data.
// Three.js can't read image pixels directly — this draws into a hidden canvas first.
export function sampleImage(img, cols, rows) {
  sampleCanvas.width = cols;
  sampleCanvas.height = rows;
  sampleCtx.drawImage(img, 0, 0, cols, rows);

  return sampleCtx.getImageData(0, 0, cols, rows);
}

// Scans all pixels and returns the darkest and brightest luminance values found.
// Used to normalise brightness per-image so contrast always fills the full 0–1 range,
// regardless of whether the source image is dark, light, or low-contrast.
export function getBrightnessRange(imgData) {
  let minBright = 1.0;
  let maxBright = 0.0;

  for (let p = 0; p < imgData.data.length; p += 4) {
    const a = imgData.data[p + 3] / 255;
    if (a > 0) {
      // skip fully transparent pixels
      const br =
        0.299 * (imgData.data[p] / 255) +
        0.587 * (imgData.data[p + 1] / 255) +
        0.114 * (imgData.data[p + 2] / 255);
      if (br < minBright) minBright = br;
      if (br > maxBright) maxBright = br;
    }
  }

  // Prevent division by zero if the image is a single flat colour
  if (maxBright === minBright) maxBright += 0.001;
  return { minBright, maxBright };
}

// Calculates how many grid columns and rows fit on screen at the given spacing.
// When an image is provided, the grid is cropped to match the image's aspect ratio
// so dots don't spill outside the image bounds.
export function getGridDimensions(img, gridSize) {
  const winWidth = window.innerWidth;
  const winHeight = window.innerHeight;
  const maxCols = Math.floor(winWidth / gridSize);
  const maxRows = Math.floor(winHeight / gridSize);

  if (!img) return { cols: maxCols, rows: maxRows };

  const imgAspect = img.width / img.height;
  const screenAspect = winWidth / winHeight;

  // Fit the grid to whichever axis the image fills first (letterbox / pillarbox logic)
  if (imgAspect > screenAspect) {
    return { cols: maxCols, rows: Math.floor(maxCols / imgAspect) };
  } else {
    return { cols: Math.floor(maxRows * imgAspect), rows: maxRows };
  }
}
