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

export const handleAnimationSwitch = (requestedType) => {
  if (activeType === requestedType) {
    isPaused = !isPaused;
  } else {
    activeType = requestedType;
    isPaused = false;
    time = 0; // Force the new animation to start from the beginning
  }

  updateButtonUI();
};

// --- Camera Animation Engine ---
export const updateCameraAnimation = (controls) => {
  if (isPaused) {
    controls.autoRotate = false;
    return;
  }

  switch (activeType) {
    case "eased":
      controls.autoRotate = false;

      // 1. Time progression
      const timeIncrement = 0.05; // Controls how fast the loop finishes
      time += timeIncrement;

      // 2. Map time to a clean 0.0 to 1.0 progress cycle
      const loopDuration = Math.PI * 2;
      const progress = (time % loopDuration) / loopDuration;

      // 3. The "Extreme Snap" Math (Derivative of Quintic Ease)
      // This equation forces velocity to be nearly zero at the edges and spike massively at 0.5
      const velocityCurve =
        progress < 0.5
          ? 80 * Math.pow(progress, 4)
          : 5 * Math.pow(2 - 2 * progress, 4);

      // 4. Exact Spin Control
      const spinsPerLoop = 1;
      const totalDegrees = 360 * spinsPerLoop;

      // Calculate exactly how many degrees to turn THIS frame based on the curve's current slope
      const degreesThisFrame =
        velocityCurve * (timeIncrement / loopDuration) * totalDegrees;

      // Apply rotation
      controls.rotateLeft(THREE.MathUtils.degToRad(degreesThisFrame));
      break;

    case "thirdMode":
      controls.autoRotate = false;
      controls.rotateLeft(THREE.MathUtils.degToRad(1.0)); // Placeholder
      break;

    case "default":
    default:
      controls.autoRotate = true;
      controls.autoRotateSpeed = 5.0;
      break;
  }
};

export const forcePauseAnimation = () => {
  isPaused = true;
  updateButtonUI(); // Ensures the active button turns to the "paused" color
};
