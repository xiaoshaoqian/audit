"""
api模块初始化
"""
from .upload import router as upload_router
from .split import router as split_router
from .audit import router as audit_router

__all__ = ["upload_router", "split_router", "audit_router"]
