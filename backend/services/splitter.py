"""
图片分割与拼接服务
"""
import json
from pathlib import Path
from typing import List, Dict
from PIL import Image, ImageDraw, ImageFont

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
    
    def update_split(self, segment_id: int, name: str = None, type: str = None, pages: List[Dict] = None) -> Dict:
        """更新分割区块信息"""
        splits = self.load_splits()
        for split in splits:
            if split["id"] == segment_id:
                if name is not None:
                    split["name"] = name
                if type is not None:
                    split["type"] = type
                if pages is not None:
                    split["pages"] = pages
                self.save_splits(splits)
                return split
        return None

    def save_splits(self, splits: List[Dict]):
        """保存分割配置"""
        with open(self.splits_file, "w", encoding="utf-8") as f:
            json.dump(splits, f, ensure_ascii=False, indent=2)
    
    def add_split(self, name: str, pages: List[Dict], type: str = "exercise") -> Dict:
        """
        添加一个分割区块
        pages格式: [{"page": 1, "from": 0, "to": 100}, {"page": 2, "from": 0, "to": 65}]
        from/to 是百分比（0-100）
        """
        splits = self.load_splits()
        
        new_split = {
            "id": len(splits) + 1,
            "name": name,
            "type": type,
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
    
    def create_segment_image_with_grid(self, segment: Dict) -> tuple[str, int, int]:
        """
        创建带有网格和坐标的辅助图片（仅供AI审稿使用）
        返回: (图片路径, 原始宽度, 原始高度)
        """
        original_path = self.create_segment_image(segment)
        img = Image.open(original_path)
        orig_width, orig_height = img.size
        
        # 1. 补白成正方形 (Padding to Square)
        # 这样模型看到的坐标系就是标准的正方形，避免长宽比导致的坐标漂移
        max_dim = max(orig_width, orig_height)
        padded_img = Image.new("RGB", (max_dim, max_dim), "white")
        padded_img.paste(img, (0, 0))
        
        draw = ImageDraw.Draw(padded_img)
        
        # 网格配置 (10x10)
        grid_rows = 10
        grid_cols = 10
        
        step_x = max_dim / grid_cols
        step_y = max_dim / grid_rows
        
        # 绘制半透明网格线
        fill_color = (255, 0, 0)
        
        for i in range(1, grid_cols):
            x = int(i * step_x)
            draw.line([(x, 0), (x, max_dim)], fill=fill_color, width=2)
            
        for i in range(1, grid_rows):
            y = int(i * step_y)
            draw.line([(0, y), (max_dim, y)], fill=fill_color, width=2)
        
        # 绘制坐标数字 (0-1000 scale)
        try:
            font = ImageFont.load_default() 
        except:
            font = None

        for i in range(grid_cols):
            for j in range(grid_rows):
                center_x = int((i + 0.5) * step_x)
                center_y = int((j + 0.5) * step_y)
                
                # 坐标归一化到 0-1000
                norm_x = int((center_x / max_dim) * 1000)
                norm_y = int((center_y / max_dim) * 1000)
                
                text = f"{norm_x},{norm_y}"
                # 只有在原始图片范围内的网格才标注，或者全部标注让AI更有全局感？
                # 全部标注更好，让AI理解整体坐标系
                draw.text((center_x - 15, center_y - 5), text, fill=(0, 0, 255), font=font)
        
        # 保存带网格的临时图片
        grid_path = self.splits_dir / f"segment_{segment['id']}_grid.png"
        padded_img.save(str(grid_path), "PNG")
        
        return str(grid_path), orig_width, orig_height
    
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
