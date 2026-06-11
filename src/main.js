import {
  initThree,
  resetCameraView,
  pauseControl,
  setPauseControl,
} from "./three_sceneLogic.js";
import { updateThreeGrid } from "./three_gridLogic.js";
import {
  createIcons,
  ImageUp,
  Shell,
  Focus,
  CameraOff,
  VideoOff,
  ChevronDown,
} from "lucide";

const scales = {
  pixelAmount: { id: "pixelAmount", min: 80, max: 10 },
  pixelScale: { id: "pixelScale", min: 0, max: 200 },
  gridScale: { id: "gridScale", min: 2, max: 10 },
  pixelDistortion: { id: "pixelDistortion", min: 0, max: 30 },
  gravityScale: { id: "gravityScale", min: 0, max: 30 },
};

let defaultImage;
let material = null;

const pauseBtn = document.getElementById("rotationAnimation");

pauseBtn.addEventListener("click", () => {
  const nextState = !pauseControl;

  setPauseControl(nextState);
});

const getSettings = () =>
  Object.fromEntries(
    Object.entries(scales).map(([key, { id, min, max }]) => {
      const pct = parseInt(document.getElementById(id).value) || 0;
      return [key, Math.floor(min + (pct / 100) * (max - min))];
    }),
  );

const loadImage = (src) => {
  const img = new Image();
  img.onload = () => {
    defaultImage = img;
    redraw();
  };
  img.src = src;
};

const redraw = () => updateThreeGrid(defaultImage, getSettings(), material);

window.addEventListener("load", () => {
  ({ material } = initThree("canvas"));

  Object.values(scales).forEach(({ id }) =>
    document.getElementById(id).addEventListener("input", redraw),
  );

  document.getElementById("pickImage").addEventListener("change", (e) => {
    if (e.target.files[0]) loadImage(URL.createObjectURL(e.target.files[0]));
  });

  document
    .getElementById("focusCamera")
    .addEventListener("click", resetCameraView);

  const defaultImage = document.getElementById("defaultImage");
  if (defaultImage) {
    loadImage(defaultImage.src);
    redraw();
  }

  createIcons({
    icons: {
      ImageUp,
      Shell,
      Focus,
      CameraOff,
      VideoOff,
      ChevronDown,
    },
  });
});
