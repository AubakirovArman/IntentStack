import hashlib
import json
from typing import Any, Protocol

from .configurator import Configurator
from .schemas import (
    DenseEmbeddingConfig,
    EmbedAndIndexRequest,
    EmbedAndIndexResult,
    IndexTargetConfig,
    SparseEmbeddingConfig,
)


class DenseEmbedder(Protocol):
    def embed(self, text: str, config: DenseEmbeddingConfig, language: str | None = None) -> list[float]:
        ...


class SparseEmbedder(Protocol):
    def embed(self, text: str, config: SparseEmbeddingConfig, language: str | None = None) -> dict[str, float]:
        ...


class IndexWriter(Protocol):
    def upsert(self, table_name: str, row: dict[str, Any], conflict_keys: list[str]) -> None:
        ...


class EmbedAndIndexService:
    def __init__(
        self,
        configurator: Configurator,
        writer: IndexWriter,
        dense_embedder: DenseEmbedder | None = None,
        sparse_embedder: SparseEmbedder | None = None,
    ):
        self._configurator = configurator
        self._writer = writer
        self._dense_embedder = dense_embedder
        self._sparse_embedder = sparse_embedder

    def embed_and_index(self, request: EmbedAndIndexRequest) -> EmbedAndIndexResult:
        target = self._configurator.resolve(request)
        chunk = request.chunks
        row = self._base_row(request, target)
        dense_indexed = False
        sparse_indexed = False

        if "dense" in target.modes:
            if target.dense is None:
                raise ValueError("dense mode is enabled but dense config is missing")
            if self._dense_embedder is None:
                raise ValueError("dense mode is enabled but dense embedder is missing")
            row[target.dense.column] = self._dense_embedder.embed(chunk.text, target.dense, request.language)
            dense_indexed = True

        if "sparse" in target.modes:
            if target.sparse is None:
                raise ValueError("sparse mode is enabled but sparse config is missing")
            if self._sparse_embedder is None:
                raise ValueError("sparse mode is enabled but sparse embedder is missing")
            row[target.sparse.column] = self._sparse_embedder.embed(chunk.text, target.sparse, request.language)
            sparse_indexed = True

        self._writer.upsert(target.table_name, row, target.conflict_keys)
        return EmbedAndIndexResult(
            collection_name=request.collection_name,
            agent_id=request.agent_id,
            document_type=request.document_type,
            chunk_id=chunk.chunk_id,
            table_name=target.table_name,
            modes=target.modes,
            dense_indexed=dense_indexed,
            sparse_indexed=sparse_indexed,
        )

    def _base_row(self, request: EmbedAndIndexRequest, target: IndexTargetConfig) -> dict[str, Any]:
        chunk = request.chunks
        row = {
            "collection_name": request.collection_name,
            "agent_id": request.agent_id,
            "document_type": request.document_type,
            "chunk_id": chunk.chunk_id,
            "document_id": chunk.document_id,
            "chunk_index": chunk.chunk_index,
            "content_hash": chunk.content_hash,
            target.text_column: chunk.text,
            target.metadata_column: chunk.metadata,
            target.language_column: request.language,
            "embedding_config_hash": config_hash(target),
            "request_parameters": request.parameters,
        }
        row[target.id_column] = chunk.chunk_id
        return row


def config_hash(target: IndexTargetConfig) -> str:
    payload = _model_dump(target)
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _model_dump(model: Any) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()
