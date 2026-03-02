from typing import Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.group import group_service

router = APIRouter(prefix="/api/group", tags=["group"])


@router.get("/list")
async def list_groups():
    return group_service.list_groups()


@router.get("/{group_name}/slices")
async def get_group_slices(group_name: str):
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


class DeleteSliceRequest(BaseModel):
    group_name: str
    filename: str


@router.post("/delete_slice")
async def delete_slice(req: DeleteSliceRequest):
    success = group_service.delete_slice(req.group_name, req.filename)
    if not success:
        raise HTTPException(status_code=404, detail="File not found")
    return {"success": True}


class DeleteGroupRequest(BaseModel):
    group_name: str


@router.post("/delete_group")
async def delete_group(req: DeleteGroupRequest):
    success = group_service.delete_group(req.group_name)
    if not success:
        raise HTTPException(status_code=404, detail="Group not found")
    return {"success": True, "group_name": req.group_name}
