from typing import Any, Literal

from pydantic import BaseModel, Field


EmbeddingMode = Literal["dense", "sparse"]


class ChunkToIndexSchema(BaseModel):
    chunk_id: str
    text: str
    document_id: str | None = None
    chunk_index: int | None = None
    content_hash: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class EmbedAndIndexRequest(BaseModel):
    collection_name: str
    agent_id: str
    document_type: str
    chunks: ChunkToIndexSchema
    language: str | None = None
    parameters: dict[str, Any] = Field(default_factory=dict)


class DenseEmbeddingConfig(BaseModel):
    provider: str
    model: str
    dimension: int
    column: str = "dense_embedding"


class SparseEmbeddingConfig(BaseModel):
    provider: str
    model: str
    column: str = "sparse_embedding"


class IndexTargetConfig(BaseModel):
    table_name: str
    modes: list[EmbeddingMode] = Field(default_factory=lambda: ["dense"])
    id_column: str = "chunk_id"
    text_column: str = "text"
    metadata_column: str = "metadata"
    language_column: str = "language"
    dense: DenseEmbeddingConfig | None = None
    sparse: SparseEmbeddingConfig | None = None
    conflict_keys: list[str] = Field(
        default_factory=lambda: ["collection_name", "agent_id", "document_type", "chunk_id"]
    )


class EmbedAndIndexResult(BaseModel):
    collection_name: str
    agent_id: str
    document_type: str
    chunk_id: str
    table_name: str
    modes: list[EmbeddingMode]
    dense_indexed: bool = False
    sparse_indexed: bool = False
    upserted: bool = True
