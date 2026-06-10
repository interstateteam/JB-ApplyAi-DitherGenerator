import { initThree, resetCameraView } from "/src/three_sceneLogic.js";
import { updateThreeGrid } from "/src/three_gridLogic.js";

// Maps each Three.js setting to its HTML slider ID and real-world min/max range.
// Slider values are always 0–100; getSettings() converts them to these units at runtime.
const scales = {
  gridSize: { id: "gridScale", min: 20, max: 5 }, // dot spacing in px (inverts: high % = tighter grid)
  pixelSpace: { id: "spaceScale", min: 1, max: 20 }, // global instance scale multiplier
  pixelSizePercent: { id: "sizeScale", min: 0, max: 100 }, // base dot size before brightness shading
  varietyPercent: { id: "noiseScale", min: 0, max: 30 }, // chaos: wobble in size, stretch, and geometry
};

let currentImage = null;
let material = null;

// Reads all sliders and returns a settings object with real mapped values.
// Each 0–100 slider value is linearly interpolated into its actual range.
const getSettings = () =>
  Object.fromEntries(
    Object.entries(scales).map(([key, { id, min, max }]) => {
      const pct = parseInt(document.getElementById(id).value) || 0;
      return [key, Math.floor(min + (pct / 100) * (max - min))];
    }),
  );

// Rebuilds the grid using the current image and live slider values.
// Bails early if either isn't ready yet.
const redraw = () =>
  currentImage &&
  material &&
  updateThreeGrid(currentImage, getSettings(), material);

// Loads an image from a URL (file blob or path), then triggers a redraw once decoded.
const loadImage = (src) => {
  const img = new Image();
  img.onload = () => {
    currentImage = img;
    redraw();
  };
  img.src = src;
};

window.addEventListener("load", () => {
  // Boot Three.js and get back the shared material for instanced mesh coloring
  ({ material } = initThree("canvas"));

  // Wire every slider to redraw on change
  Object.values(scales).forEach(({ id }) =>
    document.getElementById(id).addEventListener("input", redraw),
  );

  // File picker: convert the dropped file to an object URL and load it
  document.getElementById("imageLoader").addEventListener("change", (e) => {
    if (e.target.files[0]) loadImage(URL.createObjectURL(e.target.files[0]));
  });

  document
    .getElementById("resetCamera")
    .addEventListener("click", resetCameraView);

  // If the page embeds a default <img id="defaultImage">, use it as the starting image
  const defaultImage = document.getElementById("defaultImage");
  if (defaultImage) {
    currentImage = defaultImage;
    redraw();
  }
});
