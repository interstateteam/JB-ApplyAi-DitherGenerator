import * as THREE from "three";
import { scene, resetCameraView, mouseRay } from "./three_sceneLogic.js";
import { getActiveMesh } from "./three_gridLogic.js";
import {
  easeInOutQuad,
  easeInOutCubic,
  easeInOutQuintic,
  easeInOutSine,
  easeInQuint,
  easeOutQuint,
  easeOutExpo,
} from "./animation_EasingLogic.js";

// --- PERFORMANCE OPTIMIZATION ---
// Pre-calculate 10,000 random 3D vectors.
// Uses an Irwin-Hall distribution for organic, Gaussian-like feathered edges
// rather than uniform "blocky" noise.
const SCRAMBLE_NOISE = new Float32Array(30000);
for (let i = 0; i < 30000; i++) {
  // Summing 3 randoms yields a bell curve between -1.5 and 1.5.
  // Multiplying by 0.66 scales the peak roughly back to a -1.0 to 1.0 range.
  SCRAMBLE_NOISE[i] = ((Math.random() + Math.random() + Math.random()) - 1.5) * 0.66;
}

const SCRAMBLE_QUATS = [];
for (let i = 0; i < 10000; i++) {
  const u1 = Math.random();
  const u2 = Math.random();
  const u3 = Math.random();
  const sqrt1u1 = Math.sqrt(1 - u1);
  const sqrtu1 = Math.sqrt(u1);
  SCRAMBLE_QUATS.push(new THREE.Quaternion(
    sqrt1u1 * Math.sin(2 * Math.PI * u2),
    sqrt1u1 * Math.cos(2 * Math.PI * u2),
    sqrtu1 * Math.sin(2 * Math.PI * u3),
    sqrtu1 * Math.cos(2 * Math.PI * u3)
  ));
}

const FAST_SIN = new Float32Array(8192);
for (let i = 0; i < 8192; i++) {
  FAST_SIN[i] = Math.sin((i / 8192) * Math.PI * 2);
}
const PI2_INV = 1.0 / (Math.PI * 2);

const animSettings = {
  scramble: {
    transitionFrames: 120,
    spinDuration: 240,
    twistAmount: 0.015,     // How tightly the grid winds up into a spiral
    scatterAmount: 40,      // Outward push to break the grid structure
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
    pauseNormal: 30,
    pauseExpanded: 30,
    explodeTransition: 150,
    explodeStandard: 160,
    implodeTransition: 150,
    implodeStandard: 80,
    cubeSize: 2500,
  },
  default: {
      transitionFrames: 120,
      spinDuration: 240,
      pauseDuration: 0,
      zDepthVolume: 15, // Reduced from 60! Prevents the animation from stretching the 3D mesh during the turn.
    },
  spinExplode: {
    pauseNormal: 45,
    spinDuration: 180,
    explodeDelay: 20,
    explodeDuration: 180,
    pauseExpanded: 60,
    cubeSize: 2500,
    rotations: 1.5,
    transitionFrames: 200,
  },
};

let activeType = null;
let isPaused = false;
let time = 0;
let needsStaticReset = false;

const buttonMapping = {
  default: "rotationAnimation",
  eased: "spinAnimation",
  breakApart: "breakApartAnimation",
  implode: "implodeAnimation",
  scramble: "scrambleAnimation",
  spinExplode: "spinExplodeAnimation",
};

// --- REUSABLE VERTEX HELPERS ---

const applySwarmWobble = (pos, i, currentTime, speed = 0.025, amp = 4.5, intensity = 1.0, zScatter = 0) => {
  if (intensity <= 0.001) return;

  const phase = i * 0.618;

  pos.x += Math.sin(currentTime * speed + phase) * amp * intensity;
  pos.y += Math.cos(currentTime * (speed * 0.8) + phase * 1.4) * amp * intensity;

  // Only apply gentle organic noise on Z during the turn
  const rIdx = (i % 10000) * 3;
  const volumetricZ = SCRAMBLE_NOISE[rIdx + 2] * zScatter;

  pos.z += (Math.sin(currentTime * (speed * 1.2) + phase * 0.8) * amp + volumetricZ) * intensity;
};

