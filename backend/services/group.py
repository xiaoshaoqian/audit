import os
import shutil
from typing import Dict, List

from config import settings


class GroupService:
    def __init__(self):
        self.groups_dir = settings.BASE_DIR / "data" / "groups"
        self.groups_dir.mkdir(parents=True, exist_ok=True)

    def list_groups(self) -> List[Dict]:
        if not self.groups_dir.exists():
            return []

        groups = []
        for entry in os.scandir(self.groups_dir):
            if entry.is_dir():
                groups.append({
                    "name": entry.name,
                    "path": str(entry.path),
                    "modified_time": entry.stat().st_mtime,
                })

        groups.sort(key=lambda x: x["modified_time"], reverse=True)
        return groups

    def get_group_slices(self, group_name: str) -> List[Dict]:
        group_path = self.groups_dir / group_name
        if not group_path.exists():
            return []

        slices = []
        for file in group_path.glob("*.png"):
            name_parts = file.stem.rsplit('_', 1)
            b_type = "unknown"
            label = file.stem

            if len(name_parts) == 2 and name_parts[1] in ["knowledge", "example", "answer", "unknown"]:
                label = name_parts[0]
                b_type = name_parts[1]

            slices.append({
                "filename": file.name,
                "url": f"/files/groups/{group_name}/{file.name}",
                "label": label,
                "type": b_type,
                "path": str(file),
            })

        slices.sort(key=lambda x: x["filename"])
        return slices

    def rename_slice(self, group_name: str, filename: str, new_name: str) -> bool:
        group_path = self.groups_dir / group_name
        src_file = group_path / filename
        if not src_file.exists():
            return False

        name_parts = filename.rsplit('_', 1)
        if len(name_parts) == 2:
            current_type_ext = name_parts[1]
        else:
            current_type_ext = "unknown.png"

        new_filename = f"{new_name}_{current_type_ext}"
        dst_file = group_path / new_filename
        src_file.rename(dst_file)
        return True

    def delete_slice(self, group_name: str, filename: str) -> bool:
        file_path = self.groups_dir / group_name / filename
        if file_path.exists():
            file_path.unlink()
            return True
        return False

    def delete_group(self, group_name: str) -> bool:
        group_path = self.groups_dir / group_name
        if not group_path.exists() or not group_path.is_dir():
            return False
        shutil.rmtree(group_path)
        return True

    def update_slice_status(self, group_name: str, filename: str, status: str):
        # TODO: Implement status saving later
        pass


group_service = GroupService()
