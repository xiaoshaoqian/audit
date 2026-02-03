"""
API路由 - 画布服务
"""
from typing import List, Dict
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel

from services.canvas import CanvasService

router = APIRouter(prefix="/api/canvas", tags=["canvas"])
canvas_service = CanvasService()

class StitchRequest(BaseModel):
    doc_ids: List[str]
    trim_top: float = 0.12     # 默认顶部裁切比例
    trim_bottom: float = 0.10  # 默认底部裁切比例

class CropRequest(BaseModel):
    canvas_path: str
    x: int
    y: int
    w: int
    h: int
    label: str  # 方便前端传标签，虽然后端暂时可能只负责切图

@router.post("/stitch")
async def stitch_documents(request: StitchRequest):
    """
    拼接多个文档
    """
    try:
        result = canvas_service.stitch_documents(
            request.doc_ids,
            trim_top=request.trim_top,
            trim_bottom=request.trim_bottom
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/crop")
async def crop_block(request: CropRequest):
    """
    裁剪区域
    """
    try:
        # 裁剪并保存
        block_path = canvas_service.crop_block(
            request.canvas_path, 
            request.x, 
            request.y, 
            request.w, 
            request.h
        )
        
        # 返回裁剪后的图片路径 (可访问的URL)
        # 假设静态文件挂载在 /files
        # block_path 是绝对路径，我们需要转换为URL
        from config import settings
        from pathlib import Path
        
        rel_path = Path(block_path).relative_to(settings.BASE_DIR)
        # 假设 main.py 中 mount 了 BASE_DIR/data 到 /files
        # rel_path 可能是 data/images/canvas/block_xxx.png
        # 我们需要把它变成 /files/images/canvas/block_xxx.png
        
        # 简易处理：直接根据文件名拼接，因为我们知道存哪儿了
        filename = Path(block_path).name
        url = f"/files/images/canvas/{filename}"
        
        return {
            "success": True,
            "url": url,
            "local_path": str(block_path),
            "label": request.label
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
