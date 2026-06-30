import * as THREE from "three";
import {
  sampleImage,
  getBrightnessRange,
  getGridDimensions,
  getPixelData,
} from "./three_imageLogic.js";
import { calculateGravityShift } from "./three_gravityLogic.js";
import { scene, material, setCameraZoom } from "./three_sceneLogic.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import logomarkUrl from "../assets/LogoMarkFull.svg";

const dummyObject = new THREE.Object3D();
const colorHelper = new THREE.Color();
const eulerScratch = new THREE.Euler();

let currentGeometry = null;
let instancedMesh = null;
let cachedLogomarkGeometry = null;

/**
 * Reuses an existing array of Vector3/Quaternion instances when the instance count
 * is unchanged (the common case for repeated GIF-frame updates against the same
 * mesh), avoiding thousands of fresh allocations per frame. Allocates fresh objects
 * only when the count changes or no array exists yet.
 */
const ensureObjectArray = (existing, count, Ctor) => {
  if (existing && existing.length === count) return existing;
  const arr = new Array(count);
  for (let i = 0; i < count; i++) arr[i] = new Ctor();
  return arr;
};

const ensurePlainArray = (existing, count) =>
  existing && existing.length === count ? existing : new Array(count);

const densityPower = 1.2;
const baseVarianceMultiplier = 1.2;
const borderSizeMaxInfluence = 1;
const wobbleSpreadModifier = 0.15;
const sizeMidpoint = 1.0;
const borderEasingPower = 1.5;
const vertexNoiseModifier = 0.25;
const gravityWobbleDampener = 0.8;
const gravityDensityBoost = 0.8;
const minStippleDensity = 0.1;
const highlightCutoff = 0.98;
const lightEdgeMinimum = 0.5;

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
    geometry.computeBoundingBox();

    const size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);
    const scaleFactor = 4.0 / Math.max(size.x, size.y);
    geometry.scale(scaleFactor, -scaleFactor, scaleFactor);

    cachedLogomarkGeometry = geometry;
  });
};

initLogomarkGeometry();

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
    geometry = new THREE.IcosahedronGeometry(2, 2);
  }

  if (!isLogomark) {
    const pos = geometry.attributes.position;
    const vec = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      vec.fromBufferAttribute(pos, i);
      const noise =
        Math.sin(vec.x * 4) + Math.cos(vec.y * 3.6) + Math.sin(vec.z * 5.8);
      vec.multiplyScalar(1.0 + noise * vertexNoiseModifier * chaosLevel);
      pos.setXYZ(i, vec.x, vec.y, vec.z);
    }
    geometry.computeVertexNormals();
  }

  return geometry;
};

export const getResponsiveZoom = (gridScale) => {
  const currentWidth = window.innerWidth;
  const screenFactor = Math.min(currentWidth / 1920, 1);
  return (1 / gridScale) * screenFactor;
};

export const handleGridScaleUpdate = (newGridScale) => {
  const adjustedZoom = getResponsiveZoom(newGridScale);
  setCameraZoom(adjustedZoom);
};

