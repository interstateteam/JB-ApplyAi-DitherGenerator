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
  queueNextTransitionImage,
} from "./scripts/three_gridLogic.js";
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
} from "./scripts/three_animationLogic.js";
import { sampleImage } from "./scripts/three_imageLogic.js";
import { parseGifFile } from "./scripts/three_videoLogic.js";

// --- Global UI Notifications Configuration (Moved to prevent TDZ errors) ---
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

// --- State & Constants ---
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
let pendingTransitionAnimation = "breakApart";

let lastTransitionBackup = null;
let lastTransitionAnimName = null;

let sourceGifBackup = null;

// --- GIF Playback State ---
let isPlayingGif = false;
let currentGifFrames = [];
let currentGifCols = 0;
let currentGifRows = 0;
let currentGifMesh = null;
let currentFrameIndex = 0;
let lastFrameTime = 0;
let gifAnimationId = null;

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

const stopGifPlayback = () => {
  isPlayingGif = false;
  if (gifAnimationId) cancelAnimationFrame(gifAnimationId);
};

const playGifLoop = (timestamp) => {
  // Check if the screen is actively morphing away from a background backup stream
  let activeMesh = null;
  if (scene) {
    scene.traverse((child) => {
      if (child.isInstancedMesh) activeMesh = child;
    });
  }

  const isMorphingAway =
    activeMesh && activeMesh.userData.isTransitioning && sourceGifBackup;

  if (isMorphingAway) {
    const backup = sourceGifBackup;
    const frame = backup.frames[backup.currentIndex];

    if (timestamp - backup.lastTime >= frame.delay) {
      // 1. Create a lightweight mock object to intercept array math without touching WebGL
      const mockMesh = {
        userData: {},
        setColorAt: () => {},
        setMatrixAt: () => {},
        instanceMatrix: { needsUpdate: false },
        instanceColor: { needsUpdate: false },
      };

      // 2. Calculate the grid positions for this exact GIF frame layout
      applyImageToGrid(
        frame.imageData,
        backup.cols,
        backup.rows,
        getSettings(),
        mockMesh,
      );

      // 3. Deeply slice and pad the frame to perfectly match the active mesh footprint
      const count = activeMesh.count;
      const freshData = mockMesh.userData;

      let safePos = freshData.originalPositions
        .map((v) => v.clone())
        .slice(0, count);
      let safeScl = [...freshData.originalScales].slice(0, count);
      let safeRot = freshData.originalRotations
        .map((q) => q.clone())
        .slice(0, count);

      while (safePos.length < count) {
        safePos.push(new THREE.Vector3(0, 0, -600));
        safeScl.push(0);
        safeRot.push(new THREE.Quaternion());
      }

      // 4. Dynamically update the active morph baseline mid-flight!
      activeMesh.userData.prevPositions = safePos;
      activeMesh.userData.prevScales = safeScl;
      activeMesh.userData.prevRotations = safeRot;

      backup.lastTime = timestamp;
      backup.currentIndex = (backup.currentIndex + 1) % backup.frames.length;
    }
  } else if (isPlayingGif && currentGifFrames.length > 0) {
    // Standard ongoing foreground playback loop
    const frame = currentGifFrames[currentFrameIndex];
    if (timestamp - lastFrameTime >= frame.delay) {
      applyImageToGrid(
        frame.imageData,
        currentGifCols,
        currentGifRows,
        getSettings(),
        currentGifMesh,
      );
      lastFrameTime = timestamp;
      currentFrameIndex = (currentFrameIndex + 1) % currentGifFrames.length;
    }
  } else {
    // No active GIF profiles running, stop loop cycle
    return;
  }

  gifAnimationId = requestAnimationFrame(playGifLoop);
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
      currentGifCols = setup.cols;
      currentGifRows = setup.rows;
      currentGifMesh = setup.instancedMesh;
      currentGifFrames.forEach((f) => {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = f.imageData.width;
        tempCanvas.height = f.imageData.height;
        tempCanvas.getContext("2d").putImageData(f.imageData, 0, 0);
        f.imageData = sampleImage(tempCanvas, currentGifCols, currentGifRows);
      });
      isPlayingGif = true;
      lastFrameTime = performance.now();
      playGifLoop(performance.now());
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
  const currentBg = document.getElementsByClassName("cus-bgColour")[0];
  const pageDeco = document.querySelectorAll(".cus-pageDeco");

  if (!currentBg) return selectedOption;

  // 1. Remove all possible color and border classes first
  currentBg.classList.remove(
    "bg-ApplyMaroon",
    "bg-ApplyDark",
    "bg-ApplyWhite",
    "bg-ApplyOrange",
    "border-2",
    "border-ApplyWhite",
  );

  // 2. Add only the specific classes needed for the selected theme
  if (selectedOption === "ColourMaroon") {
    pageDeco.forEach((element) => {
      element.classList.add("hidden");
    });
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

// --- Initialization & Event Binding (On Load) ---
window.addEventListener("load", () => {
  initThree("canvas");

  const currentBgColor = document.getElementById("cus-bgChoice");
  const applyVisualChanges = () => {
    changeColourBG(currentBgColor.value);
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

  applyVisualChanges();
  currentBgColor?.addEventListener("change", applyVisualChanges);

  // Focus View State Trigger
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

  // --- Dynamic Button Router ---
  const handleAnimButtonClick = (animName) => {
    if (isMorphActive()) return;

    // Note: Ensuring the space is matched exactly based on your HTML value="PatternGenerator "
    if (currentMode === "TransitionMode ") {
      pendingTransitionAnimation = animName;
      document.getElementById("hiddenTransitionInput").click(); // Trigger upload dialog!
    } else {
      currentActiveAnimation = animName;
      handleAnimationSwitch(animName); // Play normally
    }
  };

  document.getElementById("focusCamera").addEventListener("click", () => {
    if (isMorphActive()) return;
    resetAnimationTimeline(controls);
    resetCameraView();
  });

  document
    .getElementById("rotationAnimation")
    .addEventListener("click", () => handleAnimButtonClick("default"));
  document
    .getElementById("spinAnimation")
    .addEventListener("click", () => handleAnimButtonClick("eased"));
  document
    .getElementById("bounceAnimation")
    .addEventListener("click", () => handleAnimButtonClick("breakApart"));

  // Primary Assets Media Pipeline Input Hook
  document.getElementById("pickImage").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    stopGifPlayback();

    if (file.type === "image/gif") {
      // 1. Start a 2-second timer for the loading popup
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

        currentGifCols = setup.cols;
        currentGifRows = setup.rows;
        currentGifMesh = setup.instancedMesh;

        currentGifFrames = parsedGif.frames.map((frame) => {
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = parsedGif.width;
          tempCanvas.height = parsedGif.height;
          tempCanvas.getContext("2d").putImageData(frame.imageData, 0, 0);
          return {
            imageData: sampleImage(tempCanvas, currentGifCols, currentGifRows),
            delay: frame.delay,
          };
        });

        currentImage = null;
        currentFrameIndex = 0;

        // --- FIXED: Pre-load Frame 0 into the mesh synchronously so the morph has a target! ---
        applyImageToGrid(
          currentGifFrames[0].imageData,
          currentGifCols,
          currentGifRows,
          getSettings(),
          currentGifMesh,
        );

        // Start the GIF immediately so it plays DURING the morph
        isPlayingGif = true;
        lastFrameTime = performance.now();
        playGifLoop(performance.now());

        // Cancel the timer or close the popup
        clearTimeout(loadingTimer);
        if (Swal.isVisible()) Swal.close();

        triggerMorph();
      } catch (err) {
        clearTimeout(loadingTimer);
        Swal.fire("Error", "Failed to parse GIF", "error");
        console.error(err);
      }
    } else {
      currentGifFrames = [];
      loadImage(URL.createObjectURL(file));
    }
  });

  // Morph Transition Target Uploader Selector Bound
  document
    .getElementById("hiddenTransitionInput")
    ?.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file || !scene) return;

      let targetMesh = null;
      scene.traverse((child) => {
        if (child.isInstancedMesh) targetMesh = child;
      });

      // 1. Snapshot the CURRENT state instantly.
      // We MUST clone the vectors so the old GIF frames don't mutate our snapshot memory!
      const prevPositions = targetMesh
        ? targetMesh.userData.originalPositions.map((v) => v.clone())
        : [];
      const prevScales = targetMesh
        ? [...targetMesh.userData.originalScales]
        : [];
      const prevRotations = targetMesh
        ? targetMesh.userData.originalRotations.map((q) => q.clone())
        : [];

      const hasSourceGif = isPlayingGif && currentGifFrames.length > 0;

      lastTransitionBackup = {
        positions: prevPositions.map((v) => v.clone()),
        scales: [...prevScales],
        rotations: prevRotations.map((q) =>
          q && q.clone ? q.clone() : new THREE.Quaternion().copy(q),
        ),
        sourceGif: hasSourceGif
          ? {
              frames: [...currentGifFrames],
              cols: currentGifCols,
              rows: currentGifRows,
            }
          : null,
      };
      lastTransitionAnimName = pendingTransitionAnimation;

      if (hasSourceGif) {
        sourceGifBackup = {
          frames: [...currentGifFrames],
          cols: currentGifCols,
          rows: currentGifRows,
          currentIndex: currentFrameIndex,
          lastTime: performance.now(),
        };
      }

      // 2. Instantly stop the foreground player loop
      stopGifPlayback();

      // Wake the engine loop back up strictly to process the background fade out
      if (sourceGifBackup) {
        gifAnimationId = requestAnimationFrame(playGifLoop);
      }

      // Helper function to finalize and trigger the morph
      const triggerMorph = () => {
        scene.traverse((child) => {
          if (child.isInstancedMesh) targetMesh = child;
        });

        if (targetMesh) {
          const count = targetMesh.count;

          // 1. TRUNCATE if the old image had MORE dots than the new image
          let safePos = prevPositions.slice(0, count);
          let safeScl = prevScales.slice(0, count);
          let safeRot = prevRotations.slice(0, count);

          // 2. PAD if the old image had FEWER dots than the new image
          while (safePos.length < count) {
            safePos.push(new THREE.Vector3(0, 0, -600)); // Spawn pushed back
            safeScl.push(0); // Spawn invisible so they grow in naturally
            safeRot.push(new THREE.Quaternion());
          }

          // 3. Attach perfectly matched arrays
          targetMesh.userData.prevPositions = safePos;
          targetMesh.userData.prevScales = safeScl;
          targetMesh.userData.prevRotations = safeRot;
          targetMesh.userData.isTransitioning = true;

          currentActiveAnimation = pendingTransitionAnimation;
          handleAnimationSwitch(pendingTransitionAnimation, true);
          resetAnimationTimeline(controls);
        }
      };

      // 3. Process the file based on its type
      if (file.type === "image/gif") {
        // Start the 2-second timer
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

          currentGifCols = setup.cols;
          currentGifRows = setup.rows;
          currentGifMesh = setup.instancedMesh;

          currentGifFrames = parsedGif.frames.map((frame) => {
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = parsedGif.width;
            tempCanvas.height = parsedGif.height;
            tempCanvas.getContext("2d").putImageData(frame.imageData, 0, 0);
            return {
              imageData: sampleImage(
                tempCanvas,
                currentGifCols,
                currentGifRows,
              ),
              delay: frame.delay,
            };
          });

          currentImage = null;
          currentFrameIndex = 0;

          // Start the GIF immediately so it plays DURING the morph
          isPlayingGif = true;
          lastFrameTime = performance.now();
          playGifLoop(performance.now());

          // Cancel the timer or close the popup
          clearTimeout(loadingTimer);
          if (Swal.isVisible()) Swal.close();

          triggerMorph();
        } catch (err) {
          clearTimeout(loadingTimer);
          Swal.fire("Error", "Failed to parse GIF", "error");
          console.error(err);
        }
      } else {
        // Standard Static Image
        const reader = new FileReader();
        reader.onload = (event) => {
          const tempImg = new Image();
          tempImg.onload = () => {
            currentImage = tempImg;
            currentGifFrames = []; // Clear old GIF memory

            updateThreeGrid(currentImage, getSettings());
            triggerMorph();
          };
          tempImg.src = event.target.result;
        };
        reader.readAsDataURL(file);
      }

      // Reset input so you can upload the same image twice if desired
      e.target.value = "";
    });

  // --- Morph Cycle Completion Cleanup ---
  window.addEventListener("gifTransitionComplete", () => {
    let targetMesh = null;
    scene.traverse((child) => {
      if (child.isInstancedMesh) targetMesh = child;
    });

    if (targetMesh && targetMesh.userData.isTransitioning) {
      // 1. Clear out memory hooks
      delete targetMesh.userData.isTransitioning;
      delete targetMesh.userData.prevPositions;
      delete targetMesh.userData.prevScales;
      delete targetMesh.userData.prevRotations;

      // 2. Freeze the timeline exactly where it landed!
      // This stops the camera dead in its tracks and leaves the UI on the button you actually clicked.
      forcePauseAnimation();
    }
  });

  // Shape Export (.glb)
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

  // Image Export (.png / .svg / .jpg)
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

  // Video Export Pipeline Configurations
  document
    .getElementById("exportVideo")
    .addEventListener("click", async (e) => {
      if (e) e.preventDefault();
      const result = await newSwal.fire({
        title: "Video Export",
        text: "Enter a duration and select a file type.",
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: ".mov",
        denyButtonText: ".mp4",
        cancelButtonText: ".webm",
        input: "number",
        inputPlaceholder: "Length",
        inputAttributes: { min: 1, max: 15, step: 1 },
        preDeny: () => Swal.getInput().value,
        didOpen: () => {
          Swal.getCancelButton().onclick = () => {
            newSwal.close({
              isConfirmed: false,
              isDenied: false,
              isWebM: true,
              value: Swal.getInput().value,
            });
          };
        },
      });

      if (
        result.dismiss === Swal.DismissReason.backdrop ||
        result.dismiss === Swal.DismissReason.esc
      )
        return;
      let duration =
        result.value === "" ||
        result.value === null ||
        result.value === undefined
          ? "auto"
          : Number(result.value);

      newSwal.fire({
        title: "Exporting",
        timer: duration === "auto" ? undefined : Math.max(5, duration) * 1000,
        allowOutsideClick: false,
        text:
          duration === "auto"
            ? "Recording seamless loop sequence..."
            : `Recording scene for ${duration} seconds.`,
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

            // 1. Identify if we are about to replay a transition
            let targetMesh = null;
            scene.traverse((child) => {
              if (child.isInstancedMesh) targetMesh = child;
            });

            const isReplayingTransition =
              targetMesh &&
              lastTransitionBackup &&
              currentActiveAnimation === lastTransitionAnimName;

            // 2. Handle GIF playback and waiting states
            let gifDurationSeconds = 0;
            if (currentGifFrames && currentGifFrames.length > 0) {
              const totalDelayMs = currentGifFrames.reduce(
                (sum, frame) => sum + frame.delay,
                0,
              );
              gifDurationSeconds = totalDelayMs / 1000;

              currentFrameIndex = 0;
              lastFrameTime = window.performance.now();

              // Pre-load frame 0 into the target memory for the morph to use
              applyImageToGrid(
                currentGifFrames[0].imageData,
                currentGifCols,
                currentGifRows,
                getSettings(),
                currentGifMesh,
              );

              // --- FIXED: Always let the GIF play from Frame 0 immediately! ---
              if (!isPlayingGif) {
                isPlayingGif = true;
                playGifLoop(window.performance.now());
              }
            }

            if (duration === "auto") {
              window.exportRotatedAccumulator = 0;
              window.isAnimationLoopComplete = false;

              // 3. Re-arm the transition memory
              if (isReplayingTransition) {
                const count = targetMesh.count;

                // 1. Pull from backup and TRUNCATE if necessary
                let safePos = lastTransitionBackup.positions
                  .map((v) => v.clone())
                  .slice(0, count);
                let safeScl = [...lastTransitionBackup.scales].slice(0, count);
                let safeRot = lastTransitionBackup.rotations
                  .map((q) => q.clone())
                  .slice(0, count);

                // 2. PAD if necessary
                while (safePos.length < count) {
                  safePos.push(new THREE.Vector3(0, 0, -600));
                  safeScl.push(0);
                  safeRot.push(new THREE.Quaternion());
                }

                targetMesh.userData.prevPositions = safePos;
                targetMesh.userData.prevScales = safeScl;
                targetMesh.userData.prevRotations = safeRot;
                targetMesh.userData.isTransitioning = true;

                // IMPORTANT: Ensure the animation loop has a perfectly matched baseline!
                targetMesh.userData.originalPositions =
                  targetMesh.userData.prevPositions;
                targetMesh.userData.originalScales =
                  targetMesh.userData.prevScales;
                targetMesh.userData.originalRotations =
                  targetMesh.userData.prevRotations;

                if (typeof resetAnimationTimeline === "function") {
                  resetAnimationTimeline(controls);
                }
              }

              // 4. Calculate total necessary recording time
              const loopDurations = {
                default: 8,
                eased: 5,
                breakApart: 10,
                morphTransition: 10,
              };

              const animDuration = loopDurations[currentActiveAnimation] || 8;

              // Do not stretch the morph! Give it the strict original time.
              window.exportTargetDuration = animDuration;

              // Give the exporter the padded duration using a new variable
              if (gifDurationSeconds > 0) {
                if (isReplayingTransition) {
                  // Morphing INTO a GIF: Record the morph length PLUS one full GIF loop!
                  window.exportTotalDuration =
                    animDuration + gifDurationSeconds;
                } else {
                  // Standard GIF: Record one loop
                  window.exportTotalDuration = gifDurationSeconds;
                }
              } else {
                // Standard static image
                window.exportTotalDuration = animDuration;
              }

              resetCameraView();
              if (typeof controls !== "undefined") controls.update();
              handleAnimationSwitch(currentActiveAnimation, true);
            }
          },
        );

        Swal.close();
        if (targetFormat === "mov" || targetFormat === "mp4") {
          const spinner = document.getElementById("exportSpinner");
          if (spinner) spinner.classList.remove("hidden");
        }

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
      } finally {
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

  const container = document.querySelector(".slider-container");
  const indicator = document.getElementById("scrollIndicator");
  const checkScrollStatus = () => {
    if (!container || !indicator) return;
    const hasRoomToScroll = container.scrollHeight > container.clientHeight;
    const reachedEnd =
      container.scrollHeight - container.scrollTop <=
      container.clientHeight + 4;
    indicator.className =
      hasRoomToScroll && !reachedEnd
        ? "opacity-100 transition-all duration-200"
        : "opacity-0 transition-all duration-200";
  };

  container?.addEventListener("scroll", checkScrollStatus);
  window.addEventListener("resize", checkScrollStatus);
  setTimeout(checkScrollStatus, 200);

  Object.keys(scaleSliders).forEach((id) => {
    document.getElementById(id)?.addEventListener("input", () => {
      redraw();
    });
  });

  document.getElementById("pixelShape")?.addEventListener("change", () => {
    redraw();
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
      FileDown,
      Box,
      Camera,
      Video,
      ChevronDown,
      Images,
    },
  });
});

window.addEventListener("resize", () => {
  loadImageAnimation();
});
