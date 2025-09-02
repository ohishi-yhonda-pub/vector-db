#!/bin/bash

# Vector DB API Test Flow
# This script demonstrates the correct flow for creating and listing vectors

API_URL="https://vector-db.m-tama-ramu.workers.dev"

echo "=== Vector DB API Test Flow ==="
echo ""

# Step 1: Generate an embedding (this only generates, doesn't store)
echo "1. Generating embedding for 'Hello world'..."
EMBEDDING_RESPONSE=$(curl -s -X 'POST' \
  "${API_URL}/api/embeddings" \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{
  "text": "Hello world",
  "model": "@cf/baai/bge-base-en-v1.5"
}')

echo "Embedding response:"
echo "$EMBEDDING_RESPONSE" | jq '.'
echo ""

# Extract the embedding array from the response
EMBEDDING=$(echo "$EMBEDDING_RESPONSE" | jq '.data.embedding')

# Step 2: Create a vector with the embedding
echo "2. Creating a vector with the generated embedding..."
VECTOR_RESPONSE=$(curl -s -X 'POST' \
  "${API_URL}/api/vectors" \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d "{
  \"id\": \"hello-world-vector\",
  \"values\": ${EMBEDDING},
  \"metadata\": {
    \"text\": \"Hello world\",
    \"source\": \"test\"
  }
}")

echo "Vector creation response:"
echo "$VECTOR_RESPONSE" | jq '.'
echo ""

# Step 3: List vectors to verify it was stored
echo "3. Listing vectors..."
LIST_RESPONSE=$(curl -s -X 'GET' \
  "${API_URL}/api/vectors" \
  -H 'accept: application/json')

echo "List response:"
echo "$LIST_RESPONSE" | jq '.'
echo ""

# Alternative: Use text search directly (this generates embedding and searches in one step)
echo "4. Alternative: Search with text (generates embedding automatically)..."
SEARCH_RESPONSE=$(curl -s -X 'POST' \
  "${API_URL}/api/search" \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{
  "text": "Hello world",
  "topK": 5
}')

echo "Search response:"
echo "$SEARCH_RESPONSE" | jq '.'