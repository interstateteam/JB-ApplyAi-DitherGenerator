import * as THREE from "three";
import { parseGIF, decompressFrames } from "gifuct-js";
import { applyImageToGrid, getActiveMesh } from "./three_gridLogic.js";

// === STATE ===

export let isPlayingGif = false;
export let currentGifFrames = [];
export let currentGifCols = 0;
export let currentGifRows = 0;
export let currentGifMesh = null;
export let currentFrameIndex = 0;
export let lastFrameTime = 0;
export let gifAnimationId = null;
export let sourceGifBackup = null;

// === STATE SETTERS ===

export const setIsPlayingGif = (status) => {
  isPlayingGif = status;
};
export const setSourceGifBackup = (backup) => {
  sourceGifBackup = backup;
};
export const setLastFrameTime = (time) => {
  lastFrameTime = time;
};
export const setCurrentGifState = (frames, cols, rows, mesh) => {
  currentGifFrames = frames;
  currentGifCols = cols;
  currentGifRows = rows;
  currentGifMesh = mesh;
  currentFrameIndex = 0;
};

// === PLAYBACK ENGINE ===

export const mockMesh = {
  userData: {},
  setColorAt: () => {},
  setMatrixAt: () => {},
  instanceMatrix: { needsUpdate: false },
  instanceColor: { needsUpdate: false },
};

/**
 * Halts ongoing GIF frame progression.
 */
export const stopGifPlayback = () => {
  isPlayingGif = false;
  if (gifAnimationId) cancelAnimationFrame(gifAnimationId);
};

/**
 * Re-entrant animation loop for rendering chronological slices of GIF data.
 */
export const playGifLoop = (timestamp, scene, getSettingsFn) => {
  const activeMesh = getActiveMesh();

  const isMorphingAway =
    activeMesh && activeMesh.userData.isTransitioning && sourceGifBackup;
  const isBackgroundFrozen = activeMesh && activeMesh.userData.freezeBackground;
  let loopActive = false;

  if (isMorphingAway && !isBackgroundFrozen) {
    loopActive = true;
    const backup = sourceGifBackup;
    const frame = backup.frames[backup.currentIndex];

    if (timestamp - backup.lastTime >= frame.delay) {
      applyImageToGrid(
        frame.imageData,
        backup.cols,
        backup.rows,
        getSettingsFn(),
        mockMesh,
      );
      const count = activeMesh.count;
      const freshData = mockMesh.userData;
      const prevPos = activeMesh.userData.prevPositions;
      const prevScl = activeMesh.userData.prevScales;
      const prevRot = activeMesh.userData.prevRotations;

      for (let i = 0; i < count; i++) {
        if (i < freshData.originalPositions.length) {
          prevPos[i].copy(freshData.originalPositions[i]);
          prevScl[i] = freshData.originalScales[i];
          prevRot[i].copy(freshData.originalRotations[i]);
        } else {
          prevPos[i].set(0, 0, -600);
          prevScl[i] = 0;
          prevRot[i].identity();
        }
      }

      backup.lastTime = timestamp;
      backup.currentIndex = (backup.currentIndex + 1) % backup.frames.length;
    }
  }

  if (isPlayingGif && currentGifFrames.length > 0) {
    loopActive = true;
    const frame = currentGifFrames[currentFrameIndex];

    if (timestamp - lastFrameTime >= frame.delay) {
      applyImageToGrid(
        frame.imageData,
        currentGifCols,
        currentGifRows,
        getSettingsFn(),
        currentGifMesh,
      );
      lastFrameTime = timestamp;
      currentFrameIndex = (currentFrameIndex + 1) % currentGifFrames.length;
    }
  }

  if (!loopActive) return;
  gifAnimationId = requestAnimationFrame((t) =>
    playGifLoop(t, scene, getSettingsFn),
  );
};

// === PARSING ===

/**
 * Unpacks an array buffer into contiguous 2D Canvas ImageData chunks.
 */
export const parseGifFile = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const buffer = reader.result;
        const gif = parseGIF(buffer);
        const rawFrames = decompressFrames(gif, true);
        const frames = [];

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        canvas.width = rawFrames[0].dims.width;
        canvas.height = rawFrames[0].dims.height;
        let previousImageData = null;

        for (let i = 0; i < rawFrames.length; i++) {
          const frame = rawFrames[i];

          if (frame.disposalType === 2) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          } else if (frame.disposalType === 3 && previousImageData) {
            ctx.putImageData(previousImageData, 0, 0);
          } else {
            previousImageData = ctx.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            );
          }

          const frameImageData = new ImageData(
            new Uint8ClampedArray(frame.patch),
            frame.dims.width,
            frame.dims.height,
          );

          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = frame.dims.width;
          tempCanvas.height = frame.dims.height;
          tempCanvas.getContext("2d").putImageData(frameImageData, 0, 0);
          ctx.drawImage(tempCanvas, frame.dims.left, frame.dims.top);

          frames.push({
            imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
            delay: Math.max(20, frame.delay),
          });
        }
        resolve({ width: canvas.width, height: canvas.height, frames });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};
