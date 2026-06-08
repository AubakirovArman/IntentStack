from typing import Protocol

from .schemas import EmbedAndIndexRequest, IndexTargetConfig


ConfigKey = tuple[str | None, str | None, str | None]


class Configurator(Protocol):
    def resolve(self, request: EmbedAndIndexRequest) -> IndexTargetConfig:
        ...


class InMemoryConfigurator:
    def __init__(self, configs: dict[ConfigKey, IndexTargetConfig], default: IndexTargetConfig | None = None):
        self._configs = configs
        self._default = default

    def resolve(self, request: EmbedAndIndexRequest) -> IndexTargetConfig:
        candidates: list[ConfigKey] = [
            (request.collection_name, request.agent_id, request.document_type),
            (request.collection_name, request.agent_id, None),
            (request.collection_name, None, request.document_type),
            (request.collection_name, None, None),
            (None, request.agent_id, request.document_type),
            (None, request.agent_id, None),
            (None, None, request.document_type),
            (None, None, None),
        ]
        for key in candidates:
            if key in self._configs:
                return self._configs[key]
        if self._default is not None:
            return self._default
        raise LookupError(
            "No embedding index config for "
            f"collection={request.collection_name!r}, agent={request.agent_id!r}, "
            f"document_type={request.document_type!r}"
        )
