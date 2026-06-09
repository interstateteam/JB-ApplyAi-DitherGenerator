import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

let scene, camera, renderer, geometry, material, circleInstance;
const dummy = new THREE.Object3D();
const colorHelper = new THREE.Color();

// Hidden offscreen canvas for computational pixel sampling
const sampleCanvas = document.createElement("canvas");
const sampleCtx = sampleCanvas.getContext("2d");

export function initThree(canvasId) {
  const htmlCanvas = document.getElementById(canvasId);
  if (!htmlCanvas) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);

  camera = new THREE.OrthographicCamera(
    window.innerWidth / -2,
    window.innerWidth / 2,
    window.innerHeight / 2,
    window.innerHeight / -2,
    1,
    5000,
  );

  camera.position.z = 1000;

  renderer = new THREE.WebGLRenderer({ canvas: htmlCanvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  geometry = new THREE.SphereGeometry(2, 16, 12);
  material = new THREE.MeshBasicMaterial({ color: 0xffffff });

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener("resize", () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.left = w / -2;
    camera.right = w / 2;
    camera.top = h / 2;
    camera.bottom = h / -2;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
}

export function updateThreeGrid(img, settings) {
  if (!scene) return;

  if (circleInstance) {
    scene.remove(circleInstance);
  }

  const { gridSize, pixelSpace, pixelSizePercent } = settings;

  const dotSpace = gridSize;
  const winWidth = window.innerWidth;
  const winHeight = window.innerHeight;

  // 1. Calculate the maximum columns and rows that can physically fit on screen
  const maxCols = Math.floor(winWidth / dotSpace);
  const maxRows = Math.floor(winHeight / dotSpace);

  let cols = maxCols;
  let rows = maxRows;

  // 2. Adjust grid dimensions to perfectly match the image aspect ratio
  if (img) {
    const imgAspect = img.width / img.height;
    const screenAspect = winWidth / winHeight;

    if (imgAspect > screenAspect) {
      // Image is wider than the screen layout -> fix width, shrink height
      cols = maxCols;
      rows = Math.floor(maxCols / imgAspect);
    } else {
      // Image is taller than the screen layout -> fix height, shrink width
      rows = maxRows;
      cols = Math.floor(maxRows * imgAspect);
    }
  }

  const totalDots = cols * rows;
  if (totalDots <= 0) return;

  // 3. Render to offscreen canvas using the corrected proportions
  if (img) {
    sampleCanvas.width = cols;
    sampleCanvas.height = rows;
    sampleCtx.drawImage(img, 0, 0, cols, rows);
  }
  const imgData = img ? sampleCtx.getImageData(0, 0, cols, rows) : null;

  circleInstance = new THREE.InstancedMesh(geometry, material, totalDots);
  let instanceIndex = 0;

  // Apply Grid Zoom scale configuration
  camera.zoom = pixelSpace;
  camera.updateProjectionMatrix();

  // 4. Run loop using the new corrected 'cols' and 'rows' variables
  // 4. Run loop using the corrected 'cols' and 'rows' variables
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = (i - (cols - 1) / 2) * dotSpace;
      const y = (j - (rows - 1) / 2) * dotSpace;

      dummy.position.set(x, y, 0);

      // Default scale from your slider settings
      let currentScale = pixelSizePercent / 50;

      if (imgData) {
        // The 4 channels: Red (0), Green (1), Blue (2), Alpha (3)
        const pixelIndex = ((rows - 1 - j) * cols + i) * 4;

        const r = imgData.data[pixelIndex] / 255;
        const g = imgData.data[pixelIndex + 1] / 255;
        const b = imgData.data[pixelIndex + 2] / 255;
        const a = imgData.data[pixelIndex + 3] / 255; // 1. Grab the Alpha channel

        // 2. Calculate perceived brightness (0.0 = pure black, 1.0 = pure white)
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

        // 3. THRESHOLD CHECK: If fully transparent OR darker than 5% black, vanish it
        if (a === 0 || brightness < 0.05) {
          currentScale = 0;
        }

        colorHelper.setRGB(r, g, b);
        circleInstance.setColorAt(instanceIndex, colorHelper);
      } else {
        colorHelper.setHex(0xf43b00);
        circleInstance.setColorAt(instanceIndex, colorHelper);
      }

      // Apply the finalized scale (either its normal size or 0)
      dummy.scale.setScalar(currentScale);
      dummy.updateMatrix();

      circleInstance.setMatrixAt(instanceIndex, dummy.matrix);
      instanceIndex++;
    }
  }

  if (imgData) circleInstance.instanceColor.needsUpdate = true;
  scene.add(circleInstance);
}
