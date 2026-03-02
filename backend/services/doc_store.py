import json
import os
from datetime import datetime
from typing import List, Optional
from pathlib import Path
from config import settings

class DocumentStore:
    def __init__(self):
        self.index_path = settings.DOC_INDEX_PATH
        self.base_dir = Path(settings.BASE_DIR)
        self._ensure_index()

    def _ensure_index(self):
        if not os.path.exists(self.index_path):
            with open(self.index_path, 'w', encoding='utf-8') as f:
                json.dump([], f)

    def _to_rel_path(self, path_value: str) -> str:
        if not path_value:
            return path_value
        path = Path(path_value)
        if path.is_absolute():
            try:
                return str(path.relative_to(self.base_dir)).replace("\\", "/")
            except ValueError:
                return str(path)
        return str(path).replace("\\", "/")

    def _to_abs_path(self, path_value: str) -> str:
        if not path_value:
            return path_value
        path = Path(path_value)
        if path.is_absolute():
            return str(path)
        return str((self.base_dir / path).resolve())

    def _normalize_document_for_storage(self, doc: dict) -> dict:
        normalized = dict(doc)

        for key in ["pdf_path"]:
            value = normalized.get(key)
            if value:
                normalized[key] = self._to_rel_path(value)

        for key in ["image_paths", "thumbnails"]:
            values = normalized.get(key, [])
            if not isinstance(values, list):
                normalized[key] = []
                continue
            normalized[key] = [
                self._to_rel_path(v)
                for v in values
            ]

        return normalized

    def _hydrate_document(self, doc: dict) -> dict:
        hydrated = dict(doc)

        for key in ["pdf_path"]:
            value = hydrated.get(key)
            if value:
                hydrated[key] = self._to_abs_path(value)

        for key in ["image_paths", "thumbnails"]:
            values = hydrated.get(key, [])
            if not isinstance(values, list):
                hydrated[key] = []
                continue
            hydrated[key] = [
                self._to_abs_path(v)
                for v in values
            ]

        return hydrated

    def load_documents(self, hydrate: bool = False) -> List[dict]:
        try:
            with open(self.index_path, 'r', encoding='utf-8') as f:
                docs = json.load(f)
                if hydrate:
                    return [self._hydrate_document(d) for d in docs]
                return docs
        except (json.JSONDecodeError, FileNotFoundError):
            return []

    def save_documents(self, documents: List[dict]):
        with open(self.index_path, 'w', encoding='utf-8') as f:
            json.dump(documents, f, ensure_ascii=False, indent=2)

    def add_document(self, doc_info: dict):
        documents = self.load_documents(hydrate=False)
        doc_info = self._normalize_document_for_storage(doc_info)
        # Check if exists (update) or append
        existing = next((i for i, d in enumerate(documents) if d['doc_id'] == doc_info['doc_id']), None)
        
        # Ensure we keep created_at if updating, or add if new
        if 'created_at' not in doc_info:
            doc_info['created_at'] = datetime.now().isoformat()
            
        if existing is not None:
            # Preserve creation time if not provided in update
            if 'created_at' not in doc_info and 'created_at' in documents[existing]:
                 doc_info['created_at'] = documents[existing]['created_at']
            documents[existing] = doc_info
        else:
            documents.insert(0, doc_info) # Prepend to show newest first
            
        self.save_documents(documents)

    def remove_document(self, doc_id: str):
        documents = self.load_documents(hydrate=False)
        documents = [d for d in documents if d['doc_id'] != doc_id]
        self.save_documents(documents)

    def get_document(self, doc_id: str) -> Optional[dict]:
        documents = self.load_documents(hydrate=True)
        return next((d for d in documents if d['doc_id'] == doc_id), None)

doc_store = DocumentStore()
