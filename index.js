import fs from 'fs/promises';

/**
 * Logger interface for optional console output
 * @typedef {Object} Logger
 * @property {Function} log - Log function (default: no-op)
 * @property {Function} error - Error log function (default: console.error)
 */

const defaultLogger = {
  log: () => {},
  error: console.error
};

let logger = defaultLogger;

/**
 * Set custom logger for the library
 * @param {Logger} customLogger - Custom logger object with log and error methods
 */
export function setLogger(customLogger) {
  logger = { ...defaultLogger, ...customLogger };
}

/**
 * Set up Node.js environment for hnswlib-wasm
 * This is called automatically by loadHnswlib()
 * @private
 */
function setupNodeEnvironment() {
  // Provide minimal IndexedDB polyfill for Node.js (required for library initialization)
  if (typeof indexedDB === 'undefined') {
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

  // Set up minimal browser-like environment
  if (typeof window === 'undefined') {
    global.window = {};
  }
}

/**
 * Load hnswlib with Node.js environment setup
 * @returns {Promise<Object>} The loaded hnswlib module
 * @throws {Error} If library fails to load
 */
export async function loadHnswlib() {
  try {
    setupNodeEnvironment();
    // Use dynamic import to support both ESM and CJS builds
    const { loadHnswlib: loadHnswlibOriginal } = await import('hnswlib-wasm/dist/hnswlib.js');
    return await loadHnswlibOriginal();
  } catch (error) {
    logger.error('Failed to load hnswlib:', error);
    throw new Error(`Failed to load hnswlib: ${error.message}`);
  }
}

/**
 * Extract all vectors and their labels from an index
 * @private
 * @param {Object} index - The hnswlib index object
 * @returns {Array<{label: number, point: number[]}>} Array of vectors with labels
 */
function extractVectorsFromIndex(index) {
  try {
    const usedLabels = index.getUsedLabels();
    const vectors = [];
    
    for (const label of usedLabels) {
      const point = index.getPoint(label);
      // Convert to regular array if it's Float32Array
      const vector = Array.isArray(point) ? point : Array.from(point);
      vectors.push({ label, point: vector });
    }
    
    return vectors;
  } catch (error) {
    throw new Error(`Failed to extract vectors from index: ${error.message}`);
  }
}

/**
 * Validate index object
 * @private
 * @param {Object} index - The index to validate
 * @throws {Error} If index is invalid
 */
function validateIndex(index) {
  if (!index) {
    throw new Error('Index parameter is required');
  }
  if (typeof index.getNumDimensions !== 'function' || 
      typeof index.getCurrentCount !== 'function' ||
      typeof index.getUsedLabels !== 'function' ||
      typeof index.getPoint !== 'function') {
    throw new Error('Invalid index object: missing required methods');
  }
}

/**
 * Validate filename
 * @private
 * @param {string} filename - The filename to validate
 * @throws {Error} If filename is invalid
 */
function validateFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Filename must be a non-empty string');
  }
  if (filename.trim().length === 0) {
    throw new Error('Filename cannot be empty');
  }
}

/**
 * Save index to file (supports both JSON and binary formats)
 * @param {Object} index - The hnswlib index object
 * @param {string} filename - Output filename (extension determines format: .json or .bin/.dat)
 * @param {Object} [metadata={}] - Index metadata (spaceName, maxElements, m, efConstruction, randomSeed)
 * @returns {Promise<void>}
 * @throws {Error} If save operation fails
 */
