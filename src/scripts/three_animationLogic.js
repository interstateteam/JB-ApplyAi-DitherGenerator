import * as THREE from "three";
import { scene } from "./three_sceneLogic.js";

let activeType = "default"; // 'default', 'eased', or 'breakApart'
let isPaused = true;
let time = 0;

// --- UI Button Manager ---
const buttonMapping = {
  default: "rotationAnimation",
  eased: "spinAnimation",
  breakApart: "bounceAnimation",
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

    case "breakApart":
      controls.autoRotate = false;

      if (window.isExportingLoop) {
        if (window.exportRotatedAccumulator === undefined) {
          window.exportRotatedAccumulator = 0;
        }
        if (!window.isAnimationLoopComplete) {
          time += 1;
          if (time / 360 >= 1.0) {
            window.isAnimationLoopComplete = true;
          }
        }
      } else {
        time += 1;
      }

      // Securely fetch our generated InstancedMesh object from the scene graph
      let targetMesh = null;
      if (scene) {
        scene.traverse((child) => {
          if (child.isInstancedMesh) {
            targetMesh = child;
          }
        });
      }

      if (targetMesh && targetMesh.userData.originalPositions) {
        const currentFrame = time % 360;

        // Continuous timeline progress factor (goes from 0.0 to 1.0 flawlessly)
        const t = currentFrame / 360;

        // 1. EXPONENTIAL MORPH FACTOR: Pure continuous wave mapping (0 -> 1 -> 0)
        // The power exponent (3.5) gives it that slow takeoff and explosive mid-flight surge.
        const baseMorph = (1 - Math.cos(t * Math.PI * 2)) / 2;
        const morphFactor = Math.pow(baseMorph, 3.5);

        // 2. CONTINUOUS SPIN ANGLE: Seamlessly runs forward over the loop boundaries
        // Total rotation is Math.PI * 8 (4 full spins total: 2 spins out, 2 spins back).
        // The subtracted sine wave acts as our exponential ease, matching the morph speed.
        const totalSpins = Math.PI * 8;
        const spinAngle = t * totalSpins - Math.sin(t * Math.PI * 4) * 1.35;

        const blendedPos = new THREE.Vector3();
        const blendedRot = new THREE.Quaternion();
        const blendedScaleVec = new THREE.Vector3();
        const transformMatrix = new THREE.Matrix4();

        const rotationAxis = new THREE.Vector3(0, 1, 0);
        const globalSpinQuat = new THREE.Quaternion().setFromAxisAngle(
          rotationAxis,
          spinAngle,
        );

        const data = targetMesh.userData;

        // Perform optimized coordinate interpolation loop across every pixel instance
        for (let i = 0; i < targetMesh.count; i++) {
          // Interpolate position states with the perfectly smooth curve
          blendedPos.lerpVectors(
            data.originalPositions[i],
            data.gridPositions[i],
            morphFactor,
          );

          // Deterministic Grid Randomness - Significantly boosted on X and Y axes (340)
          const noiseX =
            (Math.sin(i * 0.13) * 0.6 + Math.cos(i * 0.45) * 0.4) * 340;
          const noiseY =
            (Math.sin(i * 0.27) * 0.5 + Math.cos(i * 0.19) * 0.5) * 340;
          const noiseZ =
            (Math.sin(i * 0.51) * 0.7 + Math.cos(i * 0.33) * 0.3) * 40;

          blendedPos.x += noiseX * morphFactor;
          blendedPos.y += noiseY * morphFactor;
          blendedPos.z += noiseZ * morphFactor;

          // Apply continuous unified single-direction rotation translations around center
          blendedPos.applyAxisAngle(rotationAxis, spinAngle);

          // Interpolate chaotic individual dot angles to clean uniform grid slots
          blendedRot.slerpQuaternions(
            data.originalRotations[i],
            data.gridRotations[i],
            morphFactor,
          );

          // Combine original orientations with global spinning tracking matrix
          blendedRot.premultiply(globalSpinQuat);

          // Interpolate structured particle sizes using the synchronized factor
          const currentScale = THREE.MathUtils.lerp(
            data.originalScales[i],
            data.gridScales[i],
            morphFactor,
          );
          blendedScaleVec.set(currentScale, currentScale, currentScale);

          // Render matrices directly into the instance buffer
          transformMatrix.compose(blendedPos, blendedRot, blendedScaleVec);
          targetMesh.setMatrixAt(i, transformMatrix);
        }

        // Notify the GPU to update layout transformation arrays
        targetMesh.instanceMatrix.needsUpdate = true;
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
  updateButtonUI();
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
