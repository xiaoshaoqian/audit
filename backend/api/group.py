from fastapi import APIRouter, HTTPException
from typing import List, Dict
from pydantic import BaseModel
from services.group import group_service

router = APIRouter(prefix="/api/group", tags=["group"])

@router.get("/list")
async def list_groups():
    """
    获取分组列表
    """
    return group_service.list_groups()

@router.get("/{group_name}/slices")
async def get_group_slices(group_name: str):
    """
    获取组内切片
    """
    return group_service.get_group_slices(group_name)

class RenameRequest(BaseModel):
    group_name: str
    filename: str
    new_name: str

@router.post("/rename_slice")
async def rename_slice(req: RenameRequest):
    success = group_service.rename_slice(req.group_name, req.filename, req.new_name)
    if not success:
        raise HTTPException(status_code=404, detail="File not found")
    return {"success": True}

class DeleteRequest(BaseModel):
    group_name: str
    filename: str

@router.post("/delete_slice")
async def delete_slice(req: DeleteRequest):
    success = group_service.delete_slice(req.group_name, req.filename)
    if not success:
        raise HTTPException(status_code=404, detail="File not found")
    return {"success": True}
