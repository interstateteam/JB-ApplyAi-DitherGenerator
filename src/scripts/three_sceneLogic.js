import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createPostProcessor } from "./thee_styleLogic.js";
import { updateCameraAnimation } from "./three_animationLogic.js";
import { getResponsiveZoom } from "./three_gridLogic.js";

// --- Global State Exports ---
export let scene, camera, renderer, controls, material;
export let pauseControl = false;
export let dynamicZoom = 1;
export let composer = null;

// --- Core Functions ---

export const getCameraSetup = (initialGridScale) => {
  // Fetch the correct zoom right at startup
  const initialZoom = initialGridScale
    ? getResponsiveZoom(initialGridScale)
    : 1;

  return {
    position: { x: 0, y: 0, z: 1000 },
    target: { x: 0, y: 0, z: 0 },
    zoom: initialZoom,
  };
};

export const setCameraZoom = (zoomLevel) => {
  dynamicZoom = zoomLevel;
  if (camera) {
    camera.zoom = dynamicZoom;
    camera.updateProjectionMatrix();

    if (controls) controls.saveState();
  }
};

// Toggles the auto-rotation of the scene
export const setPauseControl = (value) => {
  pauseControl = value;
  if (controls) {
    controls.autoRotate = !value;
  }
};

// Sets the camera clipping distance based on the slider value
export const setCameraClipping = (distance) => {
  if (!camera) return;

  camera.far = distance;
  camera.updateProjectionMatrix();
};

// Resets the camera to its initial state and pauses rotation
export const resetCameraView = () => {
  if (!camera || !controls) return;
  controls.reset();
  camera.zoom = dynamicZoom;
  camera.updateProjectionMatrix();
};

// Initializes core Three.js components
export const initThree = (canvasId, initialGridScale) => {
  const htmlCanvas = document.getElementById(canvasId);
  if (!htmlCanvas) return;

  const config = getCameraSetup(initialGridScale);

  // Scene Setup
  scene = new THREE.Scene();
  scene.background = null;

  const frustumScale = 1.25;

  // Camera Setup
  camera = new THREE.OrthographicCamera(
    (window.innerWidth / -2) * frustumScale,
    (window.innerWidth / 2) * frustumScale,
    (window.innerHeight / 2) * frustumScale,
    (window.innerHeight / -2) * frustumScale,
    -2000,
    4000,
  );

  camera.position.set(config.position.x, config.position.y, config.position.z);
  camera.zoom = config.zoom;

  dynamicZoom = config.zoom;

  camera.updateProjectionMatrix();

  // Renderer Setup
  renderer = new THREE.WebGLRenderer({
    canvas: htmlCanvas,
    antialias: true,
    alpha: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.setClearAlpha(0);

  // Controls Setup (Pan/zoom/rotate with smooth damping)
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(config.target.x, config.target.y, config.target.z);
  controls.enableDamping = true;
  controls.dampingFactor = 0.5;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 5.0;
  controls.saveState();

  // Material Setup (Single material shared across all instanced dots)
  material = new THREE.MeshBasicMaterial({});
  material.color.set("#222222");

  // Post Processing Setup
  // const composer = createPostProcessor(renderer, scene, camera);

  // Animation Loop
  const animate = () => {
    requestAnimationFrame(animate);

    if (controls) {
      updateCameraAnimation(controls);

      controls.update();
    }

    renderer.render(scene, camera);
  };
  animate();

  // Window Resize Handling
  window.addEventListener("resize", () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.left = width / -2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = height / -2;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
  });
};
