import * as THREE from "three";
import { scene, resetCameraView } from "./three_sceneLogic.js";

// --- 1. Bulletproof Initial State ---
let activeType = null;
let isPaused = false;
let time = 0;

// Store controls globally so UI buttons can reset rotations
let cachedControls = null;

// --- 2. Helper Functions ---
export const resetMeshTransforms = () => {
  let targetMesh = null;
  if (scene) {
    scene.traverse((child) => {
      if (child.isInstancedMesh) targetMesh = child;
    });
  }

  if (
    !targetMesh ||
    !targetMesh.userData ||
    !targetMesh.userData.originalPositions
  ) {
    return;
  }

  const data = targetMesh.userData;
  const transformMatrix = new THREE.Matrix4();
  const scaleVec = new THREE.Vector3();

  for (let i = 0; i < targetMesh.count; i++) {
    const s = data.originalScales[i] !== undefined ? data.originalScales[i] : 1;
    scaleVec.set(s, s, s);

    transformMatrix.compose(
      data.originalPositions[i],
      data.originalRotations[i],
      scaleVec,
    );
    targetMesh.setMatrixAt(i, transformMatrix);
  }
  targetMesh.instanceMatrix.needsUpdate = true;
};

// --- 3. UI Button Manager ---
const buttonMapping = {
  default: "rotationAnimation",
  eased: "spinAnimation",
  breakApart: "breakApartAnimation",
  implode: "implodeAnimation",
  scramble: "scrambleAnimation",
};

export const updateButtonUI = () => {
  Object.entries(buttonMapping).forEach(([type, id]) => {
    const btn = document.getElementById(id);
    if (!btn) return;

    const icon = btn.querySelector("svg, i");
    if (!icon) return;

    const activeColorClass = "text-ApplyOrange";

    if (type === activeType) {
      if (isPaused) {
        icon.classList.add(activeColorClass, "opacity-50"); // Paused visual
      } else {
        icon.classList.add(activeColorClass);
        icon.classList.remove("opacity-50"); // Playing visual
      }
    } else {
      icon.classList.remove(activeColorClass, "opacity-50"); // Inactive visual
    }
  });
};

export const getAnimationState = () => ({ activeType, isPaused });

// --- 4. Engine Controls ---
export const handleAnimationSwitch = (requestedType, forceRestart = false) => {
  console.log(
    `Requested: ${requestedType} | Previous: ${activeType} | wasPaused: ${isPaused} | forceRestart: ${forceRestart}`,
  );

  if (activeType === requestedType && !forceRestart) {
    isPaused = !isPaused;
    console.log(`Toggling pause state to: ${isPaused}`);
    updateButtonUI();
    return;
  }

  // CASE 2: Hard switch to a new animation (or forced restart)
  activeType = requestedType;
  isPaused = false;

  // ADD THIS LINE: Force the global animation clock back to frame 0!
  time = 0;

  console.log("Pressing play on new (or restarted) animation");

  if (typeof resetCameraView === "function") resetCameraView();

  if (cachedControls) {
    cachedControls.autoRotate = false;

    const wasDampingEnabled = cachedControls.enableDamping;
    cachedControls.enableDamping = false;

    cachedControls.update();

    cachedControls.enableDamping = wasDampingEnabled;
  }

  resetMeshTransforms();
  updateButtonUI();
};

export const handleFocusToggle = () => {
  activeType = null;
  isPaused = true;
  time = 0;

  if (typeof resetCameraView === "function") resetCameraView();
  if (cachedControls) {
    cachedControls.autoRotate = false;
    const wasDampingEnabled = cachedControls.enableDamping;
    cachedControls.enableDamping = false;
    cachedControls.update();
    cachedControls.enableDamping = wasDampingEnabled;
  }

  resetMeshTransforms();
  updateButtonUI();
};

export const resetAnimationTimeline = (controls) => {
  time = 0;
  if (typeof resetCameraView === "function") resetCameraView();
  if (controls) {
    updateCameraAnimation(controls);
  }
};

