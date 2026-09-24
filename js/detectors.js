/* detector implementations and routing
* 
* NOTES: 
* - claude-generated for quick test -> to be redone by hand
* - samples every 4th pixel to reduce workload (to be fiddled with / automatically adjusted in real implementation)
* 
* each implementation is an object exposing a `detect(capturedCanvas)` method, returning:
*   { detections: [ { class, confidence, x, y, width, height }, ... ] }
* x/y/width/height are normalized (0–1), relative to the captured image.
*
* app.js only ever calls `detector.detect(...)` — it doesn't know or care which implementation is behind it. 
* change selection in config.js (CONFIG.ACTIVE_DETECTOR)
* needs config.js loaded first (for CONFIG), and must itself load before app.js.
*/

// a note from chrome devtools: 
// set willReadFrequently true to speed things up
// https://html.spec.whatwg.org/multipage/canvas.html#concept-canvas-will-read-frequently
// const ctx = tempCanvas.getContext("2d", { willReadFrequently: true });

const STEP = 2; // only every n-th pixel checked


//MARK: convert
/*
* convert capturedCanvas into format compatible with detection
* potentially perform some pre-processing
*/
function convertCanvas() { 
  return console.log("heyo");
}


//MARK: fakeDetector
/*
* randomly "finds" a seal at a fixed position/size
* useful for testing UI states (found/not-found) and verifying the
* coordinate math independent of any actual image content
* */
const fakeDetector = {
  async detect(capturedCanvas) {
    // simulate some inference delay (when actual model gets involved)
    await new Promise((resolve) => setTimeout(resolve, 500));

    // randomly find or not find a thing
    const found = Math.random() > 0.3;
    if (!found) {
      return { detections: [] };
    }

    return {
      detections: [ // fake data
        {
          class: "seal",
          confidence: 0.87,
          x: 0.30,      // normalized (0–1) top-left, relative to image width
          y: 0.35,
          width: 0.25,
          height: 0.20
        }
      ]
    };
  }
};

