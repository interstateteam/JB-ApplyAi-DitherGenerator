import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// Builds and returns a post-processing composer with bloom layered on top of the main render.
// The composer is a drop-in replacement for renderer.render() in the animation loop.
export function createPostProcessor(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);

  // First pass: render the scene normally into the composer's buffer
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Second pass: bloom. Bright pixels bleed light into their neighbours.
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    3.5, // strength  — intensity of the bleed
    2.0, // radius    — how far the glow spreads across neighbouring cells
    1.0, // threshold — minimum brightness before a pixel contributes to bloom
  );
  composer.addPass(bloomPass);

  // Keep the bloom resolution in sync with the viewport
  window.addEventListener("resize", () => {
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  return composer;
}
