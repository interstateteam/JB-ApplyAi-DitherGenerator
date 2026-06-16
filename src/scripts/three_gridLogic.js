import * as THREE from "three";
import {
  sampleImage,
  getBrightnessRange,
  getGridDimensions,
  getPixelData,
} from "./three_imageLogic.js";
import { scene, material, setCameraZoom } from "./three_sceneLogic.js";

// --- Module-Level Reusables ---
const dummyObject = new THREE.Object3D();
const colorHelper = new THREE.Color();

let currentGeometry = null;
let instancedMesh = null;

// --- Helper Functions ---
const cleanupPreviousGrid = () => {
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
  const positions = geometry.attributes.position;
  const vertex = new THREE.Vector3();

  for (let i = 0; i < positions.count; i++) {
    vertex.fromBufferAttribute(positions, i);

    const noise =
      Math.sin(vertex.x * 4) +
      Math.cos(vertex.y * 3.6) +
      Math.sin(vertex.z * 5.8);
    const variance = 1.0 + noise * 0.3 * chaosLevel;

    vertex.multiplyScalar(variance);
    positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  geometry.computeVertexNormals();
  return geometry;
};

// --- Main Export ---
export const updateThreeGrid = (img, settings) => {
  if (!scene) return;
  cleanupPreviousGrid();

  const { pixelAmount, pixelScale, gridScale, pixelDistortion } = settings;
  const chaosLevel = pixelDistortion ? pixelDistortion / 100 : 0;

  // Prepare Geometry & Dimensions
  currentGeometry = createWarpedGeometry(chaosLevel);

  const { cols, rows } = getGridDimensions(img, pixelAmount);
  const totalDots = cols * rows;
  if (totalDots <= 0) return;

  // Prepare Image Data
  const imgData = img ? sampleImage(img, cols, rows) : null;
  const { minBright, maxBright } = imgData ? getBrightnessRange(imgData) : {};

  // Create the Mesh
  instancedMesh = new THREE.InstancedMesh(currentGeometry, material, totalDots);

  let instanceIndex = 0;

  const spacingFactor = gridScale / 5;
  const spacing = pixelAmount * spacingFactor;

  setCameraZoom(1 / spacingFactor);

  //  Position and Scale Each Dot
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      // Calculate physical grid position using the new spacing variable
      const xPos = (col - (cols - 1) / 2) * spacing;
      const yPos = (row - (rows - 1) / 2) * spacing;

      dummyObject.position.set(xPos, yPos, 0);
      dummyObject.rotation.set(
        THREE.MathUtils.randInt(0, 365),
        THREE.MathUtils.randInt(0, 365),
        THREE.MathUtils.randInt(0, 365),
      );

      let currentDotScale = (pixelScale / 50) * spacingFactor;
      let stretch = { x: 1, y: 1, z: 1 };
      let brightness = 1;

      if (imgData) {
        const pixel = getPixelData(
          imgData,
          col,
          row,
          cols,
          rows,
          minBright,
          maxBright,
        );
        brightness = pixel.brightness;

        if (pixel.alpha <= 0.01) {
          currentDotScale = 0;
        } else {
          const darkness = 1.0 - brightness;
          currentDotScale *= 0.2 + darkness * 1.2;

          const maxScaleWobble = 0.5 * chaosLevel;
          const maxSquashWobble = 0.4 * chaosLevel;

          currentDotScale *= THREE.MathUtils.randFloat(
            1.0 - maxScaleWobble / 2,
            1.0 + maxScaleWobble / 2,
          );
          stretch.x = THREE.MathUtils.randFloat(
            1.0 - maxSquashWobble / 2,
            1.0 + maxSquashWobble / 2,
          );
          stretch.y = THREE.MathUtils.randFloat(
            1.0 - maxSquashWobble / 2,
            1.0 + maxSquashWobble / 2,
          );
          stretch.z = THREE.MathUtils.randFloat(
            1.0 - maxSquashWobble / 2,
            1.0 + maxSquashWobble / 2,
          );
        }
        colorHelper.setRGB(brightness, brightness, brightness);
      } else {
        colorHelper.setHex(0x000000);
      }

      instancedMesh.setColorAt(instanceIndex, colorHelper);
      dummyObject.scale.set(
        currentDotScale * stretch.x,
        currentDotScale * stretch.y,
        currentDotScale * stretch.z,
      );

      dummyObject.position.z = brightness * 1200;

      dummyObject.updateMatrix();
      instancedMesh.setMatrixAt(instanceIndex, dummyObject.matrix);
      instanceIndex++;
    }
  }

  // Finalize and Render
  if (imgData) instancedMesh.instanceColor.needsUpdate = true;
  scene.add(instancedMesh);
};
