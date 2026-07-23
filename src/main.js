import "./style.css";
import {
  initThree,
  resetCameraView,
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
  getActiveMesh,
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
  Orbit,
} from "lucide";
import {
  export3D,
  exportToPNG,
  exportVideo,
  exportToJPG,
  convertToSVG,
} from "./scripts/three_exportLogic.js";
import {
  loadImageAnimation,
  handleAnimationSwitch,
  resetAnimationTimeline,
  updateButtonUI,
  handleFocusToggle,
  haltAnimationKeepingState,
} from "./scripts/three_animationLogic.js";
import { sampleImage } from "./scripts/three_imageLogic.js";
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
  buildSafeTransitionArrays,
} from "./scripts/three_transitionLogic.js";
import {
  showDelayedSpinner,
  showLoadingAlert,
  hideSpinner,
  closeAlert,
  showSuccessAlert,
  showErrorAlert,
  promptImageExportFormat,
  promptVideoExportFormat,
  triggerDownload,
  changeColourBG,
} from "./scripts/three_UiLogic.js";
import { mx_hash_int_3 } from "three/src/nodes/materialx/lib/mx_noise.js";

const scaleSliders = {
  pixelAmount: { min: 8, max: 1.5, action: "redraw" },
  pixelScale: { min: 10, max: 80, action: "redraw" },
  gridScale: { min: 1, max: 10, action: "redraw" },
  pixelDistortion: { min: 0, max: 30, action: "redraw" },
  pixelGravity: { min: 0, max: 100, action: "redraw" },
  scaleRatio: { min: 1, max: 200, action: "redraw" },
  whiteCutoff: { min: 0, max: 100, action: "redraw" },
  lightnessCurve: { min: 50, max: 500, action: "redraw" },
};

let currentImage = null;
let currentActiveAnimation = "default";
let currentMode = "AnimationMode";
let cachedSettings = {};

const updateSettingsCache = () => {
  for (const settingName in scaleSliders) {
    const range = scaleSliders[settingName];
    const slider = document.getElementById(settingName);
    const percentage = (parseFloat(slider?.value) || 0) / 100;

    if (settingName === "pixelAmount") {
      // Interpolate in "resolution" (1/gridSize) space so equal slider
      // steps feel like equal steps in dot density, not equal steps in
      // gridSize (which is inverse-square in dot count).
      const minRes = 1 / range.min; // e.g. 1/8
      const maxRes = 1 / range.max; // e.g. 1/2 (or 1/1 if you extend max)
      const res = minRes + percentage * (maxRes - minRes);
      cachedSettings[settingName] = 1 / res; // back to gridSize, now fractional
    } else {
      cachedSettings[settingName] = Math.floor(
        range.min + percentage * (range.max - range.min),
      );
    }
  }
  const shapeSelect = document.getElementById("pixelShape");
  cachedSettings.pixelShape = shapeSelect ? shapeSelect.value : "icosahedron";
};

const getSettings = () => cachedSettings;

const processGifFrames = (frames, cols, rows) => {
  return frames.map((frame) => {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = frame.imageData.width;
    tempCanvas.height = frame.imageData.height;
    tempCanvas.getContext("2d").putImageData(frame.imageData, 0, 0);
    return {
      ...frame,
      imageData: sampleImage(tempCanvas, cols, rows),
    };
  });
};

