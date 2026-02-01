"""
API路由 - 分割管理
"""
from pathlib import Path
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from config import settings
from services import ImageSplitter
from models import Segment, CreateSegmentRequest

router = APIRouter(prefix="/api/split", tags=["split"])


@router.get("/{doc_id}/segments", response_model=List[Segment])
async def get_segments(doc_id: str):
    """
    获取文档的所有分割区块
    """
    splitter = ImageSplitter(doc_id)
    splits = splitter.load_splits()
    return splits


@router.post("/{doc_id}/segments", response_model=Segment)
async def create_segment(doc_id: str, request: CreateSegmentRequest):
    """
    创建新的分割区块
    """
    splitter = ImageSplitter(doc_id)
    segment = splitter.add_split(request.name, request.pages, request.type)
    return segment


class UpdateSegmentRequest(BaseModel):
    name: str = None
    type: str = None
    pages: List[Dict[str, Any]] = None

@router.put("/{doc_id}/segments/{segment_id}", response_model=Segment)
async def update_segment(doc_id: str, segment_id: int, request: UpdateSegmentRequest):
    """
    更新分割区块
    """
    splitter = ImageSplitter(doc_id)
    segment = splitter.update_split(segment_id, request.name, request.type, request.pages)
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    return segment

@router.delete("/{doc_id}/segments/{segment_id}")
async def delete_segment(doc_id: str, segment_id: int):
    """
    删除分割区块
    """
    splitter = ImageSplitter(doc_id)
    splits = splitter.load_splits()
    splits = [s for s in splits if s["id"] != segment_id]
    splitter.save_splits(splits)
    return {"message": "删除成功"}


@router.get("/{doc_id}/segments/{segment_id}/image")
async def get_segment_image(doc_id: str, segment_id: int):
    """
    获取分割区块的拼接图片
    """
    splitter = ImageSplitter(doc_id)
    splits = splitter.load_splits()
    
    segment = next((s for s in splits if s["id"] == segment_id), None)
    if not segment:
        raise HTTPException(status_code=404, detail="分割区块不存在")
    
    image_path = splitter.create_segment_image(segment)
    return FileResponse(image_path, media_type="image/png")


@router.get("/{doc_id}/page/{page_num}")
async def get_page_image(doc_id: str, page_num: int):
    """
    获取单页图片
    """
    image_path = Path(settings.IMAGES_DIR) / doc_id / f"page_{page_num:04d}.png"
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="页面不存在")
    return FileResponse(str(image_path), media_type="image/png")


@router.get("/{doc_id}/thumbnail/{page_num}")
async def get_thumbnail(doc_id: str, page_num: int):
    """
    获取缩略图
    """
    thumb_path = Path(settings.IMAGES_DIR) / doc_id / "thumbnails" / f"page_{page_num:04d}.png"
    if not thumb_path.exists():
        raise HTTPException(status_code=404, detail="缩略图不存在")
    return FileResponse(str(thumb_path), media_type="image/png")
