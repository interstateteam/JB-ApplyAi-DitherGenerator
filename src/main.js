import {
  initThree,
  resetCameraView,
  pauseControl,
  setPauseControl,
  setCameraClipping,
} from "./scripts/three_sceneLogic.js";
import { updateThreeGrid } from "./scripts/three_gridLogic.js";
import {
  createIcons,
  ImageUp,
  Shell,
  Focus,
  CameraOff,
  VideoOff,
  ChevronDown,
} from "lucide";

// --- State & Constants ---
const scaleSliders = {
  pixelAmount: { min: 80, max: 10, action: "redraw" },
  pixelScale: { min: 0, max: 200, action: "redraw" },
  gridScale: { min: 2, max: 12, action: "redraw" },
  pixelDistortion: { min: 0, max: 30, action: "redraw" },
  gravityScale: { min: 0, max: 30, action: "redraw" },
  clipDepth: { min: 1000, max: 3000, action: "camera" },
};

let currentImage = null;

// --- Functions ---
const getSettings = () => {
  const currentSettings = {};

  for (const settingName in scaleSliders) {
    const range = scaleSliders[settingName];
    const slider = document.getElementById(settingName);
    const percentage = parseInt(slider?.value) || 0;

    const calculatedValue =
      range.min + (percentage / 100) * (range.max - range.min);

    currentSettings[settingName] = Math.floor(calculatedValue);
  }

  return currentSettings;
};

const redraw = () => {
  if (currentImage) {
    updateThreeGrid(currentImage, getSettings());
  }
};

const loadImage = (imageSource) => {
  const temporaryImage = new Image();

  temporaryImage.onload = () => {
    currentImage = temporaryImage;
    redraw();
  };

  temporaryImage.src = imageSource;
};

// --- Immediate Event Listeners ---
document
  .getElementById("rotationAnimation")
  .addEventListener("click", () => setPauseControl(!pauseControl));
document
  .getElementById("focusCamera")
  .addEventListener("click", resetCameraView);
document.getElementById("pickImage").addEventListener("change", (e) => {
  if (e.target.files[0]) loadImage(URL.createObjectURL(e.target.files[0]));
});

// --- Initialization (On Load) ---
window.addEventListener("load", () => {
  initThree("canvas");

  Object.keys(scaleSliders).forEach((id) => {
    document.getElementById(id)?.addEventListener("input", () => {
      if (scaleSliders[id].action === "camera") {
        setCameraClipping(getSettings().clipDepth);
      } else {
        redraw();
      }
    });
  });

  const defaultImageEl = document.getElementById("defaultImage");
  if (defaultImageEl?.src) {
    loadImage(defaultImageEl.src);
  }

  createIcons({
    icons: { ImageUp, Shell, Focus, CameraOff, VideoOff, ChevronDown },
  });
});
