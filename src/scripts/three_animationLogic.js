import * as THREE from "three";

let activeType = "default"; // 'default', 'eased', or 'thirdMode'
let isPaused = false;
let time = 0;

// --- UI Button Manager ---
const buttonMapping = {
  default: "rotationAnimation",
  eased: "spinAnimation",
  thirdMode: "bounceAnimation",
};

export const updateButtonUI = () => {
  Object.entries(buttonMapping).forEach(([type, id]) => {
    const btn = document.getElementById(id);
    if (!btn) return;

    // FIX: Look for an <svg> (if Lucide has loaded) or an <i> (if it hasn't)
    const icon = btn.querySelector("svg, i");
    if (!icon) return;

    const activeColorClass = "text-ApplyOrange";

    if (type === activeType) {
      if (isPaused) {
        icon.classList.add(activeColorClass, "opacity-50");
      } else {
        icon.classList.add(activeColorClass);
        icon.classList.remove("opacity-50");
      }
    } else {
      icon.classList.remove(activeColorClass, "opacity-50");
    }
  });
};
// --- State Manager ---
export const getAnimationState = () => ({ activeType, isPaused });

export const handleAnimationSwitch = (requestedType, forcePlay = false) => {
  if (activeType === requestedType && !forcePlay) {
    isPaused = !isPaused;
  } else {
    activeType = requestedType;
    isPaused = false;
    time = 0; // Force the animation timeline back to frame 1
  }

  updateButtonUI();
};

export const resetAnimationTimeline = () => {
  time = 0;
};

export const updateCameraAnimation = (controls) => {
  if (isPaused) {
    controls.autoRotate = false;
    return;
  }

  switch (activeType) {
    case "eased":
      controls.autoRotate = false;

      const timeIncrement = 0.05;
      const loopDuration = Math.PI * 2;
      let progress;

      if (window.isExportingLoop) {
        // --- AUTOMATED BACKGROUND EXPORT MODE ---
        // Initialize an absolute accumulator just for the export tracking session
        if (window.exportRotatedAccumulator === undefined) {
          window.exportRotatedAccumulator = 0;
        }

        if (!window.isAnimationLoopComplete) {
          time += timeIncrement;
          progress = time / loopDuration;

          if (progress >= 1.0) {
            progress = 1.0;
            window.isAnimationLoopComplete = true;
          }
        } else {
          progress = 1.0;
        }

        // 1. Calculate absolute progress using a smooth Quintic Ease-In-Out curve
        const easedProgress =
          progress < 0.5
            ? 16 * Math.pow(progress, 5)
            : 1 - Math.pow(-2 * progress + 2, 5) / 2;

        // 2. Determine exactly where the camera SHOULD be in total radians (Max = 2*PI)
        const targetTotalRotation = easedProgress * Math.PI * 2;

        // 3. Rotate ONLY the difference between the target position and where we are
        const deltaToRotate =
          targetTotalRotation - window.exportRotatedAccumulator;
        window.exportRotatedAccumulator = targetTotalRotation;

        controls.rotateLeft(deltaToRotate);
      } else {
        // --- NORMAL INTERACTIVE VIEWPORT MODE ---
        time += timeIncrement;
        progress = (time % loopDuration) / loopDuration;

        const velocityCurve =
          progress < 0.5
            ? 80 * Math.pow(progress, 4)
            : 5 * Math.pow(2 - 2 * progress, 4);

        const totalDegrees = 360;
        const degreesThisFrame =
          velocityCurve * (timeIncrement / loopDuration) * totalDegrees;

        controls.rotateLeft(THREE.MathUtils.degToRad(degreesThisFrame));
      }
      break;

    case "thirdMode":
      controls.autoRotate = false;

      if (window.isExportingLoop) {
        if (window.exportRotatedAccumulator === undefined) {
          window.exportRotatedAccumulator = 0;
        }

        if (!window.isAnimationLoopComplete) {
          time += 1;
          let progress = time / 360; // 360 frames total

          if (progress >= 1.0) {
            progress = 1.0;
            window.isAnimationLoopComplete = true;
          }

          const targetTotalRotation = progress * Math.PI * 2;
          const deltaToRotate =
            targetTotalRotation - window.exportRotatedAccumulator;
          window.exportRotatedAccumulator = targetTotalRotation;

          controls.rotateLeft(deltaToRotate);
        }
      } else {
        time += 1;
        controls.rotateLeft(THREE.MathUtils.degToRad(1.0));
      }
      break;

    case "default":
    default:
      if (window.isExportingLoop) {
        // --- AUTOMATED BACKGROUND EXPORT MODE ---
        controls.autoRotate = false;

        if (window.exportRotatedAccumulator === undefined) {
          window.exportRotatedAccumulator = 0;
        }

        if (!window.isAnimationLoopComplete) {
          const defaultIncrement = 0.01;
          time += defaultIncrement;
          const defaultLoopDuration = Math.PI * 2;

          let progress = time / defaultLoopDuration;

          if (progress >= 1.0) {
            progress = 1.0;
            window.isAnimationLoopComplete = true;
          }

          const targetTotalRotation = progress * Math.PI * 2;
          const deltaToRotate =
            targetTotalRotation - window.exportRotatedAccumulator;
          window.exportRotatedAccumulator = targetTotalRotation;

          controls.rotateLeft(deltaToRotate);
        } else {
          controls.autoRotate = false;
        }
      } else {
        // --- NORMAL INTERACTIVE VIEWPORT MODE ---
        controls.autoRotate = true;
        controls.autoRotateSpeed = 5.0;
      }
      break;
  }
};

export const forcePauseAnimation = () => {
  isPaused = true;
  updateButtonUI(); // Ensures the active button turns to the "paused" color
};

export function loadImageAnimation() {
  const imgCanvas = document.getElementById("imgLoadCanvas");
  const imgCTX = imgCanvas.getContext("2d");

  const img = new Image();
  img.onload = () => {
    // 1. Set the canvas to fill the window
    imgCanvas.width = window.innerWidth;
    imgCanvas.height = window.innerHeight;

    const imgAspect = img.width / img.height;
    const windowAspect = window.innerWidth / window.innerHeight;

    const scaleValue = 0.8;
    let scaledWidth, scaledHeight;

    if (windowAspect > imgAspect) {
      scaledHeight = window.innerHeight * scaleValue;
      scaledWidth = scaledHeight * imgAspect;
    } else {
      scaledWidth = window.innerWidth * scaleValue;
      scaledHeight = scaledWidth / imgAspect;
    }

    const x = (imgCanvas.width - scaledWidth) / 2;
    const y = (imgCanvas.height - scaledHeight) / 2;

    imgCTX.clearRect(0, 0, imgCanvas.width, imgCanvas.height);
    imgCTX.drawImage(img, x, y, scaledWidth, scaledHeight);
  };
  img.src = "src/assets/defaultImageTransparent.png";
}