export async function saveIndexToFile(index, filename, metadata = {}) {
  validateIndex(index);
  validateFilename(filename);
  
  try {
    const numDimensions = index.getNumDimensions();
    const numVectors = index.getCurrentCount();
    
    if (numVectors === 0) {
      throw new Error('Cannot save empty index (no vectors added)');
    }
    
    const vectors = extractVectorsFromIndex(index);
    
    // Determine format from file extension
    const isBinary = filename.endsWith('.bin') || filename.endsWith('.dat');
    
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

/**
 * Save index in JSON format
 * @private
 * @param {Object} index - The index object
 * @param {string} filename - Output filename
 * @param {Object} metadata - Index metadata
 * @param {number} numDimensions - Number of dimensions
 * @param {Array} vectors - Array of vectors with labels
 */
async function saveIndexJSON(index, filename, metadata, numDimensions, vectors) {
  const data = {
    version: 1,
    spaceName: metadata.spaceName || 'l2',
    numDimensions,
    maxElements: metadata.maxElements || index.getMaxElements(),
    m: metadata.m || 16,
    efConstruction: metadata.efConstruction || 200,
    randomSeed: metadata.randomSeed || 100,
    numVectors: vectors.length,
    vectors
  };
  
  try {
    await fs.writeFile(filename, JSON.stringify(data, null, 2), 'utf8');
    logger.log(`Index saved to ${filename} (JSON format, ${vectors.length} vectors)`);
  } catch (error) {
    throw new Error(`Failed to write JSON file: ${error.message}`);
  }
}

/**
 * Save index in binary format
 * @private
 * @param {Object} index - The index object
 * @param {string} filename - Output filename
 * @param {Object} metadata - Index metadata
 * @param {number} numDimensions - Number of dimensions
 * @param {Array} vectors - Array of vectors with labels
 */
async function saveIndexBinary(index, filename, metadata, numDimensions, vectors) {
  const spaceNameMap = { 'l2': 0, 'ip': 1, 'cosine': 2 };
  const spaceNameCode = spaceNameMap[metadata.spaceName || 'l2'] || 0;
  
  // Calculate buffer size
  // Header: version(1) + spaceName(1) + numDimensions(4) + maxElements(4) + m(4) + efConstruction(4) + randomSeed(4) + numVectors(4) + reserved(14) = 40 bytes
  // Per vector: label(4) + point(numDimensions * 4)
  const headerSize = 40;
  const reservedSize = 14; // Reserved for future use
  const vectorSize = 4 + (numDimensions * 4); // label + point
  const bufferSize = headerSize + (vectors.length * vectorSize);
  
  try {
    const buffer = Buffer.allocUnsafe(bufferSize);
    let offset = 0;
    
    // Write header
    buffer.writeUInt8(1, offset); offset += 1; // version
    buffer.writeUInt8(spaceNameCode, offset); offset += 1; // spaceName
    buffer.writeUInt32LE(numDimensions, offset); offset += 4;
    buffer.writeUInt32LE(metadata.maxElements || index.getMaxElements(), offset); offset += 4;
    buffer.writeUInt32LE(metadata.m || 16, offset); offset += 4;
    buffer.writeUInt32LE(metadata.efConstruction || 200, offset); offset += 4;
    buffer.writeUInt32LE(metadata.randomSeed || 100, offset); offset += 4;
    buffer.writeUInt32LE(vectors.length, offset); offset += 4;
    // Reserved space (14 bytes) - zero-padded for future use
    buffer.fill(0, offset, offset + reservedSize); offset += reservedSize;
    
    // Write vectors
    for (const { label, point } of vectors) {
      if (point.length !== numDimensions) {
        throw new Error(`Vector dimension mismatch: expected ${numDimensions}, got ${point.length}`);
      }
      buffer.writeUInt32LE(label, offset); offset += 4;
      for (const value of point) {
        if (typeof value !== 'number' || !isFinite(value)) {
          throw new Error(`Invalid vector value: ${value}`);
        }
        buffer.writeFloatLE(value, offset); offset += 4;
      }
    }
    
    await fs.writeFile(filename, buffer);
    logger.log(`Index saved to ${filename} (binary format, ${vectors.length} vectors, ${bufferSize} bytes)`);
  } catch (error) {
    throw new Error(`Failed to write binary file: ${error.message}`);
  }
}

/**
 * Load index from file (supports both JSON and binary formats)
 * @param {Object} hnswlib - The loaded hnswlib module
 * @param {string} filename - Input filename (extension determines format)
 * @returns {Promise<{index: Object, metadata: Object}>} The recreated index and metadata
 * @throws {Error} If load operation fails
 */
export async function loadIndexFromFile(hnswlib, filename) {
  validateFilename(filename);
  
  if (!hnswlib || typeof hnswlib.HierarchicalNSW !== 'function') {
    throw new Error('Invalid hnswlib module: HierarchicalNSW constructor not found');
  }
  
  try {
    // Check if file exists
    await fs.access(filename);
  } catch (error) {
    throw new Error(`File not found: ${filename}`);
  }
  
  const isBinary = filename.endsWith('.bin') || filename.endsWith('.dat');
  
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

/**
 * Load index from JSON file
 * @private
 * @param {Object} hnswlib - The loaded hnswlib module
 * @param {string} filename - Input filename
 * @returns {Promise<{index: Object, metadata: Object}>}
 */
async function loadIndexJSON(hnswlib, filename) {
  let data;
  try {
    const content = await fs.readFile(filename, 'utf8');
    data = JSON.parse(content);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON file: ${error.message}`);
    }
    throw new Error(`Failed to read file: ${error.message}`);
  }
  
  // Validate structure
  if (!data.vectors || !Array.isArray(data.vectors)) {
    throw new Error('Invalid index file format: missing or invalid vectors array');
  }
  
  if (typeof data.numDimensions !== 'number' || data.numDimensions <= 0) {
    throw new Error('Invalid index file format: invalid numDimensions');
  }
  
  if (!data.spaceName || !['l2', 'ip', 'cosine'].includes(data.spaceName)) {
    throw new Error(`Invalid spaceName: ${data.spaceName}. Must be 'l2', 'ip', or 'cosine'`);
  }
  
  try {
    // Create index
    const index = new hnswlib.HierarchicalNSW(data.spaceName, data.numDimensions, '');
    index.initIndex(
      data.maxElements || 100,
      data.m || 16,
      data.efConstruction || 200,
      data.randomSeed || 100
    );
    
    // Add vectors
    for (const { label, point } of data.vectors) {
      if (typeof label !== 'number') {
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

/**
 * Load index from binary file
 * @private
 * @param {Object} hnswlib - The loaded hnswlib module
 * @param {string} filename - Input filename
 * @returns {Promise<{index: Object, metadata: Object}>}
 */
async function loadIndexBinary(hnswlib, filename) {
  let buffer;
  try {
    buffer = await fs.readFile(filename);
  } catch (error) {
    throw new Error(`Failed to read file: ${error.message}`);
  }
  
  const minSize = 40; // Minimum header size
  if (buffer.length < minSize) {
    throw new Error(`File too small to be a valid index file (${buffer.length} bytes, minimum ${minSize} bytes)`);
  }
  
  let offset = 0;
  
  // Read header with bounds checking
  const version = buffer.readUInt8(offset); offset += 1;
  if (version !== 1) {
    throw new Error(`Unsupported binary format version: ${version}. Expected version 1`);
  }
  
  if (offset >= buffer.length) throw new Error('Unexpected end of file while reading header');
  const spaceNameCode = buffer.readUInt8(offset); offset += 1;
  const spaceNameMap = ['l2', 'ip', 'cosine'];
  const spaceName = spaceNameMap[spaceNameCode] || 'l2';
  
  if (offset + 24 > buffer.length) throw new Error('Unexpected end of file while reading header');
  const numDimensions = buffer.readUInt32LE(offset); offset += 4;
  const maxElements = buffer.readUInt32LE(offset); offset += 4;
  const m = buffer.readUInt32LE(offset); offset += 4;
  const efConstruction = buffer.readUInt32LE(offset); offset += 4;
  const randomSeed = buffer.readUInt32LE(offset); offset += 4;
  const numVectors = buffer.readUInt32LE(offset); offset += 4;
  // Skip reserved space (14 bytes)
  offset += 14;
  
  // Validate dimensions
  if (numDimensions <= 0 || numDimensions > 100000) {
    throw new Error(`Invalid numDimensions: ${numDimensions}`);
  }
  
  if (numVectors < 0 || numVectors > 100000000) {
    throw new Error(`Invalid numVectors: ${numVectors}`);
  }
  
  // Calculate expected file size
  const vectorSize = 4 + (numDimensions * 4);
  const expectedSize = 40 + (numVectors * vectorSize);
  if (buffer.length < expectedSize) {
    throw new Error(`File size mismatch: expected ${expectedSize} bytes, got ${buffer.length} bytes`);
  }
  
  try {
    // Create index
    const index = new hnswlib.HierarchicalNSW(spaceName, numDimensions, '');
    index.initIndex(maxElements, m, efConstruction, randomSeed);
    
    // Read and add vectors with bounds checking
    for (let i = 0; i < numVectors; i++) {
      if (offset + 4 > buffer.length) {
        throw new Error(`Unexpected end of file while reading vector ${i}`);
      }
      const label = buffer.readUInt32LE(offset); offset += 4;
      
      const point = [];
      for (let j = 0; j < numDimensions; j++) {
        if (offset + 4 > buffer.length) {
          throw new Error(`Unexpected end of file while reading vector ${i}, dimension ${j}`);
        }
        point.push(buffer.readFloatLE(offset)); offset += 4;
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
