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
        const color = new THREE.Color();

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

// --- Export Image Logic ---

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

  // Apply target resolutions
  renderer.setSize(targetWidth, targetHeight, false);
  if (composer) composer.setSize(targetWidth, targetHeight);

  // Update camera projection (with Perspective & Orthographic support)
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
  // Restore renderer size
  renderer.setSize(originalState.size.x, originalState.size.y, false);
  if (composer) composer.setSize(originalState.size.x, originalState.size.y);

  // Restore camera state
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
    console.error(
      "Something went wrong with Three.JS — Fundamental objects missing",
    );
    return null;
  }

  let activeCamera = camera;
  scene.traverse((object) => {
    if (object.isCamera) activeCamera = object;
  });

  // 1. SETUP: Call the helper to resize and get the original state
  const originalState = setupExportResolution(
    renderer,
    activeCamera,
    targetWidth,
    targetHeight,
  );

  // 2. FORMAT SPECIFIC LOGIC: Handle JPG solid backgrounds
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

  // 3. TEARDOWN: Restore background and call the helper to restore sizing
  scene.background = originalBackground;
  restoreOriginalResolution(renderer, activeCamera, originalState);

  return dataURL;
}

export function exportToPNG(scene, renderer, camera) {
  if (!scene || !renderer || !camera) {
    console.error(
      "Something went wrong in with Three.JS — Fundamental objects missing",
    );
    return null;
  }

  let activeCamera = camera;
  scene.traverse((object) => {
    if (object.isCamera) activeCamera = object;
  });

  // 1. SETUP: Call the helper to resize and get the original state
  const originalState = setupExportResolution(
    renderer,
    activeCamera,
    targetWidth,
    targetHeight,
  );

  // 2. FORMAT SPECIFIC LOGIC: Handle PNG transparency & alpha buffers
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

  // 3. TEARDOWN: Restore background/alpha and call the helper to restore sizing
  scene.background = originalBackground;
  renderer.setClearAlpha(originalClearAlpha);
  restoreOriginalResolution(renderer, activeCamera, originalState);

  return dataURL;
}

