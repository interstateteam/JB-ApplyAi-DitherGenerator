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
      transitionFrames: 300, // 10s transition when dropping new images/GIFs
      spinDuration: 600,     // 600 frames (~20 seconds) per 180-degree turn for an ultra-slow sweep
      pauseDuration: 0,      // 0 frames for continuous motion without dead stops
    },
  spinExplode: {
      pauseNormal: 45,        // 1.5s pause on solid shape at start
      spinDuration: 180,      // 6s total spin time
      explodeDelay: 20,       // Triggers much earlier (~0.6s into spin) for massive overlap
      explodeDuration: 180,   // 6s explode time (finishes at frame 200)
      pauseExpanded: 60,      // Reduced by 1 second (was 90, now 60 frames / 2s pause)
      cubeSize: 2500,         // Scatter radius matching breakApart
      rotations: 1.5,         // Halved from 3 down to 1.5 turns for a much slower, calmer spin
      transitionFrames: 200,  // Matches total action window (20 + 180 = 200)
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
  spinExplode: "spinExplodeAnimation",
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
  const { transitionFrames, spinDuration } = animSettings.default;

  // Two distinct 180° sweeps ensure a slow-down every half-turn
  const totalLoop = spinDuration * 2;

  if (targetMesh) {
    const data = targetMesh.userData;
    if (!data.originalPositions || !data.originalRotations) return;

    let rotationAngle = 0;

    if (isTransitioning) {
      time += 1;
      const progress = Math.min(time / transitionFrames, 1.0);

      // Gentler Sine easing prevents the mid-transition velocity whip
      const blendFactor = 0.90;
      const eased = easeInOutSine(progress) * blendFactor + progress * (1.0 - blendFactor);

      rotationAngle = eased * (Math.PI * 2);
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
      advanceLoopFrame(totalLoop);
      const currentFrame = time % totalLoop;

      // 90% Sine Easing + 10% Linear gives an "almost stop" at 180° and 360°
      // while keeping a smooth, consistent cruising speed through the middle!
      const blendFactor = 0.90;

      if (currentFrame < spinDuration) {
        // First Half-Turn: 0° -> 180° (0 to PI radians)
        const t = currentFrame / spinDuration;
        const smoothT = easeInOutSine(t) * blendFactor + t * (1.0 - blendFactor);
        rotationAngle = smoothT * Math.PI;
      } else {
        // Second Half-Turn: 180° -> 360° (PI to 2*PI radians)
        const frameInSecondHalf = currentFrame - spinDuration;
        const t = frameInSecondHalf / spinDuration;
        const smoothT = easeInOutSine(t) * blendFactor + t * (1.0 - blendFactor);
        rotationAngle = Math.PI + (smoothT * Math.PI);
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

const handleSpinExplodeAnimation = (targetMesh, isTransitioning) => {
  const {
    pauseNormal,
    spinDuration,
    explodeDelay,
    explodeDuration,
    pauseExpanded,
    cubeSize,
    rotations,
    transitionFrames,
  } = animSettings.spinExplode;

  // Dynamically calculate the end of the action window (20 + 180 = 200 frames)
  const totalActionFrames = Math.max(spinDuration, explodeDelay + explodeDuration);

  const loopDuration = isTransitioning
    ? transitionFrames
    : pauseNormal + totalActionFrames + pauseExpanded + totalActionFrames;

  advanceLoopFrame(loopDuration);

  if (!targetMesh || !targetMesh.userData.originalPositions) return;

  const currentFrame = time % loopDuration;
  let spinFactor = 0;
  let explodeFactor = 0;
  let isSecondHalf = false;

  if (isTransitioning) {
    const progress = Math.min(time / transitionFrames, 1.0);
    const spinProgress = Math.min(progress * (transitionFrames / spinDuration), 1.0);
    spinFactor = easeInOutQuintic(spinProgress);

    const expProgress = Math.max(0, (progress * transitionFrames - explodeDelay) / explodeDuration);
    explodeFactor = easeInOutQuintic(Math.min(expProgress, 1.0));
  } else {
    if (currentFrame < pauseNormal) {
      // Phase 1: Solid shape pause
      spinFactor = 0;
      explodeFactor = 0;
    } else if (currentFrame < pauseNormal + totalActionFrames) {
      // Phase 2: Spin starts immediately; explode waits only 20 frames (160 frames of simultaneous overlap)
      const elapsed = currentFrame - pauseNormal;

      const spinProgress = Math.min(elapsed / spinDuration, 1.0);
      spinFactor = easeInOutQuintic(spinProgress);

      const expElapsed = elapsed - explodeDelay;
      const expProgress = expElapsed <= 0 ? 0 : Math.min(expElapsed / explodeDuration, 1.0);
      explodeFactor = easeInOutQuintic(expProgress);
    } else if (currentFrame < pauseNormal + totalActionFrames + pauseExpanded) {
      // Phase 3: Frozen in exploded state (now 1 second shorter)
      spinFactor = 1.0;
      explodeFactor = 1.0;
      isSecondHalf = true;
    } else {
      // Phase 4: Mirrored reverse (Exploding grid condenses first, rotation spins back as it reassembles)
      const elapsed = currentFrame - (pauseNormal + totalActionFrames + pauseExpanded);
      const remaining = totalActionFrames - elapsed;

      const spinProgress = Math.min(Math.max(0, remaining / spinDuration), 1.0);
      spinFactor = easeInOutQuintic(spinProgress);

      const expElapsed = remaining - explodeDelay;
      const expProgress = expElapsed <= 0 ? 0 : Math.min(expElapsed / explodeDuration, 1.0);
      explodeFactor = easeInOutQuintic(expProgress);

      isSecondHalf = true;
    }
  }

  const data = targetMesh.userData;
  const scatterTarget = new THREE.Vector3();

  const totalAngle = spinFactor * Math.PI * 2 * rotations;
  const spinQuat = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    totalAngle
  );

  runInstanceMorph(targetMesh, (i, pos, rot) => {
    const { x, y, z } = pseudoRandomFrac3(i);
    scatterTarget.set(x * cubeSize, y * cubeSize, z * cubeSize);

    const sourceState = getMorphState(
      data,
      i,
      isTransitioning && !isSecondHalf,
    );

    pos.lerpVectors(sourceState.pos, scatterTarget, explodeFactor);
    rot.slerpQuaternions(sourceState.rot, data.gridRotations[i], explodeFactor);

    let currentScale = THREE.MathUtils.lerp(
      sourceState.scale,
      data.gridScales[i],
      explodeFactor
    );
    const zNormalized = (pos.z + cubeSize) / (cubeSize * 2);
    const zMultiplier = 0.2 + zNormalized * 3.8;
    const finalScaleMultiplier = 1.0 + (zMultiplier - 1.0) * explodeFactor;
    currentScale *= Math.max(0.01, finalScaleMultiplier);

    pos.applyQuaternion(spinQuat);
    rot.premultiply(spinQuat);

    return currentScale;
  });

  if (isTransitioning && currentFrame === loopDuration - 1) {
    window.dispatchEvent(new CustomEvent("gifTransitionComplete"));
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
    case "spinExplode":
      handleSpinExplodeAnimation(targetMesh, isTransitioning);
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