const startGifPlayback = (frames, setup) => {
  setCurrentGifState(frames, setup.cols, setup.rows, setup.instancedMesh);
  currentImage = null;
  applyImageToGrid(
    frames[0].imageData,
    setup.cols,
    setup.rows,
    getSettings(),
    setup.instancedMesh,
  );
  setIsPlayingGif(true);
  setLastFrameTime(performance.now());
  playGifLoop(performance.now(), scene, getSettings);
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
      const processedFrames = processGifFrames(
        currentGifFrames,
        setup.cols,
        setup.rows,
      );
      startGifPlayback(processedFrames, setup);
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

window.addEventListener("load", () => {
  updateSettingsCache();

  const startingSettings = getSettings();
  initThree("canvas", startingSettings.gridScale);
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
    const targetMesh = getActiveMesh();
    return targetMesh && targetMesh.userData.isTransitioning;
  };

  const handleAnimButtonClick = (animName) => {
    if (isMorphActive()) return;
    if (currentMode === "TransitionMode") {
      setPendingTransition(animName);
      document.getElementById("hiddenTransitionInput").click();
    } else {
      currentActiveAnimation = animName;
      handleAnimationSwitch(animName);
    }
  };

  document.getElementById("focusCamera").addEventListener("click", () => {
    if (isMorphActive()) return;
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
  document
    .getElementById("spinExplodeAnimation")
    .addEventListener("click", () => handleAnimButtonClick("spinExplode"));

  document.getElementById("pickImage").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    stopGifPlayback();

    if (file.type === "image/gif") {
      showDelayedSpinner();

      try {
        const parsedGif = await parseGifFile(file);
        const setup = initThreeGrid(
          parsedGif.width,
          parsedGif.height,
          getSettings(),
        );
        if (!setup) throw new Error("Could not initialize grid.");

        const processedFrames = processGifFrames(
          parsedGif.frames,
          setup.cols,
          setup.rows,
        );

        startGifPlayback(processedFrames, setup);
        hideSpinner();
      } catch (err) {
        hideSpinner();
        showErrorAlert("Error", "Failed to parse GIF");
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
          setSourceGifBackup(null);
        }
        stopGifPlayback();
      };

      const triggerMorph = () => {
        finalizeMorphState(scene);
        currentActiveAnimation = pendingTransitionAnimation;
        if (sourceGifBackup && !isPlayingGif) {
          requestAnimationFrame((t) => playGifLoop(t, scene, getSettings));
        }
      };

      if (file.type === "image/gif") {
        showDelayedSpinner();

        try {
          const parsedGif = await parseGifFile(file);
          executeSnapshotAndStop();

          const setup = initThreeGrid(
            parsedGif.width,
            parsedGif.height,
            getSettings(),
          );
          const processedFrames = processGifFrames(
            parsedGif.frames,
            setup.cols,
            setup.rows,
          );

          startGifPlayback(processedFrames, setup);
          triggerMorph();
          hideSpinner();
        } catch (err) {
          hideSpinner();
          showErrorAlert("Error", "Failed to parse GIF");
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
    const targetMesh = getActiveMesh();
    if (targetMesh && targetMesh.userData.isTransitioning) {
      delete targetMesh.userData.isTransitioning;
      delete targetMesh.userData.prevPositions;
      delete targetMesh.userData.prevScales;
      delete targetMesh.userData.prevRotations;
      setSourceGifBackup(null);
      haltAnimationKeepingState();
    }
  });

  document.getElementById("export3D").addEventListener("click", async (e) => {
    if (e) e.preventDefault();
    showLoadingAlert(
      "Exporting 3D Model",
      "Packaging 3D assets and geometry. Please wait...",
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    let modelUrl = null;

    try {
      const gltfData = await export3D();
      const blob = new Blob([gltfData], { type: "model/gltf-binary" });
      modelUrl = URL.createObjectURL(blob);

      showSuccessAlert("Finished", "Your 3D model is ready.");
      triggerDownload(modelUrl, "ApplyAi_3DModel.glb", true);
    } catch (error) {
      showErrorAlert("Error", "3D Export failed: " + error.message);
    } finally {
      if (modelUrl) URL.revokeObjectURL(modelUrl);
    }
  });

  document
    .getElementById("exportPhoto")
    .addEventListener("click", async (e) => {
      e.preventDefault();
      const result = await promptImageExportFormat();

      if (result.dismiss) return;

      let svgUrl = null;
      try {
        if (result.isConfirmed) {
          showLoadingAlert("Generating SVG", "Converting 3D to 2D");
          await new Promise((resolve) => setTimeout(resolve, 100));

          svgUrl = await convertToSVG();
          showSuccessAlert("Finished", "Vector graphic asset is ready.");
          triggerDownload(svgUrl, "ApplyAi_DitheredVector.svg", true);
        } else if (result.isDenied) {
          triggerDownload(exportToPNG(), "ApplyAi_DitheredSnapshot.png", false);
        } else if (result.dismiss === "cancel") {
          triggerDownload(exportToJPG(), "ApplyAi_DitheredSnapshot.jpg", false);
        }
      } catch (error) {
        showErrorAlert("Error", "Image generation failed: " + error.message);
      } finally {
        if (svgUrl) URL.revokeObjectURL(svgUrl);
      }
    });

  document
    .getElementById("exportVideo")
    .addEventListener("click", async (e) => {
      if (e) e.preventDefault();
      const result = await promptVideoExportFormat();

      if (result.dismiss) return;

      let duration = "auto";
      showLoadingAlert("Exporting", "Recording seamless sequence...");

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
          duration,
          targetFormat,
          chosenBgColor,
          () => {
            window.isExportingLoop = true;
            const targetMesh = getActiveMesh();

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
              window.isAnimationLoopComplete = false;

              if (isReplayingTransition) {
                const { safePos, safeScl, safeRot } = buildSafeTransitionArrays(
                  lastTransitionBackup,
                  targetMesh,
                );

                targetMesh.userData.prevPositions = safePos;
                targetMesh.userData.prevScales = safeScl;
                targetMesh.userData.prevRotations = safeRot;
                targetMesh.userData.isTransitioning = true;

                resetAnimationTimeline();
              }

              window.exportTargetDuration = undefined;

              if (gifDurationSeconds > 0) {
                window.exportTotalDuration = gifDurationSeconds;
              } else {
                window.exportTotalDuration = undefined;
              }

              resetCameraView();
              controls.update();
              handleAnimationSwitch(currentActiveAnimation, true);
            }
          },
        );

        closeAlert();

        if (targetFormat === "mov" || targetFormat === "mp4") {
          const spinner = document.getElementById("exportSpinner");
          if (spinner) spinner.classList.remove("hidden");
        }

        downloadUrl = URL.createObjectURL(videoBlob);
        fileName = `ApplyAi_Render.${targetFormat}`;

        showSuccessAlert("Finished Rendering", `${fileName} is ready.`);
        triggerDownload(downloadUrl, fileName, targetFormat === "webm");
      } catch (error) {
        const errorMsg =
          error?.message ||
          error ||
          "Web Worker crashed (Likely Out of Memory)";
        showErrorAlert("Error", "Export failed: " + errorMsg);
      } finally {
        const spinner = document.getElementById("exportSpinner");
        if (spinner) spinner.classList.add("hidden");
        window.isExportingLoop = false;
        window.exportTargetDuration = undefined;
        window.exportTotalDuration = undefined;

        if (
          downloadUrl &&
          typeof downloadUrl === "string" &&
          downloadUrl.startsWith("blob:")
        ) {
          setTimeout(() => URL.revokeObjectURL(downloadUrl), 2000);
        }
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

  Object.keys(scaleSliders).forEach((id) => {
    document.getElementById(id)?.addEventListener("input", () => {
      updateSettingsCache();
      redraw();
    });
  });

  document.getElementById("pixelShape")?.addEventListener("change", () => {
    updateSettingsCache();
    redraw();
  });

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
      Orbit,
    },
  });
  updateButtonUI();
});

window.addEventListener("resize", () => {
  loadImageAnimation();
});
