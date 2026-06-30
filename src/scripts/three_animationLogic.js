import * as THREE from "three";
import { scene, resetCameraView } from "./three_sceneLogic.js";
import { getActiveMesh } from "./three_gridLogic.js";
import {
  easeInOutQuad,
  easeInOutCubic,
  easeInOutQuintic,
  easeInOutSine,
  easeInQuint,
  easeOutQuint,
  easeOutExpo,
  pseudoRandom3,
  pseudoRandomFrac3,
} from "./animation_EasingLogic.js";

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
    timeIncrement: 0.06,
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
    loopIncrement: 0.01,
    loopRotationRad: 0.00873,
  },
};

let activeType = null;
let isPaused = false;
let time = 0;

const buttonMapping = {
  default: "rotationAnimation",
  eased: "spinAnimation",
  breakApart: "breakApartAnimation",
  implode: "implodeAnimation",
  scramble: "scrambleAnimation",
};

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

const runInstanceMorph = (targetMesh, computeInstance) => {
  const blendedPos = new THREE.Vector3();
  const blendedRot = new THREE.Quaternion();
  const blendedScaleVec = new THREE.Vector3();
  const transformMatrix = new THREE.Matrix4();

  for (let i = 0; i < targetMesh.count; i++) {
    const scale = computeInstance(i, blendedPos, blendedRot);
    blendedScaleVec.set(scale, scale, scale);
    transformMatrix.compose(blendedPos, blendedRot, blendedScaleVec);
    targetMesh.setMatrixAt(i, transformMatrix);
  }

  targetMesh.instanceMatrix.needsUpdate = true;
};

const advanceLoopFrame = (loopDuration) => {
  if (window.isExportingLoop) {
    if (!window.isAnimationLoopComplete) {
      time += 1;
      if (time >= loopDuration) window.isAnimationLoopComplete = true;
    }
  } else {
    time += 1;
  }
};

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

export const handleAnimationSwitch = (requestedType, forceRestart = false) => {
  if (activeType === requestedType && !forceRestart) {
    isPaused = !isPaused;
    updateButtonUI();
    return;
  }

  activeType = requestedType;
  isPaused = false;
  time = 0;

  resetCameraView();
  resetMeshTransforms();
  updateButtonUI();
};

export const handleFocusToggle = () => {
  activeType = null;
  isPaused = true;
  time = 0;

  resetCameraView();
  resetMeshTransforms();
  updateButtonUI();
};

export const resetAnimationTimeline = () => {
  time = 0;
  resetCameraView();
};

