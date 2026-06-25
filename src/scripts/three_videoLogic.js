import { parseGIF, decompressFrames } from "gifuct-js";

export const parseGifFile = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const buffer = reader.result;
        const gif = parseGIF(buffer);
        const rawFrames = decompressFrames(gif, true);

        const frames = [];

        // We use a canvas to properly composite GIF frames
        // (handling transparency and disposal methods correctly)
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        canvas.width = rawFrames[0].dims.width;
        canvas.height = rawFrames[0].dims.height;

        let previousImageData = null;

        for (let i = 0; i < rawFrames.length; i++) {
          const frame = rawFrames[i];

          // Handle GIF disposal methods
          if (frame.disposalType === 2) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          } else if (frame.disposalType === 3 && previousImageData) {
            ctx.putImageData(previousImageData, 0, 0);
          } else {
            previousImageData = ctx.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            );
          }

          // Create ImageData for the current patch
          const frameImageData = new ImageData(
            new Uint8ClampedArray(frame.patch),
            frame.dims.width,
            frame.dims.height,
          );

          // Draw the patch onto our compositing canvas
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = frame.dims.width;
          tempCanvas.height = frame.dims.height;
          tempCanvas.getContext("2d").putImageData(frameImageData, 0, 0);

          ctx.drawImage(tempCanvas, frame.dims.left, frame.dims.top);

          // Save the fully composited frame
          frames.push({
            imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
            delay: Math.max(20, frame.delay), // Fallback for 0-delay frames
          });
        }

        resolve({
          width: canvas.width,
          height: canvas.height,
          frames: frames,
        });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};
