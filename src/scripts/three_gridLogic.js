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

const densityPower = 2.2;
const wobbleSpreadModifier = 0.15;
const sizeMidpoint = 1.0;
const vertexNoiseModifier = 0.25;
const gravityWobbleDampener = 0.8;
const gravityDensityBoost = 0.8;
const minStippleDensity = 0;
const highlightCutoff = 0.98;

const pixelDistortion = 40;

const baseVarianceMultiplier = 0.2; // Multiplier for base variance (controls randomness)

const borderBoostMax = 1; // Adjusted to 0.15 for visibility now that the math is normalized
const borderFalloffCurve = 5; // Smooths the transition from the edge down to the inner dots

const maxGravityInfluence = 0.5; // Controls the slider ceiling (100% slider = this value)
const jitterSpreadFactor = 2.0; // How many grid rows/cols away a dot can randomly jump
const darknessExponent = 1; // Higher = chaos isolates to pure blacks. Lower = chaos bleeds into midtones/whites.
const attractionStrength = 0.5; // How aggressively dots pull toward darker neighbors (magnetic force)

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
    pixelGravity = 0,
    scaleRatio,
    alignmentScale,
    whiteCutoff = 8
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

  const brightnessCache = new Float32Array(count);
  const alphaCache = new Float32Array(count);

  if (imgData) {
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const pData = getPixelData(
          imgData,
          c,
          r,
          cols,
          rows,
          minBright,
          maxBright,
        );
        const cacheIndex = r * cols + c;
        brightnessCache[cacheIndex] = pData.brightness;
        alphaCache[cacheIndex] = pData.alpha;
      }
    }
  }

  for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const cacheIndex = row * cols + col;
        const brightness = imgData ? brightnessCache[cacheIndex] : 0;
        const alpha = imgData ? alphaCache[cacheIndex] : 0;

        const darkness = 1.0 - brightness;

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
        const gravityInfluence = gravityNorm * maxGravityInfluence;
        const varianceWeight = typeof scaleRatio === "number" ? scaleRatio / 50 : 1.0;

        // 1. SCAN NEIGHBORS: Track darkest pull & detect actual subject boundaries
        let darkPullX = 0;
        let darkPullY = 0;
        let maxNeighborDarkness = darkness;
        let isBoundary = false;

        const neighborOffsets = [
          { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
          { x: 1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 },
        ];

        neighborOffsets.forEach((offset) => {
          const nCol = col + offset.x;
          const nRow = row + offset.y;

          if (nCol >= 0 && nCol < cols && nRow >= 0 && nRow < rows) {
            const nIndex = nRow * cols + nCol;
            const neighborAlpha = imgData ? alphaCache[nIndex] : 0;
            const neighborBrightness = imgData ? brightnessCache[nIndex] : 1;

            const isNeighborEmpty = neighborAlpha <= 0.05 || neighborBrightness > (typeof highlightCutoff !== "undefined" ? highlightCutoff : 0.98);

            if (isNeighborEmpty) {
              isBoundary = true;
            }

            const neighborDarkness = 1.0 - neighborBrightness;

            if (neighborDarkness > maxNeighborDarkness) {
              maxNeighborDarkness = neighborDarkness;
            }

            if (neighborDarkness > darkness) {
              const pullStrength =
                (neighborDarkness - darkness) *
                spacing *
                (attractionStrength + varianceWeight * 0.5) *
                gravityInfluence;
              darkPullX += offset.x * pullStrength;
              darkPullY += offset.y * pullStrength;
            }
          }
        });

        // MULTI-LINE GRADIENT EDGE:
        const isThisPixelEmpty = alpha <= 0.05 || brightness > (typeof highlightCutoff !== "undefined" ? highlightCutoff : 0.98);

        const effectiveEdge = isBoundary ? Math.max(edgeProximity, 0.95) : edgeProximity;
        const edgeGradient = THREE.MathUtils.smoothstep(effectiveEdge, 0.15, 1.0);

        const inEdgeBand = edgeGradient > 0.0 && !isThisPixelEmpty;
        const isBackground = isThisPixelEmpty && !inEdgeBand;

        // 2. DENSITY & SPARE DOT LOGIC
        const lowerCutoff = (whiteCutoff || 0) / 100;
        const whiteRatio = THREE.MathUtils.clamp((whiteCutoff || 0) / 30, 0.1, 1.0);

        const curvedDarkness = Math.pow(darkness, 2.5);
        const curvedNeighbor = Math.pow(maxNeighborDarkness, 2.5);
        const effectiveDarkness = Math.max(curvedDarkness, curvedNeighbor * 0.5 * gravityNorm);

        const upperCutoff = Math.max(lowerCutoff + 0.15, 0.35);
        let stippleDensity = THREE.MathUtils.smoothstep(effectiveDarkness, lowerCutoff, upperCutoff);

        if (inEdgeBand) {
          const edgeDensityTarget = THREE.MathUtils.lerp(0.35, 0.70, whiteRatio);
          const blendedEdgeDensity = edgeDensityTarget * edgeGradient;
          stippleDensity = Math.max(stippleDensity, blendedEdgeDensity);
        }

        // LIGHT PATCH DENSITY SUPPRESSION:
        // Aggressively thins out dots in lighter wood grain bands (darkness < 0.45)
        // by up to 70%, keeping mid-to-light areas sparse and clean like the drawing!
        if (darkness < 0.45 && !inEdgeBand) {
          stippleDensity *= Math.pow(Math.max(0, darkness) / 0.45, 1.5);
        }

        // DENSE SHADOW OVERRIDE (Shifted up to protect lighter tones):
        // Guaranteed 100% survival for deep shadows (> 0.65), and an 80% floor for mid-shadows (> 0.45).
        if (darkness > 0.65) {
          stippleDensity = 1.0;
        } else if (darkness > 0.45) {
          stippleDensity = Math.max(stippleDensity, 0.80);
        }

        // 4x4 Bayer Dither Matrix
        const ditherMatrix = [
          [0.06, 0.56, 0.19, 0.69],
          [0.81, 0.31, 0.94, 0.44],
          [0.25, 0.75, 0.12, 0.62],
          [1.00, 0.50, 0.88, 0.38],
        ];

        const ditherThreshold = ditherMatrix[row % 4][col % 4];

        // AGGRESSIVE DITHER SCRAMBLE:
        const organicScramble = THREE.MathUtils.randFloatSpread(0.45) * Math.pow(1.0 - darkness, 1.2);
        const hideDot = (ditherThreshold + organicScramble) > stippleDensity;

        activeInstances[instanceIndex] = isBackground || hideDot ? 0 : 1;

        // 3. SIZE & SCALE CALCULATIONS
        const originalVariance = 0.5 + Math.pow(darkness, 2) * baseVarianceMultiplier;
        const innerSize = sizeMidpoint + (originalVariance - sizeMidpoint) * varianceWeight;

        const patchFrequency = 0.3;
        const spatialNoise =
          (Math.sin(col * patchFrequency) +
            Math.cos(row * patchFrequency) +
            Math.sin((col + row) * (patchFrequency * 0.5))) / 3;

        const normalizedNoise = (spatialNoise + 1) / 2;
        const stableSize = sizeMidpoint + Math.pow(darkness, 2) * varianceWeight;
        const sizeWeight = Math.max(0, 2 - stableSize);

        const normalizedFalloff = borderFalloffCurve * Math.max(0.5, stableSize);
        const edgeIntensity = Math.pow(edgeProximity, normalizedFalloff);
        const organicEdgeBlend = 0.3 + normalizedNoise * 0.7;

        const borderMultiplier =
          1.0 + borderBoostMax * sizeWeight * edgeIntensity * organicEdgeBlend;

        let finalDotSize = innerSize * borderMultiplier;

        // SHADOW INK EXPANSION:
        if (darkness > 0.35) {
          finalDotSize *= 1.0 + Math.pow(darkness, 2) * 0.40;
        }

        // MID-TONE SIZE RANDOMNESS:
        // Uses a sine wave (Math.sin(darkness * Math.PI)) that peaks at 1.0 right in the middle tones (0.5),
        // and drops to 0 in pure highlights and deep shadows. Applies up to +/-35% organic size variety!
        const midToneWeight = Math.sin(THREE.MathUtils.clamp(darkness, 0.0, 1.0) * Math.PI);
        finalDotSize *= 1.0 + THREE.MathUtils.randFloatSpread(0.70) * midToneWeight;

        // GRADIENT OUTLINE SIZE SCALING:
        if (inEdgeBand) {
          const targetEdgeScale = THREE.MathUtils.lerp(0.30, 0.65, whiteRatio);
          const edgeSizeFactor = THREE.MathUtils.lerp(1.0, targetEdgeScale, edgeGradient);
          finalDotSize *= edgeSizeFactor;
        }

        // Universal 0.28 size floor applied after all randomizations so dots never vanish into dust
        finalDotSize = Math.max(finalDotSize, 0.28);

        const maxEdgeSize = 1.2;
        const dynamicCap = maxEdgeSize + (1.0 - edgeProximity) * 10.0;
        finalDotSize = Math.min(finalDotSize, dynamicCap);

        const baseScale = (isBackground || hideDot)
          ? 0
          : (pixelScale / 100) * (gridScale / 5) * finalDotSize;

        const dotPixelDistortion = 15 + Math.pow(normalizedNoise, 2) * (pixelDistortion - 15);
        const dotChaosLevel = dotPixelDistortion / 100;
        const dampenedChaos = dotChaosLevel * (1.0 - gravityNorm * gravityWobbleDampener);

        const wobble = 1.0 + spatialNoise * wobbleSpreadModifier * dampenedChaos;
        const finalOriginalScale = baseScale * wobble;

        // 4. RANDOM JITTER & EDGE ANCHORING
        const anchorWeight = 1.0 - Math.pow(edgeGradient, 0.7);

        const whiteSpaceBoost = 1.0 + Math.pow(1.0 - darkness, 2) * 0.75;
        const maxJitterDistance = spacing * jitterSpreadFactor * whiteSpaceBoost;

        const brightScatterFloor = Math.pow(1.0 - darkness, 1.5) * 0.85;
        const shadowTightScatter = Math.pow(darkness, darknessExponent) * 0.35;
        const scatterIntensity = Math.max(brightScatterFloor, shadowTightScatter);

        const effectiveJitter = THREE.MathUtils.lerp(
          Math.max(gravityInfluence, 0.80),
          Math.max(gravityInfluence, 0.30),
          Math.min(1.0, darkness * 1.5)
        );

        const darkJitterX =
          THREE.MathUtils.randFloatSpread(maxJitterDistance) *
          scatterIntensity *
          effectiveJitter;
        const darkJitterY =
          THREE.MathUtils.randFloatSpread(maxJitterDistance) *
          scatterIntensity *
          effectiveJitter;

        // Apply anchorWeight to ALL spatial movement (gravity shifts, neighbor pulls, and jitter)
        const totalShiftX = (shiftX + darkPullX + darkJitterX) * anchorWeight;
        const totalShiftY = (shiftY + darkPullY + darkJitterY) * anchorWeight;

        // 5. FINAL POSITION ASSEMBLY
        const objPos = originalPositions[instanceIndex];
        objPos.set(
          (col - (cols - 1) / 2) * spacing + totalShiftX,
          (row - (rows - 1) / 2) * spacing + totalShiftY,
          (brightness - 0.5) * 1200,
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
