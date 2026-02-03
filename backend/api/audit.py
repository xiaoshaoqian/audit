"""
API路由 - 审稿
"""
import json
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException

from config import settings
from services import ImageSplitter, AuditService
from models import AuditRequest, AuditResult, Issue, UpdateIssueRequest

router = APIRouter(prefix="/api/audit", tags=["audit"])


def load_results(doc_id: str) -> dict:
    """加载审稿结果"""
    results_file = Path(settings.RESULTS_DIR) / doc_id / "results.json"
    if results_file.exists():
        with open(results_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"segments": [], "issues": []}


def save_results(doc_id: str, results: dict):
    """保存审稿结果"""
    results_dir = Path(settings.RESULTS_DIR) / doc_id
    results_dir.mkdir(parents=True, exist_ok=True)
    with open(results_dir / "results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)


@router.post("/{doc_id}/start")
async def start_audit(doc_id: str, request: AuditRequest):
    """
    开始审稿
    """
    splitter = ImageSplitter(doc_id)
    splits = splitter.load_splits()
    
    if not splits:
        raise HTTPException(status_code=400, detail="请先创建分割区块")
    
    # 加载现有结果，用于增量更新
    existing_results = load_results(doc_id)
    
    # 筛选要审核的区块
    if request.segment_ids:
        segments_to_audit = [s for s in splits if s["id"] in request.segment_ids]
        # 增量模式：保留不需要重新审核的区块结果
        kept_segments = [s for s in existing_results.get("segments", []) if s["segment_id"] not in request.segment_ids]
        kept_issues = [i for i in existing_results.get("issues", []) if i["segment_id"] not in request.segment_ids]
    else:
        # 全量模式
        segments_to_audit = splits
        kept_segments = []
        kept_issues = []
    
    if not segments_to_audit:
        raise HTTPException(status_code=400, detail="没有找到要审核的区块")
    
    # 计算起始Issue ID
    issue_id_counter = 1
    if kept_issues:
        issue_id_counter = max(i["id"] for i in kept_issues) + 1

    # 开始审稿
    auditor = AuditService()
    new_issues = []
    results = {"segments": kept_segments, "issues": kept_issues}
    
    for segment in segments_to_audit:
        # 生成拼接图片 (使用网格辅助版进行AI识别)
        # 获取 padded 后的图片路径，以及原始尺寸
        image_path, orig_w, orig_h = splitter.create_segment_image_with_grid(segment)
        
        # 获取区块类型
        segment_type = segment.get("type", "exercise")
        
        # 调用AI审稿
        # 传入 original_size=(orig_w, orig_h) 以便还原坐标
        audit_result = auditor.audit_segment(
            image_path, 
            segment["name"], 
            segment_type, 
            original_size=(orig_w, orig_h)
        )
        
        if audit_result["success"]:
            result_data = audit_result["result"]
            issues = result_data.get("issues", [])
            
            # 分类问题
            classified = auditor.classify_issues(issues)
            
            # 添加问题ID和segment_id
            for issue in classified["certain"] + classified["uncertain"]:
                issue["id"] = issue_id_counter
                issue["segment_id"] = segment["id"]
                issue["status"] = "pending"
                issue_id_counter += 1
                new_issues.append(issue)
            
            # 使用新结果覆盖旧的SegmentMeta
            results["segments"].append({
                "segment_id": segment["id"],
                "segment_name": segment["name"],
                "summary": result_data.get("summary", ""),
                "certain_count": len(classified["certain"]),
                "uncertain_count": len(classified["uncertain"]),
                "jiuzhang_analysis": result_data.get("jiuzhang_analysis") # 保存九章结果
            })
        else:
            results["segments"].append({
                "segment_id": segment["id"],
                "segment_name": segment["name"],
                "error": audit_result.get("error", "未知错误")
            })
    
    # 合并问题列表
    results["issues"].extend(new_issues)
    save_results(doc_id, results)
    
    return {
        "message": "审稿完成",
        "total_segments": len(results["segments"]),
        "total_issues": len(results["issues"]),
        "certain_count": len([i for i in results["issues"] if i.get("level") == "CERTAIN_ERROR"]),
        "uncertain_count": len([i for i in results["issues"] if i.get("level") == "UNCERTAIN"])
    }


@router.get("/{doc_id}/results")
async def get_results(doc_id: str):
    """
    获取审稿结果
    """
    results = load_results(doc_id)
    return results


@router.get("/{doc_id}/issues")
async def get_issues(doc_id: str, level: Optional[str] = None, status: Optional[str] = None):
    """
    获取问题列表，支持按级别和状态筛选
    """
    results = load_results(doc_id)
    issues = results.get("issues", [])
    
    if level:
        issues = [i for i in issues if i.get("level") == level]
    if status:
        issues = [i for i in issues if i.get("status") == status]
    
    return issues


@router.put("/{doc_id}/issues/{issue_id}")
async def update_issue(doc_id: str, issue_id: int, request: UpdateIssueRequest):
    """
    更新问题状态（确认/驳回）
    """
    results = load_results(doc_id)
    issues = results.get("issues", [])
    
    for issue in issues:
        if issue.get("id") == issue_id:
            issue["status"] = request.status
            if request.note:
                issue["note"] = request.note
            break
    else:
        raise HTTPException(status_code=404, detail="问题不存在")
    
    results["issues"] = issues
    save_results(doc_id, results)
    
    return {"message": "更新成功"}
