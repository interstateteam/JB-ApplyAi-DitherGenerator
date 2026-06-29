import * as THREE from "three";
import {
  handleAnimationSwitch,
  resetAnimationTimeline,
} from "./three_animationLogic.js";
import { getActiveMesh } from "./three_gridLogic.js";

// === STATE ===

export let pendingTransitionAnimation = "breakApart";
export let lastTransitionBackup = null;
export let lastTransitionAnimName = null;

export const setPendingTransition = (animName) => {
  pendingTransitionAnimation = animName;
};

// === TRANSITION PIPELINE ===

/**
 * Creates a backup clone of the current frame data before loading a new sequence.
 */
export const snapshotOldState = (
  scene,
  isPlayingGif,
  currentGifFrames,
  currentGifCols,
  currentGifRows,
  currentFrameIndex,
) => {
  const targetMesh = getActiveMesh();

  const prevPositions = targetMesh
    ? targetMesh.userData.originalPositions.map((v) => v.clone())
    : [];
  const prevScales = targetMesh ? [...targetMesh.userData.originalScales] : [];
  const prevRotations = targetMesh
    ? targetMesh.userData.originalRotations.map((q) => q.clone())
    : [];
  const hasSourceGif = isPlayingGif && currentGifFrames.length > 0;

  lastTransitionBackup = {
    positions: prevPositions.map((v) => v.clone()),
    scales: [...prevScales],
    rotations: prevRotations.map((q) =>
      q && q.clone ? q.clone() : new THREE.Quaternion().copy(q),
    ),
    sourceGif: hasSourceGif
      ? {
          frames: [...currentGifFrames],
          cols: currentGifCols,
          rows: currentGifRows,
        }
      : null,
  };

  lastTransitionAnimName = pendingTransitionAnimation;

  if (hasSourceGif) {
    return {
      frames: [...currentGifFrames],
      cols: currentGifCols,
      rows: currentGifRows,
      currentIndex: currentFrameIndex,
      lastTime: performance.now(),
    };
  }
  return null;
};

/**
 * Standardizes the cloned transition arrays to ensure they perfectly match the target grid dimensions.
 */
export const finalizeMorphState = (scene, controls) => {
  const targetMesh = getActiveMesh();

  if (targetMesh && lastTransitionBackup) {
    const count = targetMesh.count;
    let safePos = lastTransitionBackup.positions
      .map((v) => v.clone())
      .slice(0, count);
    let safeScl = [...lastTransitionBackup.scales].slice(0, count);
    let safeRot = lastTransitionBackup.rotations
      .map((q) => q.clone())
      .slice(0, count);

    while (safePos.length < count) {
      safePos.push(new THREE.Vector3(0, 0, -600));
      safeScl.push(0);
      safeRot.push(new THREE.Quaternion());
    }

    targetMesh.userData.prevPositions = safePos;
    targetMesh.userData.prevScales = safeScl;
    targetMesh.userData.prevRotations = safeRot;
    targetMesh.userData.isTransitioning = true;

    handleAnimationSwitch(pendingTransitionAnimation, true);
    resetAnimationTimeline(controls);
  }
};
