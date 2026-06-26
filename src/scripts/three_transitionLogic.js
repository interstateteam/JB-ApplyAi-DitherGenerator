import * as THREE from "three";
import {
  handleAnimationSwitch,
  resetAnimationTimeline,
} from "./three_animationLogic.js";

export let pendingTransitionAnimation = "breakApart";
export let lastTransitionBackup = null;
export let lastTransitionAnimName = null;

export const setPendingTransition = (animName) => {
  pendingTransitionAnimation = animName;
};

// 1. Instantly clones the current frame before the next image writes over it
export const snapshotOldState = (
  scene,
  isPlayingGif,
  currentGifFrames,
  currentGifCols,
  currentGifRows,
  currentFrameIndex,
) => {
  let targetMesh = null;
  scene.traverse((child) => {
    if (child.isInstancedMesh) targetMesh = child;
  });

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

  // Returns the backup profile (or null) to feed back into the videoLogic engine
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

// 2. Safely truncates or pads the arrays to perfectly fit the new grid dimensions
export const finalizeMorphState = (scene, controls) => {
  let targetMesh = null;
  scene.traverse((child) => {
    if (child.isInstancedMesh) targetMesh = child;
  });

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
