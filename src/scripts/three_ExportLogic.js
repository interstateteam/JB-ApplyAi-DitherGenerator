import * as THREE from "three";
import { composer } from "./three_sceneLogic.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import polygonClipping from "polygon-clipping";

const targetWidth = 2560;
const targetHeight = 1440;

const ffmpeg = new FFmpeg();

// --- Export 3D Shape Logic ---
export async function export3D(scene) {
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

        // Grab the VIP list from the mesh
        const activeInstances = object.userData.activeInstances;

        for (let i = 0; i < count; i++) {
          // --- FIXED: Ignore physical size. If it's flagged as background (0), skip it immediately. ---
          if (activeInstances && activeInstances[i] === 0) continue;

          object.getMatrixAt(i, matrix);
          matrix.decompose(position, quaternion, scale);

          // Fallback sanity check just to prevent absolute zeros from crashing math
          if (scale.x <= 0.0001) continue;

          const dummyMesh = new THREE.Mesh(object.geometry, object.material);
          dummyMesh.applyMatrix4(matrix);
          exportGroup.add(dummyMesh);
        }
      }
    });

    exportGroup.updateMatrixWorld(true);

    exporter.parse(
      exportGroup,
      (gltf) => {
        resolve(gltf);
      },
      (error) => {
        console.error("GLTF Export failed:", error);
        reject(error);
      },
      { binary: true },
    );
  });
}

