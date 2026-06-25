import * as THREE from "three";
import {
  sampleImage,
  getBrightnessRange,
  getGridDimensions,
  getPixelData,
} from "./three_imageLogic.js";
import { scene, material, setCameraZoom } from "./three_sceneLogic.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import logomarkUrl from "../assets/LogoMarkFull.svg";

const dummyObject = new THREE.Object3D();
const colorHelper = new THREE.Color();

let currentGeometry = null;
let instancedMesh = null;

let cachedLogomarkGeometry = null;

const initLogomarkGeometry = () => {
  const loader = new SVGLoader();
  loader.load(logomarkUrl, (data) => {
    const paths = data.paths;
    const shapes = [];

    for (let i = 0; i < paths.length; i++) {
      Array.prototype.push.apply(shapes, paths[i].toShapes(true));
    }

    const geometry = new THREE.ShapeGeometry(shapes);
    geometry.center();

    // 1. Dynamically measure your specific SVG
    geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);

    // 2. Scale it perfectly to match the diameter of your pen dots (4.0)
    const scaleFactor = 4.0 / Math.max(size.x, size.y);
    geometry.scale(scaleFactor, -scaleFactor, scaleFactor);

    cachedLogomarkGeometry = geometry;
  });
};

initLogomarkGeometry();

// --- Helper Functions ---

const cleanup = () => {
  if (instancedMesh) {
    scene.remove(instancedMesh);
    instancedMesh.dispose();
  }
  if (currentGeometry) {
    currentGeometry.dispose();
  }
};

const createWarpedGeometry = (chaosLevel, shapeType) => {
  let geometry;
  let isLogomark = false;

  if (shapeType === "logomark" && cachedLogomarkGeometry) {
    geometry = cachedLogomarkGeometry.clone();
    isLogomark = true;
  } else if (shapeType === "box") {
    geometry = new THREE.BoxGeometry(3, 3, 3);
  } else if (shapeType === "sphere") {
    geometry = new THREE.SphereGeometry(2, 12, 12);
  } else if (shapeType === "torus") {
    geometry = new THREE.TorusGeometry(1.5, 0.6, 12, 24);
  } else {
    // RESTORED: (2, 2) gives the noise function enough vertices to warp!
    geometry = new THREE.IcosahedronGeometry(2, 2);
  }

  // Only warp 3D objects, leave the SVG pristine
  if (!isLogomark) {
    const pos = geometry.attributes.position;
    const vec = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      vec.fromBufferAttribute(pos, i);
      const noise =
        Math.sin(vec.x * 4) + Math.cos(vec.y * 3.6) + Math.sin(vec.z * 5.8);
      vec.multiplyScalar(1.0 + noise * 0.3 * chaosLevel);
      pos.setXYZ(i, vec.x, vec.y, vec.z);
    }
    geometry.computeVertexNormals();
  }

  return geometry;
};

// Restored to 0.25 so the 0-1000 slider packs enough punch to move dots across columns
const calculateShift = (grad, gravity, spacing, maxShift) => {
  const val = -grad * gravity * spacing * 0.25;
  return Math.max(-maxShift, Math.min(maxShift, val));
};

// --- Main Export ---
export const initThreeGrid = (imgWidth, imgHeight, settings) => {
  if (!scene) return null;
  cleanup();

  material.side = THREE.DoubleSide;
  material.needsUpdate = true;

  // Grab pixelShape from the settings object
  const { pixelAmount, pixelDistortion, gridScale, pixelShape } = settings;
  const chaosLevel = (pixelDistortion || 0) / 100;
  const shapeType = pixelShape || "icosahedron";

  const maxCols = Math.floor(window.innerWidth / pixelAmount);
  const maxRows = Math.floor(window.innerHeight / pixelAmount);
  const imgAspect = imgWidth / imgHeight;
  const screenAspect = window.innerWidth / window.innerHeight;

  let cols, rows;
  if (imgAspect > screenAspect) {
    cols = maxCols;
    rows = Math.floor(maxCols / imgAspect);
  } else {
    cols = Math.floor(maxRows * imgAspect);
    rows = maxRows;
  }

  if (cols * rows <= 0) return null;

  // Pass shapeType here
  currentGeometry = createWarpedGeometry(chaosLevel, shapeType);

  instancedMesh = new THREE.InstancedMesh(
    currentGeometry,
    material,
    cols * rows,
  );

  setCameraZoom(5 / gridScale);
  scene.add(instancedMesh);

  return { cols, rows, instancedMesh };
};