const handleScrambleAnimation = (targetMesh, isTransitioning) => {
  const {
    transitionFrames,
    loopDuration,
    spreadXY,
    spreadZ,
    noiseSpeed,
    rotationAmount,
  } = animSettings.scramble;
  const targetFrames = isTransitioning ? transitionFrames : loopDuration;
  let progress;

  if (window.isExportingLoop) {
    const wasComplete = window.isAnimationLoopComplete;
    advanceLoopFrame(targetFrames);
    progress = wasComplete ? 1.0 : time / targetFrames;
  } else {
    advanceLoopFrame(targetFrames);
    progress = isTransitioning
      ? Math.min(time / targetFrames, 1.0)
      : (time % targetFrames) / targetFrames;
  }

  if (!targetMesh || !targetMesh.userData.originalPositions) return;

  const data = targetMesh.userData;
  const eased = easeInOutQuad(progress);
  const noiseAmp = Math.sin(eased * Math.PI);

  runInstanceMorph(targetMesh, (i, pos, rot) => {
    const stateA = getMorphState(data, i, isTransitioning);
    const stateB = getMorphState(data, i, false);

    pos.lerpVectors(stateA.pos, stateB.pos, eased);
    rot.slerpQuaternions(stateA.rot, stateB.rot, eased);
    let currentScale = THREE.MathUtils.lerp(stateA.scale, stateB.scale, eased);

    const {
      x: noiseX0,
      y: noiseY0,
      z: noiseZ0,
    } = pseudoRandom3(i, time * noiseSpeed);
    const noiseX = noiseX0 * spreadXY;
    const noiseY = noiseY0 * spreadXY;
    const noiseZ = noiseZ0 * spreadZ;

    pos.x += noiseX * noiseAmp;
    pos.y += noiseY * noiseAmp;
    pos.z += noiseZ * noiseAmp;

    const randomQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        noiseX * rotationAmount,
        noiseY * rotationAmount,
        noiseZ * rotationAmount,
      ),
    );
    rot.slerp(randomQuat, noiseAmp * 0.5);

    return currentScale;
  });

  if (isTransitioning && progress >= 1.0)
    window.dispatchEvent(new CustomEvent("gifTransitionComplete"));
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

  advanceLoopFrame(loopDuration);

  if (targetMesh && targetMesh.userData.originalPositions) {
    const currentFrame = time % loopDuration;
    let morphFactor = 0;
    let isSecondHalf = false;

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

    const data = targetMesh.userData;
    const implodeTarget = new THREE.Vector3();

    runInstanceMorph(targetMesh, (i, pos, rot) => {
      const { x, y, z } = pseudoRandom3(i);
      implodeTarget.set(x * radius, y * radius, z * radius);

      const sourceState = getMorphState(
        data,
        i,
        isTransitioning && !isSecondHalf,
      );

      pos.lerpVectors(sourceState.pos, implodeTarget, morphFactor);
      rot.slerpQuaternions(sourceState.rot, data.gridRotations[i], morphFactor);

      return sourceState.scale * Math.max(0.01, 1.0 - morphFactor * 0.99);
    });

    if (isTransitioning && currentFrame === loopDuration - 1) {
      window.dispatchEvent(new CustomEvent("gifTransitionComplete"));
    }
  }
};

const handleEasedAnimation = (targetMesh, isTransitioning) => {
  const { timeIncrement } = animSettings.eased;
  const loopDuration = Math.PI * 2;
  let progress;

  if (window.isExportingLoop) {
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
  } else {
    time += timeIncrement;
    progress = isTransitioning
      ? Math.min(time / loopDuration, 1.0)
      : (time % loopDuration) / loopDuration;
  }

  if (targetMesh) {
    const data = targetMesh.userData;
    if (!data.originalPositions || !data.originalRotations) return;

    const baseMorphProgress = easeInOutQuintic(progress);
    const rotationAngle = baseMorphProgress * Math.PI * 2;
    const spinQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      rotationAngle,
    );

    // Prevent visual pops from -1 W quaternion flips at exactly 360 degrees
    if (progress >= 1.0 || progress === 0.0) {
      spinQuat.identity();
    }

    runInstanceMorph(targetMesh, (i, pos, rot) => {
      const stateA = getMorphState(data, i, isTransitioning);
      const stateB = getMorphState(data, i, false);

      if (isTransitioning) {
        const maxStagger = 0.2;
        const staggerDelay = ((i % 10) / 9) * maxStagger;
        let dotProgress =
          progress < 1.0 ? (progress - staggerDelay) / (1.0 - maxStagger) : 1.0;
        dotProgress = THREE.MathUtils.clamp(dotProgress, 0, 1);
        dotProgress = easeInOutQuad(dotProgress);

        pos
          .lerpVectors(stateA.pos, stateB.pos, dotProgress)
          .applyQuaternion(spinQuat);
        rot
          .slerpQuaternions(stateA.rot, stateB.rot, dotProgress)
          .premultiply(spinQuat);
        return THREE.MathUtils.lerp(stateA.scale, stateB.scale, dotProgress);
      } else {
        pos.copy(stateB.pos).applyQuaternion(spinQuat);
        rot.copy(stateB.rot).premultiply(spinQuat);
        return stateB.scale;
      }
    });

    if (isTransitioning && progress >= 1.0)
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

  advanceLoopFrame(loopDuration);

  if (targetMesh && targetMesh.userData.originalPositions) {
    const currentFrame = time % loopDuration;
    let morphFactor = 0;
    let isSecondHalf = false;

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

    const data = targetMesh.userData;
    const scatterTarget = new THREE.Vector3();

    runInstanceMorph(targetMesh, (i, pos, rot) => {
      const { x, y, z } = pseudoRandomFrac3(i);
      scatterTarget.set(x * cubeSize, y * cubeSize, z * cubeSize);

      const sourceState = getMorphState(
        data,
        i,
        isTransitioning && !isSecondHalf,
      );

      pos.lerpVectors(sourceState.pos, scatterTarget, morphFactor);
      rot.slerpQuaternions(sourceState.rot, data.gridRotations[i], morphFactor);

      let currentScale = THREE.MathUtils.lerp(
        sourceState.scale,
        data.gridScales[i],
        morphFactor,
      );
      const zNormalized = (pos.z + cubeSize) / (cubeSize * 2);
      const zMultiplier = 0.2 + zNormalized * 3.8;
      const finalScaleMultiplier = 1.0 + (zMultiplier - 1.0) * morphFactor;

      return currentScale * Math.max(0.01, finalScaleMultiplier);
    });

    if (isTransitioning && currentFrame === loopDuration - 1) {
      window.dispatchEvent(new CustomEvent("gifTransitionComplete"));
    }
  }
};