// --- Resolution Setup Helpers ---
function setupExportResolution(
  renderer,
  activeCamera,
  targetWidth,
  targetHeight,
) {
  const originalState = {
    size: new THREE.Vector2(),
    aspect: activeCamera.aspect,
    left: activeCamera.left,
    right: activeCamera.right,
  };

  renderer.getSize(originalState.size);

  renderer.setSize(targetWidth, targetHeight, false);
  if (composer) composer.setSize(targetWidth, targetHeight);

  const targetAspect = targetWidth / targetHeight;
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

function restoreOriginalResolution(renderer, activeCamera, originalState) {
  renderer.setSize(originalState.size.x, originalState.size.y, false);
  if (composer) composer.setSize(originalState.size.x, originalState.size.y);

  if (activeCamera.isPerspectiveCamera) {
    activeCamera.aspect = originalState.aspect;
  } else if (activeCamera.isOrthographicCamera) {
    activeCamera.left = originalState.left;
    activeCamera.right = originalState.right;
  }
  activeCamera.updateProjectionMatrix();
}

// --- Export Image Logic ---
export function exportToJPG(scene, renderer, camera) {
  if (!scene || !renderer || !camera) {
    console.error("Fundamental objects missing");
    return null;
  }

  let activeCamera = camera;
  scene.traverse((object) => {
    if (object.isCamera) activeCamera = object;
  });

  const originalState = setupExportResolution(
    renderer,
    activeCamera,
    targetWidth,
    targetHeight,
  );

  const canvasContainer = renderer.domElement.parentElement;
  const currentBgColor = canvasContainer
    ? window.getComputedStyle(canvasContainer).backgroundColor
    : "0xf43b00";

  const originalBackground = scene.background;
  scene.background = new THREE.Color(currentBgColor);

  if (composer) {
    composer.render();
  } else {
    renderer.render(scene, activeCamera);
  }

  const dataURL = renderer.domElement.toDataURL("image/jpeg", 1.0);

  scene.background = originalBackground;
  restoreOriginalResolution(renderer, activeCamera, originalState);

  return dataURL;
}

export function exportToPNG(scene, renderer, camera) {
  if (!scene || !renderer || !camera) {
    console.error("Fundamental objects missing");
    return null;
  }

  let activeCamera = camera;
  scene.traverse((object) => {
    if (object.isCamera) activeCamera = object;
  });

  const originalState = setupExportResolution(
    renderer,
    activeCamera,
    targetWidth,
    targetHeight,
  );

  const originalBackground = scene.background;
  const originalClearAlpha = renderer.getClearAlpha();

  scene.background = null;
  renderer.setClearAlpha(0);

  if (composer) {
    if (composer.readBuffer)
      composer.readBuffer.texture.format = THREE.RGBAFormat;
    if (composer.writeBuffer)
      composer.writeBuffer.texture.format = THREE.RGBAFormat;
    composer.render();
  } else {
    renderer.render(scene, activeCamera);
  }

  const dataURL = renderer.domElement.toDataURL("image/png");

  scene.background = originalBackground;
  renderer.setClearAlpha(originalClearAlpha);
  restoreOriginalResolution(renderer, activeCamera, originalState);

  return dataURL;
}

// --- SVG Pipeline ---
function convertToSVG_export(scene, camera) {
  const canvasWidth = window.innerWidth;
  const canvasHeight = window.innerHeight;

  const matrix = new THREE.Matrix4();
  const instanceScale = new THREE.Vector3();
  const vector = new THREE.Vector3();
  const svgPaths = [];

  camera.updateMatrixWorld();

  scene.traverse((object) => {
    if (!object.isInstancedMesh) return;

    const posAttr = object.geometry.attributes.position;
    const activeInstances = object.userData.activeInstances;

    for (let i = 0; i < object.count; i++) {
      if (activeInstances && activeInstances[i] === 0) continue;

      object.getMatrixAt(i, matrix);
      matrix.premultiply(object.matrixWorld);

      instanceScale.setFromMatrixScale(matrix);
      if (instanceScale.x <= 0.0001) continue;

      const pathPoints = [];

      for (let v = 0; v < posAttr.count; v++) {
        vector.fromBufferAttribute(posAttr, v);
        vector.applyMatrix4(matrix);
        vector.project(camera);

        const x = (vector.x + 1) * 0.5 * canvasWidth;
        const y = -(vector.y - 1) * 0.5 * canvasHeight;

        pathPoints.push(
          `${v === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`,
        );
      }

      svgPaths.push(`<path d="${pathPoints.join(" ")} Z" fill="black" />`);
    }
  });

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}">
      ${svgPaths.join("\n")}
    </svg>
  `;
}

async function convertToSVG_refine(svgString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const paths = Array.from(doc.querySelectorAll("path"));

  const canvasWidth =
    doc.documentElement.getAttribute("width") || window.innerWidth;
  const canvasHeight =
    doc.documentElement.getAttribute("height") || window.innerHeight;
  const finalSvgPaths = [];

  const totalDots = paths.length;
  const CHUNK_SIZE = 1000;
  const totalChunks = Math.ceil(totalDots / CHUNK_SIZE);

  console.log(`--- SVG Export Started ---`);
  console.log(`Total dots to refine: ${totalDots}`);

  for (let i = 0; i < paths.length; i += CHUNK_SIZE) {
    const chunk = paths.slice(i, i + CHUNK_SIZE);
    const currentChunk = Math.floor(i / CHUNK_SIZE) + 1;

    const percentComplete = Math.round((i / totalDots) * 100);
    console.log(
      `Processing SVG chunk ${currentChunk}/${totalChunks} | ${percentComplete}% complete...`,
    );

    chunk.forEach((path, chunkIndex) => {
      const absoluteIndex = i + chunkIndex;
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

        // --- CULLING ---
        // Calculate signed area to drop degenerate geometry and back-facing polygons.
        // NOTE: If all dots disappear, change `< 0.1` to `> -0.1` (SVG Y-axis inversion).
        const signedArea =
          (pB[0] - pA[0]) * (pC[1] - pA[1]) - (pC[0] - pA[0]) * (pB[1] - pA[1]);

        if (signedArea < 0.00001) continue;

        triangles.push([[pA, pB, pC, pA]]);
      }

      // If all triangles were culled, there's nothing to draw
      if (triangles.length === 0) return;

      let unified = null;

      try {
        // --- ATTEMPT 1: Fast Batch Union ---
        unified = polygonClipping.union(...triangles);
      } catch (batchError) {
        // --- ATTEMPT 2: Progressive Reconstruction ---
        console.log(
          `Dot #${absoluteIndex + 1}: Batch union failed. Initiating progressive reconstruction...`,
        );

        unified = [];
        let successfulMerges = 0;

        for (let k = 0; k < triangles.length; k++) {
          if (unified.length === 0) {
            unified = [triangles[k]];
            successfulMerges++;
            continue;
          }

          try {
            unified = polygonClipping.union(unified, triangles[k]);
            successfulMerges++;
          } catch (stepError) {
            // Try micro-nudge for this specific toxic triangle
            try {
              const nudgedTriangle = triangles[k].map((polygon) => {
                const nudgedRing = polygon[0].map((pt, ptIdx) => {
                  if (ptIdx === 3) return null;
                  const nudgeX = (ptIdx % 2 === 0 ? 1 : -1) * 0.001;
                  const nudgeY = (ptIdx % 2 !== 0 ? 1 : -1) * 0.001;
                  return [pt[0] + nudgeX, pt[1] + nudgeY];
                });
                nudgedRing[3] = nudgedRing[0];
                return [nudgedRing];
              });

              unified = polygonClipping.union(unified, nudgedTriangle);
              successfulMerges++;
            } catch (nudgeError) {
              // Graceful degradation: The nudge failed. Drop this specific triangle.
            }
          }
        }

        // --- STRUCTURAL INTEGRITY CHECK ---
        // If we didn't salvage at least 5 triangles, the shape is likely a mangled mess. Delete it.
        if (successfulMerges < 5) {
          console.warn(
            `Dot #${absoluteIndex + 1}: Shape collapsed (only ${successfulMerges} valid triangles). Deleting dot entirely.`,
          );
          unified = null;
        } else {
          console.log(
            `Dot #${absoluteIndex + 1}: Recovered successfully with ${successfulMerges}/${triangles.length} triangles.`,
          );
        }
      }

      // --- FINAL BUILD ---
      if (unified) {
        const unifiedPathData = [];
        unified.forEach((polygon) => {
          const outerRing = polygon[0];
          outerRing.forEach((pt, idx) => {
            unifiedPathData.push(
              `${idx === 0 ? "M" : "L"}${pt[0].toFixed(2)} ${pt[1].toFixed(2)}`,
            );
          });
          unifiedPathData.push("Z");
        });

        if (unifiedPathData.length > 0) {
          finalSvgPaths.push(
            `<path d="${unifiedPathData.join(" ")}" fill="black" stroke="none" />`,
          );
        }
      }
      // Notice: The "else" block that exported the red path has been completely removed.
      // If unified is null, the dot is simply skipped.
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  console.log(`Building final SVG document...`);

  const finalSvgDocument = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}">
      ${finalSvgPaths.join("\n")}
    </svg>
  `.trim();

  const blob = new Blob([finalSvgDocument], {
    type: "image/svg+xml;charset=utf-8",
  });

  console.log(`--- SVG Export Complete! ---`);
  return URL.createObjectURL(blob);
}

export async function convertToSVG(scene, camera) {
  console.log("Extracting raw geometry from Three.js scene...");
  const rawSvg = convertToSVG_export(scene, camera);

  if (!rawSvg) {
    console.error("Failed to extract raw geometry.");
    throw new Error("Failed to generate raw SVG");
  }

  return await convertToSVG_refine(rawSvg);
}

// --- Export Video Logic ---
export function exportVideo(
  renderer,
  scene,
  camera,
  durationInSeconds = 5,
  format = "mp4",
  bgColor = null,
  onStartRecord,
) {
  return new Promise(async (resolve, reject) => {
    if (!renderer || !scene || !camera) {
      reject("Fundamental dependencies missing");
      return;
    }

    let activeCamera = camera;
    scene.traverse((object) => {
      if (object.isCamera) activeCamera = object;
    });

    if (!ffmpeg.loaded) {
      await ffmpeg.load();
    }

    const originalSize = new THREE.Vector2();
    renderer.getSize(originalSize);
    const originalAspect = activeCamera.aspect;
    const originalLeft = activeCamera.left;
    const originalRight = activeCamera.right;
    const originalBackground = scene.background;
    const originalClearAlpha = renderer.getClearAlpha();

    if (bgColor) {
      scene.background = new THREE.Color(bgColor);
      renderer.setClearAlpha(1);
    } else {
      scene.background = null;
      renderer.setClearAlpha(0);
    }

    renderer.setSize(targetWidth, targetHeight, false);
    if (composer) composer.setSize(targetWidth, targetHeight);

    const targetAspect = targetWidth / targetHeight;
    if (activeCamera.isPerspectiveCamera) {
      activeCamera.aspect = targetAspect;
    } else if (activeCamera.isOrthographicCamera) {
      const frustumHeight = activeCamera.top - activeCamera.bottom;
      activeCamera.left = -(frustumHeight * targetAspect) / 2;
      activeCamera.right = (frustumHeight * targetAspect) / 2;
    }
    activeCamera.updateProjectionMatrix();

    if (typeof onStartRecord === "function") {
      onStartRecord();
    }

    console.log(
      `--- Strict Frame-By-Frame Direct-${format.toUpperCase()} Engine Initialized ---`,
    );

    const canvas = renderer.domElement;
    let frameCount = 0;
    const mimeType = bgColor ? "image/jpeg" : "image/png";
    const extension = bgColor ? "jpg" : "png";

    // ==========================================
    // THE TIME HEIST V2: Multi-Loop Interception
    // ==========================================
    const originalPerfNow = window.performance.now.bind(window.performance);
    const originalDateNow = window.Date.now.bind(window.Date);
    const originalRAF = window.requestAnimationFrame.bind(window);
    const originalCancelRAF = window.cancelAnimationFrame.bind(window);

    let simulatedTime = originalPerfNow();

    // 1. Freeze the global clocks
    window.performance.now = () => simulatedTime;
    window.Date.now = () => Math.floor(simulatedTime);

    // 2. Intercept ALL background animation loops into an array
    let rafCallbacks = [];
    window.requestAnimationFrame = (callback) => {
      rafCallbacks.push(callback);
      return Math.random(); // Dummy ID
    };
    window.cancelAnimationFrame = () => {}; // Prevent loops from cancelling our fake IDs
    // ==========================================

    const captureNextFrame = async () => {
      // Step 1: Advance our fake clock by EXACTLY 1/30th of a second
      simulatedTime += 1000 / 30;

      // Step 2: Flush the queue and run ALL animation loops for this exact moment in time
      const callbacksToRun = [...rafCallbacks];
      rafCallbacks = []; // Clear the queue so the loops can re-register themselves for the next frame

      callbacksToRun.forEach((cb) => cb(simulatedTime));

      // Step 3: Render the newly updated scene
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, activeCamera);
      }

      // Step 4: Update the UI
      const swalText = document.querySelector(".swal2-html-container");
      let targetFrames = "...";

      if (typeof durationInSeconds === "number") {
        targetFrames = durationInSeconds * 30;
      } else if (window.exportTotalDuration) {
        targetFrames = window.exportTotalDuration * 30;
      } else if (window.exportTargetDuration) {
        targetFrames = window.exportTargetDuration * 30;
      }

      if (swalText) {
        swalText.innerText = `Capturing perfect frame ${frameCount} of ${targetFrames}...`;
      }

      // Step 5: Wait for the browser to finish extracting the high-res Blob (Animation remains fully paused here!)
      const frameBlob = await new Promise((res) => {
        canvas.toBlob(
          res,
          mimeType,
          mimeType === "image/jpeg" ? 0.98 : undefined,
        );
      });

      // Step 6: Save to FFmpeg virtual file system
      const frameName = `frame_${String(frameCount).padStart(4, "0")}.${extension}`;
      await ffmpeg.writeFile(frameName, await fetchFile(frameBlob));
      frameCount++;

      // Step 7: Check if we are done
      let isSequenceFinished = false;
      if (typeof durationInSeconds === "number") {
        if (frameCount >= durationInSeconds * 30) isSequenceFinished = true;
      } else {
        const totalExportDuration =
          window.exportTotalDuration || window.exportTargetDuration;

        if (totalExportDuration) {
          if (frameCount >= totalExportDuration * 30) {
            isSequenceFinished = true;
          }
        } else if (window.isAnimationLoopComplete) {
          isSequenceFinished = true;
        }
      }

      // Step 8: Route logic
      if (isSequenceFinished) {
        if (swalText)
          swalText.innerText = `Compiling video... this may take a moment.`;
        console.log(
          `Captured ${frameCount} pristine frames. Initializing direct compilation...`,
        );
        compileVideo();
      } else {
        // Schedule the next frame synchronously on the next event loop tick
        setTimeout(captureNextFrame, 0);
      }
    };

    // --- FFmpeg Compilation Logic ---
    const compileVideo = async () => {
      try {
        let outFilename = `output.${format}`;
        let ffmpegArgs = ["-framerate", "30", "-i", `frame_%04d.${extension}`];

        if (format === "mp4") {
          ffmpegArgs.push(
            "-c:v",
            "libx264",
            "-tune",
            "animation",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "12",
            outFilename,
          );
        } else if (format === "mov") {
          ffmpegArgs.push(
            "-c:v",
            "prores_ks",
            "-profile:v",
            "4",
            "-pix_fmt",
            "yuva444p10le",
            outFilename,
          );
        } else {
          ffmpegArgs.push(
            "-c:v",
            "libvpx-vp9",
            "-crf",
            "10",
            "-b:v",
            "0",
            "-pix_fmt",
            bgColor ? "yuv420p" : "yuva420p",
            outFilename,
          );
        }

        await ffmpeg.exec(ffmpegArgs);
        const finalVideoData = await ffmpeg.readFile(outFilename);

        const videoTypeMap = {
          mp4: "video/mp4",
          mov: "video/quicktime",
          webm: "video/webm",
        };
        resolve(
          new Blob([finalVideoData.buffer], { type: videoTypeMap[format] }),
        );
      } catch (err) {
        reject(err);
      } finally {
        // ==========================================
        // RESTORE THE REAL WORLD
        // ==========================================
        window.performance.now = originalPerfNow;
        window.Date.now = originalDateNow;
        window.requestAnimationFrame = originalRAF;
        window.cancelAnimationFrame = originalCancelRAF;

        // Resume all background animation loops naturally into the real-world timeline
        rafCallbacks.forEach((cb) => originalRAF(cb));
        rafCallbacks = [];
        // ==========================================

        renderer.setSize(originalSize.x, originalSize.y, false);
        if (composer) composer.setSize(originalSize.x, originalSize.y);

        if (activeCamera.isPerspectiveCamera) {
          activeCamera.aspect = originalAspect;
        } else if (activeCamera.isOrthographicCamera) {
          activeCamera.left = originalLeft;
          activeCamera.right = originalRight;
        }
        activeCamera.updateProjectionMatrix();

        scene.background = originalBackground;
        renderer.setClearAlpha(originalClearAlpha);

        // Cleanup FFmpeg virtual files
        for (let i = 0; i < frameCount; i++) {
          try {
            await ffmpeg.deleteFile(
              `frame_${String(i).padStart(4, "0")}.${extension}`,
            );
          } catch (e) {}
        }
        try {
          await ffmpeg.deleteFile(`output.${format}`);
        } catch (e) {}
      }
    };

    // Kick off the strict capture loop
    setTimeout(captureNextFrame, 100);
  });
}

export async function cleanupTempFiles(
  files = ["input.webm", "output.mov", "output.mp4"],
) {
  for (const file of files) {
    try {
      await ffmpeg.deleteFile(file);
      console.log(`Cleaned up: ${file}`);
    } catch (e) {}
  }
}
