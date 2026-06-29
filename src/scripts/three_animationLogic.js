import * as THREE from "three";
import { scene, resetCameraView } from "./three_sceneLogic.js";
import { getActiveMesh } from "./three_gridLogic.js";

// === SETTINGS ===

const animSettings = {
  scramble: {
    transitionFrames: 240,
    loopDuration: 300,
    spreadXY: 150,
    spreadZ: 20,
    noiseSpeed: 0.05,
    rotationAmount: 0.01,
  },
  implode: {
    pauseNormal: 60,
    pauseImploded: 30,
    implodeTransition: 210,
    implodeStandard: 180,
    explodeTransition: 300,
    explodeStandard: 180,
    radius: 40,
  },
  eased: {
    timeIncrement: 0.05,
    totalDegrees: 360,
  },
  breakApart: {
    pauseNormal: 60,
    pauseExpanded: 30,
    explodeTransition: 210,
    explodeStandard: 390,
    implodeTransition: 300,
    implodeStandard: 120,
    cubeSize: 2500,
  },
  default: {
    transitionFrames: 120,
    transitionRotationDeg: 1.5,
    loopIncrement: 0.01,
    loopRotationRad: 0.00873,
  },
};

// === STATE ===

let activeType = null;
let isPaused = false;
let time = 0;
let cachedControls = null;

const buttonMapping = {
  default: "rotationAnimation",
  eased: "spinAnimation",
  breakApart: "breakApartAnimation",
  implode: "implodeAnimation",
  scramble: "scrambleAnimation",
};

// === HELPER FUNCTIONS ===

/**
 * Extracts coordinates for interpolation based on the current transition phase.
 */
const getMorphState = (data, i, usePrevious) => {
  if (usePrevious) {
    return {
      pos: data.prevPositions[i] || data.originalPositions[i],
      scale: data.prevScales[i] !== undefined ? data.prevScales[i] : 0,
      rot: data.prevRotations[i] || data.originalRotations[i],
    };
  }
  return {
    pos: data.originalPositions[i],
    scale: data.originalScales[i],
    rot: data.originalRotations[i],
  };
};

/**
 * Resets an instanced mesh to its original un-animated transformations.
 */
export const resetMeshTransforms = () => {
  const targetMesh = getActiveMesh();
  if (!targetMesh || !targetMesh.userData?.originalPositions) return;

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

/**
 * Updates UI styling for animation control buttons based on current state.
 */
export const updateButtonUI = () => {
  Object.entries(buttonMapping).forEach(([type, id]) => {
    const btn = document.getElementById(id);
    if (!btn) return;

    const icon = btn.querySelector("svg, i");
    if (!icon) return;

    const activeColorClass = "text-ApplyOrange";

    if (type === activeType) {
      icon.classList.add(activeColorClass);
      if (isPaused) {
        icon.classList.add("opacity-50");
      } else {
        icon.classList.remove("opacity-50");
      }
    } else {
      icon.classList.remove(activeColorClass, "opacity-50");
    }
  });
};

export const getAnimationState = () => ({ activeType, isPaused });

// === CONTROLS ===

/**
 * Switches the active animation type, handling play/pause toggles and resets.
 */
export const handleAnimationSwitch = (requestedType, forceRestart = false) => {
  if (activeType === requestedType && !forceRestart) {
    isPaused = !isPaused;
    updateButtonUI();
    return;
  }

  activeType = requestedType;
  isPaused = false;
  time = 0;

  if (typeof resetCameraView === "function") resetCameraView();
  resetMeshTransforms();
  updateButtonUI();
};

/**
 * Clears the current animation and brings the focus to a paused resting state.
 */
export const handleFocusToggle = () => {
  activeType = null;
  isPaused = true;
  time = 0;

  if (typeof resetCameraView === "function") resetCameraView();
  resetMeshTransforms();
  updateButtonUI();
};

/**
 * Resets the global animation timeline clock.
 */
export const resetAnimationTimeline = (controls) => {
  time = 0;
  if (typeof resetCameraView === "function") resetCameraView();
  if (controls) updateCameraAnimation(controls);
};

// === ANIMATION ROUTINES ===

const handleScrambleAnimation = (targetMesh, isTransitioning) => {
  const {
    transitionFrames,
    loopDuration,
    spreadXY,
    spreadZ,
    noiseSpeed,
    rotationAmount,
  } = animSettings.scramble;
  let progress = 0;

  if (window.isExportingLoop) {
    if (window.exportRotatedAccumulator === undefined)
      window.exportRotatedAccumulator = 0;
    if (!window.isAnimationLoopComplete) {
      time += 1;
      const targetFrames = isTransitioning ? transitionFrames : loopDuration;
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

  if (!targetMesh || !targetMesh.userData.originalPositions) return;

  const data = targetMesh.userData;
  if (isTransitioning)
    targetMesh.userData.freezeBackground = progress > 0.02 && progress < 0.98;

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
    // REFACTORED: Unified fetch for positional transition data
    const stateA = getMorphState(data, i, isTransitioning);
    const stateB = getMorphState(data, i, false);

    blendedPos.lerpVectors(stateA.pos, stateB.pos, easeInOutQuad);
    blendedRot.slerpQuaternions(stateA.rot, stateB.rot, easeInOutQuad);
    let currentScale = THREE.MathUtils.lerp(
      stateA.scale,
      stateB.scale,
      easeInOutQuad,
    );

    const noiseX = Math.sin(i * 12.9898 + time * noiseSpeed) * spreadXY;
    const noiseY = Math.sin(i * 78.233 + time * noiseSpeed) * spreadXY;
    const noiseZ = Math.sin(i * 39.346 + time * noiseSpeed) * spreadZ;

    blendedPos.x += noiseX * noiseAmp;
    blendedPos.y += noiseY * noiseAmp;
    blendedPos.z += noiseZ * noiseAmp;

    const randomQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        noiseX * rotationAmount,
        noiseY * rotationAmount,
        noiseZ * rotationAmount,
      ),
    );
    blendedRot.slerp(randomQuat, noiseAmp * 0.5);

    blendedScaleVec.set(currentScale, currentScale, currentScale);
    transformMatrix.compose(blendedPos, blendedRot, blendedScaleVec);
    targetMesh.setMatrixAt(i, transformMatrix);
  }

  if (isTransitioning && progress >= 1.0)
    window.dispatchEvent(new CustomEvent("gifTransitionComplete"));
  targetMesh.instanceMatrix.needsUpdate = true;
};

