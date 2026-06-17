import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { SVGRenderer } from "three/addons/renderers/SVGRenderer.js";

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

          if (scale.x < 1.1) {
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
export function exportImg(scene, renderer, camera) {
  if (!scene || !renderer || !camera) {
    console.error(
      "Something went wrong in with Three.JS — Fundamental objects missing",
    );
    return null;
  }

  scene.traverse((object) => {
    if (object.isCamera) {
      camera = object;
    }
  });

  renderer.render(scene, camera);

  const dataURL = renderer.domElement.toDataURL("image/png");
  return dataURL;
}

export function convertToSVG(scene, camera) {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  let svgPaths = "";
  const matrix = new THREE.Matrix4();
  const vector = new THREE.Vector3();

  scene.traverse((obj) => {
    if (obj.isInstancedMesh && obj.geometry) {
      const { position } = obj.geometry.attributes;

      for (let i = 0; i < obj.count; i++) {
        obj.getMatrixAt(i, matrix);

        // Draw the geometry for THIS specific instance
        svgPaths += `<path d="`;
        for (let j = 0; j < position.count; j++) {
          vector.fromBufferAttribute(position, j);
          vector.applyMatrix4(matrix); // Apply instance transform
          vector.applyMatrix4(obj.matrixWorld); // Apply mesh world transform
          vector.project(camera); // Project to screen

          const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
          const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;

          svgPaths += j === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
        }
        svgPaths += `" fill="black" />`;
      }
    }
  });

  const svgContent = `<svg width="${window.innerWidth}" height="${window.innerHeight}" xmlns="http://www.w3.org/2000/svg">${svgPaths}</svg>`;
  return URL.createObjectURL(new Blob([svgContent], { type: "image/svg+xml" }));
}

// --- Export Transparent WebM Video  ---
export function exportVid(renderer, durationInSeconds = 5) {
  return new Promise((resolve, reject) => {
    if (!renderer) {
      console.error("Renderer is required to capture video.");
      reject("Renderer missing");
      return;
    }

    const canvas = renderer.domElement;
    const stream = canvas.captureStream(30);

    const options = {
      mimeType: "video/webm; codecs=vp9",
      videoBitsPerSecond: 2500000,
      alphaBits: 8,
    };

    let mediaRecorder;

    try {
      mediaRecorder = new MediaRecorder(stream, options);
    } catch (e) {
      console.warn(
        "VP9 with transparent alphaBits not supported on this browser, falling back to default webm.",
      );
      mediaRecorder = new MediaRecorder(stream);
    }

    const chunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      // Return the pure WebM Blob rather than a URL string so the converter can read it directly
      const blob = new Blob(chunks, { type: "video/webm; codecs=vp9" });
      resolve(blob);
    };

    mediaRecorder.start();
    console.log(`Recording started for ${durationInSeconds} seconds...`);

    setTimeout(() => {
      mediaRecorder.stop();
      stream.getTracks().forEach((track) => track.stop());
    }, durationInSeconds * 1000);
  });
}

export async function convertToMov(webmBlob) {
  if (!webmBlob) {
    throw new Error("webmBlob parameter is required for conversion.");
  }

  console.log(
    "Starting background transparency conversion to MOV (ProRes 4444)...",
  );

  try {
    // Dynamically load the FFmpeg web assembly binaries if they aren't ready
    if (!ffmpeg.loaded) {
      await ffmpeg.load();
    }

    // Write the WebM blob to FFmpeg's virtual file system
    await ffmpeg.writeFile("input.webm", await fetchFile(webmBlob));

    // Run the ProRes 4444 translation command preserving the alpha/transparency channels
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

    // Read the processed transparent .mov out of virtual memory
    const movData = await ffmpeg.readFile("output.mov");

    // Package it into a native QuickTime Blob
    const movBlob = new Blob([movData.buffer], { type: "video/quicktime" });

    // Generate a final downloadable object URL
    const videoURL = URL.createObjectURL(movBlob);
    return videoURL;
  } catch (err) {
    console.error("In-browser MOV conversion pipeline failed: ", err);
    throw err;
  }
}
