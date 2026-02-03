"""
画布服务
负责长图拼接、裁剪和切分
"""
import os
import cv2
import json
import numpy as np
from pathlib import Path
from PIL import Image
from typing import List, Dict, Tuple

from config import settings
from services.doc_store import doc_store

# 解除PIL大图限制
Image.MAX_IMAGE_PIXELS = None

class CanvasService:
    """画布服务"""

    def __init__(self):
        self.output_dir = Path(settings.IMAGES_DIR) / "canvas"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        # 单个分块的最大高度 (30000px 是比较保守的安全值，浏览器和OpenCV都能轻松处理)
        self.chunk_height = 30000 

    def _fixed_trim(self, image: np.ndarray, top_ratio: float, bottom_ratio: float) -> Tuple[np.ndarray, Tuple[int, int, int, int]]:
        """
        固定比例裁切
        """
        h_img, w_img = image.shape[:2]
        
        y_min = int(h_img * top_ratio)
        y_max = int(h_img * (1 - bottom_ratio))
        
        # 确保有效
        if y_max <= y_min:
            return image, (0, 0, w_img, h_img)
            
        x_min, x_max = 0, w_img
        
        return image[y_min:y_max, x_min:x_max], (x_min, y_min, w_img, y_max - y_min)

    def stitch_documents(self, doc_ids: List[str], trim_top: float = 0.12, trim_bottom: float = 0.10) -> Dict:
        """
        拼接多个文档 (分块模式)
        """
        page_info_list = []
        
        # 1. 预处理：计算布局信息
        current_y = 0
        max_width = 0
        
        # 暂存待处理的图片信息
        pending_pages = []
        
        for doc_id in doc_ids:
            doc_info = doc_store.get_document(doc_id)
            if not doc_info: continue
            
            for img_path in doc_info.get("image_paths", []):
                if not os.path.exists(img_path): continue
                
                # 读取图片
                img_array = np.fromfile(img_path, dtype=np.uint8)
                img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
                if img is None: continue
                
                # 固定裁切
                _, (tx, ty, tw, th) = self._fixed_trim(img, trim_top, trim_bottom)
                
                page_data = {
                    "doc_id": doc_id,
                    "original_path": img_path,
                    "trim_x": tx,
                    "trim_y": ty,
                    "trim_w": tw,
                    "trim_h": th,
                    "canvas_y": current_y, # 全局Y坐标
                    "img_shape": img.shape[:2] # (h, w)
                }
                
                pending_pages.append(page_data)
                page_info_list.append(page_data)
                
                current_y += th
                max_width = max(max_width, tw)
        
        total_height = current_y
        if total_height == 0:
            raise ValueError("没有有效内容")

        # 2. 生成分块 (Chunks)
        # 我们不生成一张巨大的图，而是直接把 pending_pages 渲染到多个 chunk 中
        
        canvas_id = f"canvas_{doc_ids[0]}_{len(doc_ids)}"
        chunks = []
        
        # 按照 chunk_height 切分全图
        # Total: 0 -> total_height
        # Chunk 0: 0 -> 30000
        # Chunk 1: 30000 -> 60000 ...
        
        num_chunks = (total_height + self.chunk_height - 1) // self.chunk_height
        
        for i in range(num_chunks):
            chunk_start_y = i * self.chunk_height
            chunk_end_y = min((i + 1) * self.chunk_height, total_height)
            chunk_h = chunk_end_y - chunk_start_y
            
            # 创建空白 Chunk
            chunk_img = np.full((chunk_h, max_width, 3), 255, dtype=np.uint8)
            
            # 找到落在当前 Chunk 范围内的 pages
            # Page range: [p.canvas_y, p.canvas_y + p.trim_h]
            # Chunk range: [chunk_start_y, chunk_end_y]
            
            for page in pending_pages:
                p_y_start = page["canvas_y"]
                p_y_end = p_y_start + page["trim_h"]
                
                # 判断是否有交集
                intersect_y1 = max(chunk_start_y, p_y_start)
                intersect_y2 = min(chunk_end_y, p_y_end)
                
                if intersect_y2 > intersect_y1:
                    # 有重叠，需要绘制
                    
                    # 1. 计算在 Page 内部的取值范围 (trim坐标系)
                    # local_y_offset = (intersect_y1 - p_y_start)
                    src_y1 = page["trim_y"] + (intersect_y1 - p_y_start)
                    src_y2 = src_y1 + (intersect_y2 - intersect_y1)
                    src_x1 = page["trim_x"]
                    src_x2 = src_x1 + page["trim_w"]
                    
                    # 2. 计算在 Chunk 内部的绘制位置
                    dst_y1 = intersect_y1 - chunk_start_y
                    dst_y2 = intersect_y2 - chunk_start_y
                    # 居中绘制
                    x_offset = (max_width - page["trim_w"]) // 2
                    page["canvas_x_offset"] = x_offset # 更新 metadata
                    dst_x1 = x_offset
                    dst_x2 = x_offset + page["trim_w"]
                    
                    # 3. 读取并复制
                    img_array = np.fromfile(page["original_path"], dtype=np.uint8)
                    full_img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
                    
                    # 裁剪原图
                    patch = full_img[src_y1:src_y2, src_x1:src_x2]
                    
                    # 贴图
                    chunk_img[dst_y1:dst_y2, dst_x1:dst_x2] = patch
            
            # 保存 Chunk
            chunk_filename = f"{canvas_id}_part_{i}.jpg"
            chunk_path = self.output_dir / chunk_filename
            
            # 使用 cv2.imencode 保存
            # 30000px 高度对于 JPG 应该没问题 (极限是65535)
            params = [cv2.IMWRITE_JPEG_QUALITY, 85]
            success, encoded_img = cv2.imencode(".jpg", chunk_img, params)
            if success:
                with open(chunk_path, "wb") as f:
                    encoded_img.tofile(f)
            
            chunks.append({
                "index": i,
                "url": f"/files/images/canvas/{chunk_filename}",
                "local_path": str(chunk_path),
                "height": chunk_h,
                "start_y": chunk_start_y
            })

        # 保存 Metadata
        metadata = {
            "canvas_id": canvas_id,
            "total_width": max_width,
            "total_height": total_height,
            "pages": page_info_list,
            "chunks": chunks
        }
        meta_filename = f"{canvas_id}.json"
        with open(self.output_dir / meta_filename, "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False)
            
        return metadata

    def crop_block(self, canvas_path_or_id: str, x: int, y: int, w: int, h: int) -> str:
        """
        裁剪区域 (逻辑基本不变，依然是从原图中扣)
        """
        filename = Path(canvas_path_or_id).name
        # filename 可能是 canvas_abc_part_0.jpg，我们要取 ID canvas_abc
        if "_part_" in filename:
            # removing _part_X.jpg
            base = filename.rsplit('_part_', 1)[0]
            canvas_id = base
        else:
             # fallback or direct id
             canvas_id = filename.rsplit('.', 1)[0]
        
        meta_file = self.output_dir / f"{canvas_id}.json"
        if not meta_file.exists():
            # try to see if input *is* the ID
            meta_file = self.output_dir / f"{canvas_path_or_id}.json"
            if not meta_file.exists():
                 raise FileNotFoundError(f"Canvas metadata not found for {canvas_id}")
            
        with open(meta_file, "r") as f:
            meta = json.load(f)
            
        # 找到最佳覆盖页
        y_start_req = y
        y_end_req = y + h
        
        target_page = None
        max_overlap = 0
        
        for page in meta["pages"]:
            p_y1 = page["canvas_y"]
            p_y2 = p_y1 + page["trim_h"]
            
            inter_y1 = max(y_start_req, p_y1)
            inter_y2 = min(y_end_req, p_y2)
            
            if inter_y2 > inter_y1:
                overlap = inter_y2 - inter_y1
                if overlap > max_overlap:
                    max_overlap = overlap
                    target_page = page
        
        if not target_page:
             # 没找到，返回白图
             img = Image.new('RGB', (w, h), (255, 255, 255))
        else:
            # 坐标变换
            local_y = y - target_page["canvas_y"]
            cx = target_page.get("canvas_x_offset", 0)
            local_x = x - cx
            
            orig_x = local_x + target_page["trim_x"]
            orig_y = local_y + target_page["trim_y"]
            
            img_array = np.fromfile(target_page["original_path"], dtype=np.uint8)
            img_bgr = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
            img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(img_rgb)
            
            img_w, img_h = pil_img.size
            crop_box = (
                max(0, int(orig_x)),
                max(0, int(orig_y)),
                min(img_w, int(orig_x + w)),
                min(img_h, int(orig_y + h))
            )
            img = pil_img.crop(crop_box)
        
        # Save Block
        block_filename = f"block_{canvas_id}_{x}_{y}.png"
        block_path = self.output_dir / block_filename
        img.save(block_path)
            
        return str(block_path)