export const applyImageToGrid = (imgData, cols, rows, settings, mesh) => {
  if (!mesh) return;

  const {
    pixelAmount,
    pixelScale,
    gridScale,
    pixelDistortion,
    pixelGravity = 0,
    scaleRatio,
    alignmentScale,
  } = settings;

  const chaosLevel = (pixelDistortion || 0) / 100;
  const gravityNorm = Math.max(0, Math.min(100, pixelGravity)) / 100;
  const spacing = pixelAmount * (gridScale / 5);

  const { minBright, maxBright } = imgData ? getBrightnessRange(imgData) : {};

  // --- RESTORED: Coordinate Tracking Arrays for the Animation Loop ---
  const originalPositions = [];
  const gridPositions = [];
  const originalRotations = [];
  const gridRotations = [];
  const originalScales = [];
  const gridScales = [];
  const activeInstances = new Uint8Array(cols * rows);

  let instanceIndex = 0;

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const { brightness, alpha } = imgData
        ? getPixelData(imgData, col, row, cols, rows, minBright, maxBright)
        : { brightness: 0, alpha: 0 };

      let shiftX = 0,
        shiftY = 0;
      const smallnessInfluence =
        brightness < 0.1 ? 0 : (brightness - 0.1) / 0.9;

      if (alpha > 0.01) {
        const getSafe = (c, r) =>
          getPixelData(
            imgData,
            Math.max(0, Math.min(cols - 1, c)),
            Math.max(0, Math.min(rows - 1, r)),
            cols,
            rows,
            minBright,
            maxBright,
          );
        const neighbors = {
          left: getSafe(col - 1, row),
          right: getSafe(col + 1, row),
          up: getSafe(col, row - 1),
          down: getSafe(col, row + 1),
        };

        if (!Object.values(neighbors).some((n) => n.alpha <= 0.01)) {
          const maxShift = spacing * 5.0;
          const rawShiftX = calculateShift(
            neighbors.right.brightness - neighbors.left.brightness,
            pixelGravity,
            spacing,
            maxShift,
          );
          const rawShiftY = calculateShift(
            neighbors.down.brightness - neighbors.up.brightness,
            pixelGravity,
            spacing,
            maxShift,
          );
          const alignmentFactor = document.getElementById("alignmentScale")
            ? alignmentScale / 100
            : 1.0;

          shiftX = rawShiftX * smallnessInfluence * alignmentFactor;
          shiftY = rawShiftY * smallnessInfluence * alignmentFactor;
        }
      }

      const isBackground = alpha <= 0.05 || brightness > 0.9;
      activeInstances[instanceIndex] = isBackground ? 0 : 1;

      const fadeOutFactor = 1.0 - smallnessInfluence * gravityNorm;
      const varianceWeight =
        typeof scaleRatio === "number" ? scaleRatio / 50 : 1.0;
      const originalVariance = 0.3 + Math.pow(1.0 - brightness, 2) * 1.5;
      const midPoint = 1.05;
      const sizeModifier =
        midPoint + (originalVariance - midPoint) * varianceWeight;

      const baseScale = isBackground
        ? 0
        : (pixelScale / 100) *
          (gridScale / 5) *
          sizeModifier *
          Math.max(0, fadeOutFactor);

      const wobble = 1.0 + THREE.MathUtils.randFloatSpread(0.5 * chaosLevel);
      const finalOriginalScale = baseScale * wobble;

      const objPos = new THREE.Vector3(
        (col - (cols - 1) / 2) * spacing + shiftX,
        (row - (rows - 1) / 2) * spacing + shiftY,
        (1.0 - brightness) * 1200 - 600,
      );

      // Check if the current shape is the logomark
      const isLogomark = settings.pixelShape === "logomark";

      // If logomark, keep rotation flat (0,0,0). Otherwise, spin randomly.
      const objRot = isLogomark
        ? new THREE.Euler(0, 0, 0)
        : new THREE.Euler(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
          );

      const spreadX = 1.6;
      const spreadY = 1;
      const spreadZ = 15;
      const depthStep = ((col + row) % 8) - 4;

      const gPos = new THREE.Vector3(
        (col - (cols - 1) / 2) * spacing * spreadX,
        (row - (rows - 1) / 2) * spacing * spreadY,
        depthStep * spacing * spreadZ,
      );
      const gRot = new THREE.Euler(0, 0, 0);
      const finalGridScale = (pixelScale / 100) * (gridScale / 5) * 0.6;

      // --- RESTORED: Pushing to tracking arrays ---
      originalPositions.push(objPos);
      gridPositions.push(gPos);
      originalRotations.push(new THREE.Quaternion().setFromEuler(objRot));
      gridRotations.push(new THREE.Quaternion().setFromEuler(gRot));
      originalScales.push(finalOriginalScale);
      gridScales.push(finalGridScale);

      dummyObject.position.copy(objPos);
      dummyObject.rotation.copy(objRot);
      dummyObject.scale.setScalar(finalOriginalScale);

      colorHelper.setScalar(brightness);
      mesh.setColorAt(instanceIndex, colorHelper);
      dummyObject.updateMatrix();
      mesh.setMatrixAt(instanceIndex, dummyObject.matrix);
      instanceIndex++;
    }
  }

  // --- FIXED: Merge properties instead of replacing the entire object.
  // This prevents the GIF loop from erasing the morph's 'prevPositions' memory! ---
  mesh.userData = mesh.userData || {};
  mesh.userData.originalPositions = originalPositions;
  mesh.userData.gridPositions = gridPositions;
  mesh.userData.originalRotations = originalRotations;
  mesh.userData.gridRotations = gridRotations;
  mesh.userData.originalScales = originalScales;
  mesh.userData.gridScales = gridScales;
  mesh.userData.activeInstances = activeInstances;

  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
};

