import * as THREE from "three";
import { scene, camera, renderer, composer } from "./three_sceneLogic.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import polygonClipping from "polygon-clipping";

// --- STATE ---

const targetWidth = 2160;
const targetHeight = 1440;

// --- EXPORT 3D ---

/**
 * Exports the active instanced mesh to a GLTF binary format with material transparency enabled.
 */
export async function export3D() {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    const exportGroup = new THREE.Group();
    exportGroup.scale.set(0.01, 0.01, 0.01);

    scene.traverse((object) => {
      if (object.isInstancedMesh) {
        const count = object.count;
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const activeInstances = object.userData.activeInstances;

        // Clone material and ensure transparency flags are preserved for GLTF exporter
        const exportMat = object.material.clone();
        exportMat.transparent = true;

        for (let i = 0; i < count; i++) {
          if (activeInstances && activeInstances[i] === 0) continue;

          object.getMatrixAt(i, matrix);
          matrix.decompose(position, quaternion, scale);

          if (scale.x <= 0.0001) continue;

          const dummyMesh = new THREE.Mesh(object.geometry, exportMat);
          dummyMesh.applyMatrix4(matrix);
          exportGroup.add(dummyMesh);
        }
      }
    });

    exportGroup.updateMatrixWorld(true);

    exporter.parse(
      exportGroup,
      (gltf) => resolve(gltf),
      (error) => reject(error),
      { binary: true },
    );
  });
}

// --- RESOLUTION HELPERS ---

/**
 * Mutates renderer state to match export dimensions, returning original states for rollback.
 */
function setupExportResolution(tWidth, tHeight) {
  let activeCamera = camera;
  scene.traverse((object) => {
    if (object.isCamera) activeCamera = object;
  });

  const originalState = {
    size: new THREE.Vector2(),
    aspect: activeCamera.aspect,
    left: activeCamera.left,
    right: activeCamera.right,
    clearColor: new THREE.Color(),
    clearAlpha: renderer.getClearAlpha(),
    activeCamera,
  };

  renderer.getSize(originalState.size);
  renderer.getClearColor(originalState.clearColor);

  renderer.setSize(tWidth, tHeight, false);

  if (composer) composer.setSize(tWidth, tHeight);

  const targetAspect = tWidth / tHeight;

  if (activeCamera.isPerspectiveCamera) {
    activeCamera.aspect = targetAspect;
  } else if (activeCamera.isOrthographicCamera) {
    const frustumHeight = activeCamera.top - activeCamera.bottom;
    activeCamera.left = -(frustumHeight * targetAspect) / 2;
    activeCamera.right = (frustumHeight * targetAspect) / 2;
  }

  activeCamera.updateProjectionMatrix();
  return originalState;
}

/**
 * Rolls back resolution modifications applied during export routines.
 */
function restoreOriginalResolution(originalState) {
  const { activeCamera, clearColor, clearAlpha } = originalState;
  renderer.setSize(originalState.size.x, originalState.size.y, false);
  if (composer) composer.setSize(originalState.size.x, originalState.size.y);

  renderer.setClearColor(clearColor, clearAlpha);

  if (activeCamera.isPerspectiveCamera) {
    activeCamera.aspect = originalState.aspect;
  } else if (activeCamera.isOrthographicCamera) {
    activeCamera.left = originalState.left;
    activeCamera.right = originalState.right;
  }

  activeCamera.updateProjectionMatrix();
}

// --- EXPORT 2D IMAGE ---

/**
 * Renders the active scene into a base64 encoded JPG format.
 */
 export function exportToJPG() {
   if (!scene || !renderer || !camera) return null;

   const originalState = setupExportResolution(targetWidth, targetHeight);
   const canvasContainer = renderer.domElement.parentElement;

   // 1. Get container color, but intercept transparent values
   let currentBgColor = canvasContainer
     ? window.getComputedStyle(canvasContainer).backgroundColor
     : "#f43b00";

   // If the container is transparent, fallback to white (or your default theme color)
   // otherwise THREE.Color parses rgba(0,0,0,0) as solid black.
   if (currentBgColor === "rgba(0, 0, 0, 0)" || currentBgColor === "transparent") {
     currentBgColor = "#ffffff"; // Or "#f43b00" based on your needs
   }

   const originalBackground = scene.background;
   scene.background = new THREE.Color(currentBgColor);

   // 2. CRITICAL: Explicitly clear buffers before rendering to prevent artifacting
   renderer.clear(true, true, true);

   if (composer) {
     composer.render();
   } else {
     renderer.render(scene, originalState.activeCamera);
   }

   const dataURL = renderer.domElement.toDataURL("image/jpeg", 1.0);

   scene.background = originalBackground;
   restoreOriginalResolution(originalState);

   return dataURL;
 }

