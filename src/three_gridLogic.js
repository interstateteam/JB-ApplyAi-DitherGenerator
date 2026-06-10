import * as THREE from "three";
import {
  sampleImage,
  getBrightnessRange,
  getGridDimensions,
} from "./three_imageLogic.js";
import { scene } from "./three_sceneLogic.js";

// Reused across frames to avoid per-instance allocations
const dummy = new THREE.Object3D();
const colorHelper = new THREE.Color();

let geometry, circleInstance;

// Tears down the previous grid and rebuilds it from scratch.
// Called on every slider change or new image load.
export function updateThreeGrid(img, settings, material) {
  if (!scene) return;

  // --- Cleanup: remove old mesh and free GPU memory before rebuilding ---
  if (circleInstance) {
    scene.remove(circleInstance);
    circleInstance.dispose();
  }
  if (geometry) {
    geometry.dispose();
  }

  const { gridSize, pixelSpace, pixelSizePercent, varietyPercent } = settings;
  const chaos = varietyPercent ? varietyPercent / 100 : 0;

  // --- Geometry: start from an icosahedron, then warp vertices with trig noise ---
  // Higher chaos = more lumpy/organic blobs; at 0 it stays a clean sphere-ish shape
  geometry = new THREE.IcosahedronGeometry(2, 2);
  const positions = geometry.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < positions.count; i++) {
    v.fromBufferAttribute(positions, i);
    // Layered sine/cosine noise across all three axes
    const noise = Math.sin(v.x * 4) + Math.cos(v.y * 3.6) + Math.sin(v.z * 5.8);
    const variance = 1.0 + noise * 0.3 * chaos;
    v.multiplyScalar(variance);
    positions.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals(); // recalculate normals after manual vertex edits

  // --- Grid dimensions: fit the dot grid to the image's aspect ratio ---
  const { cols, rows } = getGridDimensions(img, gridSize);
  const totalDots = cols * rows;
  if (totalDots <= 0) return;

  // --- Image sampling: downsample to grid resolution for per-dot colour/brightness ---
  const imgData = img ? sampleImage(img, cols, rows) : null;
  const { minBright, maxBright } = imgData ? getBrightnessRange(imgData) : {};

  // InstancedMesh renders all dots in a single draw call
  circleInstance = new THREE.InstancedMesh(geometry, material, totalDots);
  circleInstance.scale.setScalar(pixelSpace / 10); // global size driven by the space slider
  let instanceIndex = 0;

  // --- Per-dot loop: set position, rotation, scale, and colour for each instance ---
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      // Centre the grid on the origin
      const x = (i - (cols - 1) / 2) * gridSize;
      const y = (j - (rows - 1) / 2) * gridSize;

      dummy.position.set(x, y, 0);
      // Randomise orientation so each dot catches light differently
      dummy.rotation.set(
        THREE.MathUtils.randInt(0, 365),
        THREE.MathUtils.randInt(0, 365),
        THREE.MathUtils.randInt(0, 365),
      );

      let currentScale = pixelSizePercent / 50;
      let stretchX = 1,
        stretchY = 1,
        stretchZ = 1;
      let brightness = 1;

      if (imgData) {
        // ImageData is top-down; flip j so row 0 maps to the bottom of the image
        const pixelIndex = ((rows - 1 - j) * cols + i) * 4;
        const r = imgData.data[pixelIndex] / 255;
        const g = imgData.data[pixelIndex + 1] / 255;
        const b = imgData.data[pixelIndex + 2] / 255;
        const a = imgData.data[pixelIndex + 3] / 255;

        // Perceptual luminance (ITU-R BT.601 weights)
        brightness = 0.299 * r + 0.587 * g + 0.114 * b;
        // Stretch contrast so the darkest pixel = 0, brightest = 1
        brightness = (brightness - minBright) / (maxBright - minBright);
        brightness = Math.max(0.0, Math.min(1.0, brightness));

        if (a <= 0.01) {
          currentScale = 0; // hide dots in transparent areas
        } else {
          // Halftone sizing: dark pixels get bigger dots, bright pixels get smaller ones
          const darkness = 1.0 - brightness;
          const shadeMultiplier = 0.2 + darkness * 1.2;
          currentScale *= shadeMultiplier;

          // Chaos: randomise per-dot size and per-axis stretch
          const maxScaleWobble = 0.5 * chaos;
          const maxSquashWobble = 0.4 * chaos;

          // Multiply currentScale by a random value centered around 1.0
          currentScale *= THREE.MathUtils.randFloat(
            1.0 - maxScaleWobble / 2,
            1.0 + maxScaleWobble / 2,
          );

          // Generate random stretch factors centered around 1.0
          stretchX = THREE.MathUtils.randFloat(
            1.0 - maxSquashWobble / 2,
            1.0 + maxSquashWobble / 2,
          );
          stretchY = THREE.MathUtils.randFloat(
            1.0 - maxSquashWobble / 2,
            1.0 + maxSquashWobble / 2,
          );
          stretchZ = THREE.MathUtils.randFloat(
            1.0 - maxSquashWobble / 2,
            1.0 + maxSquashWobble / 2,
          );
        }

        // Greyscale colour matched to normalised brightness
        colorHelper.setRGB(brightness, brightness, brightness);
        circleInstance.setColorAt(instanceIndex, colorHelper);
      } else {
        // No image: fallback orange so the grid is visible during setup
        colorHelper.setHex(0x000000);
        circleInstance.setColorAt(instanceIndex, colorHelper);
      }

      dummy.scale.set(
        currentScale * stretchX,
        currentScale * stretchY,
        currentScale * stretchZ,
      );
      // Push bright pixels forward in Z, creating a depth relief effect
      // console.log(ranbrightness * 1000);
      dummy.position.z = brightness * 1200;

      dummy.updateMatrix();
      circleInstance.setMatrixAt(instanceIndex, dummy.matrix);
      instanceIndex++;
    }
  }

  if (imgData) circleInstance.instanceColor.needsUpdate = true;
  scene.add(circleInstance);
}