const handleImplodeAnimation = (targetMesh, isTransitioning) => {
  const {
    pauseNormal,
    pauseImploded,
    implodeTransition,
    implodeStandard,
    explodeTransition,
    explodeStandard,
    radius,
  } = animSettings.implode;
  const implodeFrames = isTransitioning ? implodeTransition : implodeStandard;
  const explodeFrames = isTransitioning ? explodeTransition : explodeStandard;
  const loopDuration =
    pauseNormal + implodeFrames + pauseImploded + explodeFrames;

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

    if (currentFrame < pauseNormal) {
      morphFactor = 0;
    } else if (currentFrame < pauseNormal + implodeFrames) {
      const t = (currentFrame - pauseNormal) / implodeFrames;
      morphFactor = easeInQuint(t);
    } else if (currentFrame < pauseNormal + implodeFrames + pauseImploded) {
      morphFactor = 1.0;
      isSecondHalf = true;
    } else {
      const t =
        (currentFrame - (pauseNormal + implodeFrames + pauseImploded)) /
        explodeFrames;
      morphFactor = 1.0 - easeOutExpo(t);
      isSecondHalf = true;
    }

    if (isTransitioning)
      targetMesh.userData.freezeBackground = morphFactor > 0.05;

    const blendedPos = new THREE.Vector3();
    const blendedRot = new THREE.Quaternion();
    const blendedScaleVec = new THREE.Vector3();
    const transformMatrix = new THREE.Matrix4();
    const implodeTarget = new THREE.Vector3();
    const data = targetMesh.userData;

    for (let i = 0; i < targetMesh.count; i++) {
      implodeTarget.set(
        Math.sin(i * 12.9898) * radius,
        Math.sin(i * 78.233) * radius,
        Math.sin(i * 39.346) * radius,
      );

      // REFACTORED: Unified fetch for positional transition data
      const sourceState = getMorphState(
        data,
        i,
        isTransitioning && !isSecondHalf,
      );

      blendedPos.lerpVectors(sourceState.pos, implodeTarget, morphFactor);
      blendedRot.slerpQuaternions(
        sourceState.rot,
        data.gridRotations[i],
        morphFactor,
      );

      let currentScale =
        sourceState.scale * Math.max(0.01, 1.0 - morphFactor * 0.99);

      blendedScaleVec.set(currentScale, currentScale, currentScale);
      transformMatrix.compose(blendedPos, blendedRot, blendedScaleVec);
      targetMesh.setMatrixAt(i, transformMatrix);
    }

    if (isTransitioning && currentFrame === loopDuration - 1) {
      window.dispatchEvent(new CustomEvent("gifTransitionComplete"));
    }

    targetMesh.instanceMatrix.needsUpdate = true;
  }
};