const PUSH_RADIUS = 340;
const PUSH_RADIUS_SQ = PUSH_RADIUS * PUSH_RADIUS;
const PUSH_STRENGTH = 14;

const applyMouseRepulsion = (pos, currentScale, i = 0) => {
  const O = mouseRay.origin;
  if (O.x > 90000) return currentScale;

  const D = mouseRay.direction;

  const vx = pos.x - O.x;
  const vy = pos.y - O.y;
  const vz = pos.z - O.z;

  const t = vx * D.x + vy * D.y + vz * D.z;

  const cx = O.x + t * D.x;
  const cy = O.y + t * D.y;
  const cz = O.z + t * D.z;

  const dx = pos.x - cx;
  const dy = pos.y - cy;
  const dz = pos.z - cz;

  const distSq = dx * dx + dy * dy + dz * dz;

  if (distSq < PUSH_RADIUS_SQ && distSq > 0.0001) {
    const dist = Math.sqrt(distSq);

    const normalizedDist = dist / PUSH_RADIUS;
    const steepFalloff = Math.pow(1.0 - normalizedDist, 5);
    const coreDamping = Math.min(dist / 35.0, 1.0);
    const randomMult = Math.abs(Math.sin(i * 91.3458) * 47453.5453) % 1;

    const totalForce = steepFalloff * coreDamping * randomMult * PUSH_STRENGTH;

    pos.x += (dx / dist) * totalForce;
    pos.y += (dy / dist) * totalForce;
    pos.z += (dz / dist) * totalForce;
  }

  return currentScale;
};

// --- CORE PIPELINE ---

