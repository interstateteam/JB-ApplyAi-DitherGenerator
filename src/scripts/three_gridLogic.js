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

// Restored to 0.25 so the 0-1000 slider packs enough punch to move dots across columns
const calculateShift = (grad, gravity, spacing, maxShift) => {
  const val = -grad * gravity * spacing * 0.25;
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
    scaleRatio,
    alignmentScale,
  } = settings;
  const chaosLevel = (pixelDistortion || 0) / 100;

  const gravityNorm = Math.max(0, Math.min(100, pixelGravity)) / 100;

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

  const originalPositions = [];
  const gridPositions = [];
  const originalRotations = [];
  const gridRotations = [];
  const originalScales = [];
  const gridScales = [];

  // --- NEW: The VIP List. Tracks exactly which dots are foreground vs background ---
  const activeInstances = new Uint8Array(cols * rows);

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const { brightness, alpha } = imgData
        ? getPixelData(imgData, col, row, cols, rows, minBright, maxBright)
        : { brightness: 0, alpha: 0 };

      let shiftX = 0,
        shiftY = 0;
      const smallnessInfluence =
        brightness < 0.1 ? 0 : (brightness - 0.1) / 0.9;

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
          const maxShift = spacing * 5.0;
          const rawShiftX = calculateShift(
            neighbors.right.brightness - neighbors.left.brightness,
            pixelGravity,
            spacing,
            maxShift,
          );
          const rawShiftY = calculateShift(
            neighbors.down.brightness - neighbors.up.brightness,
            pixelGravity,
            spacing,
            maxShift,
          );
          const alignmentFactor = document.getElementById("alignmentScale")
            ? alignmentScale / 100
            : 1.0;

          shiftX = rawShiftX * smallnessInfluence * alignmentFactor;
          shiftY = rawShiftY * smallnessInfluence * alignmentFactor;
        }
      }

      const isBackground = alpha <= 0.05 || brightness > 0.9;

      // Mark the VIP list: 1 for active foreground dots, 0 for invisible backgrounds
      activeInstances[instanceIndex] = isBackground ? 0 : 1;

      const fadeOutFactor = 1.0 - smallnessInfluence * gravityNorm;

      // Clean, robust scale math (0 to 100 slider translates to a 0.0 to 2.0 multiplier)
      const varianceWeight =
        typeof scaleRatio === "number" ? scaleRatio / 50 : 1.0;
      const originalVariance = 0.3 + Math.pow(1.0 - brightness, 2) * 1.5;
      const midPoint = 1.05;
      const sizeModifier =
        midPoint + (originalVariance - midPoint) * varianceWeight;

      const baseScale = isBackground
        ? 0
        : (pixelScale / 100) *
          (gridScale / 5) *
          sizeModifier *
          Math.max(0, fadeOutFactor);

      const wobble = 1.0 + THREE.MathUtils.randFloatSpread(0.5 * chaosLevel);
      const finalOriginalScale = baseScale * wobble;

      const objPos = new THREE.Vector3(
        (col - (cols - 1) / 2) * spacing + shiftX,
        (row - (rows - 1) / 2) * spacing + shiftY,
        (1.0 - brightness) * 1200 - 600,
      );
      const objRot = new THREE.Euler(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
      );

      const spreadX = 1.6;
      const spreadY = 1;
      const spreadZ = 15;
      const depthStep = ((col + row) % 8) - 4;

      const gPos = new THREE.Vector3(
        (col - (cols - 1) / 2) * spacing * spreadX,
        (row - (rows - 1) / 2) * spacing * spreadY,
        depthStep * spacing * spreadZ,
      );
      const gRot = new THREE.Euler(0, 0, 0);
      const finalGridScale = (pixelScale / 100) * (gridScale / 5) * 0.6;

      originalPositions.push(objPos);
      gridPositions.push(gPos);
      originalRotations.push(new THREE.Quaternion().setFromEuler(objRot));
      gridRotations.push(new THREE.Quaternion().setFromEuler(gRot));
      originalScales.push(finalOriginalScale);
      gridScales.push(finalGridScale);

      dummyObject.position.copy(objPos);
      dummyObject.rotation.copy(objRot);
      dummyObject.scale.setScalar(finalOriginalScale);

      colorHelper.setScalar(brightness);
      instancedMesh.setColorAt(instanceIndex, colorHelper);
      dummyObject.updateMatrix();
      instancedMesh.setMatrixAt(instanceIndex, dummyObject.matrix);
      instanceIndex++;
    }
  }

  // Attach the VIP list to userData so the exporter can read it
  instancedMesh.userData = {
    originalPositions,
    gridPositions,
    originalRotations,
    gridRotations,
    originalScales,
    gridScales,
    activeInstances,
  };

  if (imgData) instancedMesh.instanceColor.needsUpdate = true;
  scene.add(instancedMesh);
};