// Keep backwards compatibility for your static image loader
export const updateThreeGrid = (img, settings) => {
  const { cols, rows, instancedMesh } =
    initThreeGrid(img.width, img.height, settings) || {};
  if (!instancedMesh) return;
  const imgData = sampleImage(img, cols, rows);
  applyImageToGrid(imgData, cols, rows, settings, instancedMesh);
};

export const queueNextTransitionImage = (img, settings) => {
  if (!instancedMesh) return null;

  const { pixelAmount } = settings;
  // Use your current logic to calculate the columns and rows for this new image
  const maxCols = Math.floor(window.innerWidth / pixelAmount);
  const maxRows = Math.floor(window.innerHeight / pixelAmount);
  const imgAspect = img.width / img.height;
  const screenAspect = window.innerWidth / window.innerHeight;

  let cols, rows;
  if (imgAspect > screenAspect) {
    cols = maxCols;
    rows = Math.floor(maxCols / imgAspect);
  } else {
    cols = Math.floor(maxRows * imgAspect);
    rows = maxRows;
  }

  const nextImgData = sampleImage(img, cols, rows);
  const { minBright, maxBright } = nextImgData
    ? getBrightnessRange(nextImgData)
    : {};

  // Store the secondary target target data inside the userData object
  instancedMesh.userData.nextImgData = nextImgData;
  instancedMesh.userData.nextMinBright = minBright;
  instancedMesh.userData.nextMaxBright = maxBright;
  instancedMesh.userData.nextCols = cols;
  instancedMesh.userData.nextRows = rows;

  return instancedMesh;
};

// Add a small helper function at the bottom to allow the animation loop to calculate
// target positions on the fly for Image B mid-flight.
export const getPixelDataDirect = (
  imgData,
  col,
  row,
  cols,
  rows,
  minBright,
  maxBright,
) => {
  return getPixelData(imgData, col, row, cols, rows, minBright, maxBright);
};
