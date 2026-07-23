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

const ensureObjectArray = (existing, count, Ctor) => {
  if (existing && existing.length === count) return existing;
  const arr = new Array(count);
  for (let i = 0; i < count; i++) arr[i] = new Ctor();
  return arr;
};

const ensurePlainArray = (existing, count) =>
  existing && existing.length === count ? existing : new Array(count);

// S-curve applied to darkness before it drives density/size, so mid-darks
// and true-darks separate instead of collapsing into the same band.
// Only used for structure (density/scatter/size) — never for color.
const contrastCurve = (t, strength = 0.35) => {
  const eased = t < 0.5
    ? 0.5 * Math.pow(2 * t, 1 + strength)
    : 1 - 0.5 * Math.pow(2 * (1 - t), 1 + strength);
  return eased;
};

// Hashed pseudo-random per-cell value — replaces the old sin/cos noise,
// which was periodic and caused visible grid/moiré banding in smooth
// gradients (e.g. across the bridge of a nose).
const hashNoise = (col, row) => {
  const s = Math.sin(col * 127.1 + row * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// --- HIGHLIGHT, CONTOUR & WHITE SPACE CONTROLS ---
const sliderMaxCutoff = 200;
const whiteSpaceScatterBoost = 1.8;
const globalDotNormalization = 0.62;   // widened to let dark dots overlap into solid ink
const lightDotMinScale = 0.18;         // light dots shrink further for cleaner highlights
const airyDotOpticalShrink = 0.85;

// --- CONFIGURATION CONSTANTS ---
const densityPower = 2.2;
const wobbleSpreadModifier = 0.15;
const sizeMidpoint = 1.0;
const vertexNoiseModifier = 0.25;
const gravityWobbleDampener = 0.8;
const gravityDensityBoost = 0.8;
const minStippleDensity = 0;
const highlightCutoff = 0.98;

const pixelDistortion = 20;
const baseVarianceMultiplier = 0.2;
const borderBoostMax = 1;
const borderFalloffCurve = 5;
const maxGravityInfluence = 0.5;
const jitterSpreadFactor = 2.0;
const darknessExponent = 1;
const attractionStrength = 0.5;

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
    instancedMesh = null;
  }
  if (currentGeometry) {
    currentGeometry.dispose();
    currentGeometry = null;
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

  const { pixelAmount, gridScale, pixelShape } = settings;
  const chaosLevel = pixelDistortion / 100;
  const shapeType = pixelShape || "icosahedron";

  if (settings && settings.gridScale) {
    const newZoom = getResponsiveZoom(settings.gridScale);
    setCameraZoom(newZoom);
  }

  const { cols, rows } = getGridDimensions(
    { width: imgWidth, height: imgHeight },
    pixelAmount,
  );

  const count = cols * rows;
  if (count <= 0) return null;

  currentGeometry = createWarpedGeometry(chaosLevel, shapeType);
  instancedMesh = new THREE.InstancedMesh(currentGeometry, material, Math.ceil(count * 1.6));

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
    pixelGravity = 0,
    scaleRatio,
    alignmentScale,
    whiteCutoff = 20,
    lightnessCurve = 100,
  } = settings;

  const chaosLevel = (pixelDistortion || 0) / 100;
  const spacing = pixelAmount * (gridScale / 5);
  const { minBright, maxBright } = imgData ? getBrightnessRange(imgData) : {};
  const effectiveCurve = lightnessCurve / 100;

  const count = cols * rows;
  const maxInstances = Math.ceil(count * 1.6);

  const existing = mesh.userData || {};

  const originalPositions = ensureObjectArray(existing.originalPositions, maxInstances, THREE.Vector3);
  const gridPositions = ensureObjectArray(existing.gridPositions, maxInstances, THREE.Vector3);
  const originalRotations = ensureObjectArray(existing.originalRotations, maxInstances, THREE.Quaternion);
  const gridRotations = ensureObjectArray(existing.gridRotations, maxInstances, THREE.Quaternion);
  const originalScales = ensurePlainArray(existing.originalScales, maxInstances);
  const gridScales = ensurePlainArray(existing.gridScales, maxInstances);
  const activeInstances =
    existing.activeInstances && existing.activeInstances.length === maxInstances
      ? existing.activeInstances
      : new Uint8Array(maxInstances);

  const brightnessCache = new Float32Array(count);
  const alphaCache = new Float32Array(count);

  if (imgData) {
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const pData = getPixelData(imgData, c, r, cols, rows, minBright, maxBright);
        const cacheIndex = r * cols + c;
        brightnessCache[cacheIndex] = pData.brightness;
        alphaCache[cacheIndex] = pData.alpha;
      }
    }
  }

  const bgCutoffThreshold = 0.985;

  let subjectMin = 1.0;
  let subjectMax = 0.0;
  if (imgData) {
    for (let i = 0; i < count; i++) {
      const b = brightnessCache[i];
      const a = alphaCache[i];
      const isBg = a <= 0.05 || b >= bgCutoffThreshold;
      if (!isBg) {
        if (b < subjectMin) subjectMin = b;
        if (b > subjectMax) subjectMax = b;
      }
    }
  }
  if (subjectMax <= subjectMin + 0.05) {
    subjectMin = 0.0;
    subjectMax = 1.0;
  }

  const gravityNorm = Math.max(0, Math.min(100, pixelGravity)) / 100;
  const gravityInfluence = gravityNorm * maxGravityInfluence;
  const varianceWeight = typeof scaleRatio === "number" ? scaleRatio / 50 : 0.0;

  const normalizedCutoff = THREE.MathUtils.clamp(whiteCutoff / sliderMaxCutoff, 0.0, 1.0);
  const highlightPower = 1.0 + (normalizedCutoff * 6.0);

  const normBrightness = new Float32Array(count);
  const isBg = new Uint8Array(count);

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const idx = row * cols + col;
      const rawBrightness = imgData ? brightnessCache[idx] : 0;
      const alpha = imgData ? alphaCache[idx] : 0;
      const bg = alpha <= 0.05 || rawBrightness >= bgCutoffThreshold;
      isBg[idx] = bg ? 1 : 0;

      if (bg) {
        normBrightness[idx] = 1.0;
        continue;
      }
      let b = THREE.MathUtils.clamp((rawBrightness - subjectMin) / (subjectMax - subjectMin), 0.0, 1.0);
      if (Math.abs(effectiveCurve - 1.0) > 0.03) b = Math.pow(b, effectiveCurve);
      normBrightness[idx] = b;
    }
  }

  const neighborOffsets = [
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    { x: 1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 },
  ];

  const internalEdgeThreshold = 0.1;
  const subjectCells = [];

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const cacheIndex = row * cols + col;
      if (isBg[cacheIndex]) continue;

      const brightness = normBrightness[cacheIndex];
      const darkness = 1.0 - brightness;

      let shiftX = 0, shiftY = 0, edgeProximity = 0;
      const smallnessInfluence = brightness < 0.1 ? 0 : (brightness - 0.1) / 0.9;

      ({ shiftX, shiftY, edgeProximity } = calculateGravityShift(
        col, row, cols, rows, imgData, minBright, maxBright,
        alphaCache[cacheIndex], smallnessInfluence, pixelGravity, spacing, alignmentScale,
      ));

      let darkPullX = 0;
      let darkPullY = 0;
      let isBoundary = false;
      let maxLocalContrast = 0;

      for (let n = 0; n < neighborOffsets.length; n++) {
        const offset = neighborOffsets[n];
        const nCol = col + offset.x;
        const nRow = row + offset.y;

        if (nCol >= 0 && nCol < cols && nRow >= 0 && nRow < rows) {
          const nIndex = nRow * cols + nCol;
          const neighborIsBg = isBg[nIndex] === 1;
          if (neighborIsBg) isBoundary = true;

          const neighborBrightness = normBrightness[nIndex];
          const neighborDarkness = 1.0 - neighborBrightness;

          if (!neighborIsBg) {
            const contrast = Math.abs(brightness - neighborBrightness);
            if (contrast > maxLocalContrast) maxLocalContrast = contrast;
          }

          if (neighborDarkness > darkness) {
            const pullStrength =
              (neighborDarkness - darkness) * spacing *
              (attractionStrength + varianceWeight * 0.5) * gravityInfluence;
            darkPullX += offset.x * pullStrength;
            darkPullY += offset.y * pullStrength;
          }
        } else {
          isBoundary = true;
        }
      }

      const isInternalEdge = maxLocalContrast > internalEdgeThreshold;
      const effectiveEdge = isBoundary ? Math.max(edgeProximity, 0.95) : edgeProximity;

      subjectCells.push({
        col, row, brightness, darkness, shiftX, shiftY,
        darkPullX, darkPullY, effectiveEdge, isBoundary, isInternalEdge,
      });
    }
  }

  let estimatedTotalDots = 0;
  const cellTonalDarkness = new Array(subjectCells.length);
  const cellDensities = new Array(subjectCells.length);

  for (let i = 0; i < subjectCells.length; i++) {
    const cell = subjectCells[i];
    const tonalDarkness = contrastCurve(cell.darkness, 0.65);
    const densityCurve =
      Math.pow(tonalDarkness, densityPower) *
      Math.pow(tonalDarkness, (highlightPower - 1) * 0.35) *
      (0.85 + 0.9 * Math.pow(tonalDarkness, 3));
    const densityTarget = densityCurve * 2.6;

    cellTonalDarkness[i] = tonalDarkness;
    cellDensities[i] = densityTarget;
    estimatedTotalDots += densityTarget;
  }

  const budgetScale = estimatedTotalDots > maxInstances
    ? (maxInstances / estimatedTotalDots) * 0.92
    : 1.0;

  let instanceIndex = 0;

  for (let i = 0; i < subjectCells.length && instanceIndex < maxInstances; i++) {
    const cell = subjectCells[i];

    const tonalDarkness = cellTonalDarkness[i];
    const densityTarget = cellDensities[i] * budgetScale;

    let numDots = Math.floor(densityTarget);

    if (Math.random() < densityTarget - numDots) numDots += 1;

    const isCrispEdgeCell = cell.isBoundary || cell.effectiveEdge > 0.6 || cell.isInternalEdge;

    const edgeGuaranteeProbability = THREE.MathUtils.smoothstep(cell.darkness, 0.0, 0.25);
    if (isCrispEdgeCell && numDots === 0 && Math.random() < edgeGuaranteeProbability) {
      numDots = 1;
    }

    for (let d = 0; d < numDots && instanceIndex < maxInstances; d++) {
      let stippleJitterX = 0;
      let stippleJitterY = 0;

      const baseScatter = isCrispEdgeCell
        ? spacing * (cell.isInternalEdge && !cell.isBoundary
            ? 0.08
            : THREE.MathUtils.lerp(0.12, 0.45, Math.pow(tonalDarkness, 1.3)))
        : spacing * THREE.MathUtils.lerp(1.15, 1.65, Math.pow(tonalDarkness, 1.3));

      const randomAngle = Math.random() * Math.PI * 2;
      const randomDist = Math.sqrt(Math.random()) * baseScatter;
      stippleJitterX = Math.cos(randomAngle) * randomDist;
      stippleJitterY = Math.sin(randomAngle) * randomDist;

      const pullWeight = THREE.MathUtils.smoothstep(cell.darkness, 0.05, 0.80);
      const totalShiftX = cell.shiftX + (cell.darkPullX * pullWeight) + stippleJitterX;
      const totalShiftY = cell.shiftY + (cell.darkPullY * pullWeight) + stippleJitterY;

      const effectiveDiff = THREE.MathUtils.clamp(varianceWeight * 0.5, 0.0, 1.0);
      const lightDotSize = THREE.MathUtils.lerp(1.0, lightDotMinScale, effectiveDiff);
      const perceptualDarkness = Math.pow(tonalDarkness, 0.90);
      const innerSize = THREE.MathUtils.lerp(lightDotSize, 1.0, perceptualDarkness);

      const normalizedNoise = hashNoise(cell.col, cell.row);
      const spatialNoise = normalizedNoise * 2 - 1;

      const outlineEase = THREE.MathUtils.smoothstep(cell.effectiveEdge, 0.10, 1.0);
      const outlineBoost = 0.10 * Math.pow(outlineEase, 2.2) * THREE.MathUtils.smoothstep(cell.darkness, 0.0, 0.3);
      const internalEdgeBoost = cell.isInternalEdge ? 0.04 : 0;

      let finalDotSize = innerSize + Math.max(outlineBoost, internalEdgeBoost);

      const midToneWeight = Math.sin(THREE.MathUtils.clamp(cell.darkness, 0.0, 1.0) * Math.PI);
      finalDotSize += THREE.MathUtils.randFloatSpread(0.05) * midToneWeight;

      const opticalShrink = THREE.MathUtils.lerp(
        airyDotOpticalShrink, 1.0,
        THREE.MathUtils.smoothstep(cell.darkness, 0.0, 0.2)
      );
      finalDotSize *= opticalShrink;
      finalDotSize = THREE.MathUtils.clamp(finalDotSize, 0.10, 1.6);

      const baseScale = (pixelScale / 100) * (gridScale / 5) * finalDotSize * globalDotNormalization;

      const dotPixelDistortion = 15 + Math.pow(normalizedNoise, 2) * (pixelDistortion - 15);
      const dotChaosLevel = dotPixelDistortion / 100;
      const dampenedChaos = dotChaosLevel * (1.0 - gravityNorm * gravityWobbleDampener);
      const wobble = 1.0 + spatialNoise * wobbleSpreadModifier * dampenedChaos;
      const finalOriginalScale = baseScale * wobble;

      const objPos = originalPositions[instanceIndex];

      // --- LIGHT / DARK ZONE CUSTOMIZATION KNOBS ---
      const midpoint = 0.02;     // Lower = forces almost ALL dots into the light zone
      const lightPower = 0.75;   // < 1.0 aggressively propels faint mid-tones deep into light space
      const darkPower = 0.85;    // Exponent for dark depth falloff

      const maxForward = 135;    // Total forward reach into positive Z space
      const maxBackward = 45;    // Total backward reach into negative Z space

      // --- Z-DEPTH CALCULATION ---
      const toneDiff = cell.brightness - midpoint;
      let baseZ = 0;

      if (toneDiff >= 0) {
        const normLight = toneDiff / (1.0 - midpoint);
        baseZ = Math.pow(normLight, lightPower) * maxForward;
      } else {
        const normDark = Math.abs(toneDiff) / midpoint;
        baseZ = -Math.pow(normDark, darkPower) * maxBackward;
      }

      const jitterMin = toneDiff < 0 ? 0.2 : 0.75;
      const depthJitter = jitterMin + Math.random() * (1.2 - jitterMin);
      baseZ *= depthJitter;

      const organicScatter = THREE.MathUtils.randFloatSpread(6);
      const finalZ = baseZ + organicScatter;

      objPos.set(
        (cell.col - (cols - 1) / 2) * spacing + totalShiftX,
        (cell.row - (rows - 1) / 2) * spacing + totalShiftY,
        finalZ,
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

      const spreadX = 1.6, spreadY = 1, spreadZ = 20;
      const depthStep = ((cell.col + cell.row) % 8) - 4;
      const gPos = gridPositions[instanceIndex];
      gPos.set(
        (cell.col - (cols - 1) / 2) * spacing * spreadX,
        (cell.row - (rows - 1) / 2) * spacing * spreadY,
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

      const dotGrey = THREE.MathUtils.lerp(0.08, 0.92, cell.brightness);
      colorHelper.setScalar(dotGrey);
      mesh.setColorAt(instanceIndex, colorHelper);

      dummyObject.updateMatrix();
      mesh.setMatrixAt(instanceIndex, dummyObject.matrix);

      activeInstances[instanceIndex] = 1;
      instanceIndex++;
    }
  }

  dummyObject.position.set(0, 0, 0);
  dummyObject.rotation.set(0, 0, 0);
  dummyObject.scale.setScalar(0);
  dummyObject.updateMatrix();
  const zeroMatrix = dummyObject.matrix.clone();

  while (instanceIndex < maxInstances) {
    activeInstances[instanceIndex] = 0;
    originalScales[instanceIndex] = 0;
    gridScales[instanceIndex] = 0;
    mesh.setMatrixAt(instanceIndex, zeroMatrix);
    instanceIndex++;
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