// --- 5. Main Render Loop logic ---
export const updateCameraAnimation = (controls) => {
  // Cache controls on first run and save their pristine starting angle
  if (controls && !cachedControls) {
    cachedControls = controls;
    if (typeof cachedControls.saveState === "function") {
      cachedControls.saveState();
    }
  }

  // If paused or no active animation type, exit immediately with zero side-effects
  if (isPaused || !activeType) {
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
    case "scramble": {
      const transitionFrames = 240;
      const loopDuration = 300;

      let progress = 0;
      if (window.isExportingLoop) {
        if (window.exportRotatedAccumulator === undefined)
          window.exportRotatedAccumulator = 0;
        if (!window.isAnimationLoopComplete) {
          time += 1;
          const targetFrames = isTransitioning
            ? transitionFrames
            : loopDuration;
          if (time >= targetFrames) window.isAnimationLoopComplete = true;
          progress = time / targetFrames;
        } else {
          progress = 1.0;
        }
      } else {
        time += 1;
        const targetFrames = isTransitioning ? transitionFrames : loopDuration;
        progress = isTransitioning
          ? Math.min(time / targetFrames, 1.0)
          : (time % targetFrames) / targetFrames;
      }

      if (targetMesh && targetMesh.userData.originalPositions) {
        const data = targetMesh.userData;

        if (isTransitioning) {
          targetMesh.userData.freezeBackground =
            progress > 0.02 && progress < 0.98;
        }

        const blendedPos = new THREE.Vector3();
        const blendedRot = new THREE.Quaternion();
        const blendedScaleVec = new THREE.Vector3();
        const transformMatrix = new THREE.Matrix4();

        const easeInOutQuad =
          progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        const noiseAmp = Math.sin(easeInOutQuad * Math.PI);

        for (let i = 0; i < targetMesh.count; i++) {
          let posA, posB, scaleA, scaleB, rotA, rotB;

          if (isTransitioning) {
            posA = data.prevPositions[i] || data.originalPositions[i];
            scaleA = data.prevScales[i] !== undefined ? data.prevScales[i] : 0;
            rotA = data.prevRotations[i] || data.originalRotations[i];

            posB = data.originalPositions[i];
            scaleB = data.originalScales[i];
            rotB = data.originalRotations[i];
          } else {
            posA = posB = data.originalPositions[i];
            scaleA = scaleB = data.originalScales[i];
            rotA = rotB = data.originalRotations[i];
          }

          blendedPos.lerpVectors(posA, posB, easeInOutQuad);
          blendedRot.slerpQuaternions(rotA, rotB, easeInOutQuad);
          let currentScale = THREE.MathUtils.lerp(
            scaleA,
            scaleB,
            easeInOutQuad,
          );

          const spreadXY = 150;
          const spreadZ = 20;

          const noiseX = Math.sin(i * 12.9898 + time * 0.05) * spreadXY;
          const noiseY = Math.sin(i * 78.233 + time * 0.05) * spreadXY;
          const noiseZ = Math.sin(i * 39.346 + time * 0.05) * spreadZ;

          blendedPos.x += noiseX * noiseAmp;
          blendedPos.y += noiseY * noiseAmp;
          blendedPos.z += noiseZ * noiseAmp;

          const randomQuat = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(noiseX * 0.01, noiseY * 0.01, noiseZ * 0.01),
          );
          blendedRot.slerp(randomQuat, noiseAmp * 0.5);

          blendedScaleVec.set(currentScale, currentScale, currentScale);
          transformMatrix.compose(blendedPos, blendedRot, blendedScaleVec);
          targetMesh.setMatrixAt(i, transformMatrix);
        }

        if (isTransitioning && progress >= 1.0) {
          window.dispatchEvent(new CustomEvent("gifTransitionComplete"));
        }

        targetMesh.instanceMatrix.needsUpdate = true;
      }
      break;
    }

    case "implode": {
      const pauseNormalFrames = 60;
      const implodeFrames = isTransitioning ? 210 : 180;
      const pauseImplodedFrames = 30;
      const explodeFrames = isTransitioning ? 300 : 180;
      const loopDuration =
        pauseNormalFrames + implodeFrames + pauseImplodedFrames + explodeFrames;

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

        const easeInQuint = (x) => x * x * x * x * x;
        const easeOutExpo = (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x));

        if (currentFrame < pauseNormalFrames) {
          morphFactor = 0;
        } else if (currentFrame < pauseNormalFrames + implodeFrames) {
          const t = (currentFrame - pauseNormalFrames) / implodeFrames;
          morphFactor = easeInQuint(t);
        } else if (
          currentFrame <
          pauseNormalFrames + implodeFrames + pauseImplodedFrames
        ) {
          morphFactor = 1.0;
          isSecondHalf = true;
        } else {
          const t =
            (currentFrame -
              (pauseNormalFrames + implodeFrames + pauseImplodedFrames)) /
            explodeFrames;
          morphFactor = 1.0 - easeOutExpo(t);
          isSecondHalf = true;
        }

        if (isTransitioning) {
          targetMesh.userData.freezeBackground = morphFactor > 0.05;
        }

        const blendedPos = new THREE.Vector3();
        const blendedRot = new THREE.Quaternion();
        const blendedScaleVec = new THREE.Vector3();
        const transformMatrix = new THREE.Matrix4();
        const implodeTarget = new THREE.Vector3();
        const data = targetMesh.userData;

        for (let i = 0; i < targetMesh.count; i++) {
          implodeTarget.set(
            Math.sin(i * 12.9898) * 40,
            Math.sin(i * 78.233) * 40,
            Math.sin(i * 39.346) * 40,
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

          blendedPos.lerpVectors(sourcePos, implodeTarget, morphFactor);
          blendedRot.slerpQuaternions(
            sourceRot,
            data.gridRotations[i],
            morphFactor,
          );

          let currentScale = sourceScale;
          currentScale *= Math.max(0.01, 1.0 - morphFactor * 0.99);

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

    case "eased": {
      const timeIncrement = 0.05;
      const loopDuration = Math.PI * 2;
      let progress;

      if (window.isExportingLoop) {
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

      if (isTransitioning && targetMesh) {
        const data = targetMesh.userData;

        if (
          !data.prevPositions ||
          !data.originalPositions ||
          !data.prevRotations ||
          !data.originalRotations
        )
          return;

        targetMesh.userData.freezeBackground = progress > 0.05;

        const blendedPos = new THREE.Vector3();
        const blendedRot = new THREE.Quaternion();
        const blendedScaleVec = new THREE.Vector3();
        const transformMatrix = new THREE.Matrix4();

        const baseMorphProgress =
          progress < 0.5
            ? 16 * Math.pow(progress, 5)
            : 1 - Math.pow(-2 * progress + 2, 5) / 2;

        for (let i = 0; i < targetMesh.count; i++) {
          let posA = data.prevPositions[i] || data.originalPositions[i];
          let scaleA =
            data.prevScales[i] !== undefined ? data.prevScales[i] : 0;
          let rotA = data.prevRotations[i] || data.originalRotations[i];

          const staggerOffset = Math.sin(i * 0.1) * 0.2;
          let dotProgress = Math.max(
            0,
            Math.min(1, baseMorphProgress + staggerOffset),
          );

          dotProgress =
            dotProgress < 0.5
              ? 2 * dotProgress * dotProgress
              : 1 - Math.pow(-2 * dotProgress + 2, 2) / 2;

          blendedPos.lerpVectors(posA, data.originalPositions[i], dotProgress);
          blendedRot.slerpQuaternions(
            rotA,
            data.originalRotations[i],
            dotProgress,
          );
          let currentScale = THREE.MathUtils.lerp(
            scaleA,
            data.originalScales[i],
            dotProgress,
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

        if (isTransitioning) {
          targetMesh.userData.freezeBackground = morphFactor > 0.05;
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
      if (isTransitioning && targetMesh) {
        const transitionFrames = 120;
        time += 1;
        const progress = Math.min(time / transitionFrames, 1.0);

        targetMesh.userData.freezeBackground = progress > 0.05;

        controls.rotateLeft(THREE.MathUtils.degToRad(1.5));

        const data = targetMesh.userData;

        if (
          !data.prevPositions ||
          !data.originalPositions ||
          !data.prevRotations ||
          !data.originalRotations
        )
          return;

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
        if (window.isExportingLoop) {
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
          // Unified standard: Manual incremental frame tracking instead of implicit autoRotate triggers
          controls.rotateLeft(0.00873);
        }
      }
      break;
  }
};

// --- 6. Loading Screen Setup ---
export function loadImageAnimation() {
  const imgCanvas = document.getElementById("imgLoadCanvas");
  if (!imgCanvas) return;

  const imgCTX = imgCanvas.getContext("2d");

  const img = new Image();
  img.onload = () => {
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
  img.src = "./src/assets/defaultImageTransparent.png";
}