const getMeshPivot = (targetMesh) => {
  if (targetMesh.userData.pivot) return targetMesh.userData.pivot;

  const data = targetMesh.userData;
  const pivot = new THREE.Vector3();
  let activeCount = 0;

  for (let i = 0; i < targetMesh.count; i++) {
    if (data.activeInstances && data.activeInstances[i] === 0) continue;
    pivot.add(data.originalPositions[i]);
    activeCount++;
  }

  if (activeCount > 0) pivot.divideScalar(activeCount);
  targetMesh.userData.pivot = pivot;
  return pivot;
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

  targetMesh.userData.pivot = null;

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

// --- ANIMATION HANDLERS ---

const handleStaticAnimation = (targetMesh) => {
  const data = targetMesh.userData;
  if (!data || !data.originalPositions) return;

  if (mouseRay.origin.x > 90000) {
    if (needsStaticReset) {
      resetMeshTransforms();
      needsStaticReset = false;
    }
    return;
  }

  needsStaticReset = true;

  runInstanceMorph(targetMesh, (i, pos, rot) => {
    pos.copy(data.originalPositions[i]);
    rot.copy(data.originalRotations[i]);
    return applyMouseRepulsion(pos, data.originalScales[i], i);
  });
};

const handleScrambleAnimation = (targetMesh, isTransitioning) => {
  const { transitionFrames, spinDuration, twistAmount, scatterAmount } = animSettings.scramble;
  const totalLoop = spinDuration * 2;

  if (!targetMesh || !targetMesh.userData.originalPositions) return;

  let rotationAngle = 0;
  const pivot = getMeshPivot(targetMesh);
  const data = targetMesh.userData;

  if (isTransitioning) {
    time += 1;
    const progress = Math.min(time / transitionFrames, 1.0);
    const blendFactor = 0.90;
    const eased = easeInOutSine(progress) * blendFactor + progress * (1.0 - blendFactor);

    rotationAngle = eased * (Math.PI * 2);
    const spinQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationAngle);

    const noiseAmp = Math.max(0, (1.0 - progress) * 0.5);
    const t = noiseAmp * 0.8;
    const invT = 1.0 - t;

    runInstanceMorph(targetMesh, (i, pos, rot) => {
      const origPos = data.originalPositions[i];
      const origRot = data.originalRotations[i];
      const origScale = data.originalScales[i];

      const prevPos = data.prevPositions ? (data.prevPositions[i] || origPos) : origPos;
      const prevRot = data.prevRotations ? (data.prevRotations[i] || origRot) : origRot;
      const prevScale = data.prevScales && data.prevScales[i] !== undefined ? data.prevScales[i] : 0;

      pos.lerpVectors(prevPos, origPos, eased);

      if (noiseAmp > 0.001) {
        const rIdx = (i % 10000) * 3;
        const dy = pos.y - pivot.y;
        const twistAngle = (dy * twistAmount + SCRAMBLE_NOISE[rIdx] * 1.5) * noiseAmp;

        if (Math.abs(twistAngle) > 0.001) {
          // --- OPTIMIZATION: Fast Trig Lookup ---
          let normAngle = (twistAngle * PI2_INV) % 1.0;
          if (normAngle < 0) normAngle += 1.0;
          const sinIdx = (normAngle * 8192) | 0;
          const cosIdx = (sinIdx + 2048) % 8192;

          const sinT = FAST_SIN[sinIdx];
          const cosT = FAST_SIN[cosIdx];

          const dx = pos.x - pivot.x;
          const dz = pos.z - pivot.z;
          pos.x = pivot.x + (dx * cosT - dz * sinT);
          pos.z = pivot.z + (dx * sinT + dz * cosT);

          pos.x += SCRAMBLE_NOISE[rIdx] * scatterAmount * noiseAmp;
          pos.y += SCRAMBLE_NOISE[rIdx + 1] * scatterAmount * noiseAmp;
          pos.z += SCRAMBLE_NOISE[rIdx + 2] * scatterAmount * noiseAmp;
        }

        // --- OPTIMIZATION: Inline NLERP (Normalized Linear Interpolation) ---
        const q2 = SCRAMBLE_QUATS[i % 10000];
        const dot = prevRot.x * q2.x + prevRot.y * q2.y + prevRot.z * q2.z + prevRot.w * q2.w;
        const sign = dot < 0 ? -1 : 1;

        rot.x = prevRot.x * invT + q2.x * t * sign;
        rot.y = prevRot.y * invT + q2.y * t * sign;
        rot.z = prevRot.z * invT + q2.z * t * sign;
        rot.w = prevRot.w * invT + q2.w * t * sign;

        const lenSq = rot.x * rot.x + rot.y * rot.y + rot.z * rot.z + rot.w * rot.w;
        if (lenSq > 0.000001) {
          const invLen = 1.0 / Math.sqrt(lenSq);
          rot.x *= invLen;
          rot.y *= invLen;
          rot.z *= invLen;
          rot.w *= invLen;
        } else {
          rot.copy(prevRot);
        }
      } else {
        rot.slerpQuaternions(prevRot, origRot, eased);
      }

      pos.sub(pivot).applyQuaternion(spinQuat).add(pivot);
      rot.premultiply(spinQuat);

      const scale = THREE.MathUtils.lerp(prevScale, origScale, eased);
      return applyMouseRepulsion(pos, scale, i);
    });

    if (progress >= 1.0) window.dispatchEvent(new CustomEvent("gifTransitionComplete"));
  } else {
    advanceLoopFrame(totalLoop);
    const currentFrame = time % totalLoop;

    const blendFactor = 0.95;
    let turnT = 0;

    if (currentFrame < spinDuration) {
      turnT = currentFrame / spinDuration;
      const smoothT = easeInOutCubic(turnT) * blendFactor + turnT * (1.0 - blendFactor);
      rotationAngle = smoothT * Math.PI;
    } else {
      turnT = (currentFrame - spinDuration) / spinDuration;
      const smoothT = easeInOutCubic(turnT) * blendFactor + turnT * (1.0 - blendFactor);
      rotationAngle = Math.PI + (smoothT * Math.PI);
    }

    const sineArc = Math.sin(turnT * Math.PI);
    let rawAmp = Math.max(0, sineArc - 0.4);
    let noiseAmp = Math.pow((rawAmp / 0.6), 2.0) * 0.75;
    const t = noiseAmp * 0.85;
    const invT = 1.0 - t;

    const spinQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationAngle);

    runInstanceMorph(targetMesh, (i, pos, rot) => {
      const origPos = data.originalPositions[i];
      const origRot = data.originalRotations[i];
      const origScale = data.originalScales[i];

      pos.copy(origPos);

      if (noiseAmp > 0.001) {
        const rIdx = (i % 10000) * 3;
        const dy = pos.y - pivot.y;

        const twistAngle = (dy * twistAmount + SCRAMBLE_NOISE[rIdx] * 1.5) * noiseAmp;

        if (Math.abs(twistAngle) > 0.001) {
          // --- OPTIMIZATION: Fast Trig Lookup ---
          let normAngle = (twistAngle * PI2_INV) % 1.0;
          if (normAngle < 0) normAngle += 1.0;
          const sinIdx = (normAngle * 8192) | 0;
          const cosIdx = (sinIdx + 2048) % 8192;

          const sinT = FAST_SIN[sinIdx];
          const cosT = FAST_SIN[cosIdx];

          const dx = pos.x - pivot.x;
          const dz = pos.z - pivot.z;
          pos.x = pivot.x + (dx * cosT - dz * sinT);
          pos.z = pivot.z + (dx * sinT + dz * cosT);

          pos.x += SCRAMBLE_NOISE[rIdx] * scatterAmount * noiseAmp;
          pos.y += SCRAMBLE_NOISE[rIdx + 1] * scatterAmount * noiseAmp;
          pos.z += SCRAMBLE_NOISE[rIdx + 2] * scatterAmount * noiseAmp;
        }

        // --- OPTIMIZATION: Inline NLERP (Normalized Linear Interpolation) ---
        const q2 = SCRAMBLE_QUATS[i % 10000];
        const dot = origRot.x * q2.x + origRot.y * q2.y + origRot.z * q2.z + origRot.w * q2.w;
        const sign = dot < 0 ? -1 : 1;

        rot.x = origRot.x * invT + q2.x * t * sign;
        rot.y = origRot.y * invT + q2.y * t * sign;
        rot.z = origRot.z * invT + q2.z * t * sign;
        rot.w = origRot.w * invT + q2.w * t * sign;

        const lenSq = rot.x * rot.x + rot.y * rot.y + rot.z * rot.z + rot.w * rot.w;
        if (lenSq > 0.000001) {
          const invLen = 1.0 / Math.sqrt(lenSq);
          rot.x *= invLen;
          rot.y *= invLen;
          rot.z *= invLen;
          rot.w *= invLen;
        } else {
          rot.copy(origRot);
        }
      } else {
        rot.copy(origRot);
      }

      pos.sub(pivot).applyQuaternion(spinQuat).add(pivot);
      rot.premultiply(spinQuat);

      return applyMouseRepulsion(pos, origScale, i);
    });
  }
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
  const loopDuration = pauseNormal + implodeFrames + pauseImploded + explodeFrames;

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
      const t = (currentFrame - (pauseNormal + implodeFrames + pauseImploded)) / explodeFrames;
      morphFactor = 1.0 - easeOutExpo(t);
      isSecondHalf = true;
    }

    const data = targetMesh.userData;
    const implodeTarget = new THREE.Vector3();
    const pivot = getMeshPivot(targetMesh);

    runInstanceMorph(targetMesh, (i, pos, rot) => {
      const rIdx = (i % 10000) * 3;
      implodeTarget.set(
        SCRAMBLE_NOISE[rIdx] * radius,
        SCRAMBLE_NOISE[rIdx + 1] * radius,
        SCRAMBLE_NOISE[rIdx + 2] * radius
      ).add(pivot);

      const origPos = data.originalPositions[i];
      const origRot = data.originalRotations[i];
      const origScale = data.originalScales[i];

      const usePrev = isTransitioning && !isSecondHalf;
      const srcPos = usePrev ? (data.prevPositions?.[i] || origPos) : origPos;
      const srcRot = usePrev ? (data.prevRotations?.[i] || origRot) : origRot;
      const srcScale = usePrev ? (data.prevScales?.[i] ?? 0) : origScale;

      pos.lerpVectors(srcPos, implodeTarget, morphFactor);
      rot.slerpQuaternions(srcRot, data.gridRotations[i], morphFactor);

      const scale = srcScale * Math.max(0.01, 1.0 - morphFactor * 0.99);
      return applyMouseRepulsion(pos, scale, i);
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
    const spinQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationAngle);
    const pivot = getMeshPivot(targetMesh);

    if (progress >= 1.0 || progress === 0.0) {
      spinQuat.identity();
    }

    runInstanceMorph(targetMesh, (i, pos, rot) => {
      const origPos = data.originalPositions[i];
      const origRot = data.originalRotations[i];
      const origScale = data.originalScales[i];

      if (isTransitioning) {
        const prevPos = data.prevPositions ? (data.prevPositions[i] || origPos) : origPos;
        const prevRot = data.prevRotations ? (data.prevRotations[i] || origRot) : origRot;
        const prevScale = data.prevScales && data.prevScales[i] !== undefined ? data.prevScales[i] : 0;

        const maxStagger = 0.2;
        const staggerDelay = ((i % 10) / 9) * maxStagger;
        let dotProgress = progress < 1.0 ? (progress - staggerDelay) / (1.0 - maxStagger) : 1.0;
        dotProgress = THREE.MathUtils.clamp(dotProgress, 0, 1);
        dotProgress = easeInOutQuad(dotProgress);

        pos.lerpVectors(prevPos, origPos, dotProgress);
        pos.sub(pivot).applyQuaternion(spinQuat).add(pivot);

        rot.slerpQuaternions(prevRot, origRot, dotProgress).premultiply(spinQuat);
        const scale = THREE.MathUtils.lerp(prevScale, origScale, dotProgress);
        return applyMouseRepulsion(pos, scale, i);
      } else {
        pos.copy(origPos).sub(pivot).applyQuaternion(spinQuat).add(pivot);
        rot.copy(origRot).premultiply(spinQuat);
        return applyMouseRepulsion(pos, origScale, i);
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
  const loopDuration = pauseNormal + explodeFrames + pauseExpanded + implodeFrames;

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
      const t = (currentFrame - (pauseNormal + explodeFrames + pauseExpanded)) / implodeFrames;
      morphFactor = 1.0 - easeInOutCubic(t);
      isSecondHalf = true;
    }

    const data = targetMesh.userData;
    const scatterTarget = new THREE.Vector3();
    const pivot = getMeshPivot(targetMesh);

    runInstanceMorph(targetMesh, (i, pos, rot) => {
      const rIdx = (i % 10000) * 3;
      scatterTarget.set(
        SCRAMBLE_NOISE[rIdx] * cubeSize,
        SCRAMBLE_NOISE[rIdx + 1] * cubeSize,
        SCRAMBLE_NOISE[rIdx + 2] * cubeSize
      ).add(pivot);

      const origPos = data.originalPositions[i];
      const origRot = data.originalRotations[i];
      const origScale = data.originalScales[i];

      const usePrev = isTransitioning && !isSecondHalf;
      const srcPos = usePrev ? (data.prevPositions?.[i] || origPos) : origPos;
      const srcRot = usePrev ? (data.prevRotations?.[i] || origRot) : origRot;
      const srcScale = usePrev ? (data.prevScales?.[i] ?? 0) : origScale;

      pos.lerpVectors(srcPos, scatterTarget, morphFactor);
      rot.slerpQuaternions(srcRot, data.gridRotations[i], morphFactor);

      let currentScale = THREE.MathUtils.lerp(srcScale, data.gridScales[i], morphFactor);
      const zNormalized = (pos.z + cubeSize) / (cubeSize * 2);
      const zMultiplier = 0.2 + zNormalized * 3.8;
      const finalScaleMultiplier = 1.0 + (zMultiplier - 1.0) * morphFactor;

      const scale = currentScale * Math.max(0.01, finalScaleMultiplier);
      return applyMouseRepulsion(pos, scale, i);
    });

    if (isTransitioning && currentFrame === loopDuration - 1) {
      window.dispatchEvent(new CustomEvent("gifTransitionComplete"));
    }
  }
};

const handleDefaultAnimation = (targetMesh, isTransitioning) => {
  const { transitionFrames, spinDuration, zDepthVolume } = animSettings.default;
  const totalLoop = spinDuration * 2;

  if (targetMesh) {
    const data = targetMesh.userData;
    if (!data.originalPositions || !data.originalRotations) return;

    let rotationAngle = 0;
    const pivot = getMeshPivot(targetMesh);

    if (isTransitioning) {
      time += 1;
      const progress = Math.min(time / transitionFrames, 1.0);
      const blendFactor = 0.90;
      const eased = easeInOutSine(progress) * blendFactor + progress * (1.0 - blendFactor);

      rotationAngle = eased * (Math.PI * 2);
      const spinQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationAngle);

      const wobbleIntensity = Math.sin(progress * Math.PI) * 0.6;

      runInstanceMorph(targetMesh, (i, pos, rot) => {
        const origPos = data.originalPositions[i];
        const origRot = data.originalRotations[i];
        const origScale = data.originalScales[i];

        const prevPos = data.prevPositions ? (data.prevPositions[i] || origPos) : origPos;
        const prevRot = data.prevRotations ? (data.prevRotations[i] || origRot) : origRot;
        const prevScale = data.prevScales && data.prevScales[i] !== undefined ? data.prevScales[i] : 0;

        pos.lerpVectors(prevPos, origPos, eased);

        // Pass origScale into the structural wobble
        applySwarmWobble(pos, i, time, 0.025, 4.5, wobbleIntensity, zDepthVolume, origScale);

        pos.sub(pivot).applyQuaternion(spinQuat).add(pivot);
        rot.slerpQuaternions(prevRot, origRot, eased).premultiply(spinQuat);

        const scale = THREE.MathUtils.lerp(prevScale, origScale, eased);
        return applyMouseRepulsion(pos, scale, i);
      });

      if (progress >= 1.0)
        window.dispatchEvent(new CustomEvent("gifTransitionComplete"));
    } else {
      advanceLoopFrame(totalLoop);
      const currentFrame = time % totalLoop;

      const blendFactor = 0.95;
      let t = 0;

      if (currentFrame < spinDuration) {
        t = currentFrame / spinDuration;
        const smoothT = easeInOutCubic(t) * blendFactor + t * (1.0 - blendFactor);
        rotationAngle = smoothT * Math.PI;
      } else {
        t = (currentFrame - spinDuration) / spinDuration;
        const smoothT = easeInOutCubic(t) * blendFactor + t * (1.0 - blendFactor);
        rotationAngle = Math.PI + (smoothT * Math.PI);
      }

      const sineArc = Math.sin(t * Math.PI);
      const wobbleIntensity = 0.02 + Math.pow(sineArc, 1.4) * 0.8;
      const spinQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationAngle);

      runInstanceMorph(targetMesh, (i, pos, rot) => {
        const origPos = data.originalPositions[i];
        const origRot = data.originalRotations[i];
        const origScale = data.originalScales[i];

        pos.copy(origPos);

        // Pass origScale into the structural wobble
        applySwarmWobble(pos, i, time, 0.025, 4.5, wobbleIntensity, zDepthVolume, origScale);

        pos.sub(pivot).applyQuaternion(spinQuat).add(pivot);
        rot.copy(origRot).premultiply(spinQuat);

        return applyMouseRepulsion(pos, origScale, i);
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
      spinFactor = 0;
      explodeFactor = 0;
    } else if (currentFrame < pauseNormal + totalActionFrames) {
      const elapsed = currentFrame - pauseNormal;
      spinFactor = easeInOutQuintic(Math.min(elapsed / spinDuration, 1.0));

      const expElapsed = elapsed - explodeDelay;
      explodeFactor = expElapsed <= 0 ? 0 : easeInOutQuintic(Math.min(expElapsed / explodeDuration, 1.0));
    } else if (currentFrame < pauseNormal + totalActionFrames + pauseExpanded) {
      spinFactor = 1.0;
      explodeFactor = 1.0;
      isSecondHalf = true;
    } else {
      const elapsed = currentFrame - (pauseNormal + totalActionFrames + pauseExpanded);
      const remaining = totalActionFrames - elapsed;
      spinFactor = easeInOutQuintic(Math.min(Math.max(0, remaining / spinDuration), 1.0));

      const expElapsed = remaining - explodeDelay;
      explodeFactor = expElapsed <= 0 ? 0 : easeInOutQuintic(Math.min(expElapsed / explodeDuration, 1.0));
      isSecondHalf = true;
    }
  }

  const data = targetMesh.userData;
  const scatterTarget = new THREE.Vector3();
  const totalAngle = spinFactor * Math.PI * 2 * rotations;
  const spinQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), totalAngle);
  const pivot = getMeshPivot(targetMesh);

  runInstanceMorph(targetMesh, (i, pos, rot) => {
    const rIdx = (i % 10000) * 3;
    scatterTarget.set(
      SCRAMBLE_NOISE[rIdx] * cubeSize,
      SCRAMBLE_NOISE[rIdx + 1] * cubeSize,
      SCRAMBLE_NOISE[rIdx + 2] * cubeSize
    ).add(pivot);

    const origPos = data.originalPositions[i];
    const origRot = data.originalRotations[i];
    const origScale = data.originalScales[i];

    const usePrev = isTransitioning && !isSecondHalf;
    const srcPos = usePrev ? (data.prevPositions?.[i] || origPos) : origPos;
    const srcRot = usePrev ? (data.prevRotations?.[i] || origRot) : origRot;
    const srcScale = usePrev ? (data.prevScales?.[i] ?? 0) : origScale;

    pos.lerpVectors(srcPos, scatterTarget, explodeFactor);
    rot.slerpQuaternions(srcRot, data.gridRotations[i], explodeFactor);

    let currentScale = THREE.MathUtils.lerp(srcScale, data.gridScales[i], explodeFactor);
    const zNormalized = (pos.z + cubeSize) / (cubeSize * 2);
    const zMultiplier = 0.2 + zNormalized * 3.8;
    currentScale *= Math.max(0.01, 1.0 + (zMultiplier - 1.0) * explodeFactor);

    pos.sub(pivot).applyQuaternion(spinQuat).add(pivot);
    rot.premultiply(spinQuat);

    return applyMouseRepulsion(pos, currentScale, i);
  });

  if (isTransitioning && currentFrame === loopDuration - 1) {
    window.dispatchEvent(new CustomEvent("gifTransitionComplete"));
  }
};

export const updateCameraAnimation = () => {
  const targetMesh = getActiveMesh();
  if (!targetMesh) return;

  if (!activeType) {
    handleStaticAnimation(targetMesh);
    return;
  }

  if (isPaused) return;

  const isTransitioning = targetMesh.userData.isTransitioning;

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
