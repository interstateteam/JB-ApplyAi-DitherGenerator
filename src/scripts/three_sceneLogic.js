import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { updateCameraAnimation } from "./three_animationLogic.js";
import { getResponsiveZoom } from "./three_gridLogic.js";

// --- GLOBAL STATE ---

export let scene, camera, renderer, controls, material;
export let pauseControl = false;
export let dynamicZoom = 1;
export let composer = null;

// --- CAMERA LOGIC ---

/**
 * Generates the initial camera configuration object.
 */
export const getCameraSetup = (initialGridScale) => {
  const initialZoom = initialGridScale
    ? getResponsiveZoom(initialGridScale)
    : 1;
  return {
    position: { x: 0, y: 0, z: 1000 },
    target: { x: 0, y: 0, z: 0 },
    zoom: initialZoom,
  };
};

/**
 * Updates the camera's zoom level dynamically.
 */
export const setCameraZoom = (zoomLevel) => {
  dynamicZoom = zoomLevel;
  if (camera) {
    camera.zoom = dynamicZoom;
    camera.updateProjectionMatrix();
    if (controls) controls.saveState();
  }
};

/**
 * Toggles auto-rotation on the scene controls.
 */
export const setPauseControl = (value) => {
  pauseControl = value;
  if (controls) {
    controls.autoRotate = !value;
  }
};

/**
 * Adjusts the far clipping plane of the camera.
 */
export const setCameraClipping = (distance) => {
  if (!camera) return;
  camera.far = distance;
  camera.updateProjectionMatrix();
};

/**
 * Resets the camera to its cached original orientation and zoom.
 */
export const resetCameraView = () => {
  if (!camera || !controls) return;
  controls.reset();
  camera.zoom = dynamicZoom;
  camera.updateProjectionMatrix();
};

// --- INITIALIZATION ---

/**
 * Bootstraps the Three.js scene, renderer, camera, and standard materials.
 */
export const initThree = (canvasId, initialGridScale) => {
  const htmlCanvas = document.getElementById(canvasId);
  if (!htmlCanvas) return;

  const config = getCameraSetup(initialGridScale);
  const frustumScale = 1.25;

  scene = new THREE.Scene();
  scene.background = null;

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

  renderer = new THREE.WebGLRenderer({
    canvas: htmlCanvas,
    antialias: true,
    alpha: true,
  });

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.setClearAlpha(0);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(config.target.x, config.target.y, config.target.z);
  controls.saveState();

  material = new THREE.MeshBasicMaterial({});
  material.color.set("#222222");

  const animate = () => {
    requestAnimationFrame(animate);
    if (controls) {
      updateCameraAnimation(controls);
      controls.update();
    }
    renderer.render(scene, camera);
  };

  animate();

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
