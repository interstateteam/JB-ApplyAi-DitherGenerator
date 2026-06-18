import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createPostProcessor } from "./thee_styleLogic.js";
import {
  updateCameraAnimation,
  forcePauseAnimation,
} from "./three_animationLogic.js";

// --- Global State Exports ---
export let scene, camera, renderer, controls, material;
export let pauseControl = false;
let dynamicZoom = 1;
export let composer = null;

// --- Configuration ---
const cameraSetup = {
  position: { x: 0, y: 0, z: 1500 },
  target: { x: 0, y: 0, z: 500 },
  zoom: 1,
};

// --- Core Functions ---

// Toggles the auto-rotation of the scene
export const setPauseControl = (value) => {
  pauseControl = value;
  if (controls) {
    controls.autoRotate = !value;
  }
};

// update the camera zoom
export const setCameraZoom = (zoomLevel) => {
  dynamicZoom = zoomLevel;
  if (camera) {
    camera.zoom = dynamicZoom;
    camera.updateProjectionMatrix();
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
  forcePauseAnimation();
  controls.reset();
  camera.zoom = dynamicZoom;
  camera.updateProjectionMatrix();
};

// Initializes core Three.js components
export const initThree = (canvasId) => {
  const htmlCanvas = document.getElementById(canvasId);
  if (!htmlCanvas) return;

  // Scene Setup
  scene = new THREE.Scene();
  scene.background = null;

  // Camera Setup (Orthographic for consistent dot sizes regardless of depth)
  camera = new THREE.OrthographicCamera(
    window.innerWidth / -2,
    window.innerWidth / 2,
    window.innerHeight / 2,
    window.innerHeight / -2,
    1,
    2000,
  );
  camera.position.set(
    cameraSetup.position.x,
    cameraSetup.position.y,
    cameraSetup.position.z,
  );
  camera.zoom = cameraSetup.zoom;
  camera.updateProjectionMatrix();

  // Renderer Setup
  renderer = new THREE.WebGLRenderer({
    canvas: htmlCanvas,
    antialias: true,
    alpha: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);

  // Controls Setup (Pan/zoom/rotate with smooth damping)
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(
    cameraSetup.target.x,
    cameraSetup.target.y,
    cameraSetup.target.z,
  );
  controls.enableDamping = true;
  controls.dampingFactor = 0.5;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 5.0;
  controls.saveState();

  // Material Setup (Single material shared across all instanced dots)
  material = new THREE.MeshBasicMaterial({});
  material.color.setRGB(0.0, 0.0, 0.0);

  // Post Processing Setup
  const composer = createPostProcessor(renderer, scene, camera);

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