//MARK: reindeerDetector
/*
* detects reindeers by looking for their natural colour
*/
const reindeerDetector = {
  async detect(capturedCanvas) {
    const ctx = capturedCanvas.getContext("2d");
    const width = capturedCanvas.width;
    const height = capturedCanvas.height;
    const { data } = ctx.getImageData(0, 0, width, height);

    // sample every Nth pixel instead of every single one, for performance
    // on large snapshots (e.g. full-res phone camera captures)
    const step = STEP;

    let minX = width, minY = height, maxX = 0, maxY = 0;
    let matchCount = 0;

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        //const isBlueish = b > 120 && (b - g) > 40 && (b - r) > 40;
        const isBlueish = b > 120 && b > (g+20) && (b+g)/4 > r;

        if (isBlueish) {
          matchCount++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // simulate some inference delay (when actual model gets involved)
    await new Promise((resolve) => setTimeout(resolve, 300));

    // require a minimum number of sampled matches, so a single stray
    // reddish/bright pixel doesn't produce a "detection"
    const minMatches = 15;
    if (matchCount < minMatches) {
      return { detections: [] };
    }

    const boxWidth = maxX - minX;
    const boxHeight = maxY - minY;

    // rough stand-in "confidence": denser matches within the box area
    // read as more confident, capped so it never claims certainty
    const sampledBoxArea = (boxWidth / step + 1) * (boxHeight / step + 1);
    const confidence = Math.min(0.5 + matchCount / sampledBoxArea, 0.99);

    return {
      detections: [
        {
          class: "reindeer",
          confidence,
          x: minX / width,      // normalized (0–1) top-left, relative to image width
          y: minY / height,
          width: boxWidth / width,
          height: boxHeight / height
        }
      ]
    };
  }
};

//MARK: brightDetector
/*
* a copy of colour based one, but looking for bright spots
*/
const brightDetector = {
  async detect(capturedCanvas) {
    const ctx = capturedCanvas.getContext("2d");
    const width = capturedCanvas.width;
    const height = capturedCanvas.height;
    const { data } = ctx.getImageData(0, 0, width, height);

    // sample every Nth pixel instead of every single one, for performance
    // on large snapshots (e.g. full-res phone camera captures)
    const step = STEP;

    let minX = width, minY = height, maxX = 0, maxY = 0;
    let matchCount = 0;

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const isBright = r > 220 && g > 220 && b > 220;

        if (isBright) {
          matchCount++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // simulate some inference delay (when actual model gets involved)
    await new Promise((resolve) => setTimeout(resolve, 300));

    // require a minimum number of sampled matches, so a single stray
    // reddish/bright pixel doesn't produce a "detection"
    const minMatches = 15;
    if (matchCount < minMatches) {
      return { detections: [] };
    }

    const boxWidth = maxX - minX;
    const boxHeight = maxY - minY;

    // rough stand-in "confidence": denser matches within the box area
    // read as more confident, capped so it never claims certainty
    const sampledBoxArea = (boxWidth / step + 1) * (boxHeight / step + 1);
    const confidence = Math.min(0.5 + matchCount / sampledBoxArea, 0.99);

    return {
      detections: [
        {
          class: "bright object",
          confidence,
          x: minX / width,      // normalized (0–1) top-left, relative to image width
          y: minY / height,
          width: boxWidth / width,
          height: boxHeight / height
        }
      ]
    };
  }
};


//MARK: ai-slop
/*
* quick YOLOv8 ONNX experiment (ai-slop)
* 
* yeah... no
* 
* doesn't include NMS
*
* NOT production code yet.
* Assumes:
* - model input: [1, 3, 640, 640]
* - model output: [1, 6, 8400]
* - output format: [x, y, width, height, class0, class1]
*/

const yoloDetector = {

  session: null,
  initPromise: null,

  async init() {
    if (this.initPromise) {
      return this.initPromise;
    }

    if (typeof ort === "undefined") {
      throw new Error("ONNX Runtime Web is not loaded.");
    }

    console.log("[yolo] Loading models/best.onnx...");

    this.initPromise = ort.InferenceSession.create("models/best.onnx")
      .then((session) => {
        this.session = session;
        console.log("[yolo] Model loaded.", {
          inputNames: session.inputNames,
          outputNames: session.outputNames
        });
        return session;
      })
      .catch((error) => {
        this.initPromise = null;
        console.error("[yolo] Model loading failed:", error);
        throw error;
      });

    return this.initPromise;
  },


  async detect(capturedCanvas) {

    if (!this.session) {
      await this.init();
    }

    console.log("[yolo] Running detection.", {
      width: capturedCanvas.width,
      height: capturedCanvas.height
    });

    const input = new Float32Array(1 * 3 * 640 * 640);

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = 640;
    tempCanvas.height = 640;

    const ctx = tempCanvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(capturedCanvas, 0, 0, 640, 640);

    const imageData = ctx.getImageData(0, 0, 640, 640);

    /*
    * Convert browser RGBA pixels into YOLO's
    * RGB / CHW / float32 format.
    */

    for (let y = 0; y < 640; y++) {
      for (let x = 0; x < 640; x++) {

        const pixel = (y * 640 + x) * 4;
        const index = y * 640 + x;

        input[index] =
          imageData.data[pixel] / 255;

        input[640 * 640 + index] =
          imageData.data[pixel + 1] / 255;

        input[2 * 640 * 640 + index] =
          imageData.data[pixel + 2] / 255;
      }
    }

    const tensor = new ort.Tensor(
      "float32",
      input,
      [1, 3, 640, 640]
    );

    const results = await this.session.run({
      images: tensor
    });

    const outputTensor = results.output0;

    console.log("[yolo] Inference complete.", {
      outputNames: Object.keys(results),
      outputDimensions: outputTensor.dims,
      outputLength: outputTensor.data.length
    });

    const output = outputTensor.data;

    const detections = [];

    const numCandidates = 8400;
    const numClasses = 2;

    const confidenceThreshold = 0.4;

    for (let i = 0; i < numCandidates; i++) {

      const x = output[i];
      const y = output[numCandidates + i];
      const width = output[2 * numCandidates + i];
      const height = output[3 * numCandidates + i];

      const class0 = output[4 * numCandidates + i];
      const class1 = output[5 * numCandidates + i];

      let classId;
      let confidence;

      if (class0 > class1) {
        classId = 0;
        confidence = class0;
      } else {
        classId = 1;
        confidence = class1;
      }

      if (confidence < confidenceThreshold) {
        continue;
      }

      /*
      * YOLO gives centre coordinates.
      * Convert to top-left coordinates.
      */

      const boxX = x - width / 2;
      const boxY = y - height / 2;

      detections.push({
        class: classId === 0 ? "class0" : "class1",
        confidence: confidence,

        // Convert 640px coordinates to normalized 0–1.
        x: boxX / 640,
        y: boxY / 640,
        width: width / 640,
        height: height / 640
      });
    }

    console.log("[yolo] Detections:", detections.length);
    if (detections.length > 0) console.log(detections); // just dump it all

    return { detections };
  }
};


//MARK: detector routing
/*
* maps CONFIG.ACTIVE_DETECTOR ("fake" | "red" | later: "onnx" | "remote")
* to the actual implementation used by app.js.
* falls back to fakeDetector (with a console warning) on an unrecognised
* value, rather than leaving `detector` undefined and crashing on first use
* */
const detectors = {
  //toy examples
  fake: fakeDetector,
  reindeer: reindeerDetector, // inside joke: looks for blueish blobs
  bright: brightDetector,
  // the real deal
  yolo: yoloDetector
  //yololocal: toBeAdded,   
  //yoloort: toBeAddded,    // optimised https://onnxruntime.ai/docs/performance/model-optimizations/ort-format-models.html
  //yolohosted: toBeAdddded // maybe
};

const detector = detectors[CONFIG.ACTIVE_DETECTOR] || (() => {
  console.error(
    `Unknown CONFIG.ACTIVE_DETECTOR "${CONFIG.ACTIVE_DETECTOR}" in config.js — falling back to fakeDetector.`
  );
  return fakeDetector; // fallback
})();