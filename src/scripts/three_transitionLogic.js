import * as THREE from "three";
import {
  handleAnimationSwitch,
  resetAnimationTimeline,
  resetMeshTransforms,
} from "./three_animationLogic.js";
import { getActiveMesh } from "./three_gridLogic.js";

export let pendingTransitionAnimation = "breakApart";
export let lastTransitionBackup = null;
export let lastTransitionAnimName = null;

export const setPendingTransition = (animName) => {
  pendingTransitionAnimation = animName;
};

export const buildSafeTransitionArrays = (backup, targetMesh) => {
  const count = targetMesh.count;
  const safePos = new Array(count);
  const safeScl = new Array(count);
  const safeRot = new Array(count);
  const backupCount = backup.positions.length;

  for (let i = 0; i < count; i++) {
    // Because of the padding logic, count will perfectly equal backupCount
    // (The `i < backupCount` check just protects against browser resizes mid-transition)
    if (i < backupCount) {
      safePos[i] = backup.positions[i].clone();
      safeScl[i] = backup.scales[i];
      safeRot[i] = backup.rotations[i].clone();
    } else {
      safePos[i] = new THREE.Vector3(0, 0, -600);
      safeScl[i] = 0;
      safeRot[i] = new THREE.Quaternion();
    }
  }

  return { safePos, safeScl, safeRot };
};

export const snapshotOldState = (
  scene,
  isPlayingGif,
  currentGifFrames,
  currentGifCols,
  currentGifRows,
  currentFrameIndex,
) => {
  // 1. Snap camera and time back to default BEFORE the new grid builds
  // This prevents the new grid from baking your manual rotation as its default!
  resetAnimationTimeline();

  // 2. Snap the old mesh visually back to Frame 0
  resetMeshTransforms();

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

export const finalizeMorphState = (scene) => {
  const targetMesh = getActiveMesh();

  if (targetMesh && lastTransitionBackup) {
    const { safePos, safeScl, safeRot } = buildSafeTransitionArrays(
      lastTransitionBackup,
      targetMesh,
    );

    targetMesh.userData.prevPositions = safePos;
    targetMesh.userData.prevScales = safeScl;
    targetMesh.userData.prevRotations = safeRot;
    targetMesh.userData.isTransitioning = true;

    handleAnimationSwitch(pendingTransitionAnimation, true);
    resetAnimationTimeline();
  }
};
