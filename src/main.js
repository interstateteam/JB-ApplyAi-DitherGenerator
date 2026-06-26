import * as THREE from "three";
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
import {
  initThreeGrid,
  applyImageToGrid,
  updateThreeGrid,
} from "./scripts/three_gridLogic.js";
import {
  createIcons,
  Shrink,
  Expand,
  UnfoldHorizontal,
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
  Images,
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
  resetAnimationTimeline,
  forcePauseAnimation,
  updateButtonUI,
  handleFocusToggle,
} from "./scripts/three_animationLogic.js";
import { sampleImage } from "./scripts/three_imageLogic.js";

// --- NEW MODULE IMPORTS ---
import {
  isPlayingGif,
  currentGifFrames,
  currentGifCols,
  currentGifRows,
  currentGifMesh,
  currentFrameIndex,
  sourceGifBackup,
  setIsPlayingGif,
  setSourceGifBackup,
  setCurrentGifState,
  setLastFrameTime,
  stopGifPlayback,
  playGifLoop,
  parseGifFile,
} from "./scripts/three_videoLogic.js";

import {
  pendingTransitionAnimation,
  lastTransitionBackup,
  lastTransitionAnimName,
  setPendingTransition,
  snapshotOldState,
  finalizeMorphState,
} from "./scripts/three_transitionLogic.js";

// --- Global UI Notifications Configuration ---
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
    image: "cusSwal-image", // RESTORED: Brings back the animation!
  },
});

function triggerDownload(url, filename, shouldRevoke = false) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (shouldRevoke) URL.revokeObjectURL(url);
}

// --- App State & Constants ---
const scaleSliders = {
  pixelAmount: { min: 20, max: 4, action: "redraw" },
  pixelScale: { min: 50, max: 250, action: "redraw" },
  gridScale: { min: 4, max: 12, action: "redraw" },
  pixelDistortion: { min: 0, max: 30, action: "redraw" },
  pixelGravity: { min: 0, max: 500, action: "redraw" },
  scaleRatio: { min: 0, max: 100, action: "redraw" },
};

let currentImage = null;
let currentActiveAnimation = "default";
let currentMode = "AnimationMode";

// --- Helpers ---
const getSettings = () => {
  const currentSettings = {};
  for (const settingName in scaleSliders) {
    const range = scaleSliders[settingName];
    const slider = document.getElementById(settingName);
    const percentage = parseInt(slider?.value) || 0;
    currentSettings[settingName] = Math.floor(
      range.min + (percentage / 100) * (range.max - range.min),
    );
  }
  currentSettings.pixelDistortion = 25;
  const shapeSelect = document.getElementById("pixelShape");
  currentSettings.pixelShape = shapeSelect ? shapeSelect.value : "icosahedron";
  return currentSettings;
};

