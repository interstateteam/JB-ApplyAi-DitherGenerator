import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createPostProcessor } from "./postprocessing.js";

// Exported so gridLogic can add/remove meshes without needing a getter
export let scene, camera, renderer, controls;
export let pauseControl = false;

// The setter function that main.js will call
export function setPauseControl(value) {
  pauseControl = value;

  if (controls) {
    controls.autoRotate = !value;
  }
}

const defCamPos = { x: 0, y: 0, z: 1000 };
const defCamZoom = 1;
const defCamTar = { x: 0, y: 0, z: 500 };

// Bootstraps the Three.js scene, camera, renderer, controls, and animation loop.
// Returns { material } — the single shared MeshBasicMaterial used by all instanced dots.
export function initThree(canvasId) {
  const htmlCanvas = document.getElementById(canvasId);
  if (!htmlCanvas) return;

  scene = new THREE.Scene();
  scene.background = null;

  // Orthographic camera keeps dot sizes consistent regardless of depth
  camera = new THREE.OrthographicCamera(
    window.innerWidth / -2,
    window.innerWidth / 2,
    window.innerHeight / 2,
    window.innerHeight / -2,
    1,
    1000,
  );
  camera.position.set(defCamPos.x, defCamPos.y, defCamPos.z);
  camera.zoom = defCamZoom;
  camera.updateProjectionMatrix();

  renderer = new THREE.WebGLRenderer({
    canvas: htmlCanvas,
    antialias: true,
    alpha: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);

  // OrbitControls: pan/zoom/rotate with damping for smooth feel
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(defCamTar.x, defCamTar.y, defCamTar.z);
  controls.enableDamping = true;
  controls.dampingFactor = 0.5;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 5.0;
  controls.saveState();

  // Single material shared across all dot instances; colour is set per-instance via InstancedMesh
  const material = new THREE.MeshBasicMaterial({});
  material.color.setRGB(0.0, 0.0, 0.0);

  const composer = createPostProcessor(renderer, scene, camera);

  function animate() {
    requestAnimationFrame(animate);
    if (controls) {
      controls.update();
    }
    renderer.render(scene, camera);
    // composer.render();
  }
  animate();

  // Recalculate frustum and renderer size on window resize
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

  return { material };
}

export function resetCameraView() {
  if (!camera || !controls) return;
  setPauseControl(true);

  controls.reset();
}
