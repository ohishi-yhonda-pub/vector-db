// Quick test for the new separated API

// Test 1: Create embedding with EmbeddingsWorkflow
const embeddingPayload = {
  text: "Hello World",
  model: "@cf/baai/bge-base-en-v1.5"
};

console.log("EmbeddingsWorkflow input:", embeddingPayload);

// Test 2: Save vector with VectorOperationsWorkflow  
const vectorPayload = {
  type: "create",
  embedding: new Array(768).fill(0.1), // Mock 768-dimensional embedding
  namespace: "test",
  metadata: { text: "Hello World" }
};

console.log("VectorOperationsWorkflow input:", vectorPayload);

// Test 3: Batch embeddings
const batchPayload = {
  texts: ["Text 1", "Text 2", "Text 3"],
  model: "@cf/baai/bge-base-en-v1.5",
  batchSize: 2
  // Note: saveToVectorize parameter has been removed
};

console.log("BatchEmbeddingsWorkflow input:", batchPayload);