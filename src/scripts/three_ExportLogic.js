import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { SVGRenderer } from "three/addons/renderers/SVGRenderer.js";
import paper from "paper";

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
export function exportToPNG(scene, renderer, camera) {
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

// Default export of an SVG from the scene — created from all triangles that make up each shape (A mess of an SVG file)
export function convertToSVG_export(scene, camera) {
  const tempMeshes = [];
  const instancesToHide = [];

  const exportMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.FrontSide,
  });

  console.log("    a. Recreating the scene...");
  scene.traverse((object) => {
    if (object.isInstancedMesh) {
      // Hide the instanced meshes
      instancesToHide.push(object);
      object.visible = false;

      const matrix = new THREE.Matrix4();
      const dummyPosition = new THREE.Vector3();
      const dummyRotation = new THREE.Quaternion();
      const dummyScale = new THREE.Vector3();

      // Create a new grid of meshes outside of the instanced mesh
      for (let i = 0; i < object.count; i++) {
        object.getMatrixAt(i, matrix);

        matrix.decompose(dummyPosition, dummyRotation, dummyScale);

        // Only add to the array if the dot isnt hidden
        if (dummyScale.x <= 1) {
          continue;
        }

        // Create individual meshes (not instanced) for each dot in the loop
        const singleMesh = new THREE.Mesh(object.geometry, exportMaterial);

        singleMesh.position.copy(dummyPosition);
        singleMesh.quaternion.copy(dummyRotation);
        singleMesh.scale.copy(dummyScale);

        singleMesh.updateMatrix();
        singleMesh.applyMatrix4(object.matrixWorld);

        scene.add(singleMesh);
        tempMeshes.push(singleMesh);
      }
    }
  });

  console.log("    b. Rendering to SVG...");
  const svgRenderer = new SVGRenderer();
  svgRenderer.setSize(window.innerWidth, window.innerHeight);
  svgRenderer.setPrecision(8);

  svgRenderer.render(scene, camera);

  // Remove the temporary instances
  tempMeshes.forEach((mesh) => {
    scene.remove(mesh);
  });

  exportMaterial.dispose();

  console.log("    c. Reconstructing the scene...");
  instancesToHide.forEach((inst) => {
    inst.visible = true;
  });

  // SVG renderer setup
  const svgElement = svgRenderer.domElement;
  svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  return svgElement.outerHTML;
}

export function convertToSVG(scene, camera) {
  console.log("1. Generating raw 3D SVG layout...");
  const rawSvg = convertToSVG_export(scene, camera);

  if (!rawSvg) {
    throw new Error("Failed to generate raw SVG from Three.js");
  }

  console.log("2. Melting shapes together with Paper.js...");
  const finalSvgUrl = convertToSVG_refine(rawSvg);

  return finalSvgUrl;
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
      // NOW that the recorder has stopped, we know the recording is safe
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: "video/webm" });
      resolve(blob);
    };

    mediaRecorder.start();

    // Just stop the recorder here
    setTimeout(() => {
      mediaRecorder.stop();
    }, durationInSeconds * 1000);
  });
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

export async function convertToMP4(webmBlob) {
  return;
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
