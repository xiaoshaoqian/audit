import os
import json
from pathlib import Path
from typing import List, Dict, Optional
from config import settings

class GroupService:
    def __init__(self):
        self.groups_dir = settings.BASE_DIR / "data" / "groups"
        self.groups_dir.mkdir(parents=True, exist_ok=True)

    def list_groups(self) -> List[Dict]:
        """
        列出所有分组
        """
        if not self.groups_dir.exists():
            return []
        
        groups = []
        for entry in os.scandir(self.groups_dir):
            if entry.is_dir():
                # 尝试读取元数据（如果有）
                # 目前只返回名称
                groups.append({
                    "name": entry.name,
                    "path": str(entry.path),
                    "modified_time": entry.stat().st_mtime
                })
        
        # 按修改时间倒序
        groups.sort(key=lambda x: x["modified_time"], reverse=True)
        return groups

    def get_group_slices(self, group_name: str) -> List[Dict]:
        """
        获取分组下的切片列表
        """
        group_path = self.groups_dir / group_name
        if not group_path.exists():
            return []
        
        slices = []
        # 扫描 png 文件
        for file in group_path.glob("*.png"):
            # 解析文件名获取信息: label_type.png or just name.png
            # 格式约定: {label}_{type}.png
            name_parts = file.stem.rsplit('_', 1)
            b_type = "unknown"
            label = file.stem
            
            if len(name_parts) == 2 and name_parts[1] in ['knowledge', 'example', 'answer', 'unknown']:
                label = name_parts[0]
                b_type = name_parts[1]
                
            slices.append({
                "filename": file.name,
                "url": f"/files/groups/{group_name}/{file.name}",
                "label": label,
                "type": b_type,
                "path": str(file)
            })
            
        # 简单排序 (文件名)
        slices.sort(key=lambda x: x["filename"])
        return slices

    def rename_slice(self, group_name: str, filename: str, new_name: str) -> bool:
        """
        重命名切片 (改 label)
        filename: 原始文件名 (如 Math_knowledge.png)
        new_name: 新的 label (如 Physics)
        """
        group_path = self.groups_dir / group_name
        src_file = group_path / filename
        
        if not src_file.exists():
            return False
            
        # Parse old type to preserve it
        # filename format: {label}_{type}.png
        name_parts = filename.rsplit('_', 1)
        if len(name_parts) == 2:
            current_type = name_parts[1] # includes .png? No, split by _
            # actually filename is "label_type.png"
            # rsplit('_', 1) -> ["label", "type.png"]
            current_type_ext = name_parts[1]
        else:
            current_type_ext = "unknown.png"
            
        new_filename = f"{new_name}_{current_type_ext}"
        dst_file = group_path / new_filename
        
        src_file.rename(dst_file)
        return True

    def delete_slice(self, group_name: str, filename: str) -> bool:
        """
        删除切片
        """
        file_path = self.groups_dir / group_name / filename
        if file_path.exists():
            file_path.unlink()
            return True
        return False

    def update_slice_status(self, group_name: str, filename: str, status: str):
        # TODO: Implement status saving later
        pass

group_service = GroupService()
