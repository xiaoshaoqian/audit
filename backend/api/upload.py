"""
API路由 - 文件上传
"""
import os
import uuid
import shutil
import traceback
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException

from config import settings
from services import DocumentConverter
from models import DocumentInfo

router = APIRouter(prefix="/api/upload", tags=["upload"])


@router.post("/", response_model=DocumentInfo)
async def upload_document(file: UploadFile = File(...)):
    """
    上传DOCX文档并转换为图片
    """
    print(f"[上传] 收到文件: {file.filename}")
    
    # 检查文件类型
    if not file.filename.endswith(".docx"):
        raise HTTPException(status_code=400, detail="只支持DOCX文件")
    
    # 生成文档ID
    doc_id = str(uuid.uuid4())[:8]
    print(f"[上传] 文档ID: {doc_id}")
    
    # 保存上传的文件
    upload_dir = Path(settings.UPLOAD_DIR) / doc_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    print(f"[上传] 保存目录: {upload_dir}")
    
    file_path = upload_dir / file.filename
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    print(f"[上传] 文件已保存: {file_path}")
    
    # 转换文档
    try:
        print("[转换] 开始转换...")
        converter = DocumentConverter(doc_id)
        result = converter.convert(str(file_path))
        print(f"[转换] 完成! 页数: {result['page_count']}")
        
        return DocumentInfo(
            doc_id=doc_id,
            filename=file.filename,
            page_count=result["page_count"],
            pdf_path=result["pdf_path"],
            image_paths=result["image_paths"],
            thumbnails=result["thumbnails"]
        )
    except Exception as e:
        print(f"[错误] 转换失败: {str(e)}")
        print(traceback.format_exc())
        # 清理已上传的文件
        shutil.rmtree(upload_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"文档转换失败: {str(e)}")


@router.get("/{doc_id}/info", response_model=DocumentInfo)
async def get_document_info(doc_id: str):
    """
    获取文档信息
    """
    images_dir = Path(settings.IMAGES_DIR) / doc_id
    if not images_dir.exists():
        raise HTTPException(status_code=404, detail="文档不存在")
    
    # 查找图片
    image_paths = sorted(images_dir.glob("page_*.png"))
    thumbnails = sorted((images_dir / "thumbnails").glob("*.png"))
    
    # 查找原始文件名
    upload_dir = Path(settings.UPLOAD_DIR) / doc_id
    docx_files = list(upload_dir.glob("*.docx"))
    filename = docx_files[0].name if docx_files else "unknown.docx"
    
    return DocumentInfo(
        doc_id=doc_id,
        filename=filename,
        page_count=len(image_paths),
        pdf_path=str(images_dir / f"{Path(filename).stem}.pdf"),
        image_paths=[str(p) for p in image_paths],
        thumbnails=[str(p) for p in thumbnails]
    )
