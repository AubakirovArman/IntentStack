# Embed And Index Contract

This package models one Airflow-retryable chunk indexing request.

`EmbedAndIndexRequest.chunks` intentionally contains one `ChunkToIndexSchema`.
The field name can stay plural for external compatibility, but the request is
single-chunk so Airflow retries only the failed chunk task.

```json
{
  "collection_name": "docs",
  "agent_id": "agent_1",
  "document_type": "pdf",
  "language": "ru",
  "chunks": {
    "chunk_id": "doc_1_chunk_10",
    "document_id": "doc_1",
    "text": "Chunk text",
    "metadata": {
      "page": 4
    }
  }
}
```

Flow:

1. `Configurator.resolve(request)` returns the target table and embedding modes.
2. `EmbedAndIndexService` computes dense and/or sparse embeddings.
3. `IndexWriter.upsert(...)` writes to the configured table using idempotent
   conflict keys.

Dense and sparse embeddings can be written into the same table:

```python
IndexTargetConfig(
    table_name="agent_document_chunks",
    modes=["dense", "sparse"],
    dense=DenseEmbeddingConfig(
        provider="openai",
        model="text-embedding-3-large",
        dimension=3072,
        column="dense_embedding",
    ),
    sparse=SparseEmbeddingConfig(
        provider="splade",
        model="splade-v3",
        column="sparse_embedding",
    ),
)
```