function convertToSVG_export(scene, camera) {
  console.log("Starting Conversion of 3D Scene to SVG.");

  const canvasWidth = window.innerWidth;
  const canvasHeight = window.innerHeight;

  // Hoist reusable objects outside loops to prevent massive garbage collection lag
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

      // Extract scale to respect your threshold
      instanceScale.setFromMatrixScale(matrix);
      if (instanceScale.x <= 1) continue;

      const pathPoints = [];

      for (let v = 0; v < posAttr.count; v++) {
        vector.fromBufferAttribute(posAttr, v);

        // Native Three.js matrix transformation is vastly faster than manual decomposition math
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

  console.log("Completed Conversion of 3D Scene to SVG.");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}">
      ${svgPaths.join("\n")}
    </svg>
  `;
}

function convertToSVG_refine(svgString) {
  // Parse raw SVG text into a traversable virtual DOM
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const paths = doc.querySelectorAll("path");

  // Set canvas boundaries based on the source or viewport sizing
  const canvasWidth =
    doc.documentElement.getAttribute("width") || window.innerWidth;
  const canvasHeight =
    doc.documentElement.getAttribute("height") || window.innerHeight;
  const finalSvgPaths = [];

  console.log(
    `Starting SVG geometry refinement across ${paths.length} nodes...`,
  );

  paths.forEach((path, index) => {
    // Extract the coordinate commands string from the path attribute
    const dAttr = path.getAttribute("d");
    if (!dAttr) return;

    // Parse flat string numbers into an array of floats
    const coords = dAttr.match(/[-+]?[0-9]*\.?[0-9]+/g);
    if (!coords) return;

    // Structure flat coordinates into MultiPolygon triangle arrays
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

    // --- SHAPE BUILDING PIPELINE ---
    try {
      // PASS 1: High-Precision Native Batch Melt
      unified = polygonClipping.union(...triangles);
    } catch (initialError) {
      try {
        // PASS 2: Float-Snapping Core Fix (Handles decimal rounding anomalies)
        const roundedTriangles = triangles.map((polygon) => {
          const roundedRing = polygon[0].map((pt) => [
            Math.round(pt[0] * 10) / 10,
            Math.round(pt[1] * 10) / 10,
          ]);
          return [roundedRing];
        });

        unified = polygonClipping.union(...roundedTriangles);
        console.log(
          `Fixed geometry variance via rounding for dot #${index + 1}`,
        );
      } catch (roundingError) {
        try {
          // PASS 3: Micro-Jitter Nudge (Disentangles complex overlapping knots)
          const nudgedTriangles = triangles.map((polygon, polyIdx) => {
            const nudgedRing = polygon[0].map((pt, ptIdx) => {
              if (ptIdx === 3) return null;

              // Applies an invisible, deterministic fraction shift to separate overlapping edges
              const nudgeX = (((polyIdx * 4 + ptIdx) % 5) - 2) * 0.02;
              const nudgeY = (((polyIdx * 4 + ptIdx) % 7) - 3) * 0.02;
              return [pt[0] + nudgeX, pt[1] + nudgeY];
            });
            nudgedRing[3] = nudgedRing[0]; // Maintain valid loop closure criteria
            return [nudgedRing];
          });

          unified = polygonClipping.union(...nudgedTriangles);
          console.log(
            `Disentangled structural knot via micro-jitter for dot #${index + 1}`,
          );
        } catch (nudgeError) {
          console.error(`Critical: Unable to repair dot #${index + 1}`);
        }
      }
    }

    // Convert shape built polygon data structures back to standard SVG path syntax
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
      // Safety Fallback: If all processing modes fail, preserve original raw wireframe asset but color it red
      let redPath = path.outerHTML;

      redPath = redPath.includes("fill=")
        ? redPath.replace(/fill="[^"]*"/g, 'fill="red"')
        : redPath.replace("<path", '<path fill="red"');

      redPath = redPath.includes("stroke=")
        ? redPath.replace(/stroke="[^"]*"/g, 'stroke="red"')
        : redPath.replace("<path", '<path stroke="red"');

      finalSvgPaths.push(redPath);
    }
  });

  console.log("SVG refinement processing complete.");

  // Compile everything back into a fully formed standalone SVG document string
  const finalSvgDocument = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}">
      ${finalSvgPaths.join("\n")}
    </svg>
  `.trim();

  // Pack string memory into a file blob pointer for automatic browser downloads
  const blob = new Blob([finalSvgDocument], {
    type: "image/svg+xml;charset=utf-8",
  });
  return URL.createObjectURL(blob);
}

export function convertToSVG(scene, camera) {
  const rawSvg = convertToSVG_export(scene, camera);
  if (!rawSvg) {
    throw new Error("Failed to generate raw SVG from Three.js");
  }
  return convertToSVG_refine(rawSvg);
}

// --- Export Video Logic ---
// Change the bgColor default to null
export function exportWEBM(
  renderer,
  scene,
  camera,
  durationInSeconds = 5,
  bgColor = null, // 👈 Defaults to null (transparent)
  onStartRecord,
) {
  return new Promise((resolve, reject) => {
    if (!renderer || !scene || !camera) {
      reject("Fundamental dependencies missing");
      return;
    }

    let activeCamera = camera;
    scene.traverse((object) => {
      if (object.isCamera) activeCamera = object;
    });

    const originalSize = new THREE.Vector2();
    renderer.getSize(originalSize);
    const originalAspect = activeCamera.aspect;
    const originalBackground = scene.background;
    const originalClearAlpha = renderer.getClearAlpha();

    // 👈 CONDITIONAL BACKGROUND: Solid for MP4, transparent for MOV/WebM
    if (bgColor) {
      scene.background = new THREE.Color(bgColor);
      renderer.setClearAlpha(1);
    } else {
      scene.background = null;
      renderer.setClearAlpha(0);
    }

    renderer.setSize(targetWidth, targetHeight, false);
    if (composer) composer.setSize(targetWidth, targetHeight);
    activeCamera.aspect = targetWidth / targetHeight;
    activeCamera.updateProjectionMatrix();

    if (typeof onStartRecord === "function") onStartRecord();

    if (composer) {
      composer.render();
    } else {
      renderer.render(scene, activeCamera);
    }

    const canvas = renderer.domElement;
    const stream = canvas.captureStream(30);

    // Dynamic encoder settings based on transparency needs
    const options = {
      mimeType: "video/webm; codecs=vp9",
      videoBitsPerSecond: 80000000, // Keeping your high-quality bitrate!
    };

    // 👈 Re-enable alpha channel allocations ONLY if we are transparent
    if (!bgColor) {
      options.alphaBits = 8;
    }

    let mediaRecorder;
    try {
      mediaRecorder = new MediaRecorder(stream, options);
    } catch (e) {
      mediaRecorder = new MediaRecorder(stream);
    }

    const chunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());

      renderer.setSize(originalSize.x, originalSize.y, false);
      if (composer) composer.setSize(originalSize.x, originalSize.y);
      activeCamera.aspect = originalAspect;
      activeCamera.updateProjectionMatrix();
      scene.background = originalBackground;
      renderer.setClearAlpha(originalClearAlpha);

      const blob = new Blob(chunks, { type: "video/webm" });
      resolve(blob);
    };

    mediaRecorder.start();

    if (typeof durationInSeconds === "number") {
      setTimeout(() => {
        mediaRecorder.stop();
      }, durationInSeconds * 1000);
    } else {
      const monitorLoop = () => {
        if (window.isAnimationLoopComplete) {
          setTimeout(() => {
            mediaRecorder.stop();
          }, 500);
        } else {
          requestAnimationFrame(monitorLoop);
        }
      };
      setTimeout(() => {
        requestAnimationFrame(monitorLoop);
      }, 200);
    }
  });
}

export async function convertToMP4(webmBlob) {
  if (!webmBlob) {
    throw new Error("webmBlob parameter is required for conversion.");
  }

  console.log("Starting direct high-speed MP4 conversion...");

  try {
    if (!ffmpeg.loaded) {
      await ffmpeg.load();
    }

    await cleanupTempFiles(["input.webm", "output.mp4"]);
    await ffmpeg.writeFile("input.webm", await fetchFile(webmBlob));

    // Clean, direct, high-speed layout conversion stream
    await ffmpeg.exec([
      "-i",
      "input.webm",
      "-c:v",
      "libx264",
      "-tune",
      "animation",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "14",
      "output.mp4",
    ]);

    const mp4Data = await ffmpeg.readFile("output.mp4");
    await cleanupTempFiles(["input.webm", "output.mp4"]);

    return URL.createObjectURL(
      new Blob([mp4Data.buffer], { type: "video/mp4" }),
    );
  } catch (err) {
    console.error("In-browser MP4 conversion pipeline failed: ", err);
    await cleanupTempFiles(["input.webm", "output.mp4"]);
    throw err;
  }
}
export async function convertToMOV(webmBlob) {
  if (!webmBlob) {
    throw new Error("webmBlob parameter is required for conversion.");
  }

  console.log(
    "Starting background transparency conversion to MOV (ProRes 4444)...",
  );

  try {
    if (!ffmpeg.loaded) {
      await ffmpeg.load();
    }

    await ffmpeg.writeFile("input.webm", await fetchFile(webmBlob));

    await ffmpeg.exec([
      "-c:v",
      "libvpx-vp9",
      "-i",
      "input.webm",
      "-c:v",
      "prores_ks",
      "-profile:v",
      "4",
      "-pix_fmt",
      "yuva444p10le",
      "output.mov",
    ]);

    const movData = await ffmpeg.readFile("output.mov");
    return URL.createObjectURL(
      new Blob([movData.buffer], { type: "video/quicktime" }),
    );
  } catch (err) {
    // You MUST have this block to keep the 'try' block happy
    console.error("In-browser MOV conversion pipeline failed: ", err);
    throw err;
  }
}

export async function cleanupTempFiles(
  files = ["input.webm", "output.mov", "output.mp4"],
) {
  for (const file of files) {
    try {
      // Check if file exists in the virtual FS first
      await ffmpeg.deleteFile(file);
      console.log(`Cleaned up: ${file}`);
    } catch (e) {
      // Ignore if file doesn't exist
    }
  }
}
