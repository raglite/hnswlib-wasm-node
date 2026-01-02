# hnswlib-wasm-node

Persistence layer for [hnswlib-wasm](https://www.npmjs.com/package/hnswlib-wasm) with JSON and binary format support for Node.js. This package enables saving and loading HNSW vector indexes to disk, making it easy to persist your vector search indexes across application restarts.

## Features

- ✅ **Dual Package Support**: Works with both ESM (`import`) and CommonJS (`require()`)
- ✅ **Dual Format Support**: Save/load indexes in both JSON (human-readable) and binary (compact) formats
- ✅ **Node.js Optimized**: Automatic environment setup for Node.js
- ✅ **Type Safe**: Full JSDoc documentation
- ✅ **Error Handling**: Comprehensive validation and error messages
- ✅ **Optional Logging**: Configurable logger interface
- ✅ **Production Ready**: Buffer bounds checking, input validation, edge case handling

## Installation

```bash
npm install hnswlib-wasm-node
```

**Peer Dependency**: This package requires `hnswlib-wasm` to be installed:

```bash
npm install hnswlib-wasm
```

## Quick Start

### ESM (Recommended)

```javascript
import { loadHnswlib, saveIndexToFile, loadIndexFromFile } from 'hnswlib-wasm-node';

// Load the library (environment setup is automatic)
const hnswlib = await loadHnswlib();

// Create an index
const index = new hnswlib.HierarchicalNSW('l2', 128, '');
index.initIndex(1000, 16, 200, 100);

// Add vectors
const vectors = [
  [1.0, 2.0, 3.0, ...], // 128-dimensional vector
  [4.0, 5.0, 6.0, ...],
  // ... more vectors
];

vectors.forEach((vector, i) => {
  index.addPoint(vector, i, false);
});

// Save to disk (JSON format)
const metadata = {
  spaceName: 'l2',
  maxElements: 1000,
  m: 16,
  efConstruction: 200,
  randomSeed: 100
};

await saveIndexToFile(index, 'my-index.json', metadata);

// Later, load from disk
const { index: loadedIndex, metadata: loadedMetadata } = await loadIndexFromFile(hnswlib, 'my-index.json');

// Use the loaded index
const results = loadedIndex.searchKnn([1.0, 2.0, 3.0, ...], 5, undefined);
```

### CommonJS

```javascript
const { loadHnswlib, saveIndexToFile, loadIndexFromFile } = require('hnswlib-wasm-node');

// Load the library (environment setup is automatic)
const hnswlib = await loadHnswlib();

// ... rest of the code is the same as ESM example ...
```

## API Reference

### `loadHnswlib()`

Loads the hnswlib-wasm library with automatic Node.js environment setup.

```javascript
import { loadHnswlib } from 'hnswlib-wasm-node';

const hnswlib = await loadHnswlib();
// Returns the loaded hnswlib module
```

**Returns**: `Promise<Object>` - The loaded hnswlib module

**Throws**: `Error` if library fails to load

---

### `saveIndexToFile(index, filename, metadata?)`

Saves an HNSW index to disk in JSON or binary format (determined by file extension).

```javascript
import { saveIndexToFile } from 'hnswlib-wasm-node';

await saveIndexToFile(index, 'index.json', {
  spaceName: 'l2',        // 'l2', 'ip', or 'cosine'
  maxElements: 1000,      // Maximum number of elements
  m: 16,                  // Number of bi-directional links
  efConstruction: 200,    // Construction time/accuracy trade-off
  randomSeed: 100         // Random seed
});
```

**Parameters**:
- `index` (Object): The hnswlib index object
- `filename` (string): Output filename (`.json` for JSON, `.bin` or `.dat` for binary)
- `metadata` (Object, optional): Index metadata
  - `spaceName` (string): 'l2', 'ip', or 'cosine'
  - `maxElements` (number): Maximum number of elements
  - `m` (number): Number of bi-directional links (default: 16)
  - `efConstruction` (number): Construction parameter (default: 200)
  - `randomSeed` (number): Random seed (default: 100)

**Returns**: `Promise<void>`

**Throws**: `Error` if save operation fails

---

### `loadIndexFromFile(hnswlib, filename)`

Loads an HNSW index from disk (JSON or binary format).

```javascript
import { loadIndexFromFile } from 'hnswlib-wasm-node';

const { index, metadata } = await loadIndexFromFile(hnswlib, 'index.json');
```

**Parameters**:
- `hnswlib` (Object): The loaded hnswlib module (from `loadHnswlib()`)
- `filename` (string): Input filename (`.json` for JSON, `.bin` or `.dat` for binary)

**Returns**: `Promise<{index: Object, metadata: Object}>`
- `index`: The recreated index object
- `metadata`: Index metadata (spaceName, numDimensions, maxElements, m, efConstruction, randomSeed)

**Throws**: `Error` if load operation fails

---

### `setLogger(logger)`

Configure custom logger for the library (optional). By default, the library is silent (no console output).

```javascript
import { setLogger } from 'hnswlib-wasm-node';

// Enable logging
setLogger({
  log: console.log,      // Info messages
  error: console.error   // Error messages (accepts message and error object)
});

// Disable all logging
setLogger({
  log: () => {},
  error: () => {}
});
```

**Parameters**:
- `logger` (Object): Logger object with `log` and `error` methods

---

## Core HNSWlib APIs

The following APIs are provided by the underlying `hnswlib-wasm` library. This package wraps `hnswlib-wasm` to add persistence functionality. For complete API documentation, refer to [hnswlib-wasm](https://www.npmjs.com/package/hnswlib-wasm) and [hnswlib-node](https://www.npmjs.com/package/hnswlib-node).

### `HierarchicalNSW(spaceName, numDimensions, autoSaveFilename)`

Creates a new HNSW (Hierarchical Navigable Small World) index instance.

```javascript
const hnswlib = await loadHnswlib();
const index = new hnswlib.HierarchicalNSW('l2', 128, '');
```

**Parameters**:
- `spaceName` (string): The metric space to use. Must be one of:
  - `'l2'` - Euclidean distance (L2 norm)
  - `'ip'` - Inner product
  - `'cosine'` - Cosine similarity
- `numDimensions` (number): The dimensionality of the vectors
- `autoSaveFilename` (string): Filename for automatic saving via Emscripten file system. Use `''` (empty string) to disable auto-save when using this package's persistence methods.

**Returns**: `HierarchicalNSW` instance

---

### `initIndex(maxElements, m, efConstruction, randomSeed)`

Initializes the index with construction parameters. Must be called before adding points.

```javascript
index.initIndex(1000, 16, 200, 100);
```

**Parameters**:
- `maxElements` (number): Maximum number of elements the index can hold
- `m` (number): Number of bi-directional links created for each new element during construction. Higher values improve recall but increase memory usage. Typical range: 12-48 (default: 16)
- `efConstruction` (number): Size of the dynamic candidate list during construction. Higher values improve index quality but increase construction time. Typical range: 100-500 (default: 200)
- `randomSeed` (number): Seed for the random number generator (default: 100)

**Note**: These parameters cannot be changed after the index is created. Choose them carefully based on your dataset size and quality requirements.

---

### `addPoint(point, label, replaceDeleted)`

Adds a single vector point to the index.

```javascript
index.addPoint([1.0, 2.0, 3.0, ...], 0, false);
```

**Parameters**:
- `point` (Float32Array | number[]): The vector to add to the index
- `label` (number): Unique identifier/label for this point
- `replaceDeleted` (boolean): If `true`, allows reusing labels from previously deleted points. If `false` (default), deleted labels cannot be reused.

**Throws**: `Error` if the point dimensions don't match the index dimensions, or if the label already exists (when `replaceDeleted` is `false`)

---

### `searchKnn(queryPoint, numNeighbors, filter)`

Searches for the nearest neighbors of a query point.

```javascript
const results = index.searchKnn([1.0, 2.0, 3.0, ...], 5, undefined);
// Returns: { neighbors: [0, 1, 2, 3, 4], distances: [0.1, 0.5, 0.8, 1.2, 1.5] }
```

**Parameters**:
- `queryPoint` (Float32Array | number[]): The query vector to search for
- `numNeighbors` (number): Number of nearest neighbors to return
- `filter` (Function | undefined): Optional filter function that takes a label and returns `true` to include it in results, or `false` to exclude it. Use `undefined` to disable filtering.

**Returns**: `SearchResult` object with:
- `neighbors` (number[]): Array of labels of the nearest neighbors
- `distances` (number[]): Array of distances to the nearest neighbors (corresponding to `neighbors`)

**Example with filter**:
```javascript
// Only search in labels 10-20
const filter = (label) => label >= 10 && label < 20;
const results = index.searchKnn(queryPoint, 5, filter);
```

---

### Additional Methods

The `HierarchicalNSW` class provides many other useful methods:

- `getCurrentCount()`: Returns the current number of points in the index
- `getNumDimensions()`: Returns the dimensionality of the index
- `getMaxElements()`: Returns the maximum number of elements
- `getUsedLabels()`: Returns an array of all currently used labels
- `getPoint(label)`: Retrieves a point by its label
- `markDelete(label)`: Marks a point as deleted (won't appear in search results)
- `unmarkDelete(label)`: Restores a previously deleted point
- `removePoint(label)`: Permanently removes a point from the index
- `resizeIndex(newMaxElements)`: Resizes the index to accommodate more elements
- `setEfSearch(efSearch)`: Sets the search parameter (can be changed after construction)

For complete API documentation, see:
- [hnswlib-wasm documentation](https://github.com/shravansunder/hnswlib-wasm)
- [hnswlib-node API documentation](https://yoshoku.github.io/hnswlib-node/doc/)

---

## Format Comparison

### JSON Format (`.json`)

**Pros**:
- Human-readable and editable
- Easy to debug
- Portable across systems

**Cons**:
- Larger file size
- Slower to parse

**Example**:
```json
{
  "version": 1,
  "spaceName": "l2",
  "numDimensions": 128,
  "maxElements": 1000,
  "m": 16,
  "efConstruction": 200,
  "randomSeed": 100,
  "numVectors": 3,
  "vectors": [
    {
      "label": 0,
      "point": [1.0, 2.0, 3.0, ...]
    },
    ...
  ]
}
```

### Binary Format (`.bin` or `.dat`)

**Pros**:
- Compact file size (~83% smaller than JSON)
- Fast read/write operations
- Efficient for large datasets

**Cons**:
- Not human-readable
- Requires a reader to inspect

**File Structure**:
- Header (40 bytes): version, spaceName, dimensions, parameters, vector count, reserved space (14 bytes for future use)
- Vector records: label (4 bytes) + point (numDimensions × 4 bytes)

---

## Complete Examples

### Example 1: Basic Usage

```javascript
import { loadHnswlib, saveIndexToFile, loadIndexFromFile } from 'hnswlib-wasm-node';

async function main() {
  // Load library
  const hnswlib = await loadHnswlib();
  
  // Create index
  const index = new hnswlib.HierarchicalNSW('l2', 3, '');
  index.initIndex(10, 16, 200, 100);
  
  // Add vectors
  const vectors = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ];
  
  vectors.forEach((vector, i) => {
    index.addPoint(vector, i, false);
  });
  
  // Save
  await saveIndexToFile(index, 'vectors.json', {
    spaceName: 'l2',
    maxElements: 10,
    m: 16,
    efConstruction: 200,
    randomSeed: 100
  });
  
  // Load
  const { index: loadedIndex } = await loadIndexFromFile(hnswlib, 'vectors.json');
  
  // Search
  const results = loadedIndex.searchKnn([0.9, 0.1, 0], 2, undefined);
  console.log(results);
}

main().catch(console.error);
```

### Example 2: Using Binary Format

```javascript
import { loadHnswlib, saveIndexToFile, loadIndexFromFile } from 'hnswlib-wasm-node';

async function main() {
  const hnswlib = await loadHnswlib();
  const index = new hnswlib.HierarchicalNSW('cosine', 128, '');
  index.initIndex(10000, 32, 200, 100);
  
  // ... add vectors ...
  
  // Save as binary (more efficient for large datasets)
  await saveIndexToFile(index, 'large-index.bin', {
    spaceName: 'cosine',
    maxElements: 10000,
    m: 32,
    efConstruction: 200,
    randomSeed: 100
  });
  
  // Load binary file
  const { index: loadedIndex } = await loadIndexFromFile(hnswlib, 'large-index.bin');
}
```

### Example 3: Error Handling

```javascript
import { loadHnswlib, saveIndexToFile, loadIndexFromFile } from 'hnswlib-wasm-node';

async function main() {
  const hnswlib = await loadHnswlib();
  
  try {
    // This will throw if file doesn't exist
    const { index } = await loadIndexFromFile(hnswlib, 'nonexistent.json');
  } catch (error) {
    console.error('Load failed:', error.message);
    // Error: File not found: nonexistent.json
  }
  
  try {
    // This will throw if index is empty
    const emptyIndex = new hnswlib.HierarchicalNSW('l2', 3, '');
    emptyIndex.initIndex(10, 16, 200, 100);
    await saveIndexToFile(emptyIndex, 'empty.json');
  } catch (error) {
    console.error('Save failed:', error.message);
    // Error: Cannot save empty index (no vectors added)
  }
}
```

### Example 4: Custom Logging

```javascript
import { loadHnswlib, saveIndexToFile, setLogger } from 'hnswlib-wasm-node';

// Enable verbose logging
setLogger({
  log: (message) => console.log(`[INFO] ${message}`),
  error: (message, error) => console.error(`[ERROR] ${message}`, error)
});

const hnswlib = await loadHnswlib();
const index = new hnswlib.HierarchicalNSW('l2', 128, '');
// ... create and save index ...
// Will output: [INFO] Index saved to index.json (JSON format, 100 vectors)
```

---

## Requirements

- **Node.js**: >= 18.0.0
- **Peer Dependency**: `hnswlib-wasm` ^0.8.2

## License

MIT

## Related Projects

- [hnswlib-wasm](https://www.npmjs.com/package/hnswlib-wasm) - WebAssembly bindings for HNSWlib
- [hnswlib-node](https://www.npmjs.com/package/hnswlib-node) - Native Node.js bindings for HNSWlib

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please open an issue on the GitHub repository.