const redraw = () => {
  if (isPlayingGif && currentGifFrames.length > 0) {
    stopGifPlayback();
    const setup = initThreeGrid(
      currentGifFrames[0].imageData.width,
      currentGifFrames[0].imageData.height,
      getSettings(),
    );
    if (setup) {
      const processedFrames = currentGifFrames.map((f) => {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = f.imageData.width;
        tempCanvas.height = f.imageData.height;
        tempCanvas.getContext("2d").putImageData(f.imageData, 0, 0);
        return {
          ...f,
          imageData: sampleImage(tempCanvas, setup.cols, setup.rows),
        };
      });
      setCurrentGifState(
        processedFrames,
        setup.cols,
        setup.rows,
        setup.instancedMesh,
      );
      setIsPlayingGif(true);
      setLastFrameTime(performance.now());
      playGifLoop(performance.now(), scene, getSettings);
    }
  } else if (currentImage) {
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
  const currentBg = document.querySelector(".cus-bgColour");
  const pageDeco = document.querySelectorAll(".cus-pageDeco");
  if (!currentBg) return selectedOption;

  currentBg.classList.remove(
    "bg-ApplyMaroon",
    "bg-ApplyDark",
    "bg-ApplyWhite",
    "bg-ApplyOrange",
    "border-2",
    "border-ApplyWhite",
  );

  if (selectedOption === "ColourMaroon") {
    pageDeco.forEach((el) => el.classList.add("hidden"));
    currentBg.classList.add("bg-ApplyMaroon");
  } else if (selectedOption === "ColourBlack") {
    currentBg.classList.add("border-2", "border-ApplyWhite", "bg-ApplyDark");
  } else if (selectedOption === "ColourWhite") {
    currentBg.classList.add("bg-ApplyWhite");
  } else {
    currentBg.classList.add("bg-ApplyOrange");
  }
  return selectedOption;
}

// --- Initialization & Event Binding ---
window.addEventListener("load", () => {
  initThree("canvas");

  const currentBgColor = document.getElementById("cus-bgChoice");
  const applyVisualChanges = () => {
    changeColourBG(currentBgColor.value);
    if (material) {
      if (currentBgColor.value === "ColourBlack") material.color.set("#e9e8e6");
      else if (currentBgColor.value === "ColourMaroon")
        material.color.set("#f43b00");
      else material.color.set("#222222");
    }
  };

  applyVisualChanges();
  currentBgColor?.addEventListener("change", applyVisualChanges);

  document.getElementById("modeSelection")?.addEventListener("change", (e) => {
    currentMode = e.target.value;
  });

  const isMorphActive = () => {
    let targetMesh = null;
    scene.traverse((child) => {
      if (child.isInstancedMesh) targetMesh = child;
    });
    return targetMesh && targetMesh.userData.isTransitioning;
  };

  const handleAnimButtonClick = (animName) => {
    if (isMorphActive()) return;
    if (currentMode === "TransitionMode ") {
      setPendingTransition(animName);
      document.getElementById("hiddenTransitionInput").click();
    } else {
      currentActiveAnimation = animName;
      handleAnimationSwitch(animName);
    }
  };

  document.getElementById("focusCamera").addEventListener("click", () => {
    if (isMorphActive()) return;

    // This stops the animation, clears OrbitControls, resets the camera, and snaps the grid
    handleFocusToggle();
  });

  document
    .getElementById("rotationAnimation")
    .addEventListener("click", () => handleAnimButtonClick("default"));
  document
    .getElementById("spinAnimation")
    .addEventListener("click", () => handleAnimButtonClick("eased"));
  document
    .getElementById("breakApartAnimation")
    .addEventListener("click", () => handleAnimButtonClick("breakApart"));

  document
    .getElementById("implodeAnimation")
    .addEventListener("click", () => handleAnimButtonClick("implode"));

  document
    .getElementById("scrambleAnimation")
    .addEventListener("click", () => handleAnimButtonClick("scramble"));

  // --- File Uploads ---
  document.getElementById("pickImage").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    stopGifPlayback();

    if (file.type === "image/gif") {
      const loadingTimer = setTimeout(() => {
        newSwal.fire({
          title: "Parsing GIF...",
          text: "Large file detected, just a moment!",
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading(),
        });
      }, 2000);

      try {
        const parsedGif = await parseGifFile(file);
        const setup = initThreeGrid(
          parsedGif.width,
          parsedGif.height,
          getSettings(),
        );
        if (!setup) throw new Error("Could not initialize grid.");

        const processedFrames = parsedGif.frames.map((frame) => {
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = parsedGif.width;
          tempCanvas.height = parsedGif.height;
          tempCanvas.getContext("2d").putImageData(frame.imageData, 0, 0);
          return {
            imageData: sampleImage(tempCanvas, setup.cols, setup.rows),
            delay: frame.delay,
          };
        });

        setCurrentGifState(
          processedFrames,
          setup.cols,
          setup.rows,
          setup.instancedMesh,
        );
        currentImage = null;

        // Pre-load frame 0 synchronously
        applyImageToGrid(
          processedFrames[0].imageData,
          setup.cols,
          setup.rows,
          getSettings(),
          setup.instancedMesh,
        );

        setIsPlayingGif(true);
        setLastFrameTime(performance.now());
        playGifLoop(performance.now(), scene, getSettings);

        clearTimeout(loadingTimer);
        if (Swal.isVisible()) Swal.close();
      } catch (err) {
        clearTimeout(loadingTimer);
        Swal.fire("Error", "Failed to parse GIF", "error");
      }
    } else {
      setCurrentGifState([], 0, 0, null);
      loadImage(URL.createObjectURL(file));
    }
  });

  document
    .getElementById("hiddenTransitionInput")
    ?.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file || !scene) return;

      const executeSnapshotAndStop = () => {
        const backup = snapshotOldState(
          scene,
          isPlayingGif,
          currentGifFrames,
          currentGifCols,
          currentGifRows,
          currentFrameIndex,
        );
        if (backup) {
          setSourceGifBackup(backup);
        } else {
          setSourceGifBackup(null); // Explicit garbage collection!
        }
        stopGifPlayback();
      };

      const triggerMorph = () => {
        finalizeMorphState(scene, controls);
        currentActiveAnimation = pendingTransitionAnimation;
        if (sourceGifBackup && !isPlayingGif) {
          requestAnimationFrame((t) => playGifLoop(t, scene, getSettings));
        }
      };

      if (file.type === "image/gif") {
        const loadingTimer = setTimeout(() => {
          newSwal.fire({
            title: "Parsing GIF...",
            text: "Large file detected, just a moment!",
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading(),
          });
        }, 2000);

        try {
          const parsedGif = await parseGifFile(file);

          executeSnapshotAndStop();

          const setup = initThreeGrid(
            parsedGif.width,
            parsedGif.height,
            getSettings(),
          );
          const processedFrames = parsedGif.frames.map((frame) => {
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = parsedGif.width;
            tempCanvas.height = parsedGif.height;
            tempCanvas.getContext("2d").putImageData(frame.imageData, 0, 0);
            return {
              imageData: sampleImage(tempCanvas, setup.cols, setup.rows),
              delay: frame.delay,
            };
          });

          setCurrentGifState(
            processedFrames,
            setup.cols,
            setup.rows,
            setup.instancedMesh,
          );
          currentImage = null;

          triggerMorph();

          setIsPlayingGif(true);
          setLastFrameTime(performance.now());
          playGifLoop(performance.now(), scene, getSettings);

          clearTimeout(loadingTimer);
          if (Swal.isVisible()) Swal.close();
        } catch (err) {
          clearTimeout(loadingTimer);
          Swal.fire("Error", "Failed to parse GIF", "error");
        }
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          const tempImg = new Image();
          tempImg.onload = () => {
            executeSnapshotAndStop();
            currentImage = tempImg;
            setCurrentGifState([], 0, 0, null);
            updateThreeGrid(currentImage, getSettings());
            triggerMorph();
          };
          tempImg.src = event.target.result;
        };
        reader.readAsDataURL(file);
      }
      e.target.value = "";
    });

  window.addEventListener("gifTransitionComplete", () => {
    let targetMesh = null;
    scene.traverse((child) => {
      if (child.isInstancedMesh) targetMesh = child;
    });

    if (targetMesh && targetMesh.userData.isTransitioning) {
      delete targetMesh.userData.isTransitioning;
      delete targetMesh.userData.prevPositions;
      delete targetMesh.userData.prevScales;
      delete targetMesh.userData.prevRotations;

      delete targetMesh.userData.freezeBackground;

      setSourceGifBackup(null); // Explicit garbage collection!
      forcePauseAnimation();
    }
  });

  // --- Exports ---
  document.getElementById("export3D").addEventListener("click", async (e) => {
    if (e) e.preventDefault();
    newSwal.fire({
      title: "Exporting 3D Model",
      text: "Packaging 3D assets and geometry. Please wait...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    let modelUrl = null;
    try {
      const gltfData = await export3D(scene);
      const blob = new Blob([gltfData], { type: "model/gltf-binary" });
      modelUrl = URL.createObjectURL(blob);
      newSwal.fire({
        title: "Finished",
        text: "Your 3D model is ready.",
        timer: 4000,
        showConfirmButton: false,
      });
      triggerDownload(modelUrl, "ApplyAi_3DModel.glb", true);
    } catch (error) {
      Swal.fire("Error", "3D Export failed: " + error.message, "error");
    } finally {
      if (modelUrl) URL.revokeObjectURL(modelUrl);
    }
  });

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
      if (
        result.dismiss === Swal.DismissReason.backdrop ||
        result.dismiss === Swal.DismissReason.esc
      )
        return;
      let svgUrl = null;
      try {
        if (result.isConfirmed) {
          newSwal.fire({
            title: "Generating SVG",
            text: "Converting 3D to 2D...",
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading(),
          });
          await new Promise((resolve) => setTimeout(resolve, 100));
          svgUrl = await convertToSVG(scene, camera);
          newSwal.fire({
            title: "Finished",
            text: "Vector graphic asset is ready.",
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
      } finally {
        if (svgUrl) URL.revokeObjectURL(svgUrl);
      }
    });

  document
    .getElementById("exportVideo")
    .addEventListener("click", async (e) => {
      if (e) e.preventDefault();

      // 1. Cleaned up SweetAlert (No more number input!)
      const result = await newSwal.fire({
        title: "Video Export",
        text: "Select a file format to render your animation loop.",
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: ".mov",
        denyButtonText: ".mp4",
        cancelButtonText: ".webm",
      });

      if (
        result.dismiss === Swal.DismissReason.backdrop ||
        result.dismiss === Swal.DismissReason.esc
      )
        return;

      // 2. Hardcode duration to "auto" so it ALWAYS records the perfect loop
      let duration = "auto";

      newSwal.fire({
        title: "Exporting",
        allowOutsideClick: false,
        text: "Recording seamless sequence...",
        didOpen: () => Swal.showLoading(),
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
      let downloadUrl = null;
      let fileName = null;

      try {
        let targetFormat = "webm";
        if (result.isConfirmed) targetFormat = "mov";
        if (result.isDenied) targetFormat = "mp4";

        let chosenBgColor = null;
        if (targetFormat === "mp4") {
          chosenBgColor = "#f43b00";
          if (currentBgColor.value === "ColourBlack") chosenBgColor = "#1a1a1a";
          if (currentBgColor.value === "ColourMaroon")
            chosenBgColor = "#800000";
          if (currentBgColor.value === "ColourWhite") chosenBgColor = "#ffffff";
        }

        const videoBlob = await exportVideo(
          renderer,
          scene,
          camera,
          duration,
          targetFormat,
          chosenBgColor,
          () => {
            window.isExportingLoop = true;
            let targetMesh = null;
            scene.traverse((child) => {
              if (child.isInstancedMesh) targetMesh = child;
            });

            const isReplayingTransition =
              targetMesh &&
              lastTransitionBackup &&
              currentActiveAnimation === lastTransitionAnimName;

            let gifDurationSeconds = 0;
            if (currentGifFrames && currentGifFrames.length > 0) {
              gifDurationSeconds =
                currentGifFrames.reduce((sum, frame) => sum + frame.delay, 0) /
                1000;
              setCurrentGifState(
                currentGifFrames,
                currentGifCols,
                currentGifRows,
                currentGifMesh,
              );
              setLastFrameTime(window.performance.now());
              applyImageToGrid(
                currentGifFrames[0].imageData,
                currentGifCols,
                currentGifRows,
                getSettings(),
                currentGifMesh,
              );

              if (!isPlayingGif) {
                setIsPlayingGif(true);
                playGifLoop(window.performance.now(), scene, getSettings);
              }
            }

            if (duration === "auto") {
              window.exportRotatedAccumulator = 0;
              window.isAnimationLoopComplete = false;

              if (isReplayingTransition) {
                const count = targetMesh.count;
                let safePos = lastTransitionBackup.positions
                  .map((v) => v.clone())
                  .slice(0, count);
                let safeScl = [...lastTransitionBackup.scales].slice(0, count);
                let safeRot = lastTransitionBackup.rotations
                  .map((q) => q.clone())
                  .slice(0, count);

                while (safePos.length < count) {
                  safePos.push(new THREE.Vector3(0, 0, -600));
                  safeScl.push(0);
                  safeRot.push(new THREE.Quaternion());
                }

                targetMesh.userData.prevPositions = safePos;
                targetMesh.userData.prevScales = safeScl;
                targetMesh.userData.prevRotations = safeRot;
                targetMesh.userData.isTransitioning = true;

                // Note: Mutating originalPositions here was deleted to prevent the cache override glitch!
                if (typeof resetAnimationTimeline === "function")
                  resetAnimationTimeline(controls);
              }

              const loopDurations = {
                default: 8,
                eased: 5,
                breakApart: 10,
                implode: 15,
                scramble: 10,
              };

              const animDuration = loopDurations[currentActiveAnimation] || 8;
              window.exportTargetDuration = animDuration;

              if (gifDurationSeconds > 0) {
                window.exportTotalDuration = isReplayingTransition
                  ? animDuration + gifDurationSeconds
                  : gifDurationSeconds;
              } else {
                window.exportTotalDuration = animDuration;
              }

              resetCameraView();
              if (typeof controls !== "undefined") controls.update();
              handleAnimationSwitch(currentActiveAnimation, true);
            }
          },
        );

        Swal.close();

        // RESTORED: Spinner Logic
        if (targetFormat === "mov" || targetFormat === "mp4") {
          const spinner = document.getElementById("exportSpinner");
          if (spinner) spinner.classList.remove("hidden");
        }

        downloadUrl = URL.createObjectURL(videoBlob);
        fileName = `ApplyAi_Render.${targetFormat}`;

        newSwal.fire({
          title: "Finished Rendering",
          text: `${fileName} is ready.`, // RESTORED
          timer: 4000,
          showConfirmButton: false,
        });

        triggerDownload(downloadUrl, fileName, targetFormat === "webm");
      } catch (error) {
        Swal.fire("Error", "Export failed: " + error.message, "error");
      } finally {
        // RESTORED: Spinner Hide and URL Revoke Logic
        const spinner = document.getElementById("exportSpinner");
        if (spinner) spinner.classList.add("hidden");
        window.isExportingLoop = false;

        window.exportRotatedAccumulator = undefined;
        window.exportTargetDuration = undefined;
        window.exportTotalDuration = undefined;

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

  const checkScrollStatus = () => {
    const container = document.querySelector(".slider-container");
    const indicator = document.getElementById("scrollIndicator");
    if (!container || !indicator) return;
    const hasRoom = container.scrollHeight > container.clientHeight;
    const reachedEnd =
      container.scrollHeight - container.scrollTop <=
      container.clientHeight + 4;
    indicator.className =
      hasRoom && !reachedEnd
        ? "opacity-100 transition-all duration-200"
        : "opacity-0 transition-all duration-200";
  };
  document
    .querySelector(".slider-container")
    ?.addEventListener("scroll", checkScrollStatus);
  window.addEventListener("resize", checkScrollStatus);
  setTimeout(checkScrollStatus, 200);

  Object.keys(scaleSliders).forEach((id) =>
    document.getElementById(id)?.addEventListener("input", redraw),
  );
  document.getElementById("pixelShape")?.addEventListener("change", redraw);

  const defaultImageEl = document.getElementById("defaultImage");
  if (defaultImageEl?.src) loadImage(defaultImageEl.src);

  loadImageAnimation();
  createIcons({
    icons: {
      ImageUp,
      Shrink,
      Expand,
      UnfoldHorizontal,
      CircleGauge,
      Snail,
      ZoomIn,
      Focus,
      FileDown,
      Box,
      Camera,
      Video,
      ChevronDown,
      Images,
    },
  });
  updateButtonUI();
});

window.addEventListener("resize", () => {
  loadImageAnimation();
});
