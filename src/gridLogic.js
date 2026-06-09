import * as THREE from "three";

let gridClear = null;

export function gridSetup(scene, geometry, material, dotSpace) {
  if (gridClear) {
    scene.remove(circleInstance);
    circleInstance.dispose();
  }

  // Custom Variables
  let winWidth = window.innerWidth;
  let winHeight = window.innerHeight;

  let gridWidth = Math.floor(winWidth / dotSpace);
  let gridHeight = Math.floor(winHeight / dotSpace);
  let gridTotal = gridWidth * gridHeight;

  let circleInstance = new THREE.InstancedMesh(geometry, material, gridTotal);

  let instanceIndex = 0;
  const null01 = new THREE.Matrix4();

  for (let i = 0; i < gridWidth; i++) {
    for (let j = 0; j < gridHeight; j++) {
      const x = (i - (gridWidth - 1) / 2) * dotSpace;
      const y = (j - (gridHeight - 1) / 2) * dotSpace;

      null01.setPosition(x, y, 0);

      circleInstance.setMatrixAt(instanceIndex, null01);
      instanceIndex++;
    }
  }

  scene.add(circleInstance);
}
