"""
数据模型定义
"""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from enum import Enum


class IssueLevel(str, Enum):
    CERTAIN_ERROR = "CERTAIN_ERROR"
    UNCERTAIN = "UNCERTAIN"


class IssueType(str, Enum):
    FORMULA_ERROR = "公式错误"
    CONCEPT_ERROR = "概念错误"
    ANSWER_ERROR = "答案错误"
    CALCULATION_ERROR = "计算错误"
    IMAGE_TEXT_MISMATCH = "图文不符"
    EXPRESSION_ISSUE = "表述问题"


class PageRange(BaseModel):
    """页面范围"""
    page: int
    from_pct: float = 0  # 从顶部的百分比
    to_pct: float = 100  # 到顶部的百分比


class Segment(BaseModel):
    """分割区块"""
    id: int
    name: str
    pages: List[PageRange]


class Issue(BaseModel):
    """问题"""
    id: Optional[int] = None
    segment_id: int
    location: str
    confidence: str  # high, medium, low
    level: IssueLevel
    type: str
    description: str
    suggestion: str
    reasoning: str
    status: str = "pending"  # pending, confirmed, rejected


class AuditResult(BaseModel):
    """审稿结果"""
    segment_id: int
    segment_name: str
    issues: List[Issue]
    summary: str


class DocumentInfo(BaseModel):
    """文档信息"""
    doc_id: str
    filename: str
    page_count: int
    pdf_path: str
    image_paths: List[str]
    thumbnails: List[str]


class CreateSegmentRequest(BaseModel):
    """创建分割请求"""
    name: str
    pages: List[Dict[str, Any]]


class AuditRequest(BaseModel):
    """审稿请求"""
    segment_ids: Optional[List[int]] = None  # 为空则审核所有


class UpdateIssueRequest(BaseModel):
    """更新问题状态请求"""
    status: str  # confirmed, rejected
    note: Optional[str] = None