/**
 * Renders the active scene into a transparent base64 encoded PNG format.
 */
 export function exportToPNG() {
   if (!scene || !renderer || !camera) return null;

   const originalState = setupExportResolution(targetWidth, targetHeight);
   const originalBackground = scene.background;
   const originalFog = scene.fog; // 1. Store original fog

   // 2. Force transparent clear state & disable fog
   scene.background = null;
   scene.fog = null;
   renderer.setClearColor(0x000000, 0);

   // 3. CRITICAL: Explicitly clear color, depth, and stencil buffers before rendering!
   renderer.clear(true, true, true);

   // 4. Bypass composer to preserve WebGL alpha buffer
   renderer.render(scene, originalState.activeCamera);

   const dataURL = renderer.domElement.toDataURL("image/png");

   // 5. Restore scene state
   scene.background = originalBackground;
   scene.fog = originalFog;
   restoreOriginalResolution(originalState);

   return dataURL;
 }

// --- EXPORT SVG ---

/**
 * Extracts 2D projected geometry from the 3D instanced mesh to form a raw string block.
 */
function convertToSVG_export() {
  const originalState = setupExportResolution(targetWidth, targetHeight);
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);

  const matrix = new THREE.Matrix4();
  const instanceScale = new THREE.Vector3();
  const vector = new THREE.Vector3();
  const svgPaths = [];

  scene.traverse((object) => {
    if (!object.isInstancedMesh) return;
    const geometry = object.geometry;
    const posAttr = geometry.attributes.position;
    const indexAttr = geometry.index;
    const activeInstances = object.userData.activeInstances;

    for (let i = 0; i < object.count; i++) {
      if (activeInstances && activeInstances[i] === 0) continue;

      object.getMatrixAt(i, matrix);
      matrix.premultiply(object.matrixWorld);
      instanceScale.setFromMatrixScale(matrix);

      if (instanceScale.x <= 0.0001) continue;

      const pathPoints = [];

      if (indexAttr) {
        for (let f = 0; f < indexAttr.count; f++) {
          const vertexIndex = indexAttr.getX(f);
          vector.fromBufferAttribute(posAttr, vertexIndex);
          vector.applyMatrix4(matrix);
          vector.project(camera);

          const x = (vector.x + 1) * 0.5 * targetWidth;
          const y = -(vector.y - 1) * 0.5 * targetHeight;
          const isFirst = f % 3 === 0;
          pathPoints.push(`${isFirst ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
        }
      } else {
        for (let v = 0; v < posAttr.count; v++) {
          vector.fromBufferAttribute(posAttr, v);
          vector.applyMatrix4(matrix);
          vector.project(camera);

          const x = (vector.x + 1) * 0.5 * targetWidth;
          const y = -(vector.y - 1) * 0.5 * targetHeight;
          const isFirst = v % 3 === 0;
          pathPoints.push(`${isFirst ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
        }
      }

      svgPaths.push(`<path d="${pathPoints.join(" ")} Z" fill="black" />`);
    }
  });

  restoreOriginalResolution(originalState);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${targetWidth} ${targetHeight}" width="${targetWidth}" height="${targetHeight}">${svgPaths.join("\n")}</svg>`;
}

/**
 * Merges and refines raw SVG polygon paths using constructive solid geometry.
 */
async function convertToSVG_refine(svgString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const paths = Array.from(doc.querySelectorAll("path"));
  const canvasWidth = doc.documentElement.getAttribute("width") || targetWidth;
  const canvasHeight = doc.documentElement.getAttribute("height") || targetHeight;
  const finalSvgPaths = [];
  const chunkSize = 1000;

  for (let i = 0; i < paths.length; i += chunkSize) {
    const chunk = paths.slice(i, i + chunkSize);

    chunk.forEach((path) => {
      const dAttr = path.getAttribute("d");
      if (!dAttr) return;

      const coords = dAttr.match(/[-+]?[0-9]*\.?[0-9]+/g);
      if (!coords) return;

      const triangles = [];
      for (let j = 0; j < coords.length; j += 6) {
        if (j + 5 >= coords.length) break;
        const pA = [Number(coords[j]), Number(coords[j + 1])];
        const pB = [Number(coords[j + 2]), Number(coords[j + 3])];
        const pC = [Number(coords[j + 4]), Number(coords[j + 5])];

        const signedArea = (pB[0] - pA[0]) * (pC[1] - pA[1]) - (pC[0] - pA[0]) * (pB[1] - pA[1]);

        if (Math.abs(signedArea) < 0.000001) continue;

        const validTriangle = signedArea > 0 ? [pA, pB, pC, pA] : [pA, pC, pB, pA];
        triangles.push([validTriangle]);
      }

      if (triangles.length === 0) return;

      let unified = [];
      try {
        unified = polygonClipping.union(...triangles);
      } catch (e) {
        for (let k = 0; k < triangles.length; k++) {
          if (unified.length === 0) {
            unified = [triangles[k]];
            continue;
          }
          try {
            unified = polygonClipping.union(unified, triangles[k]);
          } catch (err) {
            unified.push(triangles[k]);
          }
        }
      }

      if (unified && unified.length > 0) {
        const unifiedPathData = [];
        unified.forEach((polygon) => {
          polygon.forEach((ring) => {
            ring.forEach((pt, idx) => {
              unifiedPathData.push(
                `${idx === 0 ? "M" : "L"}${pt[0].toFixed(2)} ${pt[1].toFixed(2)}`
              );
            });
            unifiedPathData.push("Z");
          });
        });

        if (unifiedPathData.length > 0) {
          finalSvgPaths.push(
            `<path d="${unifiedPathData.join(" ")}" fill="black" stroke="none" />`
          );
        }
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const finalSvgDocument = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasWidth} ${canvasHeight}" width="${canvasWidth}" height="${canvasHeight}">${finalSvgPaths.join("\n")}</svg>`.trim();
  const blob = new Blob([finalSvgDocument], { type: "image/svg+xml;charset=utf-8" });

  return URL.createObjectURL(blob);
}

/**
 * Controller pipeline for full SVG extraction and refinement.
 */
export async function convertToSVG() {
  const rawSvg = convertToSVG_export();
  if (!rawSvg) throw new Error("Failed to generate raw SVG");
  return await convertToSVG_refine(rawSvg);
}

// --- EXPORT VIDEO ---

/**
 * Compiles rendered frames into a seamless video loop using native WebM or FFmpeg fallbacks.
 */
 /**
  * Compiles rendered frames into a seamless video loop using native WebM or FFmpeg fallbacks.
  */
 export function exportVideo(
   durationInSeconds = 5,
   format = "mp4",
   bgColor = null,
   onStartRecord,
 ) {
   return new Promise(async (resolve, reject) => {
     if (!renderer || !scene || !camera) {
       reject("Dependencies missing");
       return;
     }

     const originalState = setupExportResolution(targetWidth, targetHeight);
     const originalBackground = scene.background;

     if (bgColor) {
       scene.background = new THREE.Color(bgColor);
       renderer.setClearColor(new THREE.Color(bgColor), 1);
     } else {
       scene.background = null;
       renderer.setClearColor(0x000000, 0);
     }

     if (typeof onStartRecord === "function") onStartRecord();

     // CRITICAL: Initialize global export flags so the animation loop controller knows to run
     window.isExportingLoop = true;
     window.isAnimationLoopComplete = false;

     const canvas = renderer.domElement;
     let frameCount = 0;

     const originalPerfNow = window.performance.now.bind(window.performance);
     const originalDateNow = window.Date.now.bind(window.Date);
     const originalRAF = window.requestAnimationFrame.bind(window);
     const originalCancelRAF = window.cancelAnimationFrame.bind(window);

     let simulatedTime = originalPerfNow();
     window.performance.now = () => simulatedTime;
     window.Date.now = () => Math.floor(simulatedTime);

     let rafCallbacks = [];
     window.requestAnimationFrame = (callback) => {
       rafCallbacks.push(callback);
       return Math.random();
     };
     window.cancelAnimationFrame = () => {};

     if (format === "webm") {
       const chunks = [];
       const stream = canvas.captureStream(0);
       const track = stream.getVideoTracks()[0];

       // 1. Dynamic codec selection: VP9 supports alpha transparency; VP8 does not.
       const supportedTypes = [
         "video/webm;codecs=vp9",
         "video/webm;codecs=vp8",
         "video/webm",
       ];
       const selectedMimeType = supportedTypes.find((type) =>
         MediaRecorder.isTypeSupported(type)
       ) || "video/webm";

       let recorder;
       try {
         recorder = new MediaRecorder(stream, {
           mimeType: selectedMimeType,
           videoBitsPerSecond: 25000000,
         });
       } catch (err) {
         cleanupWorld();
         reject(`WebM recording not supported: ${err.message}`);
         return;
       }

       recorder.ondataavailable = (e) => {
         if (e.data && e.data.size > 0) chunks.push(e.data);
       };

       recorder.onstop = () => {
         cleanupWorld();
         resolve(new Blob(chunks, { type: selectedMimeType }));
       };

       recorder.start();
       let isFlushing = false;
       let flushFrames = 0;

       const recordNextFrame = async () => {
         if (bgColor && composer) {
           composer.render();
         } else {
           renderer.clear(true, true, true);
           renderer.render(scene, originalState.activeCamera);
         }

         // 2. Await buffer presentation so WebGL doesn't capture blank/duplicate frames
         await new Promise((r) => originalRAF(r));

         if (track && typeof track.requestFrame === "function") {
           track.requestFrame();
         }

         const swalText = document.querySelector(".swal2-html-container");
         if (swalText) swalText.innerText = `Recording frame ${frameCount}...`;

         frameCount++;

         if (!isFlushing) {
           let isSequenceFinished = false;
           if (window.isAnimationLoopComplete) {
             if (window.exportTotalDuration) {
               const gifFrames = Math.round(window.exportTotalDuration * 30);
               if (frameCount > 0 && frameCount % gifFrames === 0)
                 isSequenceFinished = true;
             } else {
               isSequenceFinished = true;
             }
           }
           if (isSequenceFinished) isFlushing = true;
         }

         if (isFlushing) {
           if (flushFrames >= 2) {
             recorder.stop();
             return;
           }
           flushFrames++;
         }

         simulatedTime += 1000 / 30;
         const callbacksToRun = [...rafCallbacks];
         rafCallbacks = [];
         callbacksToRun.forEach((cb) => cb(simulatedTime));

         // 3. Pace frame recording to real-time (~33.3ms for 30fps) to prevent hyperspeed playback
         setTimeout(recordNextFrame, 1000 / 30);
       };

       setTimeout(recordNextFrame, 1000 / 30);
     } else {
       const { FFmpeg } = await import("@ffmpeg/ffmpeg");
       const { fetchFile } = await import("@ffmpeg/util");

       const ffmpeg = new FFmpeg();
       await ffmpeg.load();

       const captureMimeType = bgColor ? "image/jpeg" : "image/png";
       const extension = bgColor ? "jpg" : "png";

       const captureNextFrame = async () => {
         if (bgColor && composer) {
           composer.render();
         } else {
           renderer.clear(true, true, true);
           renderer.render(scene, originalState.activeCamera);
         }

         const swalText = document.querySelector(".swal2-html-container");
         if (swalText) swalText.innerText = `Capturing frame ${frameCount}...`;

         const frameBlob = await new Promise((res) => {
           canvas.toBlob(
             res,
             captureMimeType,
             captureMimeType === "image/jpeg" ? 0.85 : undefined,
           );
         });

         const frameName = `frame_${String(frameCount).padStart(4, "0")}.${extension}`;
         await ffmpeg.writeFile(frameName, await fetchFile(frameBlob));
         frameCount++;

         if (window.isAnimationLoopComplete) {
           if (swalText) swalText.innerText = `Compiling video...`;
           compileVideoAndResolve();
         } else {
           simulatedTime += 1000 / 30;
           const callbacksToRun = [...rafCallbacks];
           rafCallbacks = [];
           callbacksToRun.forEach((cb) => cb(simulatedTime));
           setTimeout(captureNextFrame, 0);
         }
       };

       const compileVideoAndResolve = async () => {
         try {
           let outFilename = `output.${format}`;
           let ffmpegArgs = [
             "-framerate",
             "30",
             "-i",
             `frame_%04d.${extension}`,
           ];

           if (format === "mp4") {
             ffmpegArgs.push(
               "-c:v",
               "libx264",
               "-preset",
               "ultrafast",
               "-tune",
               "animation",
               "-pix_fmt",
               "yuv420p",
               "-crf",
               "18",
               outFilename,
             );
           } else if (format === "mov") {
             ffmpegArgs.push(
               "-c:v",
               "prores_ks",
               "-profile:v",
               "4",
               "-vendor",
               "ap10",
               "-pix_fmt",
               "yuva444p10le",
               outFilename,
             );
           }

           await ffmpeg.exec(ffmpegArgs);
           const finalVideoData = await ffmpeg.readFile(outFilename);
           const videoTypeMap = { mp4: "video/mp4", mov: "video/quicktime" };

           cleanupWorld();
           try {
             ffmpeg.terminate();
           } catch (e) {}

           resolve(
             new Blob([finalVideoData.buffer], { type: videoTypeMap[format] }),
           );
         } catch (err) {
           cleanupWorld();
           try {
             ffmpeg.terminate();
           } catch (e) {}
           reject(err);
         }
       };

       setTimeout(captureNextFrame, 100);
     }

     function cleanupWorld() {
       window.isExportingLoop = false;
       window.performance.now = originalPerfNow;
       window.Date.now = originalDateNow;
       window.requestAnimationFrame = originalRAF;
       window.cancelAnimationFrame = originalCancelRAF;

       rafCallbacks.forEach((cb) => originalRAF(cb));
       rafCallbacks = [];

       scene.background = originalBackground;
       restoreOriginalResolution(originalState);
     }
   });
 }
