"""
图片分割与拼接服务
"""
import json
from pathlib import Path
from typing import List, Dict, Optional
from PIL import Image

from config import settings


class ImageSplitter:
    """图片分割与拼接"""
    
    def __init__(self, doc_id: str):
        self.doc_id = doc_id
        self.images_dir = Path(settings.IMAGES_DIR) / doc_id
        self.splits_dir = Path(settings.SPLITS_DIR) / doc_id
        self.splits_dir.mkdir(parents=True, exist_ok=True)
        self.splits_file = self.splits_dir / "splits.json"
    
    def load_splits(self) -> List[Dict]:
        """加载分割配置"""
        if self.splits_file.exists():
            with open(self.splits_file, "r", encoding="utf-8") as f:
                return json.load(f)
        return []
    
    def save_splits(self, splits: List[Dict]):
        """保存分割配置"""
        with open(self.splits_file, "w", encoding="utf-8") as f:
            json.dump(splits, f, ensure_ascii=False, indent=2)
    
    def add_split(self, name: str, pages: List[Dict]) -> Dict:
        """
        添加一个分割区块
        pages格式: [{"page": 1, "from": 0, "to": 100}, {"page": 2, "from": 0, "to": 65}]
        from/to 是百分比（0-100）
        """
        splits = self.load_splits()
        
        new_split = {
            "id": len(splits) + 1,
            "name": name,
            "pages": pages
        }
        splits.append(new_split)
        
        self.save_splits(splits)
        return new_split
    
    def crop_page(self, page_num: int, from_pct: float, to_pct: float) -> Image.Image:
        """
        裁剪页面的指定区域
        from_pct, to_pct: 0-100的百分比，从顶部算起
        """
        image_path = self.images_dir / f"page_{page_num:04d}.png"
        img = Image.open(image_path)
        width, height = img.size
        
        top = int(height * from_pct / 100)
        bottom = int(height * to_pct / 100)
        
        return img.crop((0, top, width, bottom))
    
    def create_segment_image(self, segment: Dict) -> str:
        """
        根据分割配置创建拼接图片
        """
        parts = []
        
        for page_info in segment["pages"]:
            page_num = page_info["page"]
            from_pct = page_info.get("from", 0)
            to_pct = page_info.get("to", 100)
            
            cropped = self.crop_page(page_num, from_pct, to_pct)
            parts.append(cropped)
        
        # 垂直拼接
        if not parts:
            raise ValueError("没有要拼接的图片")
        
        total_height = sum(p.height for p in parts)
        max_width = max(p.width for p in parts)
        
        combined = Image.new("RGB", (max_width, total_height), "white")
        
        y_offset = 0
        for part in parts:
            combined.paste(part, (0, y_offset))
            y_offset += part.height
        
        # 保存拼接结果
        segment_path = self.splits_dir / f"segment_{segment['id']}.png"
        combined.save(str(segment_path), "PNG")
        
        return str(segment_path)
    
    def get_segment_images(self) -> List[str]:
        """
        获取所有分割区块的拼接图片
        """
        splits = self.load_splits()
        segment_paths = []
        
        for segment in splits:
            path = self.create_segment_image(segment)
            segment_paths.append(path)
        
        return segment_paths
