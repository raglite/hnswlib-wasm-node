import { loadHnswlib, saveIndexToFile } from './index.js';

async function createIndexWithVectors() {
  // Load the library (environment setup is handled automatically)
  const hnswlib = await loadHnswlib();
  
  // Create an index with 3 dimensions, using L2 distance
  const index = new hnswlib.HierarchicalNSW('l2', 3, '');
  
  // Initialize the index: maxElements=10, m=16, efConstruction=200, randomSeed=100
  index.initIndex(10, 16, 200, 100);
  
  // Define the three 3D vectors
  const vectors = [
    [1, 0, 0],  // x-axis unit vector
    [0, 1, 0],  // y-axis unit vector
    [0, 0, 1]   // z-axis unit vector
  ];
  
  // Add vectors to the index
  vectors.forEach((vector, i) => {
    index.addPoint(vector, i, false);
  });
  
  console.log(`Added ${index.getCurrentCount()} vectors to index`);
  console.log(`Index dimensions: ${index.getNumDimensions()}`);
  
  // Save index to both JSON and binary formats
  const metadata = {
    spaceName: 'l2',
    maxElements: 10,
    m: 16,
    efConstruction: 200,
    randomSeed: 100
  };
  
  await saveIndexToFile(index, 'vectors-3d.json', metadata);
  await saveIndexToFile(index, 'vectors-3d.bin', metadata);
  
  // Search for nearest neighbors
  const queryVector = [0.9, 0.1, 0];
  const numNeighbors = 2;
  const searchResults = index.searchKnn(queryVector, numNeighbors, undefined);
  
  console.log(`\nSearch results for query [${queryVector.join(', ')}]:`);
  console.log(`Nearest neighbors (labels):`, searchResults.neighbors);
  console.log(`Distances:`, searchResults.distances);
  
  // Index is ready to use for searching, etc.
  return index;
}

// Run the example
createIndexWithVectors().catch(console.error);