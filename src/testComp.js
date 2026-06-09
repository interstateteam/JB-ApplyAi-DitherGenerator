const container = document.getElementById("canvas3d");
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.z = 50; // Move camera back to view the grid

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// Add a subtle ambient light and a directional light
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(0, 10, 20);
scene.add(dirLight);

// --- 2. IMAGE PROCESSING CONFIG ---
const imageLoader = document.getElementById("imageLoader");
const procCanvas = document.getElementById("processingCanvas");
const procCtx = procCanvas.getContext("2d");

const GRID_WIDTH = 60; // Higher resolution works great in 3D!
const GRID_HEIGHT = 60;
let instancedMesh = null; // Global reference to our 3D grid

imageLoader.addEventListener("change", handleImage, false);

function handleImage(e) {
  const reader = new FileReader();
  reader.onload = function (event) {
    const img = new Image();
    img.onload = function () {
      // Downsample image onto hidden canvas
      procCanvas.width = GRID_WIDTH;
      procCanvas.height = GRID_HEIGHT;
      procCtx.drawImage(img, 0, 0, GRID_WIDTH, GRID_HEIGHT);

      const imgData = procCtx.getImageData(0, 0, GRID_WIDTH, GRID_HEIGHT);

      // Generate the 3D dot grid
      create3DGrid(imgData.data);
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(e.target.files[0]);
}

// --- 3. CREATE THE 3D DOT SCALE GRID ---
function create3DGrid(pixels) {
  // If a grid already exists, remove it from the scene to prevent memory leaks
  if (instancedMesh) {
    scene.remove(instancedMesh);
    instancedMesh.geometry.dispose();
    instancedMesh.material.dispose();
  }

  // Define the geometry of a single dot (Sphere, Cylinder, or Box works beautifully)
  const dotGeometry = new THREE.SphereGeometry(0.4, 16, 16);

  // Using MeshStandardMaterial so it reacts cleanly to lighting
  const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const totalInstances = GRID_WIDTH * GRID_HEIGHT;
  instancedMesh = new THREE.InstancedMesh(
    dotGeometry,
    dotMaterial,
    totalInstances,
  );

  // Helper objects to handle individual transformation math
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  let instanceIndex = 0;

  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const pixelIndex = (y * GRID_WIDTH + x) * 4;
      const r = pixels[pixelIndex];
      const g = pixels[pixelIndex + 1];
      const b = pixels[pixelIndex + 2];

      // Calculate luminance/brightness (0.0 to 1.0)
      const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

      // Map 2D grid coordinates to centered 3D Space coordinates
      const posX = x - GRID_WIDTH / 2;
      const posY = -y + GRID_HEIGHT / 2; // Invert Y because canvas goes down, 3D goes up
      const posZ = 0;

      // Set Position
      dummy.position.set(posX, posY, posZ);

      // Apply dotScale based on brightness
      // We multiply by a scalar to make sure dark pixels don't completely vanish to 0
      const scaleFactor = brightness * 1.2 + 0.1;
      dummy.scale.set(scaleFactor, scaleFactor, scaleFactor);

      // Update internal transformation matrix for this specific dot
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(instanceIndex, dummy.matrix);

      // Set color of the dot matching the pixel
      color.setRGB(r / 255, g / 255, b / 255);
      instancedMesh.setColorAt(instanceIndex, color);

      instanceIndex++;
    }
  }

  // Notify Three.js that properties have changed
  instancedMesh.instanceMatrix.needsUpdate = true;
  if (instancedMesh.instanceColor)
    instancedMesh.instanceColor.needsUpdate = true;

  scene.add(instancedMesh);
}

// --- 4. ANIMATION LOOP ---
function animate() {
  requestAnimationFrame(animate);

  renderer.render(scene, camera);
}
animate();

// Handle browser window resizing
window.addEventListener("resize", onWindowResize, false);
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
