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
  exportVid,
  convertToMOV,
  convertToSVG_export,
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
  clipDepth: { min: 500, max: 3000, action: "camera" },
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
  e.preventDefault();
  try {
    const gltfData = await export3D(scene);

    const blob = new Blob([gltfData], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);

    triggerDownload(url, "ApplyAi_DitheredShape.glb", true);
  } catch (error) {
    console.error("3D export failed:", error);
  }
});

// Image Export (.png / .svg)
document.getElementById("exportPhoto").addEventListener("click", async (e) => {
  e.preventDefault();

  const result = await newSwal.fire({
    title: "Image Export",
    text: "Please choose a format.",
    showCancelButton: true,
    confirmButtonText: ".svg",
    cancelButtonText: ".png",
  });

  try {
    if (result.isConfirmed) {
      triggerDownload(
        URL.createObjectURL(
          new Blob([convertToSVG_export(scene, camera)], {
            type: "image/svg+xml",
          }),
        ),
        "ApplyAi_DitheredVector.svg",
        true,
      );
    } else if (result.dismiss === Swal.DismissReason.cancel) {
      triggerDownload(
        exportToPNG(scene, renderer, camera),
        "ApplyAi_DitheredSnapshot.png",
        false,
      );
    } else {
      console.log("Export cancelled by user.");
      return;
    }
  } catch (error) {
    console.error("Export configuration failed:", error);
  }
});

// Video Export (.webm / .mp4 / .mov)
document.getElementById("exportVideo").addEventListener("click", async (e) => {
  if (e) e.preventDefault();

  const result = await newSwal.fire({
    title: "Video Export",
    text: "Enter a duration and select a file typefor the video.\nWebM is instant. MOV will take a while.\n\nLeave input blank to record the full animation",
    showDenyButton: false,
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
        // Close with a custom object. This object becomes 'result' in your main code.
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
    return;
  }

  const duration = result.value;

  newSwal.fire({
    title: "Exporting",
    timer: duration < 5 ? 5 * 1000 : duration * 1000,
    allowOutsideClick: false,
    allowEscapeKey: false,
    text: `Recording the scene for ${duration} seconds.\n\n This box will close and finish rendering in the background`,
    didOpen: () => Swal.showLoading(),
  });

  try {
    const webmBlob = await exportVid(renderer, duration);
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
      console.log("returned");
      return;
    }

    // 4. Success notification using template literals
    newSwal.fire({
      title: "Finished Rendering",
      text: `${fileName} is ready.`,
      timer: 4000,
      showConfirmButton: false,
    });

    triggerDownload(downloadUrl, fileName, true);

    await cleanupTempFiles();
  } catch (error) {
    Swal.fire("Error", "Export failed: " + error.message, "error");
    console.error("Video export/conversion failed:", error);

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
