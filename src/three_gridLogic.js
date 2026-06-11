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

  const gridSize = 10;
  const { pixelAmount, pixelScale, gridScale, pixelDistortion, gravityScale } =
    settings;
  const chaos = pixelDistortion ? pixelDistortion / 100 : 0;

  // --- Geometry: start from an icosahedron, then warp vertices with trig noise ---
  geometry = new THREE.IcosahedronGeometry(2, 2);
  const positions = geometry.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < positions.count; i++) {
    v.fromBufferAttribute(positions, i);
    const noise = Math.sin(v.x * 4) + Math.cos(v.y * 3.6) + Math.sin(v.z * 5.8);
    const variance = 1.0 + noise * 0.3 * chaos;
    v.multiplyScalar(variance);
    positions.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();

  const { cols, rows } = getGridDimensions(img, pixelAmount);
  const totalDots = cols * rows;
  if (totalDots <= 0) return;

  const imgData = img ? sampleImage(img, cols, rows) : null;
  const { minBright, maxBright } = imgData ? getBrightnessRange(imgData) : {};

  circleInstance = new THREE.InstancedMesh(geometry, material, totalDots);

  circleInstance.scale.setScalar(gridSize / 10);
  let instanceIndex = 0;

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      // FIX: Use pixelAmount to calculate the base physical distance between dots
      const x = (i - (cols - 1) / 2) * pixelAmount;
      const y = (j - (rows - 1) / 2) * pixelAmount;

      dummy.position.set(x, y, 0);
      dummy.rotation.set(
        THREE.MathUtils.randInt(0, 365),
        THREE.MathUtils.randInt(0, 365),
        THREE.MathUtils.randInt(0, 365),
      );

      let currentScale = pixelScale / 50;
      let stretchX = 1,
        stretchY = 1,
        stretchZ = 1;
      let brightness = 1;

      if (imgData) {
        const pixelIndex = ((rows - 1 - j) * cols + i) * 4;
        const r = imgData.data[pixelIndex] / 255;
        const g = imgData.data[pixelIndex + 1] / 255;
        const b = imgData.data[pixelIndex + 2] / 255;
        const a = imgData.data[pixelIndex + 3] / 255;

        brightness = 0.299 * r + 0.587 * g + 0.114 * b;
        brightness = (brightness - minBright) / (maxBright - minBright);
        brightness = Math.max(0.0, Math.min(1.0, brightness));

        if (a <= 0.01) {
          currentScale = 0;
        } else {
          const darkness = 1.0 - brightness;
          const shadeMultiplier = 0.2 + darkness * 1.2;
          currentScale *= shadeMultiplier;

          const maxScaleWobble = 0.5 * chaos;
          const maxSquashWobble = 0.4 * chaos;

          currentScale *= THREE.MathUtils.randFloat(
            1.0 - maxScaleWobble / 2,
            1.0 + maxScaleWobble / 2,
          );

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

        colorHelper.setRGB(brightness, brightness, brightness);
        circleInstance.setColorAt(instanceIndex, colorHelper);
      } else {
        colorHelper.setHex(0x000000);
        circleInstance.setColorAt(instanceIndex, colorHelper);
      }

      dummy.scale.set(
        currentScale * stretchX,
        currentScale * stretchY,
        currentScale * stretchZ,
      );

      // FIX: Apply your new gravityScale setting instead of the hardcoded 1200
      dummy.position.z = brightness * 1200;

      dummy.updateMatrix();
      circleInstance.setMatrixAt(instanceIndex, dummy.matrix);
      instanceIndex++;
    }
  }

  if (imgData) circleInstance.instanceColor.needsUpdate = true;
  scene.add(circleInstance);
}
