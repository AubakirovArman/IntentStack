import unittest

from embedding_indexer import (
    ChunkToIndexSchema,
    DenseEmbeddingConfig,
    EmbedAndIndexRequest,
    EmbedAndIndexService,
    InMemoryConfigurator,
    IndexTargetConfig,
    SparseEmbeddingConfig,
)


class DenseStub:
    def embed(self, text, config, language=None):
        return [float(len(text)), float(config.dimension)]


class SparseStub:
    def embed(self, text, config, language=None):
        return {word: 1.0 for word in text.lower().split()}


class WriterStub:
    def __init__(self):
        self.calls = []

    def upsert(self, table_name, row, conflict_keys):
        self.calls.append((table_name, row, conflict_keys))


class EmbedAndIndexServiceTest(unittest.TestCase):
    def test_indexes_single_chunk_with_dense_and_sparse_in_one_table(self):
        target = IndexTargetConfig(
            table_name="agent_document_chunks",
            modes=["dense", "sparse"],
            dense=DenseEmbeddingConfig(provider="openai", model="text-embedding-3-large", dimension=3072),
            sparse=SparseEmbeddingConfig(provider="splade", model="splade-v3"),
        )
        service = EmbedAndIndexService(
            configurator=InMemoryConfigurator({("docs", "agent_1", "pdf"): target}),
            writer=WriterStub(),
            dense_embedder=DenseStub(),
            sparse_embedder=SparseStub(),
        )
        request = EmbedAndIndexRequest(
            collection_name="docs",
            agent_id="agent_1",
            document_type="pdf",
            language="ru",
            chunks=ChunkToIndexSchema(chunk_id="chunk_10", document_id="doc_1", text="Hello chunk"),
        )

        result = service.embed_and_index(request)
        table_name, row, conflict_keys = service._writer.calls[0]

        self.assertEqual(result.chunk_id, "chunk_10")
        self.assertEqual(table_name, "agent_document_chunks")
        self.assertEqual(conflict_keys, ["collection_name", "agent_id", "document_type", "chunk_id"])
        self.assertIn("dense_embedding", row)
        self.assertIn("sparse_embedding", row)
        self.assertEqual(row["chunk_id"], "chunk_10")


if __name__ == "__main__":
    unittest.main()
