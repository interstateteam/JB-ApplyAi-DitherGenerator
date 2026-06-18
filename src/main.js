import {
  initThree,
  resetCameraView,
  setCameraClipping,
  scene,
  renderer,
  camera,
  controls,
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
  exportToPNG,
  exportWEBM,
  convertToMOV,
  exportToJPG,
  convertToSVG,
  convertToMP4,
  cleanupTempFiles,
} from "./scripts/three_exportLogic.js";
import Swal from "sweetalert2";
import {
  handleAnimationSwitch,
  updateButtonUI,
} from "./scripts/three_animationLogic.js";

// --- State & Constants ---
const scaleSliders = {
  pixelAmount: { min: 80, max: 10, action: "redraw" },
  pixelScale: { min: 0, max: 200, action: "redraw" },
  gridScale: { min: 4, max: 12, action: "redraw" },
  pixelDistortion: { min: 0, max: 30, action: "redraw" },
  pixelGravity: { min: 0, max: 400, action: "redraw" },
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

document.getElementById("focusCamera").addEventListener("click", () => {
  resetCameraView();
});

document.getElementById("rotationAnimation").addEventListener("click", () => {
  handleAnimationSwitch("default");
});

document.getElementById("spinAnimation").addEventListener("click", () => {
  handleAnimationSwitch("eased");
});

document.getElementById("bounceAnimation").addEventListener("click", () => {
  handleAnimationSwitch("thirdMode");
});

document.getElementById("pickImage").addEventListener("change", (e) => {
  if (e.target.files[0]) loadImage(URL.createObjectURL(e.target.files[0]));
});

updateButtonUI();

// --- Export Logic ---

// Default Notification Styling
const newSwal = Swal.mixin({
  allowOutsideClick: true,
  buttonsStyling: false,
  reverseButtons: true,

  didOpen: () => {
    const confirmBtn = Swal.getConfirmButton();
    const cancelBtn = Swal.getCancelButton();
    if (confirmBtn) confirmBtn.blur();
    if (cancelBtn) cancelBtn.blur();

    const input = Swal.getInput();
    if (input) input.blur();
  },

  customClass: {
    container: "cusSwal-Container",
    popup: "cusSwal-popup",
    title: "cusSwal-title",
    htmlContainer: "cusSwal-text",
    confirmButton: "cusSwal-button",
    cancelButton: "cusSwal-button",
    denyButton: "cusSwal-button",
  },
});

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
document.getElementById("export3D").addEventListener("click", async (e) => {
  if (e) e.preventDefault();

  newSwal.fire({
    title: "Exporting 3D Model",
    text: "Packaging 3D assets and geometry. Please wait...",
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: () => Swal.showLoading(),
  });

  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    const modelUrl = export3D(scene);

    newSwal.fire({
      title: "Finished",
      text: "Your 3D model is ready.",
      timer: 4000,
      showConfirmButton: false,
    });
    triggerDownload(modelUrl, "ApplyAi_3DModel.gltf", true);
  } catch (error) {
    Swal.fire("Error", "3D Export failed: " + error.message, "error");
    console.error("3D export process failed:", error);
  } finally {
    if (modelUrl) {
      URL.revokeObjectURL(modelUrl);
    }
  }
});

