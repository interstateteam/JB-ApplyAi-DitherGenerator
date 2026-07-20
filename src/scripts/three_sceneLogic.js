import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { updateCameraAnimation } from "./three_animationLogic.js";
import { getResponsiveZoom } from "./three_gridLogic.js";

// --- GLOBAL STATE ---

export let scene, camera, renderer, controls, material;
export let pauseControl = false;
export let dynamicZoom = 1;
export let composer = null;

// The fixed size we set in image logic
const VIRTUAL_SIZE = 1000;

/**
 * Calculates a dynamic multiplier so the fixed virtual grid
 * always fits perfectly within the current browser window bounds.
 */
const getScreenFitZoom = () => {
  // Lower this number to zoom in more. (e.g., 1.0 is a tight fit, 0.9 crops slightly)
  const paddingTarget = VIRTUAL_SIZE * 0.95;
  return Math.min(window.innerWidth, window.innerHeight) / paddingTarget;
};
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
 * Updates the camera's zoom level dynamically, factoring in screen size.
 */
export const setCameraZoom = (zoomLevel) => {
  dynamicZoom = zoomLevel;
  if (camera) {
    camera.zoom = dynamicZoom * getScreenFitZoom();
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

  camera.position.set(0, 0, 1000);
  camera.lookAt(0, 0, 0);

  controls.target.set(0, 0, 0);
  if (typeof controls.reset === "function") {
    controls.reset();
  }
  controls.update();

  camera.zoom = dynamicZoom * getScreenFitZoom();
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
  dynamicZoom = config.zoom;

  // Apply the screen-fit multiplier to the initial zoom
  camera.zoom = dynamicZoom * getScreenFitZoom();
  camera.updateProjectionMatrix();

  renderer = new THREE.WebGLRenderer({
    canvas: htmlCanvas,
    antialias: true,
    preserveDrawingBuffer: true,
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
      updateCameraAnimation();
      controls.update();
    }
    renderer.render(scene, camera);
  };

  animate();

  window.addEventListener("resize", () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Retain frustum scale on resize to prevent sudden perspective jumps
    camera.left = (width / -2) * frustumScale;
    camera.right = (width / 2) * frustumScale;
    camera.top = (height / 2) * frustumScale;
    camera.bottom = (height / -2) * frustumScale;

    // Recalculate zoom dynamically to fit the new window size
    camera.zoom = dynamicZoom * getScreenFitZoom();
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
  });
};
