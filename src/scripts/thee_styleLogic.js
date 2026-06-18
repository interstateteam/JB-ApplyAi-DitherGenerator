import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

export function createPostProcessor(renderer, scene, camera) {
  const canvasContainer = renderer.domElement.parentElement;
  if (canvasContainer) {
    const currentBgColor =
      window.getComputedStyle(canvasContainer).backgroundColor;
    scene.background = new THREE.Color(currentBgColor);
  }

  const composer = new EffectComposer(renderer);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.6, // strength
    0.4, // radius
    0.0, // threshold
  );
  composer.addPass(bloomPass);

  window.addEventListener("resize", () => {
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  return composer;
}
