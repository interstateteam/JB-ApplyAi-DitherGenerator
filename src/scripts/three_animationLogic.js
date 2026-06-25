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

export const resetAnimationTimeline = (controls) => {
  time = 0;

  if (controls) {
    updateCameraAnimation(controls);
  }
};

export const updateCameraAnimation = (controls) => {
  if (isPaused) {
    controls.autoRotate = false;
    return;
  }

  // Helper to grab the mesh and check if we are transitioning
  let targetMesh = null;
  if (scene) {
    scene.traverse((child) => {
      if (child.isInstancedMesh) targetMesh = child;
    });
  }
  const isTransitioning = targetMesh && targetMesh.userData.isTransitioning;

  switch (activeType) {
    case "eased": {
      controls.autoRotate = false;
      const timeIncrement = 0.05;
      const loopDuration = Math.PI * 2;
      let progress;

      if (window.isExportingLoop) {
        // ... (Exporting logic remains untouched) ...
        if (window.exportRotatedAccumulator === undefined)
          window.exportRotatedAccumulator = 0;
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

        const easedProgress =
          progress < 0.5
            ? 16 * Math.pow(progress, 5)
            : 1 - Math.pow(-2 * progress + 2, 5) / 2;
        const targetTotalRotation = easedProgress * Math.PI * 2;
        const deltaToRotate =
          targetTotalRotation - window.exportRotatedAccumulator;
        window.exportRotatedAccumulator = targetTotalRotation;
        controls.rotateLeft(deltaToRotate);
      } else {
        time += timeIncrement;
        // If transitioning, lock progress at 1.0. Otherwise, loop endlessly.
        progress = isTransitioning
          ? Math.min(time / loopDuration, 1.0)
          : (time % loopDuration) / loopDuration;

        const velocityCurve =
          progress < 0.5
            ? 80 * Math.pow(progress, 4)
            : 5 * Math.pow(2 - 2 * progress, 4);
        const totalDegrees = 360;
        const degreesThisFrame =
          velocityCurve * (timeIncrement / loopDuration) * totalDegrees;
        controls.rotateLeft(THREE.MathUtils.degToRad(degreesThisFrame));
      }

      // --- DUAL-BUFFER MORPHING FOR EASED SPIN ---
      if (isTransitioning && targetMesh) {
        const data = targetMesh.userData;

        if (
          !data.prevPositions ||
          !data.originalPositions ||
          !data.prevRotations ||
          !data.originalRotations
        ) {
          return;
        }

        const blendedPos = new THREE.Vector3();
        const blendedRot = new THREE.Quaternion();
        const blendedScaleVec = new THREE.Vector3();
        const transformMatrix = new THREE.Matrix4();

        // S-Curve morph so the dots snap into place elegantly during the spin
        const morphProgress =
          progress < 0.5
            ? 16 * Math.pow(progress, 5)
            : 1 - Math.pow(-2 * progress + 2, 5) / 2;

        for (let i = 0; i < targetMesh.count; i++) {
          let posA = data.prevPositions[i] || data.originalPositions[i];
          let scaleA =
            data.prevScales[i] !== undefined ? data.prevScales[i] : 0;
          let rotA = data.prevRotations[i] || data.originalRotations[i];

          blendedPos.lerpVectors(
            posA,
            data.originalPositions[i],
            morphProgress,
          );
          blendedRot.slerpQuaternions(
            rotA,
            data.originalRotations[i],
            morphProgress,
          );
          let currentScale = THREE.MathUtils.lerp(
            scaleA,
            data.originalScales[i],
            morphProgress,
          );

          blendedScaleVec.set(currentScale, currentScale, currentScale);
          transformMatrix.compose(blendedPos, blendedRot, blendedScaleVec);
          targetMesh.setMatrixAt(i, transformMatrix);
        }
        targetMesh.instanceMatrix.needsUpdate = true;

        if (progress >= 1.0)
          window.dispatchEvent(new CustomEvent("gifTransitionComplete"));
      }
      break;
    }

    case "breakApart": {
      controls.autoRotate = false;

      // Dynamically select timings based on whether we are looping or transitioning!
      const pauseNormalFrames = 60;
      const explodeFrames = isTransitioning ? 210 : 390;
      const pauseExpandedFrames = 30;
      const implodeFrames = isTransitioning ? 300 : 120;
      const loopDuration =
        pauseNormalFrames + explodeFrames + pauseExpandedFrames + implodeFrames;

      if (window.isExportingLoop) {
        if (window.exportRotatedAccumulator === undefined)
          window.exportRotatedAccumulator = 0;
        if (!window.isAnimationLoopComplete) {
          time += 1;
          if (time >= loopDuration) window.isAnimationLoopComplete = true;
        }
      } else {
        time += 1;
      }

      if (targetMesh && targetMesh.userData.originalPositions) {
        const currentFrame = time % loopDuration;
        let morphFactor = 0;
        let isSecondHalf = false;

        const easeOutQuint = (x) => 1 - Math.pow(1 - x, 5);
        const easeInOutCubic = (x) =>
          x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

        if (currentFrame < pauseNormalFrames) {
          morphFactor = 0;
        } else if (currentFrame < pauseNormalFrames + explodeFrames) {
          const t = (currentFrame - pauseNormalFrames) / explodeFrames;
          morphFactor = easeOutQuint(t);
        } else if (
          currentFrame <
          pauseNormalFrames + explodeFrames + pauseExpandedFrames
        ) {
          morphFactor = 1.0;
          isSecondHalf = true;
        } else {
          const t =
            (currentFrame -
              (pauseNormalFrames + explodeFrames + pauseExpandedFrames)) /
            implodeFrames;
          morphFactor = 1.0 - easeInOutCubic(t);
          isSecondHalf = true;
        }

        const blendedPos = new THREE.Vector3();
        const blendedRot = new THREE.Quaternion();
        const blendedScaleVec = new THREE.Vector3();
        const transformMatrix = new THREE.Matrix4();
        const scatterTarget = new THREE.Vector3();
        const cubeSize = 2500;
        const data = targetMesh.userData;

        for (let i = 0; i < targetMesh.count; i++) {
          scatterTarget.set(
            ((Math.sin(i * 12.9898) * 43758.5453) % 1) * cubeSize,
            ((Math.sin(i * 78.233) * 43758.5453) % 1) * cubeSize,
            ((Math.sin(i * 39.346) * 43758.5453) % 1) * cubeSize,
          );

          let sourcePos, sourceScale, sourceRot;

          if (isTransitioning) {
            if (!isSecondHalf) {
              sourcePos = data.prevPositions[i] || data.originalPositions[i];
              sourceScale =
                data.prevScales[i] !== undefined ? data.prevScales[i] : 0;
              sourceRot = data.prevRotations[i] || data.originalRotations[i];
            } else {
              sourcePos = data.originalPositions[i];
              sourceScale = data.originalScales[i];
              sourceRot = data.originalRotations[i];
            }
          } else {
            sourcePos = data.originalPositions[i];
            sourceScale = data.originalScales[i];
            sourceRot = data.originalRotations[i];
          }

          blendedPos.lerpVectors(sourcePos, scatterTarget, morphFactor);
          blendedRot.slerpQuaternions(
            sourceRot,
            data.gridRotations[i],
            morphFactor,
          );

          let currentScale = THREE.MathUtils.lerp(
            sourceScale,
            data.gridScales[i],
            morphFactor,
          );
          const zNormalized = (blendedPos.z + cubeSize) / (cubeSize * 2);
          const zMultiplier = 0.2 + zNormalized * 3.8;
          const finalScaleMultiplier = 1.0 + (zMultiplier - 1.0) * morphFactor;

          currentScale *= Math.max(0.01, finalScaleMultiplier);
          blendedScaleVec.set(currentScale, currentScale, currentScale);

          transformMatrix.compose(blendedPos, blendedRot, blendedScaleVec);
          targetMesh.setMatrixAt(i, transformMatrix);
        }

        if (isTransitioning && currentFrame === loopDuration - 1) {
          window.dispatchEvent(new CustomEvent("gifTransitionComplete"));
        }

        targetMesh.instanceMatrix.needsUpdate = true;
      }
      break;
    }

    case "default":
    default: {
      // --- DUAL-BUFFER MORPHING FOR SLOW ROTATION ---
      if (isTransitioning && targetMesh) {
        controls.autoRotate = false; // Take manual control of spin
        const transitionFrames = 120; // 2 seconds
        time += 1;
        const progress = Math.min(time / transitionFrames, 1.0);

        // Gentle rotation matching the default autoRotate speed
        controls.rotateLeft(THREE.MathUtils.degToRad(1.5));

        const data = targetMesh.userData;

        // FIXED: Guard clause to prevent race conditions during file parsing
        if (
          !data.prevPositions ||
          !data.originalPositions ||
          !data.prevRotations ||
          !data.originalRotations
        ) {
          return;
        }

        const blendedPos = new THREE.Vector3();

        const blendedRot = new THREE.Quaternion();
        const blendedScaleVec = new THREE.Vector3();
        const transformMatrix = new THREE.Matrix4();

        const easeInOutSine = -(Math.cos(Math.PI * progress) - 1) / 2;

        for (let i = 0; i < targetMesh.count; i++) {
          let posA = data.prevPositions[i] || data.originalPositions[i];
          let scaleA =
            data.prevScales[i] !== undefined ? data.prevScales[i] : 0;
          let rotA = data.prevRotations[i] || data.originalRotations[i];

          blendedPos.lerpVectors(
            posA,
            data.originalPositions[i],
            easeInOutSine,
          );
          blendedRot.slerpQuaternions(
            rotA,
            data.originalRotations[i],
            easeInOutSine,
          );
          let currentScale = THREE.MathUtils.lerp(
            scaleA,
            data.originalScales[i],
            easeInOutSine,
          );

          blendedScaleVec.set(currentScale, currentScale, currentScale);
          transformMatrix.compose(blendedPos, blendedRot, blendedScaleVec);
          targetMesh.setMatrixAt(i, transformMatrix);
        }
        targetMesh.instanceMatrix.needsUpdate = true;

        if (progress >= 1.0)
          window.dispatchEvent(new CustomEvent("gifTransitionComplete"));
      } else {
        // Standard non-transitioning endless spin behavior
        if (window.isExportingLoop) {
          controls.autoRotate = false;
          if (window.exportRotatedAccumulator === undefined)
            window.exportRotatedAccumulator = 0;
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
          }
        } else {
          controls.autoRotate = true;
          controls.autoRotateSpeed = 5.0;
        }
      }
      break;
    }
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
