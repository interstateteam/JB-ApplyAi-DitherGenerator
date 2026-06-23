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

        for (let i = 0; i < count; i++) {
          object.getMatrixAt(i, matrix);
          matrix.decompose(position, quaternion, scale);

          if (scale.x < 1) {
            continue;
          }

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

    for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, matrix);
      matrix.premultiply(object.matrixWorld);

      instanceScale.setFromMatrixScale(matrix);
      if (instanceScale.x <= 1) continue;

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

function convertToSVG_refine(svgString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const paths = doc.querySelectorAll("path");

  const canvasWidth =
    doc.documentElement.getAttribute("width") || window.innerWidth;
  const canvasHeight =
    doc.documentElement.getAttribute("height") || window.innerHeight;
  const finalSvgPaths = [];

  paths.forEach((path, index) => {
    const dAttr = path.getAttribute("d");
    if (!dAttr) return;

    const coords = dAttr.match(/[-+]?[0-9]*\.?[0-9]+/g);
    if (!coords) return;

    const triangles = [];
    for (let i = 0; i < coords.length; i += 6) {
      if (i + 5 >= coords.length) break;

      const pA = [Number(coords[i]), Number(coords[i + 1])];
      const pB = [Number(coords[i + 2]), Number(coords[i + 3])];
      const pC = [Number(coords[i + 4]), Number(coords[i + 5])];

      triangles.push([[pA, pB, pC, pA]]);
    }

    if (triangles.length === 0) return;

    let unified = null;

    try {
      unified = polygonClipping.union(...triangles);
    } catch (initialError) {
      try {
        const roundedTriangles = triangles.map((polygon) => {
          const roundedRing = polygon[0].map((pt) => [
            Math.round(pt[0] * 10) / 10,
            Math.round(pt[1] * 10) / 10,
          ]);
          return [roundedRing];
        });
        unified = polygonClipping.union(...roundedTriangles);
      } catch (roundingError) {
        try {
          const nudgedTriangles = triangles.map((polygon, polyIdx) => {
            const nudgedRing = polygon[0].map((pt, ptIdx) => {
              if (ptIdx === 3) return null;
              const nudgeX = (((polyIdx * 4 + ptIdx) % 5) - 2) * 0.02;
              const nudgeY = (((polyIdx * 4 + ptIdx) % 7) - 3) * 0.02;
              return [pt[0] + nudgeX, pt[1] + nudgeY];
            });
            nudgedRing[3] = nudgedRing[0];
            return [nudgedRing];
          });
          unified = polygonClipping.union(...nudgedTriangles);
        } catch (nudgeError) {
          console.error(`Critical: Unable to repair dot #${index + 1}`);
        }
      }
    }

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
    } else {
      let redPath = path.outerHTML;
      redPath = redPath.includes("fill=")
        ? redPath.replace(/fill="[^"]*"/g, 'fill="red"')
        : redPath.replace("<path", '<path fill="red"');
      finalSvgPaths.push(redPath);
    }
  });

  const finalSvgDocument = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}">
      ${finalSvgPaths.join("\n")}
    </svg>
  `.trim();

  const blob = new Blob([finalSvgDocument], {
    type: "image/svg+xml;charset=utf-8",
  });
  return URL.createObjectURL(blob);
}

export function convertToSVG(scene, camera) {
  const rawSvg = convertToSVG_export(scene, camera);
  if (!rawSvg) throw new Error("Failed to generate raw SVG");
  return convertToSVG_refine(rawSvg);
}

// --- REFACTORED: Frame-By-Frame Export Video Logic ---

// --- REFACTORED: Unified Single-Pass Video Render Engine ---
// --- FIXED: Unified Single-Pass Video Render Engine ---
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

    // 1. Cache current viewport states (Added left and right bounds caching)
    const originalSize = new THREE.Vector2();
    renderer.getSize(originalSize);
    const originalAspect = activeCamera.aspect;
    const originalLeft = activeCamera.left; // 🌟 Cached
    const originalRight = activeCamera.right; // 🌟 Cached
    const originalBackground = scene.background;
    const originalClearAlpha = renderer.getClearAlpha();

    // 2. Configure backgrounds based on format demands
    if (bgColor) {
      scene.background = new THREE.Color(bgColor);
      renderer.setClearAlpha(1);
    } else {
      scene.background = null;
      renderer.setClearAlpha(0);
    }

    // 3. Scale up to target resolution and apply proper Orthographic scaling math
    renderer.setSize(targetWidth, targetHeight, false);
    if (composer) composer.setSize(targetWidth, targetHeight);

    const targetAspect = targetWidth / targetHeight;
    if (activeCamera.isPerspectiveCamera) {
      activeCamera.aspect = targetAspect;
    } else if (activeCamera.isOrthographicCamera) {
      // 🌟 Correctly recalculate boundaries based on target 2.5K aspect ratio
      const frustumHeight = activeCamera.top - activeCamera.bottom;
      activeCamera.left = -(frustumHeight * targetAspect) / 2;
      activeCamera.right = (frustumHeight * targetAspect) / 2;
    }
    activeCamera.updateProjectionMatrix();

    if (typeof onStartRecord === "function") {
      onStartRecord();
    }

    const canvas = renderer.domElement;
    let frameCount = 0;

    const mimeType = bgColor ? "image/jpeg" : "image/png";
    const extension = bgColor ? "jpg" : "png";

    console.log(
      `--- Frame-By-Frame Direct-${format.toUpperCase()} Engine Initialized ---`,
    );

    const captureNextFrame = async () => {
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, activeCamera);
      }

      const frameBlob = await new Promise((res) => {
        canvas.toBlob(
          res,
          mimeType,
          mimeType === "image/jpeg" ? 0.98 : undefined,
        );
      });

      const frameName = `frame_${String(frameCount).padStart(4, "0")}.${extension}`;
      await ffmpeg.writeFile(frameName, await fetchFile(frameBlob));
      frameCount++;

      let isSequenceFinished = false;
      if (typeof durationInSeconds === "number") {
        if (frameCount >= durationInSeconds * 30) isSequenceFinished = true;
      } else {
        if (window.isAnimationLoopComplete) isSequenceFinished = true;
      }

      if (isSequenceFinished) {
        console.log(
          `Captured ${frameCount} pristine frames. Initializing direct compilation...`,
        );

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
          // --- CLEANUP TIMELINE ---
          // Pass the original left and right coordinates back to the reset injector
          renderer.setSize(originalSize.x, originalSize.y, false);
          if (composer) composer.setSize(originalSize.x, originalSize.y);

          if (activeCamera.isPerspectiveCamera) {
            activeCamera.aspect = originalAspect;
          } else if (activeCamera.isOrthographicCamera) {
            // 🌟 Restore original boundaries so preview layout snaps back perfectly
            activeCamera.left = originalLeft;
            activeCamera.right = originalRight;
          }
          activeCamera.updateProjectionMatrix();

          scene.background = originalBackground;
          renderer.setClearAlpha(originalClearAlpha);

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
      } else {
        requestAnimationFrame(captureNextFrame);
      }
    };

    setTimeout(() => {
      requestAnimationFrame(captureNextFrame);
    }, 200);
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
