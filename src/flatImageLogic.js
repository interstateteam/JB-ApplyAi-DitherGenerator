export function processImage(img, canvas, ctx, settings) {
  if (!img) return;

  const { gridSize, pixelSpace, pixelSizePercent } = settings;

  const gridWidth = Math.floor(img.width / gridSize);
  const gridHeight = Math.floor(img.height / gridSize);

  canvas.width = gridWidth;
  canvas.height = gridHeight;

  ctx.drawImage(img, 0, 0, gridWidth, gridHeight);
  const imgData = ctx.getImageData(0, 0, gridWidth, gridHeight);
  const pixelBuffer32 = new Uint32Array(imgData.data.buffer);

  // Calls the local renderer directly
  renderPixelImage(
    pixelBuffer32,
    img.width,
    img.height,
    gridWidth,
    gridHeight,
    canvas,
    ctx,
    gridSize,
    pixelSpace,
    pixelSizePercent,
  );
}

function renderPixelImage(
  pixelBuffer32,
  imgWidth,
  imgHeight,
  gridWidth,
  gridHeight,
  canvas,
  ctx,
  gridSize,
  pixelSpace,
  pixelSizePercent,
) {
  canvas.width = Math.floor((imgWidth / 10) * pixelSpace);
  canvas.height = Math.floor((imgHeight / 10) * pixelSpace);

  const cellWidth = canvas.width / gridWidth;
  const cellHeight = canvas.height / gridHeight;

  for (let imageY = 0; imageY < imgHeight; imageY += gridSize) {
    for (let imageX = 0; imageX < imgWidth; imageX += gridSize) {
      const gridX = Math.floor(imageX / gridSize);
      const gridY = Math.floor(imageY / gridSize);

      if (gridX >= gridWidth || gridY >= gridHeight) continue;

      const pixelIndex = gridY * gridWidth + gridX;
      const packedColor = pixelBuffer32[pixelIndex];

      const r = packedColor & 0xff;
      const g = (packedColor >> 8) & 0xff;
      const b = (packedColor >> 16) & 0xff;
      const a = ((packedColor >> 24) & 0xff) / 255;

      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;

      const screenX = gridX * cellWidth;
      const screenY = gridY * cellHeight;

      const currentPixelSize = Math.floor((pixelSizePercent / 100) * cellWidth);

      const offsetX = (cellWidth - currentPixelSize) / 2;
      const offsetY = (cellHeight - currentPixelSize) / 2;

      ctx.fillRect(
        screenX + offsetX,
        screenY + offsetY,
        currentPixelSize,
        currentPixelSize,
      );
    }
  }
}
