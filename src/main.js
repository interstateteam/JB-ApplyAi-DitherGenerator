import "./style.css";
import logoUrl from "./assets/LogoMarkFull.svg";
import {
  initThree,
  resetCameraView,
  setCameraClipping,
  scene,
  renderer,
  camera,
  controls,
  material,
} from "./scripts/three_sceneLogic.js";
import { updateThreeGrid } from "./scripts/three_gridLogic.js";
import {
  createIcons,
  ImageUp,
  CircleGauge,
  Snail,
  ZoomIn,
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
  exportVideo,
  exportToJPG,
  convertToSVG,
  cleanupTempFiles,
} from "./scripts/three_exportLogic.js";
import Swal from "sweetalert2";
import {
  loadImageAnimation,
  handleAnimationSwitch,
} from "./scripts/three_animationLogic.js";
import { sampleImage } from "./scripts/three_imageLogic.js";

// --- State & Constants ---
const scaleSliders = {
  pixelAmount: { min: 20, max: 4, action: "redraw" },
  pixelScale: { min: 50, max: 250, action: "redraw" },
  gridScale: { min: 4, max: 12, action: "redraw" },
  pixelDistortion: { min: 0, max: 30, action: "redraw" },
  pixelGravity: { min: 0, max: 500, action: "redraw" },
  scaleRatio: { min: 0, max: 100, action: "redraw" },
  //clipDepth removed — remove action
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

  currentSettings.pixelDistortion = 25;

  const shapeSelect = document.getElementById("pixelShape");
  currentSettings.pixelShape = shapeSelect ? shapeSelect.value : "icosahedron";

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

export function changeColourBG(selectedOption) {
  const currentBg = document.getElementsByClassName("cus-bgColour")[0];
  const pageDeco = document.querySelectorAll(".cus-pageDeco");

  if (selectedOption === "ColourMaroon") {
    pageDeco.forEach((element) => {
      element.classList.add("hidden");
    });

    currentBg.classList.remove("border-2");
    currentBg.classList.remove("border-ApplyWhite");

    currentBg.classList.remove("bg-ApplyOrange");
    currentBg.classList.add("bg-ApplyMaroon");
    currentBg.classList.remove("bg-ApplyWhite");
    currentBg.classList.remove("bg-ApplyDark");

    return selectedOption;
  } else if (selectedOption === "ColourBlack") {
    currentBg.classList.add("border-2");
    currentBg.classList.add("border-ApplyWhite");

    currentBg.classList.remove("bg-ApplyOrange");
    currentBg.classList.remove("bg-ApplyMaroon");
    currentBg.classList.remove("bg-ApplyWhite");
    currentBg.classList.add("bg-ApplyDark");

    return selectedOption;
  } else if (selectedOption === "ColourWhite") {
    currentBg.classList.remove("border-2");
    currentBg.classList.remove("border-ApplyWhite");

    currentBg.classList.remove("bg-ApplyOrange");
    currentBg.classList.remove("bg-ApplyMaroon");
    currentBg.classList.add("bg-ApplyWhite");
    currentBg.classList.remove("bg-ApplyDark");

    return selectedOption;
  } else {
    currentBg.classList.remove("border-2");
    currentBg.classList.remove("border-ApplyWhite");

    currentBg.classList.add("bg-ApplyOrange");
    currentBg.classList.remove("bg-ApplyMaroon");
    currentBg.classList.remove("bg-ApplyWhite");
    currentBg.classList.remove("bg-ApplyDark");

    return selectedOption;
  }
}

// --- Immediate Event Listeners ---

document.getElementById("focusCamera").addEventListener("click", () => {
  resetCameraView();
});

let currentActiveAnimation = "default";

document.getElementById("rotationAnimation").addEventListener("click", () => {
  currentActiveAnimation = "default";
  handleAnimationSwitch("default");
});

document.getElementById("spinAnimation").addEventListener("click", () => {
  currentActiveAnimation = "eased";
  handleAnimationSwitch("eased");
});

document.getElementById("bounceAnimation").addEventListener("click", () => {
  currentActiveAnimation = "breakApart";
  handleAnimationSwitch("breakApart");
});

document.getElementById("pickImage").addEventListener("change", (e) => {
  if (e.target.files[0]) loadImage(URL.createObjectURL(e.target.files[0]));
});

// --- Export Logic ---

// Default Notification Styling
const newSwal = Swal.mixin({
  allowOutsideClick: true,
  buttonsStyling: false,
  reverseButtons: true,
  imageUrl: logoUrl,
  imageWidth: 28,
  imageHeight: 28,
  imageAlt: "Logo",

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
    image: "cusSwal-image",
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

// --- Initialization (On Load) ---
window.addEventListener("load", () => {
  initThree("canvas");

  const currentBgColor = document.getElementById("cus-bgChoice");

  // 1. Put your exact code inside a single function so it can be reused
  const applyVisualChanges = () => {
    // Update the background color
    changeColourBG(currentBgColor.value);

    // Update the 3D dot color using your if/else statement
    if (material) {
      if (currentBgColor.value === "ColourBlack") {
        material.color.set("#e9e8e6");
      } else if (currentBgColor.value === "ColourMaroon") {
        material.color.set("#f43b00");
      } else {
        material.color.set("#222222");
      }
    }
  };

  // 2. Run it immediately on page load
  applyVisualChanges();

  // 3. Run it every single time the dropdown changes
  currentBgColor.addEventListener("change", () => {
    applyVisualChanges();
  });

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

    // Declare the URL outside the try block so the 'finally' block can clean it up later
    let modelUrl = null;

    try {
      // 1. AWAIT the export function to get the raw binary data
      const gltfData = await export3D(scene);

      // 2. Wrap the raw data into a Blob file
      const blob = new Blob([gltfData], { type: "model/gltf-binary" });

      // 3. Create a valid browser URL for the Blob
      modelUrl = URL.createObjectURL(blob);

      newSwal.fire({
        title: "Finished",
        text: "Your 3D model is ready.",
        timer: 4000,
        showConfirmButton: false,
      });

      // 4. Download as a .glb (GL Transmission Format Binary)
      triggerDownload(modelUrl, "ApplyAi_3DModel.glb", true);
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
  document
    .getElementById("exportPhoto")
    .addEventListener("click", async (e) => {
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
            text: "\nConverting 3D to 2D\nThis may take some time.\n\n Hint: Open the console to see what's happening.",
            allowOutsideClick: false,
            allowEscapeKey: false,
            didOpen: () => Swal.showLoading(),
          });

          await new Promise((resolve) => setTimeout(resolve, 100));

          svgUrl = await convertToSVG(scene, camera);

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
        Swal.fire(
          "Error",
          "Image generation failed: " + error.message,
          "error",
        );
        console.error("Export configuration failed:", error);
      } finally {
        if (svgUrl) {
          URL.revokeObjectURL(svgUrl);
        }
      }
    });

  // Video Export (.webm / .mp4 / .mov)
  document
    .getElementById("exportVideo")
    .addEventListener("click", async (e) => {
      if (e) e.preventDefault();

      const result = await newSwal.fire({
        title: "Video Export",
        text: "Enter a duration and select a file type for the video.\nWebM is instant. MOV/MP4 will take a while.\n\nLeave input blank to record the full animation",
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: ".mov",
        denyButtonText: ".mp4",
        cancelButtonText: ".webm",
        input: "number",
        inputPlaceholder: "Length",
        inputAttributes: { min: 1, max: 15, step: 1 },

        preDeny: () => {
          return Swal.getInput().value;
        },

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

      let duration;

      if (
        result.value === "" ||
        result.value === null ||
        result.value === undefined
      ) {
        duration = "auto";
        window.isExportingLoop = false; // Hold false while layout alerts render
        window.isAnimationLoopComplete = false;
      } else {
        duration = Number(result.value);
      }

      newSwal.fire({
        title: "Exporting",
        timer: duration === "auto" ? undefined : Math.max(5, duration) * 1000,
        allowOutsideClick: false,
        allowEscapeKey: false,
        text:
          duration === "auto"
            ? "Recording 1 full seamless animation loop.\n\nThis box will close once the video has finished rendering. This will take some time."
            : `Recording the scene for ${duration} seconds.\n\nThis box will close once the video has finished rendering. This will take some time.`,
        didOpen: () => Swal.showLoading(),
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      let downloadUrl = null;
      let fileName = null;

      try {
        // 1. Resolve target format extension directly from button submission context
        let targetFormat = "webm";
        if (result.isConfirmed) targetFormat = "mov";
        if (result.isDenied) targetFormat = "mp4";

        // 2. Resolve background tracking parameter state mappings
        let chosenBgColor = null;
        if (targetFormat === "mp4") {
          chosenBgColor = "#f43b00"; // Orange default
          if (currentBgColor.value === "ColourBlack") chosenBgColor = "#1a1a1a";
          if (currentBgColor.value === "ColourMaroon")
            chosenBgColor = "#800000";
          if (currentBgColor.value === "ColourWhite") chosenBgColor = "#ffffff";
        }

        // 3. Fire unified single-pass composition pipeline execution
        const videoBlob = await exportVideo(
          renderer,
          scene,
          camera,
          duration,
          targetFormat,
          chosenBgColor,
          () => {
            if (duration === "auto") {
              window.exportRotatedAccumulator = 0;
              window.isAnimationLoopComplete = false;

              const loopDurations = { default: 8, eased: 5, breakApart: 6 };
              window.exportTargetDuration =
                loopDurations[currentActiveAnimation] || 8;

              resetCameraView();
              if (typeof controls !== "undefined") controls.update();

              handleAnimationSwitch(currentActiveAnimation, true);
              if (typeof resetAnimationTimeline === "function")
                resetAnimationTimeline();

              window.isExportingLoop = true;
            }
          },
        );

        Swal.close();

        // Show processing spinner for heavy conversions
        if (targetFormat === "mov" || targetFormat === "mp4") {
          const spinner = document.getElementById("exportSpinner");
          if (spinner) spinner.classList.remove("hidden");
        }

        // 4. Direct download generation map assignments
        downloadUrl = URL.createObjectURL(videoBlob);
        fileName = `ApplyAi_Render.${targetFormat}`;

        newSwal.fire({
          title: "Finished Rendering",
          text: `${fileName} is ready.`,
          timer: 4000,
          showConfirmButton: false,
        });

        triggerDownload(downloadUrl, fileName, targetFormat === "webm");
      } catch (error) {
        Swal.fire("Error", "Export failed: " + error.message, "error");
        console.error("Video export/conversion failed:", error);
      } finally {
        const spinner = document.getElementById("exportSpinner");
        if (spinner) spinner.classList.add("hidden");

        window.isExportingLoop = false;
        window.exportRotatedAccumulator = undefined;
        window.exportTargetDuration = undefined;

        if (
          downloadUrl &&
          typeof downloadUrl === "string" &&
          downloadUrl.startsWith("blob:")
        ) {
          const urlToRevoke = downloadUrl;
          setTimeout(() => {
            URL.revokeObjectURL(urlToRevoke);
          }, 2000);
        }
        await cleanupTempFiles();
      }
    });
  const container = document.querySelector(".slider-container");
  const indicator = document.getElementById("scrollIndicator");

  const checkScrollStatus = () => {
    if (!container || !indicator) return;

    const hasRoomToScroll = container.scrollHeight > container.clientHeight;

    const reachedEnd =
      container.scrollHeight - container.scrollTop <=
      container.clientHeight + 4;

    if (hasRoomToScroll && !reachedEnd) {
      indicator.classList.remove("opacity-0");
      indicator.classList.add("opacity-100");
    } else {
      indicator.classList.remove("opacity-100");
      indicator.classList.add("opacity-0");
    }
  };

  container.addEventListener("scroll", checkScrollStatus);
  window.addEventListener("resize", checkScrollStatus);

  setTimeout(checkScrollStatus, 200);

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

  loadImageAnimation();

  createIcons({
    icons: {
      ImageUp,
      CircleGauge,
      Snail,
      ZoomIn,
      Focus,
      Box,
      FileDown,
      Camera,
      Video,
      ChevronDown,
    },
  });
});

window.addEventListener("resize", () => {
  loadImageAnimation();
});