const handleDefaultAnimation = (targetMesh, isTransitioning) => {
  const { transitionFrames, loopIncrement, loopRotationRad } =
    animSettings.default;

  if (targetMesh) {
    const data = targetMesh.userData;
    if (!data.originalPositions || !data.originalRotations) return;

    let rotationAngle = 0;

    if (isTransitioning) {
      time += 1;
      const progress = Math.min(time / transitionFrames, 1.0);
      const eased = easeInOutSine(progress);
      rotationAngle = progress * (transitionFrames * loopRotationRad);
      const spinQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        rotationAngle,
      );

      runInstanceMorph(targetMesh, (i, pos, rot) => {
        const stateA = getMorphState(data, i, true);
        const stateB = getMorphState(data, i, false);

        pos
          .lerpVectors(stateA.pos, stateB.pos, eased)
          .applyQuaternion(spinQuat);
        rot
          .slerpQuaternions(stateA.rot, stateB.rot, eased)
          .premultiply(spinQuat);
        return THREE.MathUtils.lerp(stateA.scale, stateB.scale, eased);
      });

      if (progress >= 1.0)
        window.dispatchEvent(new CustomEvent("gifTransitionComplete"));
    } else {
      if (window.isExportingLoop) {
        if (!window.isAnimationLoopComplete) {
          time += loopIncrement;
          let progress = time / (Math.PI * 2);
          if (progress >= 1.0) {
            progress = 1.0;
            window.isAnimationLoopComplete = true;
          }
          rotationAngle = progress * Math.PI * 2;
        } else {
          rotationAngle = Math.PI * 2;
        }
      } else {
        time += 1;
        rotationAngle = time * loopRotationRad;
      }

      const spinQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        rotationAngle,
      );

      runInstanceMorph(targetMesh, (i, pos, rot) => {
        const stateB = getMorphState(data, i, false);
        pos.copy(stateB.pos).applyQuaternion(spinQuat);
        rot.copy(stateB.rot).premultiply(spinQuat);
        return stateB.scale;
      });
    }
  }
};

export const updateCameraAnimation = () => {
  if (isPaused || !activeType) return;

  const targetMesh = getActiveMesh();
  const isTransitioning = targetMesh && targetMesh.userData.isTransitioning;

  switch (activeType) {
    case "scramble":
      handleScrambleAnimation(targetMesh, isTransitioning);
      break;
    case "default":
      handleDefaultAnimation(targetMesh, isTransitioning);
      break;
    case "implode":
      handleImplodeAnimation(targetMesh, isTransitioning);
      break;
    case "eased":
      handleEasedAnimation(targetMesh, isTransitioning);
      break;
    case "breakApart":
      handleBreakApartAnimation(targetMesh, isTransitioning);
      break;
  }
};

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

export const haltAnimationKeepingState = () => {
  activeType = null;
  isPaused = true;
  time = 0;
  updateButtonUI();
};
