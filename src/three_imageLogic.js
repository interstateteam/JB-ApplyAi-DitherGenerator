import { gridSetup } from "./three_gridLogic.js";

export function loadImage(url, config) {
  const { scene, geometry, material, dotSpace, winWidth, winHeight } = config;

  const img = new Image();
  img.src = url;

  img.onload = () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const gridCols = Math.floor(winWidth / dotSpace);
    const gridRows = Math.floor(winHeight / dotSpace);
    canvas.width = gridCols;
    canvas.height = gridRows;

    ctx.drawImage(img, 0, 0, gridCols, gridRows);
    const imgData = ctx.getImageData(0, 0, gridCols, gridRows);

    gridSetup(scene, geometry, material, dotSpace, imgData, gridCols, gridRows);
  };
}
