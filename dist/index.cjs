var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// index.js
var index_exports = {};
__export(index_exports, {
  loadHnswlib: () => loadHnswlib,
  loadIndexFromFile: () => loadIndexFromFile,
  saveIndexToFile: () => saveIndexToFile,
  setLogger: () => setLogger
});
module.exports = __toCommonJS(index_exports);
var import_promises = __toESM(require("fs/promises"), 1);
var defaultLogger = {
  log: () => {
  },
  error: console.error
};
var logger = defaultLogger;
function setLogger(customLogger) {
  logger = { ...defaultLogger, ...customLogger };
}
function setupNodeEnvironment() {
  if (typeof indexedDB === "undefined") {
    global.indexedDB = {
      open: () => ({
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null,
        result: {
          createObjectStore: () => ({}),
          objectStoreNames: { contains: () => false }
        }
      })
    };
  }
  if (typeof window === "undefined") {
    global.window = {};
  }
}
async function loadHnswlib() {
  try {
    setupNodeEnvironment();
    const { loadHnswlib: loadHnswlibOriginal } = await import("hnswlib-wasm/dist/hnswlib.js");
    return await loadHnswlibOriginal();
  } catch (error) {
    logger.error("Failed to load hnswlib:", error);
    throw new Error(`Failed to load hnswlib: ${error.message}`);
  }
}
function extractVectorsFromIndex(index) {
  try {
    const usedLabels = index.getUsedLabels();
    const vectors = [];
    for (const label of usedLabels) {
      const point = index.getPoint(label);
      const vector = Array.isArray(point) ? point : Array.from(point);
      vectors.push({ label, point: vector });
    }
    return vectors;
  } catch (error) {
    throw new Error(`Failed to extract vectors from index: ${error.message}`);
  }
}
function validateIndex(index) {
  if (!index) {
    throw new Error("Index parameter is required");
  }
  if (typeof index.getNumDimensions !== "function" || typeof index.getCurrentCount !== "function" || typeof index.getUsedLabels !== "function" || typeof index.getPoint !== "function") {
    throw new Error("Invalid index object: missing required methods");
  }
}
function validateFilename(filename) {
  if (!filename || typeof filename !== "string") {
    throw new Error("Filename must be a non-empty string");
  }
  if (filename.trim().length === 0) {
    throw new Error("Filename cannot be empty");
  }
}
async function saveIndexToFile(index, filename, metadata = {}) {
  validateIndex(index);
  validateFilename(filename);
  try {
    const numDimensions = index.getNumDimensions();
    const numVectors = index.getCurrentCount();
    if (numVectors === 0) {
      throw new Error("Cannot save empty index (no vectors added)");
    }
    const vectors = extractVectorsFromIndex(index);
    const isBinary = filename.endsWith(".bin") || filename.endsWith(".dat");
    if (isBinary) {
      await saveIndexBinary(index, filename, metadata, numDimensions, vectors);
    } else {
      await saveIndexJSON(index, filename, metadata, numDimensions, vectors);
    }
  } catch (error) {
    logger.error(`Failed to save index to ${filename}:`, error);
    throw error;
  }
}
async function saveIndexJSON(index, filename, metadata, numDimensions, vectors) {
  const data = {
    version: 1,
    spaceName: metadata.spaceName || "l2",
    numDimensions,
    maxElements: metadata.maxElements || index.getMaxElements(),
    m: metadata.m || 16,
    efConstruction: metadata.efConstruction || 200,
    randomSeed: metadata.randomSeed || 100,
    numVectors: vectors.length,
    vectors
  };
  try {
    await import_promises.default.writeFile(filename, JSON.stringify(data, null, 2), "utf8");
    logger.log(`Index saved to ${filename} (JSON format, ${vectors.length} vectors)`);
  } catch (error) {
    throw new Error(`Failed to write JSON file: ${error.message}`);
  }
}
async function saveIndexBinary(index, filename, metadata, numDimensions, vectors) {
  const spaceNameMap = { "l2": 0, "ip": 1, "cosine": 2 };
  const spaceNameCode = spaceNameMap[metadata.spaceName || "l2"] || 0;
  const headerSize = 40;
  const reservedSize = 14;
  const vectorSize = 4 + numDimensions * 4;
  const bufferSize = headerSize + vectors.length * vectorSize;
  try {
    const buffer = Buffer.allocUnsafe(bufferSize);
    let offset = 0;
    buffer.writeUInt8(1, offset);
    offset += 1;
    buffer.writeUInt8(spaceNameCode, offset);
    offset += 1;
    buffer.writeUInt32LE(numDimensions, offset);
    offset += 4;
    buffer.writeUInt32LE(metadata.maxElements || index.getMaxElements(), offset);
    offset += 4;
    buffer.writeUInt32LE(metadata.m || 16, offset);
    offset += 4;
    buffer.writeUInt32LE(metadata.efConstruction || 200, offset);
    offset += 4;
    buffer.writeUInt32LE(metadata.randomSeed || 100, offset);
    offset += 4;
    buffer.writeUInt32LE(vectors.length, offset);
    offset += 4;
    buffer.fill(0, offset, offset + reservedSize);
    offset += reservedSize;
    for (const { label, point } of vectors) {
      if (point.length !== numDimensions) {
        throw new Error(`Vector dimension mismatch: expected ${numDimensions}, got ${point.length}`);
      }
      buffer.writeUInt32LE(label, offset);
      offset += 4;
      for (const value of point) {
        if (typeof value !== "number" || !isFinite(value)) {
          throw new Error(`Invalid vector value: ${value}`);
        }
        buffer.writeFloatLE(value, offset);
        offset += 4;
      }
    }
    await import_promises.default.writeFile(filename, buffer);
    logger.log(`Index saved to ${filename} (binary format, ${vectors.length} vectors, ${bufferSize} bytes)`);
  } catch (error) {
    throw new Error(`Failed to write binary file: ${error.message}`);
  }
}
async function loadIndexFromFile(hnswlib, filename) {
  validateFilename(filename);
  if (!hnswlib || typeof hnswlib.HierarchicalNSW !== "function") {
    throw new Error("Invalid hnswlib module: HierarchicalNSW constructor not found");
  }
  try {
    await import_promises.default.access(filename);
  } catch (error) {
    throw new Error(`File not found: ${filename}`);
  }
  const isBinary = filename.endsWith(".bin") || filename.endsWith(".dat");
  try {
    if (isBinary) {
      return await loadIndexBinary(hnswlib, filename);
    } else {
      return await loadIndexJSON(hnswlib, filename);
    }
  } catch (error) {
    logger.error(`Failed to load index from ${filename}:`, error);
    throw error;
  }
}
async function loadIndexJSON(hnswlib, filename) {
  let data;
  try {
    const content = await import_promises.default.readFile(filename, "utf8");
    data = JSON.parse(content);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON file: ${error.message}`);
    }
    throw new Error(`Failed to read file: ${error.message}`);
  }
  if (!data.vectors || !Array.isArray(data.vectors)) {
    throw new Error("Invalid index file format: missing or invalid vectors array");
  }
  if (typeof data.numDimensions !== "number" || data.numDimensions <= 0) {
    throw new Error("Invalid index file format: invalid numDimensions");
  }
  if (!data.spaceName || !["l2", "ip", "cosine"].includes(data.spaceName)) {
    throw new Error(`Invalid spaceName: ${data.spaceName}. Must be 'l2', 'ip', or 'cosine'`);
  }
  try {
    const index = new hnswlib.HierarchicalNSW(data.spaceName, data.numDimensions, "");
    index.initIndex(
      data.maxElements || 100,
      data.m || 16,
      data.efConstruction || 200,
      data.randomSeed || 100
    );
    for (const { label, point } of data.vectors) {
      if (typeof label !== "number") {
        throw new Error(`Invalid label: ${label}. Must be a number`);
      }
      if (!Array.isArray(point) || point.length !== data.numDimensions) {
        throw new Error(`Invalid vector: expected array of length ${data.numDimensions}`);
      }
      index.addPoint(point, label, false);
    }
    logger.log(`Index loaded from ${filename} (JSON format, ${data.vectors.length} vectors)`);
    return {
      index,
      metadata: {
        spaceName: data.spaceName,
        numDimensions: data.numDimensions,
        maxElements: data.maxElements || 100,
        m: data.m || 16,
        efConstruction: data.efConstruction || 200,
        randomSeed: data.randomSeed || 100
      }
    };
  } catch (error) {
    throw new Error(`Failed to recreate index: ${error.message}`);
  }
}
async function loadIndexBinary(hnswlib, filename) {
  let buffer;
  try {
    buffer = await import_promises.default.readFile(filename);
  } catch (error) {
    throw new Error(`Failed to read file: ${error.message}`);
  }
  const minSize = 40;
  if (buffer.length < minSize) {
    throw new Error(`File too small to be a valid index file (${buffer.length} bytes, minimum ${minSize} bytes)`);
  }
  let offset = 0;
  const version = buffer.readUInt8(offset);
  offset += 1;
  if (version !== 1) {
    throw new Error(`Unsupported binary format version: ${version}. Expected version 1`);
  }
  if (offset >= buffer.length) throw new Error("Unexpected end of file while reading header");
  const spaceNameCode = buffer.readUInt8(offset);
  offset += 1;
  const spaceNameMap = ["l2", "ip", "cosine"];
  const spaceName = spaceNameMap[spaceNameCode] || "l2";
  if (offset + 24 > buffer.length) throw new Error("Unexpected end of file while reading header");
  const numDimensions = buffer.readUInt32LE(offset);
  offset += 4;
  const maxElements = buffer.readUInt32LE(offset);
  offset += 4;
  const m = buffer.readUInt32LE(offset);
  offset += 4;
  const efConstruction = buffer.readUInt32LE(offset);
  offset += 4;
  const randomSeed = buffer.readUInt32LE(offset);
  offset += 4;
  const numVectors = buffer.readUInt32LE(offset);
  offset += 4;
  offset += 14;
  if (numDimensions <= 0 || numDimensions > 1e5) {
    throw new Error(`Invalid numDimensions: ${numDimensions}`);
  }
  if (numVectors < 0 || numVectors > 1e8) {
    throw new Error(`Invalid numVectors: ${numVectors}`);
  }
  const vectorSize = 4 + numDimensions * 4;
  const expectedSize = 40 + numVectors * vectorSize;
  if (buffer.length < expectedSize) {
    throw new Error(`File size mismatch: expected ${expectedSize} bytes, got ${buffer.length} bytes`);
  }
  try {
    const index = new hnswlib.HierarchicalNSW(spaceName, numDimensions, "");
    index.initIndex(maxElements, m, efConstruction, randomSeed);
    for (let i = 0; i < numVectors; i++) {
      if (offset + 4 > buffer.length) {
        throw new Error(`Unexpected end of file while reading vector ${i}`);
      }
      const label = buffer.readUInt32LE(offset);
      offset += 4;
      const point = [];
      for (let j = 0; j < numDimensions; j++) {
        if (offset + 4 > buffer.length) {
          throw new Error(`Unexpected end of file while reading vector ${i}, dimension ${j}`);
        }
        point.push(buffer.readFloatLE(offset));
        offset += 4;
      }
      index.addPoint(point, label, false);
    }
    logger.log(`Index loaded from ${filename} (binary format, ${numVectors} vectors)`);
    return {
      index,
      metadata: {
        spaceName,
        numDimensions,
        maxElements,
        m,
        efConstruction,
        randomSeed
      }
    };
  } catch (error) {
    throw new Error(`Failed to recreate index: ${error.message}`);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  loadHnswlib,
  loadIndexFromFile,
  saveIndexToFile,
  setLogger
});
