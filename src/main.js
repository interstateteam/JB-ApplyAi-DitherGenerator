import { initThree, updateThreeGrid } from "/src/threeLogic.js";

// UI Elements
let imageLoader;
let gridScale, sizeScale, spaceScale;
let currentImage;

// Decoupled Global States passed to Three.js
let gridSize;
let pixelSpace;
let pixelSizePercent;

const maxScales = {
  gridScale: { min: 10, max: 20 },
  spaceScale: { min: 1, max: 20 },
  sizeScale: { min: 0, max: 200 },
};

function mapPercentToRange(percent, config) {
  return config.min + (percent / 100) * (config.max - config.min);
}

function redraw() {
  if (currentImage) {
    const settings = { gridSize, pixelSpace, pixelSizePercent };
    updateThreeGrid(currentImage, settings);
  }
}

function handleSliderChange(event) {
  const percent = parseInt(event.target.value);
  const id = event.target.id;

  switch (id) {
    case "gridScale":
      gridSize = Math.floor(mapPercentToRange(percent, maxScales.gridScale));
      break;
    case "spaceScale":
      pixelSpace = Math.floor(mapPercentToRange(percent, maxScales.spaceScale));
      break;
    case "sizeScale":
      pixelSizePercent = Math.floor(
        mapPercentToRange(percent, maxScales.sizeScale),
      );
      break;
  }

  redraw();
}

function loadDefaultImage() {
  const defaultImage = document.getElementById("defaultImage");
  if (defaultImage) {
    currentImage = defaultImage;
    redraw();
  }
}

function handleImage(imageInput) {
  if (!imageInput.target.files || !imageInput.target.files[0]) return;

  const reader = new FileReader();
  reader.onload = function (event) {
    const img = new Image();
    img.onload = function () {
      currentImage = img;
      redraw();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(imageInput.target.files[0]);
}

window.addEventListener("load", () => {
  // 1. Initialize Three.js on your main HTML canvas element
  initThree("canvas");

  // 2. Bind inputs and state
  imageLoader = document.getElementById("imageLoader");

  gridScale = document.getElementById("gridScale");
  gridScale.addEventListener("input", handleSliderChange);
  gridSize = Math.floor(
    mapPercentToRange(parseInt(gridScale.value), maxScales.gridScale),
  );

  spaceScale = document.getElementById("spaceScale");
  spaceScale.addEventListener("input", handleSliderChange);
  pixelSpace = Math.floor(
    mapPercentToRange(parseInt(spaceScale.value), maxScales.spaceScale),
  );

  sizeScale = document.getElementById("sizeScale");
  sizeScale.addEventListener("input", handleSliderChange);
  pixelSizePercent = Math.floor(
    mapPercentToRange(parseInt(sizeScale.value), maxScales.sizeScale),
  );

  // 3. Initial load
  loadDefaultImage();
  imageLoader.addEventListener("change", handleImage, false);
});