export const initThreeGrid = (imgWidth, imgHeight, settings) => {
  if (!scene) return null;
  cleanup();

  material.side = THREE.DoubleSide;
  material.needsUpdate = true;

  const { pixelAmount, pixelDistortion, gridScale, pixelShape } = settings;
  const chaosLevel = (pixelDistortion || 0) / 100;
  const shapeType = pixelShape || "icosahedron";

  if (settings && settings.gridScale) {
    const newZoom = getResponsiveZoom(settings.gridScale);
    setCameraZoom(newZoom);
  }

  const { cols, rows } = getGridDimensions(
    { width: imgWidth, height: imgHeight },
    pixelAmount,
  );

  if (cols * rows <= 0) return null;

  currentGeometry = createWarpedGeometry(chaosLevel, shapeType);
  instancedMesh = new THREE.InstancedMesh(
    currentGeometry,
    material,
    cols * rows,
  );

  setCameraZoom(6 / gridScale);
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
  const spacing = pixelAmount * (gridScale / 5);
  const { minBright, maxBright } = imgData ? getBrightnessRange(imgData) : {};

  const count = cols * rows;
  const existing = mesh.userData || {};

  const originalPositions = ensureObjectArray(
    existing.originalPositions,
    count,
    THREE.Vector3,
  );
  const gridPositions = ensureObjectArray(
    existing.gridPositions,
    count,
    THREE.Vector3,
  );
  const originalRotations = ensureObjectArray(
    existing.originalRotations,
    count,
    THREE.Quaternion,
  );
  const gridRotations = ensureObjectArray(
    existing.gridRotations,
    count,
    THREE.Quaternion,
  );
  const originalScales = ensurePlainArray(existing.originalScales, count);
  const gridScales = ensurePlainArray(existing.gridScales, count);
  const activeInstances =
    existing.activeInstances && existing.activeInstances.length === count
      ? existing.activeInstances
      : new Uint8Array(count);

  let instanceIndex = 0;

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const { brightness, alpha } = imgData
        ? getPixelData(imgData, col, row, cols, rows, minBright, maxBright)
        : { brightness: 0, alpha: 0 };

      const darkness = 1.0 - brightness;
      const isBackground = alpha <= 0.05 || brightness > highlightCutoff;

      let shiftX = 0,
        shiftY = 0,
        edgeProximity = 0;
      const smallnessInfluence =
        brightness < 0.1 ? 0 : (brightness - 0.1) / 0.9;

      ({ shiftX, shiftY, edgeProximity } = calculateGravityShift(
        col,
        row,
        cols,
        rows,
        imgData,
        minBright,
        maxBright,
        alpha,
        smallnessInfluence,
        pixelGravity,
        spacing,
        alignmentScale,
      ));

      const gravityNorm = Math.max(0, Math.min(100, pixelGravity)) / 100;

      const baseStippleDensity = Math.max(
        minStippleDensity,
        Math.pow(darkness, densityPower),
      );
      const stippleDensity = Math.min(
        1.0,
        baseStippleDensity + gravityNorm * gravityDensityBoost * darkness,
      );
      const hideDot = Math.random() > stippleDensity;

      activeInstances[instanceIndex] = isBackground || hideDot ? 0 : 1;

      const varianceWeight =
        typeof scaleRatio === "number" ? scaleRatio / 50 : 1.0;
      const originalVariance =
        0.5 + Math.pow(darkness, 2) * baseVarianceMultiplier;

      const innerSize =
        sizeMidpoint + (originalVariance - sizeMidpoint) * varianceWeight;
      const maxBorderSize =
        innerSize + borderSizeMaxInfluence * varianceWeight * darkness;

      const edgeDarknessFactor =
        lightEdgeMinimum + (1.0 - lightEdgeMinimum) * Math.pow(darkness, 1.5);
      const dynamicEdgeProximity = edgeProximity * edgeDarknessFactor;

      const sizeModifier =
        innerSize +
        (maxBorderSize - innerSize) *
          Math.pow(dynamicEdgeProximity, borderEasingPower);

      const baseScale = isBackground
        ? 0
        : (pixelScale / 100) * (gridScale / 5) * sizeModifier;

      const dampenedChaos =
        chaosLevel * (1.0 - gravityNorm * gravityWobbleDampener);
      const wobble =
        1.0 +
        THREE.MathUtils.randFloatSpread(wobbleSpreadModifier * dampenedChaos);
      const finalOriginalScale = baseScale * wobble;

      const objPos = originalPositions[instanceIndex];
      objPos.set(
        (col - (cols - 1) / 2) * spacing + shiftX,
        (row - (rows - 1) / 2) * spacing + shiftY,
        (1.0 - brightness) * 1200 - 600,
      );

      const isLogomark = settings.pixelShape === "logomark";
      if (isLogomark) {
        eulerScratch.set(0, 0, 0);
      } else {
        eulerScratch.set(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
        );
      }

      const spreadX = 1.6,
        spreadY = 1,
        spreadZ = 15;
      const depthStep = ((col + row) % 8) - 4;
      const gPos = gridPositions[instanceIndex];
      gPos.set(
        (col - (cols - 1) / 2) * spacing * spreadX,
        (row - (rows - 1) / 2) * spacing * spreadY,
        depthStep * spacing * spreadZ,
      );

      const finalGridScale = (pixelScale / 100) * (gridScale / 5) * 0.6;

      originalRotations[instanceIndex].setFromEuler(eulerScratch);
      gridRotations[instanceIndex].identity();
      originalScales[instanceIndex] = finalOriginalScale;
      gridScales[instanceIndex] = finalGridScale;

      dummyObject.position.copy(objPos);
      dummyObject.rotation.copy(eulerScratch);
      dummyObject.scale.setScalar(finalOriginalScale);

      colorHelper.setScalar(brightness);
      mesh.setColorAt(instanceIndex, colorHelper);
      dummyObject.updateMatrix();
      mesh.setMatrixAt(instanceIndex, dummyObject.matrix);
      instanceIndex++;
    }
  }

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

export const updateThreeGrid = (img, settings) => {
  const { cols, rows, instancedMesh } =
    initThreeGrid(img.width, img.height, settings) || {};
  if (!instancedMesh) return;
  const imgData = sampleImage(img, cols, rows);
  applyImageToGrid(imgData, cols, rows, settings, instancedMesh);
};

export const queueNextTransitionImage = (img, settings) => {
  if (!instancedMesh) return null;

  const { pixelAmount, gridScale } = settings;

  if (settings && gridScale) {
    const newZoom = getResponsiveZoom(gridScale);
    setCameraZoom(newZoom);
  }

  const { cols, rows } = getGridDimensions(img, pixelAmount);

  const nextImgData = sampleImage(img, cols, rows);
  const { minBright, maxBright } = nextImgData
    ? getBrightnessRange(nextImgData)
    : {};

  instancedMesh.userData.nextImgData = nextImgData;
  instancedMesh.userData.nextMinBright = minBright;
  instancedMesh.userData.nextMaxBright = maxBright;
  instancedMesh.userData.nextCols = cols;
  instancedMesh.userData.nextRows = rows;

  return instancedMesh;
};

export const getActiveMesh = () => instancedMesh;
