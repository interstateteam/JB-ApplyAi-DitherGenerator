import * as THREE from "three";

let circleInstance = null;
const dummy = new THREE.Object3D(); // Cleaner way to handle position + scale
const colorHelper = new THREE.Color();

export function gridSetup(
  scene,
  geometry,
  material,
  dotSpace,
  pixelScale,
  imgData,
) {
  if (circleInstance) {
    scene.remove(circleInstance);
  }

  let winWidth = window.innerWidth;
  let winHeight = window.innerHeight;

  let gridWidth = Math.floor(winWidth / dotSpace);
  let gridHeight = Math.floor(winHeight / dotSpace);
  let gridTotal = gridWidth * gridHeight;

  // Safeguard against zero meshes
  if (gridTotal <= 0) return;

  circleInstance = new THREE.InstancedMesh(geometry, material, gridTotal);

  let instanceIndex = 0;

  for (let i = 0; i < gridWidth; i++) {
    for (let j = 0; j < gridHeight; j++) {
      const x = (i - (gridWidth - 1) / 2) * dotSpace;
      const y = (j - (gridHeight - 1) / 2) * dotSpace;

      // 1. Handle Translation & Scale
      dummy.position.set(x, y, 0);
      dummy.scale.set(pixelScale, pixelScale, 1); // Controlled by slider
      dummy.updateMatrix();
      circleInstance.setMatrixAt(instanceIndex, dummy.matrix);

      // 2. Handle Image Coloring (If an image is loaded)
      if (imgData) {
        // Map grid coordinates to image pixel arrays (flipping Y for standard canvas alignment)
        const imgX = Math.floor((i / gridWidth) * imgData.width);
        const imgY = Math.floor(
          ((gridHeight - 1 - j) / gridHeight) * imgData.height,
        );
        const pixelIndex = (imgY * imgData.width + imgX) * 4;

        const r = imgData.data[pixelIndex] / 255;
        const g = imgData.data[pixelIndex + 1] / 255;
        const b = imgData.data[pixelIndex + 2] / 255;

        colorHelper.setRGB(r, g, b);
        circleInstance.setColorAt(instanceIndex, colorHelper);
      } else {
        // Default color fallback if no image is uploaded
        colorHelper.setHex(0xf43b00);
        circleInstance.setColorAt(instanceIndex, colorHelper);
      }

      instanceIndex++;
    }
  }

  if (imgData) circleInstance.instanceColor.needsUpdate = true;
  scene.add(circleInstance);
}
