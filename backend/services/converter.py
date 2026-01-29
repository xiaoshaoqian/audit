"""
文档转换服务
DOCX -> PDF -> 图片
"""
import os
import subprocess
import tempfile
from pathlib import Path
from typing import List
from pdf2image import convert_from_path
from PIL import Image

from config import settings


class DocumentConverter:
    """文档转换器"""
    
    def __init__(self, doc_id: str):
        self.doc_id = doc_id
        self.images_dir = Path(settings.IMAGES_DIR) / doc_id
        self.images_dir.mkdir(parents=True, exist_ok=True)
    
    def docx_to_pdf(self, docx_path: str) -> str:
        """
        将DOCX转换为PDF
        使用LibreOffice进行转换
        """
        docx_path = Path(docx_path)
        pdf_path = self.images_dir / f"{docx_path.stem}.pdf"
        
        # 使用LibreOffice转换
        try:
            subprocess.run([
                "soffice",
                "--headless",
                "--convert-to", "pdf",
                "--outdir", str(self.images_dir),
                str(docx_path)
            ], check=True, capture_output=True)
        except FileNotFoundError:
            # Windows上可能需要完整路径
            libreoffice_paths = [
                r"C:\Program Files\LibreOffice\program\soffice.exe",
                r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
            ]
            for lo_path in libreoffice_paths:
                if os.path.exists(lo_path):
                    subprocess.run([
                        lo_path,
                        "--headless",
                        "--convert-to", "pdf",
                        "--outdir", str(self.images_dir),
                        str(docx_path)
                    ], check=True, capture_output=True)
                    break
            else:
                raise RuntimeError("LibreOffice未安装，请先安装LibreOffice")
        
        return str(pdf_path)
    
    def pdf_to_images(self, pdf_path: str) -> List[str]:
        """
        将PDF转换为图片（每页一张）
        """
        # 使用配置的poppler路径
        poppler_path = settings.POPPLER_PATH if settings.POPPLER_PATH else None
        print(f"[转换] 使用Poppler路径: {poppler_path}")
        
        images = convert_from_path(
            pdf_path,
            dpi=settings.IMAGE_DPI,
            fmt="png",
            poppler_path=poppler_path
        )
        
        image_paths = []
        for i, image in enumerate(images):
            page_num = i + 1
            image_path = self.images_dir / f"page_{page_num:04d}.png"
            image.save(str(image_path), "PNG")
            image_paths.append(str(image_path))
        
        return image_paths
    
    def create_thumbnail(self, image_path: str, size: tuple = (200, 280)) -> str:
        """
        创建缩略图
        """
        img = Image.open(image_path)
        img.thumbnail(size, Image.Resampling.LANCZOS)
        
        thumb_dir = self.images_dir / "thumbnails"
        thumb_dir.mkdir(exist_ok=True)
        
        thumb_path = thumb_dir / Path(image_path).name
        img.save(str(thumb_path), "PNG")
        
        return str(thumb_path)
    
    def convert(self, docx_path: str) -> dict:
        """
        完整转换流程
        返回：{pdf_path, image_paths, thumbnails, page_count}
        """
        # 转PDF
        pdf_path = self.docx_to_pdf(docx_path)
        
        # 转图片
        image_paths = self.pdf_to_images(pdf_path)
        
        # 创建缩略图
        thumbnails = [self.create_thumbnail(p) for p in image_paths]
        
        return {
            "doc_id": self.doc_id,
            "pdf_path": pdf_path,
            "image_paths": image_paths,
            "thumbnails": thumbnails,
            "page_count": len(image_paths)
        }