const handleEasedAnimation = (targetMesh, isTransitioning, controls) => {
  const { timeIncrement, totalDegrees } = animSettings.eased;
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
    const deltaToRotate = targetTotalRotation - window.exportRotatedAccumulator;
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
      // REFACTORED: Unified fetch for positional transition data
      const stateA = getMorphState(data, i, true);
      const stateB = getMorphState(data, i, false);

      const staggerOffset = Math.sin(i * 0.1) * 0.2;
      let dotProgress = Math.max(
        0,
        Math.min(1, baseMorphProgress + staggerOffset),
      );
      dotProgress =
        dotProgress < 0.5
          ? 2 * dotProgress * dotProgress
          : 1 - Math.pow(-2 * dotProgress + 2, 2) / 2;

      blendedPos.lerpVectors(stateA.pos, stateB.pos, dotProgress);
      blendedRot.slerpQuaternions(stateA.rot, stateB.rot, dotProgress);
      let currentScale = THREE.MathUtils.lerp(
        stateA.scale,
        stateB.scale,
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
};

const handleBreakApartAnimation = (targetMesh, isTransitioning) => {
  const {
    pauseNormal,
    pauseExpanded,
    explodeTransition,
    explodeStandard,
    implodeTransition,
    implodeStandard,
    cubeSize,
  } = animSettings.breakApart;
  const explodeFrames = isTransitioning ? explodeTransition : explodeStandard;
  const implodeFrames = isTransitioning ? implodeTransition : implodeStandard;
  const loopDuration =
    pauseNormal + explodeFrames + pauseExpanded + implodeFrames;

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

    if (currentFrame < pauseNormal) {
      morphFactor = 0;
    } else if (currentFrame < pauseNormal + explodeFrames) {
      const t = (currentFrame - pauseNormal) / explodeFrames;
      morphFactor = easeOutQuint(t);
    } else if (currentFrame < pauseNormal + explodeFrames + pauseExpanded) {
      morphFactor = 1.0;
      isSecondHalf = true;
    } else {
      const t =
        (currentFrame - (pauseNormal + explodeFrames + pauseExpanded)) /
        implodeFrames;
      morphFactor = 1.0 - easeInOutCubic(t);
      isSecondHalf = true;
    }

    if (isTransitioning)
      targetMesh.userData.freezeBackground = morphFactor > 0.05;

    const blendedPos = new THREE.Vector3();
    const blendedRot = new THREE.Quaternion();
    const blendedScaleVec = new THREE.Vector3();
    const transformMatrix = new THREE.Matrix4();
    const scatterTarget = new THREE.Vector3();
    const data = targetMesh.userData;

    for (let i = 0; i < targetMesh.count; i++) {
      scatterTarget.set(
        ((Math.sin(i * 12.9898) * 43758.5453) % 1) * cubeSize,
        ((Math.sin(i * 78.233) * 43758.5453) % 1) * cubeSize,
        ((Math.sin(i * 39.346) * 43758.5453) % 1) * cubeSize,
      );

      // REFACTORED: Unified fetch for positional transition data
      const sourceState = getMorphState(
        data,
        i,
        isTransitioning && !isSecondHalf,
      );

      blendedPos.lerpVectors(sourceState.pos, scatterTarget, morphFactor);
      blendedRot.slerpQuaternions(
        sourceState.rot,
        data.gridRotations[i],
        morphFactor,
      );

      let currentScale = THREE.MathUtils.lerp(
        sourceState.scale,
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
};

const handleDefaultAnimation = (targetMesh, isTransitioning, controls) => {
  const {
    transitionFrames,
    transitionRotationDeg,
    loopIncrement,
    loopRotationRad,
  } = animSettings.default;

  if (isTransitioning && targetMesh) {
    time += 1;
    const progress = Math.min(time / transitionFrames, 1.0);

    targetMesh.userData.freezeBackground = progress > 0.05;
    controls.rotateLeft(THREE.MathUtils.degToRad(transitionRotationDeg));

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
      // REFACTORED: Unified fetch for positional transition data
      const stateA = getMorphState(data, i, true);
      const stateB = getMorphState(data, i, false);

      blendedPos.lerpVectors(stateA.pos, stateB.pos, easeInOutSine);
      blendedRot.slerpQuaternions(stateA.rot, stateB.rot, easeInOutSine);
      let currentScale = THREE.MathUtils.lerp(
        stateA.scale,
        stateB.scale,
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
        time += loopIncrement;
        let progress = time / (Math.PI * 2);

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
      controls.rotateLeft(loopRotationRad);
    }
  }
};

/**
 * Primary router for triggering the active animation logic block.
 */
export const updateCameraAnimation = (controls) => {
  if (controls && !cachedControls) {
    cachedControls = controls;
    if (typeof cachedControls.saveState === "function")
      cachedControls.saveState();
  }

  if (isPaused || !activeType) return;

  const targetMesh = getActiveMesh();
  const isTransitioning = targetMesh && targetMesh.userData.isTransitioning;

  switch (activeType) {
    case "scramble":
      handleScrambleAnimation(targetMesh, isTransitioning);
      break;
    case "default":
      handleDefaultAnimation(targetMesh, isTransitioning, controls);
      break;
    case "implode":
      handleImplodeAnimation(targetMesh, isTransitioning);
      break;
    case "eased":
      handleEasedAnimation(targetMesh, isTransitioning, controls);
      break;
    case "breakApart":
      handleBreakApartAnimation(targetMesh, isTransitioning);
      break;
  }
};

/**
 * Centers and renders a static placeholder image cleanly onto a canvas.
 */
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
