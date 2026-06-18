import * as THREE from "three";
import {
  sampleImage,
  getBrightnessRange,
  getGridDimensions,
  getPixelData,
} from "./three_imageLogic.js";
import { scene, material, setCameraZoom } from "./three_sceneLogic.js";

const dummyObject = new THREE.Object3D();
const colorHelper = new THREE.Color();

let currentGeometry = null;
let instancedMesh = null;

// --- Helper Functions ---

const cleanup = () => {
  if (instancedMesh) {
    scene.remove(instancedMesh);
    instancedMesh.dispose();
  }
  if (currentGeometry) {
    currentGeometry.dispose();
  }
};

const createWarpedGeometry = (chaosLevel) => {
  const geometry = new THREE.IcosahedronGeometry(2, 2);
  const pos = geometry.attributes.position;
  const vec = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    vec.fromBufferAttribute(pos, i);
    const noise =
      Math.sin(vec.x * 4) + Math.cos(vec.y * 3.6) + Math.sin(vec.z * 5.8);
    vec.multiplyScalar(1.0 + noise * 0.3 * chaosLevel);
    pos.setXYZ(i, vec.x, vec.y, vec.z);
  }
  geometry.computeVertexNormals();
  return geometry;
};

const calculateShift = (grad, gravity, spacing, maxShift) => {
  const val = -grad * gravity * spacing * 0.2;
  return Math.max(-maxShift, Math.min(maxShift, val));
};

// --- Main Export ---

export const updateThreeGrid = (img, settings) => {
  if (!scene) return;
  cleanup();

  const {
    pixelAmount,
    pixelScale,
    gridScale,
    pixelDistortion,
    pixelGravity = 0,
  } = settings;
  const chaosLevel = (pixelDistortion || 0) / 100;

  currentGeometry = createWarpedGeometry(chaosLevel);
  const { cols, rows } = getGridDimensions(img, pixelAmount);
  if (cols * rows <= 0) return;

  const imgData = img ? sampleImage(img, cols, rows) : null;
  const { minBright, maxBright } = imgData ? getBrightnessRange(imgData) : {};

  instancedMesh = new THREE.InstancedMesh(
    currentGeometry,
    material,
    cols * rows,
  );
  const spacing = pixelAmount * (gridScale / 5);
  setCameraZoom(5 / gridScale);

  let instanceIndex = 0;

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const { brightness, alpha } = imgData
        ? getPixelData(imgData, col, row, cols, rows, minBright, maxBright)
        : { brightness: 0, alpha: 0 };

      // 1. Position & Gravity Shift
      let shiftX = 0,
        shiftY = 0;
      if (alpha > 0.01) {
        const getSafe = (c, r) =>
          getPixelData(
            imgData,
            Math.max(0, Math.min(cols - 1, c)),
            Math.max(0, Math.min(rows - 1, r)),
            cols,
            rows,
            minBright,
            maxBright,
          );
        const neighbors = {
          left: getSafe(col - 1, row),
          right: getSafe(col + 1, row),
          up: getSafe(col, row - 1),
          down: getSafe(col, row + 1),
        };

        if (!Object.values(neighbors).some((n) => n.alpha <= 0.01)) {
          const maxShift = spacing * 0.4;
          shiftX = calculateShift(
            neighbors.right.brightness - neighbors.left.brightness,
            pixelGravity,
            spacing,
            maxShift,
          );
          shiftY = calculateShift(
            neighbors.down.brightness - neighbors.up.brightness,
            pixelGravity,
            spacing,
            maxShift,
          );
        }
      }

      // 2. Scale & Appearance
      const isBackground = alpha <= 0.05 || brightness > 0.9;

      const baseScale = isBackground
        ? 0
        : (pixelScale / 100) *
          (gridScale / 5) *
          (0.3 + Math.pow(1.0 - brightness, 2) * 1.5);
      const wobble = 1.0 + THREE.MathUtils.randFloatSpread(0.5 * chaosLevel);

      // 3. Update Object
      dummyObject.position.set(
        (col - (cols - 1) / 2) * spacing + shiftX,
        (row - (rows - 1) / 2) * spacing + shiftY,
        (1.0 - brightness) * 1200,
      );
      dummyObject.scale.setScalar(baseScale * wobble);
      dummyObject.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
      );

      colorHelper.setScalar(brightness);
      instancedMesh.setColorAt(instanceIndex, colorHelper);
      dummyObject.updateMatrix();
      instancedMesh.setMatrixAt(instanceIndex, dummyObject.matrix);
      instanceIndex++;
    }
  }

  if (imgData) instancedMesh.instanceColor.needsUpdate = true;
  scene.add(instancedMesh);
};
