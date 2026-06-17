import {
  initThree,
  resetCameraView,
  pauseControl,
  setPauseControl,
  setCameraClipping,
  scene,
  renderer,
  camera,
} from "./scripts/three_sceneLogic.js";
import { updateThreeGrid } from "./scripts/three_gridLogic.js";
import {
  createIcons,
  ImageUp,
  CircleGauge,
  Snail,
  Volleyball,
  Focus,
  FileDown,
  Box,
  Camera,
  Video,
  ChevronDown,
} from "lucide";
import {
  export3D,
  exportImg,
  exportVid,
  convertToMov,
  convertToSVG,
} from "./scripts/three_ExportLogic.js";
import Swal from "sweetalert2";
import { Return } from "three/examples/jsm/transpiler/AST.js";

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

// --- Export Logic ---

function triggerDownload(url, filename, shouldRevoke = false) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  if (shouldRevoke) {
    URL.revokeObjectURL(url);
  }
}

// Shape Export (.glb)
document.getElementById("export3D").addEventListener("click", async (event) => {
  event.preventDefault();
  try {
    const gltfData = await export3D(scene);

    // Package as a proper binary GLTF blob
    const blob = new Blob([gltfData], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);

    triggerDownload(url, "ApplyAi_DitheredShape.glb", true);
  } catch (error) {
    console.error("3D export failed:", error);
  }
});

// Snapshot Image Export (.png / .svg)
document
  .getElementById("exportPhoto")
  .addEventListener("click", async (event) => {
    event.preventDefault();

    const result = await Swal.fire({
      title: "Image Type",
      text: "Export this image as a PNG or SVG.",
      showCancelButton: true,
      confirmButtonText: ".svg",
      cancelButtonText: ".png",
      allowOutsideClick: true,
      customClass: {
        container: "cusSwal-Container",
        popup: "cusSwal-popup",
        title: "cusSwal-title",
        htmlContainer: "cusSwal-text",
        confirmButton: "cusSwal-button",
        cancelButton: "cusSwal-button",
      },
      buttonsStyling: false,
    });

    try {
      if (result.isConfirmed) {
        const svgDownloadUrl = convertToSVG(scene, camera);
        if (svgDownloadUrl) {
          triggerDownload(svgDownloadUrl, "ApplyAi_DitheredVector.svg", true);
        }
      } else if (result.dismiss === Swal.DismissReason.cancel) {
        const pngDataURL = exportImg(scene, renderer, camera);
        if (pngDataURL) {
          triggerDownload(pngDataURL, "ApplyAi_DitheredSnapshot.png", false);
        }
      } else {
        console.log("Export cancelled by user.");
        return;
      }
    } catch (error) {
      console.error("Export configuration failed:", error);
    }
  });

document
  .getElementById("exportVideo")
  .addEventListener("click", async (event) => {
    if (event) event.preventDefault();

    const result = await Swal.fire({
      title: "Choose File Type",
      text: "Select a file type and enter a duration for the video.\n\nWebM is instant. MOV/MP4 will take a while.",
      showDenyButton: true,
      showCancelButton: true,
      reverseButtons: true,
      confirmButtonText: ".mov",
      denyButtonText: ".mp4",
      cancelButtonText: ".webm",
      allowOutsideClick: true,

      customClass: {
        container: "cusSwal-Container",
        popup: "cusSwal-popup",
        title: "cusSwal-title",
        htmlContainer: "cusSwal-text",
        confirmButton: "cusSwal-button",
        cancelButton: "cusSwal-button",
        denyButton: "cusSwal-button",
      },
      buttonsStyling: false,

      input: "number",
      inputPlaceholder: "Length",
      inputAttributes: { min: 1, max: 15, step: 1 },
      inputValue: 8,
    });

    // Check if the user cancelled the dialog
    if (result.isDismissed && !result.isConfirmed && !result.isDenied) return;

    const duration = result.value;

    // Show "Processing" modal
    Swal.fire({
      title: "Exporting...",
      text: "Your video is being processed in the background.",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const webmBlob = await exportVid(renderer, duration);
      let downloadUrl, fileName;

      if (result.isConfirmed) {
        downloadUrl = await convertToMov(webmBlob);
        fileName = "ApplyAi_Render.mov";
      } else if (result.isDenied) {
        downloadUrl = await convertToMp4(webmBlob);
        fileName = "ApplyAi_Render.mp4";
      } else {
        downloadUrl = URL.createObjectURL(webmBlob);
        fileName = "ApplyAi_Render.webm";
      }

      // Success notification
      Swal.fire({
        icon: "success",
        title: "Finished Exporting!",
        text: `${fileName} is ready.`,
        timer: 2000,
        showConfirmButton: false,
        customClass: { popup: "cusSwal-popup" },
      });

      triggerDownload(downloadUrl, fileName, true);
    } catch (error) {
      Swal.fire("Error", "Export failed: " + error.message, "error");
      console.error("Video export/conversion failed:", error);
    }
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
    icons: {
      ImageUp,
      CircleGauge,
      Snail,
      Volleyball,
      Focus,
      Box,
      FileDown,
      Camera,
      Video,
      ChevronDown,
    },
  });
});
