// Canvas Elements
const imageLoader = document.getElementById("imageLoader");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// Image Grid Elements
const gridSize = 40;
const pixelSize = 10;
const pixelSpace = 15;

// Image Loading Functions
function loadDefaultImage() {
  const defaultImage = document.getElementById("defaultImage");
  if (defaultImage) {
    processAndRenderImage(defaultImage);
  }
}
function handleImage(imageInput) {
  if (!imageInput.target.files || !imageInput.target.files[0]) return;

  const reader = new FileReader();
  reader.onload = function (event) {
    const img = new Image();
    img.onload = function () {
      processAndRenderImage(img);
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(imageInput.target.files[0]);
}

function processImage(img) {
  if (!img) return;

  const gridWidth = Math.floor(img.width / gridSize);
  const gridHeight = Math.floor(img.height / gridSize);

  canvas.width = gridWidth;
  canvas.height = gridHeight;

  ctx.drawImage(img, 0, 0, gridWidth, gridHeight);
  const imgData = ctx.getImageData(0, 0, gridWidth, gridHeight);
  const pixelBuffer32 = new Uint32Array(imgData.data.buffer);

  canvas.width = gridWidth * pixelSpace;
  canvas.height = gridHeight * pixelSpace;

  renderPixelImage(pixelBuffer32);
}

function renderPixelImage(pixelBuffer32) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const index = y * gridWidth + x;
      const pixel = pixelBuffer32[index];

      const r = pixel & 0xff;
      const g = (pixel >> 8) & 0xff;
      const b = (pixel >> 16) & 0xff;

      const lightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;

      // CHANGED: Position centers are now placed according to pixelSpace
      const centerX = x * pixelSpace + pixelSpace / 2;
      const centerY = y * pixelSpace + pixelSpace / 2;

      // Max radius remains bound to the structural pixelSize limits
      const maxRadius = pixelSize / 2;
      const radius = maxRadius * lightness;

      if (radius > 0) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

window.addEventListener("load", () => {
  console.log("ran");
  loadDefaultImage();
  imageLoader.addEventListener("change", handleImage, false);
});
