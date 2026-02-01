import json
import os
from datetime import datetime
from typing import List, Optional
from models import DocumentInfo
from config import settings

class DocumentStore:
    def __init__(self):
        self.index_path = settings.DOC_INDEX_PATH
        self._ensure_index()

    def _ensure_index(self):
        if not os.path.exists(self.index_path):
            with open(self.index_path, 'w', encoding='utf-8') as f:
                json.dump([], f)

    def load_documents(self) -> List[dict]:
        try:
            with open(self.index_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return []

    def save_documents(self, documents: List[dict]):
        with open(self.index_path, 'w', encoding='utf-8') as f:
            json.dump(documents, f, ensure_ascii=False, indent=2)

    def add_document(self, doc_info: dict):
        documents = self.load_documents()
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
        documents = self.load_documents()
        documents = [d for d in documents if d['doc_id'] != doc_id]
        self.save_documents(documents)

    def get_document(self, doc_id: str) -> Optional[dict]:
        documents = self.load_documents()
        return next((d for d in documents if d['doc_id'] == doc_id), None)

doc_store = DocumentStore()
