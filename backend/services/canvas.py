"""
?
?
"""
import os
import cv2
import json
import numpy as np
from datetime import datetime
from pathlib import Path
from PIL import Image, ImageDraw
from typing import List, Dict, Tuple, Optional

from config import settings
from services.doc_store import doc_store

# L?
Image.MAX_IMAGE_PIXELS = None

class CanvasService:
    """Canvas service."""

    def __init__(self):
        self.output_dir = Path(settings.IMAGES_DIR) / "canvas"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.index_dir = Path(settings.BASE_DIR) / "data" / "canvas"
        self.index_dir.mkdir(parents=True, exist_ok=True)
        self.index_file = self.index_dir / "index.json"
        if not self.index_file.exists():
            with open(self.index_file, "w", encoding="utf-8") as f:
                json.dump([], f, ensure_ascii=False, indent=2)
        # ?(30000px penCV?
        self.chunk_height = 30000 

    def _load_canvas_index(self) -> List[Dict]:
        try:
            with open(self.index_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
        except Exception:
            return []

    def _save_canvas_index(self, entries: List[Dict]):
        with open(self.index_file, "w", encoding="utf-8") as f:
            json.dump(entries, f, ensure_ascii=False, indent=2)

    def _canvas_meta_file(self, canvas_id: str) -> Path:
        return self.output_dir / f"{canvas_id}.json"

    def _update_canvas_metadata_draft(
        self,
        canvas_id: str,
        group_name: Optional[str] = None,
        cut_lines: Optional[List[Dict]] = None,
        blocks: Optional[List[Dict]] = None
    ) -> None:
        meta_file = self._canvas_meta_file(canvas_id)
        if not meta_file.exists():
            return

        with open(meta_file, "r", encoding="utf-8") as f:
            metadata = json.load(f)

        if group_name is not None:
            metadata["group_name"] = group_name
        if cut_lines is not None:
            metadata["cut_lines"] = cut_lines
        if blocks is not None:
            metadata["blocks"] = blocks

        with open(meta_file, "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False)

    def _upsert_canvas_entry(
        self,
        canvas_id: str,
        doc_ids: List[str],
        trim_top: float,
        trim_bottom: float,
        status: str = "stitched",
        group_name: Optional[str] = None,
        cut_lines: Optional[List[Dict]] = None,
        blocks: Optional[List[Dict]] = None
    ):
        entries = self._load_canvas_index()
        now = datetime.now().isoformat()
        existing = next((i for i, e in enumerate(entries) if e.get("canvas_id") == canvas_id), None)
        previous = entries[existing] if existing is not None else {}

        payload = {
            "canvas_id": canvas_id,
            "doc_ids": doc_ids,
            "trim_top": trim_top,
            "trim_bottom": trim_bottom,
            "status": status,
            "group_name": group_name if group_name is not None else previous.get("group_name", ""),
            "cut_lines": cut_lines if cut_lines is not None else previous.get("cut_lines", []),
            "blocks": blocks if blocks is not None else previous.get("blocks", []),
            "updated_at": now,
        }

        if existing is None:
            payload["created_at"] = now
            entries.insert(0, payload)
        else:
            payload["created_at"] = entries[existing].get("created_at", now)
            entries[existing] = payload

        entries.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
        self._save_canvas_index(entries)

    def _update_canvas_entry(self, canvas_id: str, updates: Dict) -> bool:
        entries = self._load_canvas_index()
        now = datetime.now().isoformat()
        changed = False

        for entry in entries:
            if entry.get("canvas_id") == canvas_id:
                entry.update(updates)
                entry.setdefault("group_name", "")
                entry.setdefault("cut_lines", [])
                entry.setdefault("blocks", [])
                entry["updated_at"] = now
                changed = True
                break

        if changed:
            entries.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
            self._save_canvas_index(entries)
        return changed

    def _set_canvas_status(self, canvas_id: str, status: str):
        self._update_canvas_entry(canvas_id, {"status": status})

    def _alloc_unique_group_filename(self, group_dir: Path, base_filename: str) -> Tuple[Path, bool, str]:
        """Allocate a non-conflicting filename in group directory.

        Returns (final_path, renamed, final_filename).
        """
        candidate = group_dir / base_filename
        if not candidate.exists():
            return candidate, False, base_filename

        stem = candidate.stem
        suffix = candidate.suffix
        seq = 2
        while True:
            next_name = f"{stem}({seq}){suffix}"
            next_path = group_dir / next_name
            if not next_path.exists():
                return next_path, True, next_name
            seq += 1

    def save_canvas_draft(self, canvas_id: str, group_name: str, cut_lines: List[Dict], blocks: List[Dict]) -> Dict:
        if not self._canvas_meta_file(canvas_id).exists():
            raise FileNotFoundError(f"Canvas metadata not found for {canvas_id}")

        if not self._update_canvas_entry(canvas_id, {
            "group_name": group_name,
            "cut_lines": cut_lines,
            "blocks": blocks,
        }):
            raise FileNotFoundError(f"Canvas index not found for {canvas_id}")

        self._update_canvas_metadata_draft(
            canvas_id=canvas_id,
            group_name=group_name,
            cut_lines=cut_lines,
            blocks=blocks
        )

        return {
            "canvas_id": canvas_id,
            "group_name": group_name,
            "cut_lines_count": len(cut_lines),
            "blocks_count": len(blocks),
        }

    def _fixed_trim(self, image: np.ndarray, top_ratio: float, bottom_ratio: float) -> Tuple[np.ndarray, Tuple[int, int, int, int]]:
        """
        ?
        """
        h_img, w_img = image.shape[:2]
        
        y_min = int(h_img * top_ratio)
        y_max = int(h_img * (1 - bottom_ratio))
        
        # ?
        if y_max <= y_min:
            return image, (0, 0, w_img, h_img)
            
        x_min, x_max = 0, w_img
        
        return image[y_min:y_max, x_min:x_max], (x_min, y_min, w_img, y_max - y_min)

    def stitch_documents(self, doc_ids: List[str], trim_top: float = 0.12, trim_bottom: float = 0.10) -> Dict:
        """
        ?()
        """
        page_info_list = []
        
        # 1. ?
        current_y = 0
        max_width = 0
        
        # ?
        pending_pages = []
        
        for doc_id in doc_ids:
            doc_info = doc_store.get_document(doc_id)
            if not doc_info: continue
            
            for img_path in doc_info.get("image_paths", []):
                if not os.path.exists(img_path): continue
                
                # ?
                img_array = np.fromfile(img_path, dtype=np.uint8)
                img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
                if img is None: continue
                
                # ?
                _, (tx, ty, tw, th) = self._fixed_trim(img, trim_top, trim_bottom)
                
                page_data = {
                    "doc_id": doc_id,
                    "original_path": img_path,
                    "trim_x": tx,
                    "trim_y": ty,
                    "trim_w": tw,
                    "trim_h": th,
                    "canvas_y": current_y, # ?
                    "img_shape": img.shape[:2] # (h, w)
                }
                
                pending_pages.append(page_data)
                page_info_list.append(page_data)
                
                current_y += th
                max_width = max(max_width, tw)
        
        total_height = current_y
        if total_height == 0:
            raise ValueError("No valid content to stitch")

        # 2. ?(Chunks)
        # ?pending_pages ?chunk ?
        
        canvas_id = f"canvas_{doc_ids[0]}_{len(doc_ids)}"
        chunks = []
        
        # ?chunk_height ?
        # Total: 0 -> total_height
        # Chunk 0: 0 -> 30000
        # Chunk 1: 30000 -> 60000 ...
        
        num_chunks = (total_height + self.chunk_height - 1) // self.chunk_height
        
        for i in range(num_chunks):
            chunk_start_y = i * self.chunk_height
            chunk_end_y = min((i + 1) * self.chunk_height, total_height)
            chunk_h = chunk_end_y - chunk_start_y
            
            # ?Chunk
            chunk_img = np.full((chunk_h, max_width, 3), 255, dtype=np.uint8)
            
            # ?Chunk ?pages
            # Page range: [p.canvas_y, p.canvas_y + p.trim_h]
            # Chunk range: [chunk_start_y, chunk_end_y]
            
            for page in pending_pages:
                p_y_start = page["canvas_y"]
                p_y_end = p_y_start + page["trim_h"]
                
                # ?
                intersect_y1 = max(chunk_start_y, p_y_start)
                intersect_y2 = min(chunk_end_y, p_y_end)
                
                if intersect_y2 > intersect_y1:
                    # ?
                    
                    # 1. ?Page ?(trim?
                    # local_y_offset = (intersect_y1 - p_y_start)
                    src_y1 = page["trim_y"] + (intersect_y1 - p_y_start)
                    src_y2 = src_y1 + (intersect_y2 - intersect_y1)
                    src_x1 = page["trim_x"]
                    src_x2 = src_x1 + page["trim_w"]
                    
                    # 2. ?Chunk ?
                    dst_y1 = intersect_y1 - chunk_start_y
                    dst_y2 = intersect_y2 - chunk_start_y
                    # ?
                    x_offset = (max_width - page["trim_w"]) // 2
                    page["canvas_x_offset"] = x_offset # ?metadata
                    dst_x1 = x_offset
                    dst_x2 = x_offset + page["trim_w"]
                    
                    # 3. ?
                    img_array = np.fromfile(page["original_path"], dtype=np.uint8)
                    full_img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
                    
                    # ?
                    patch = full_img[src_y1:src_y2, src_x1:src_x2]
                    
                    # ?
                    chunk_img[dst_y1:dst_y2, dst_x1:dst_x2] = patch
            
            # ?Chunk
            chunk_filename = f"{canvas_id}_part_{i}.jpg"
            chunk_path = self.output_dir / chunk_filename
            
            # ?cv2.imencode ?
            # 30000px ?JPG ?(?5535)
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

        # ?Metadata
        metadata = {
            "canvas_id": canvas_id,
            "total_width": max_width,
            "total_height": total_height,
            "pages": page_info_list,
            "chunks": chunks,
            "group_name": "",
            "cut_lines": [],
            "blocks": []
        }
        meta_filename = f"{canvas_id}.json"
        with open(self.output_dir / meta_filename, "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False)

        self._upsert_canvas_entry(
            canvas_id,
            doc_ids,
            trim_top,
            trim_bottom,
            status="stitched",
            group_name="",
            cut_lines=[],
            blocks=[]
        )

        return metadata

    def list_canvases(self) -> List[Dict]:
        entries = self._load_canvas_index()
        for entry in entries:
            entry.setdefault("group_name", "")
            entry.setdefault("cut_lines", [])
            entry.setdefault("blocks", [])
        entries.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
        return entries

    def get_canvas(self, canvas_id: str) -> Dict:
        meta_file = self._canvas_meta_file(canvas_id)
        if not meta_file.exists():
            raise FileNotFoundError(f"Canvas metadata not found for {canvas_id}")

        with open(meta_file, "r", encoding="utf-8") as f:
            metadata = json.load(f)

        entry = next((e for e in self._load_canvas_index() if e.get("canvas_id") == canvas_id), None)
        if entry:
            metadata["status"] = entry.get("status", "stitched")
            metadata["created_at"] = entry.get("created_at")
            metadata["updated_at"] = entry.get("updated_at")
            metadata["doc_ids"] = entry.get("doc_ids", [])
            metadata["trim_top"] = entry.get("trim_top")
            metadata["trim_bottom"] = entry.get("trim_bottom")
            metadata["group_name"] = entry.get("group_name", metadata.get("group_name", ""))
            metadata["cut_lines"] = entry.get("cut_lines", metadata.get("cut_lines", []))
            metadata["blocks"] = entry.get("blocks", metadata.get("blocks", []))
        else:
            metadata.setdefault("group_name", "")
            metadata.setdefault("cut_lines", [])
            metadata.setdefault("blocks", [])
        return metadata

    def delete_canvas(self, canvas_id: str) -> Dict:
        deleted_files = []

        meta_path = self.output_dir / f"{canvas_id}.json"
        if meta_path.exists():
            meta_path.unlink()
            deleted_files.append(str(meta_path))

        for path in self.output_dir.glob(f"{canvas_id}_part_*.jpg"):
            path.unlink()
            deleted_files.append(str(path))

        for path in self.output_dir.glob(f"block_{canvas_id}_*.png"):
            path.unlink()
            deleted_files.append(str(path))

        entries = [e for e in self._load_canvas_index() if e.get("canvas_id") != canvas_id]
        self._save_canvas_index(entries)

        return {
            "canvas_id": canvas_id,
            "deleted_count": len(deleted_files),
        }

    def crop_block(self, canvas_path_or_id: str, x: int, y: int, w: int, h: int) -> str:
        """
        ?(?
        """
        filename = Path(canvas_path_or_id).name
        # filename ?canvas_abc_part_0.jpg?ID canvas_abc
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
            
        # ?
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
             # ?
             img = Image.new('RGB', (w, h), (255, 255, 255))
        else:
            # 
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

    def save_group_slices(self, canvas_id: str, group_name: str, blocks: List[Dict]) -> Dict:
        """
        Save slices defined by polygon points cropped from canvas chunks.
        blocks: [{ "polygon": [{"x": int, "y": int}, ...], "label": str, "type": str }]
        """
        base_id = Path(canvas_id).stem if canvas_id.endswith(".json") else canvas_id

        meta_file = self.output_dir / f"{base_id}.json"
        if not meta_file.exists():
            raise FileNotFoundError(f"Canvas metadata not found for {base_id}")

        with open(meta_file, "r") as f:
            meta = json.load(f)

        chunks = meta["chunks"]
        total_width = int(meta["total_width"])
        total_height = int(meta["total_height"])

        group_dir = settings.BASE_DIR / "data" / "groups" / group_name
        group_dir.mkdir(parents=True, exist_ok=True)

        saved_files = []
        collision_count = 0
        renamed_files = []

        for block in blocks:
            polygon_pts = block.get("polygon", [])
            label = block.get("label", "block")
            b_type = block.get("type", "unknown")

            if not polygon_pts:
                continue

            xs = [int(p["x"]) for p in polygon_pts]
            ys = [int(p["y"]) for p in polygon_pts]
            bbox_x1 = max(0, min(xs))
            bbox_y1 = max(0, min(ys))
            bbox_x2 = min(total_width, max(xs) + 1)
            bbox_y2 = min(total_height, max(ys) + 1)
            bbox_w = bbox_x2 - bbox_x1
            bbox_h = bbox_y2 - bbox_y1

            if bbox_w <= 0 or bbox_h <= 0:
                continue

            # Assemble the bounding-box region from canvas chunk JPEGs
            region = Image.new("RGB", (bbox_w, bbox_h), (255, 255, 255))
            for chunk in chunks:
                chunk_start_y = int(chunk["start_y"])
                chunk_end_y = chunk_start_y + int(chunk["height"])
                overlap_y1 = max(bbox_y1, chunk_start_y)
                overlap_y2 = min(bbox_y2, chunk_end_y)
                if overlap_y2 <= overlap_y1:
                    continue
                chunk_path = chunk["local_path"]
                if not os.path.exists(chunk_path):
                    continue
                chunk_img = Image.open(chunk_path)
                src_y1 = overlap_y1 - chunk_start_y
                src_y2 = overlap_y2 - chunk_start_y
                patch = chunk_img.crop((bbox_x1, src_y1, bbox_x2, src_y2))
                region.paste(patch, (0, overlap_y1 - bbox_y1))

            # Apply polygon mask — pixels outside the polygon become white
            mask = Image.new("L", (bbox_w, bbox_h), 0)
            draw = ImageDraw.Draw(mask)
            offset_poly = [(int(p["x"]) - bbox_x1, int(p["y"]) - bbox_y1) for p in polygon_pts]
            draw.polygon(offset_poly, fill=255)
            result = Image.new("RGB", (bbox_w, bbox_h), (255, 255, 255))
            result.paste(region, mask=mask)

            safe_label = "".join(c for c in label if c.isalnum() or c in (' ', '-', '_')).strip()
            if not safe_label:
                safe_label = f"block_{bbox_y1}"

            filename = f"{safe_label}_{b_type}.png"
            file_path, renamed, final_filename = self._alloc_unique_group_filename(group_dir, filename)
            if renamed:
                collision_count += 1
                renamed_files.append({"original": filename, "final": final_filename})

            result.save(file_path)
            saved_files.append({
                "filename": final_filename,
                "label": label,
                "type": b_type,
                "url": f"/files/groups/{group_name}/{final_filename}",
                "path": str(file_path),
            })

        self._update_canvas_entry(base_id, {"status": "completed", "group_name": group_name})
        self._update_canvas_metadata_draft(canvas_id=base_id, group_name=group_name)

        return {
            "group_name": group_name,
            "count": len(saved_files),
            "files": saved_files,
            "conflict_strategy": "keep_both_auto_rename",
            "collision_count": collision_count,
            "renamed_files": renamed_files,
        }
