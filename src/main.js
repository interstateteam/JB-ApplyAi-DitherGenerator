import * as THREE from "three";
import { gridSetup } from "/src/gridLogic.js";

// Dot Variables
const dotSize = 2;
const dotSpace = 40;

// Window Setup
let winWidth = window.innerWidth;
let winHeight = window.innerHeight;

// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);

// Camera Setup (0,0 is dead center)
const camera = new THREE.OrthographicCamera(
  winWidth / -2,
  winWidth / 2,
  winHeight / 2,
  winHeight / -2,
  0.1,
  1000,
);
camera.position.z = 10;

// Renderer Logic
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(winWidth, winHeight);
document.body.appendChild(renderer.domElement);

// Circle Setup
const geometry = new THREE.CircleGeometry(dotSize, 32);
const material = new THREE.MeshBasicMaterial({ color: 0xf43b00 });

// Grid and circle instancing
gridSetup(scene, geometry, material, dotSpace);

// Animation setup
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

// Window Resize event (Fixed for Orthographic Camera)
window.addEventListener("resize", () => {
  winWidth = window.innerWidth;
  winHeight = window.innerHeight;

  camera.left = winWidth / -2;
  camera.right = winWidth / 2;
  camera.top = winHeight / 2;
  camera.bottom = winHeight / -2;

  camera.updateProjectionMatrix();
  renderer.setSize(winWidth, winHeight);

  gridSetup(scene, geometry, material, dotSpace);
});