// Image Export (.png / .svg)
document.getElementById("exportPhoto").addEventListener("click", async (e) => {
  e.preventDefault();

  const result = await newSwal.fire({
    title: "Image Export",
    text: "Please choose a format.",
    showDenyButton: true,
    showCancelButton: true,
    confirmButtonText: ".svg",
    denyButtonText: ".png",
    cancelButtonText: ".jpg",
  });

  // Guard clause: If the user clicked outside the box or pressed ESC, exit early
  if (
    result.dismiss === Swal.DismissReason.backdrop ||
    result.dismiss === Swal.DismissReason.esc
  ) {
    console.log("Export cancelled by user.");
    return;
  }

  let svgUrl = null;

  try {
    if (result.isConfirmed) {
      // 1. .svg Format Chosen
      newSwal.fire({
        title: "Generating SVG",
        text: "\nConverting 3D to 2D\nThis may take a moment.",
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => Swal.showLoading(),
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      svgUrl = convertToSVG(scene, camera);

      newSwal.fire({
        title: "Finished",
        text: "ApplyAi_DitheredVector.svg is ready.",
        timer: 4000,
        showConfirmButton: false,
      });

      triggerDownload(svgUrl, "ApplyAi_DitheredVector.svg", true);
    } else if (result.isDenied) {
      triggerDownload(
        exportToPNG(scene, renderer, camera),
        "ApplyAi_DitheredSnapshot.png",
        false,
      );
    } else if (result.dismiss === Swal.DismissReason.cancel) {
      triggerDownload(
        exportToJPG(scene, renderer, camera),
        "ApplyAi_DitheredSnapshot.jpg",
        false,
      );
    }
  } catch (error) {
    Swal.fire("Error", "Image generation failed: " + error.message, "error");
    console.error("Export configuration failed:", error);
  } finally {
    if (svgUrl) {
      URL.revokeObjectURL(svgUrl);
    }
  }
});

// Video Export (.webm / .mp4 / .mov)
document.getElementById("exportVideo").addEventListener("click", async (e) => {
  if (e) e.preventDefault();

  const result = await newSwal.fire({
    title: "Video Export",
    text: "Enter a duration and select a file type for the video.\nWebM is instant. MOV will take a while.\n\nLeave input blank to record the full animation",
    showDenyButton: true,
    showCancelButton: true,
    confirmButtonText: ".mov",
    denyButtonText: ".mp4",
    cancelButtonText: ".webm",
    input: "number",
    inputPlaceholder: "Length",
    inputAttributes: { min: 1, max: 15, step: 1 },
    inputValue: 8,

    didOpen: () => {
      const cancelBtn = Swal.getCancelButton();
      cancelBtn.onclick = () => {
        const inputVal = Swal.getInput().value;
        newSwal.close({
          isConfirmed: false,
          isDenied: false,
          isWebM: true,
          value: inputVal,
        });
      };
    },
  });

  if (
    result.dismiss === Swal.DismissReason.backdrop ||
    result.dismiss === Swal.DismissReason.esc
  ) {
    console.log("Export cancelled by user.");
    return;
  }

  const duration = Number(result.value) || 8;

  newSwal.fire({
    title: "Exporting",
    timer: Math.max(5, duration) * 1000,
    allowOutsideClick: false,
    allowEscapeKey: false,
    text: `Recording the scene for ${duration} seconds.\n\nThis box will close and finish rendering in the background. This may take some time.`,
    didOpen: () => Swal.showLoading(),
  });

  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    const webmBlob = await exportWEBM(renderer, duration);
    let downloadUrl, fileName;

    if (result.isConfirmed) {
      downloadUrl = await convertToMOV(webmBlob);
      fileName = "ApplyAi_Render.mov";
    } else if (result.isDenied) {
      downloadUrl = await convertToMP4(webmBlob);
      fileName = "ApplyAi_Render.mp4";
    } else if (result.isWebM) {
      downloadUrl = URL.createObjectURL(webmBlob);
      fileName = "ApplyAi_Render.webm";
    } else {
      return;
    }

    newSwal.fire({
      title: "Finished Rendering",
      text: `${fileName} is ready.`,
      timer: 4000,
      showConfirmButton: false,
    });

    triggerDownload(downloadUrl, fileName, true);
  } catch (error) {
    Swal.fire("Error", "Export failed: " + error.message, "error");
    console.error("Video export/conversion failed:", error);
  } finally {
    if (
      downloadUrl &&
      typeof downloadUrl === "string" &&
      downloadUrl.startsWith("blob:")
    ) {
      URL.revokeObjectURL(downloadUrl);
    }

    await cleanupTempFiles();
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
