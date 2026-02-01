"""
AI审稿服务
使用通义千问VL进行图片内容审核
"""
import json
import base64
from pathlib import Path
from typing import List, Dict, Optional
from dashscope import MultiModalConversation

from config import settings


class AuditService:
    """AI审稿服务"""
    
    def __init__(self):
        self.model = "qwen-vl-max"
    
    def _encode_image(self, image_path: str) -> str:
        """将图片编码为base64"""
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
    
    def _parse_box(self, box_str: str) -> Optional[Dict]:
        """
        解析坐标字符串
        输入: "<ref>文字</ref><box>(123,456),(789,512)</box>"
        输出: {"x1": 123, "y1": 456, "x2": 789, "y2": 512}
        """
        import re
        try:
            # 提取 <box> 标签中的坐标
            box_match = re.search(r'<box>\((\d+),(\d+)\),\((\d+),(\d+)\)</box>', box_str)
            if box_match:
                return {
                    "x1": int(box_match.group(1)),
                    "y1": int(box_match.group(2)),
                    "x2": int(box_match.group(3)),
                    "y2": int(box_match.group(4))
                }
        except Exception as e:
            print(f"[坐标解析] 解析失败: {e}")
        return None
    
    def _build_prompt(self, segment_name: str, segment_type: str = "exercise") -> str:
        """构建审稿提示词"""
        
        common_requirements = """
【输出要求】
1. 所有返回内容（包括问题描述、建议、理由、总结）必须严格使用**中文**。
2. 请以JSON格式输出检查结果，并使用<ref>和<box>标签标注问题位置：
{
    "issues": [
        {
            "location": "问题所在位置的描述",
            "box": "<ref>问题相关文字</ref><box>(x1,y1),(x2,y2)</box>",
            "confidence": "high/medium/low",
            "type": "公式错误/概念错误/答案错误/计算错误/图文不符/表述问题",
            "description": "问题的具体描述（必须包含出错的原文引用，例如：原文“xxxx”有问题...）",
            "suggestion": "修改建议",
            "reasoning": "你的判断依据（必填）"
        }
    ],
    "summary": "整体检查总结（1-2句话）"
}

【坐标说明】
- 使用<ref>标签包裹问题相关的文字内容
- 使用<box>标签返回该文字在图片中的精确坐标
- 坐标格式：(x1,y1),(x2,y2)，范围0-1000（左上角为0,0，右下角为1000,1000）
- **精度要求**：坐标必须非常精准，Bounding Box 应**紧贴**问题文字边缘，不要包含多余空白或无关区域
- 如果无法确定精确位置，box字段可省略

【重要原则】
- 如果你不完全确定某处是否有问题，请将confidence设为"medium"或"low"
- 宁可标注为疑似问题供人工复核，也不要产生幻觉
- 必须提供判断依据（reasoning字段）
- 如果没有发现问题，issues数组为空
"""

        if segment_type == "knowledge":
            # 知识点校验：侧重概念、定义、图文一致性
            check_items = """
【检查项目（知识点模式）】
1. 物理概念准确性：定义是否严谨，表述是否符合教材规范
2. 物理公式正确性：符号标准、下标正确、单位匹配
3. 定律表述准确性：适用条件是否完整
4. 图文一致性：配图是否准确反映了文字描述的物理情境
5. 逻辑推导：公式推导过程是否严密
6. 错别字与排版：是否有明显的文字错误
"""
        elif segment_type == "example":
            # 例题讲解审核：侧重解题步骤、逻辑、计算
            check_items = """
【检查项目（例题模式）】
1. 解题逻辑：思路是否清晰，步骤是否跳跃
2. 计算过程：中间计算是否正确，最终结果是否准确
3. 书写规范：物理量符号、单位使用是否标准
4. 方法得当：解题方法是否为高中物理标准方法
5. 题干一致性：解答是否完全扣住题干已知条件
6. 错别字与排版：是否有明显的图文错误
"""
        else:
            # 训练题：侧重题目完整性、答案正确性
            check_items = """
【检查项目（训练题模式）】
1. 题目完整性：已知条件是否充份，是否有歧义
2. 答案正确性：所给答案是否准确无误
3. 解析清晰度：解析是否能支撑答案，逻辑是否通顺
4. 图文匹配：物理情境图是否准确
5. 错别字与表述：是否有误导性的文字错误
"""

        return f"""你是高中物理教辅审稿专家。请仔细检查这张图片中的内容。

【审稿区域】{segment_name}
【区块类型】{segment_type}
{check_items}
{common_requirements}"""
    
    def audit_segment(self, image_path: str, segment_name: str, segment_type: str = "exercise", original_size: tuple[int, int] = None) -> Dict:
        """
        审核单个分割区块
        original_size: (width, height) 原始图片尺寸，用于坐标还原
        """
        messages = [
            {
                "role": "user",
                "content": [
                    {"image": f"file://{image_path}"},
                    {"text": self._build_prompt(segment_name, segment_type)}
                ]
            }
        ]
        
        try:
            response = MultiModalConversation.call(
                model=self.model,
                messages=messages,
                api_key=settings.DASHSCOPE_API_KEY
            )
            
            if response.status_code == 200:
                content = response.output.choices[0].message.content[0]["text"]
                # 尝试解析JSON
                try:
                    # 提取JSON部分
                    start = content.find("{")
                    end = content.rfind("}") + 1
                    if start >= 0 and end > start:
                        result = json.loads(content[start:end])
                        
                        # 解析坐标信息
                        if "issues" in result:
                            for issue in result["issues"]:
                                if "box" in issue and isinstance(issue["box"], str):
                                    coords = self._parse_box(issue["box"])
                                    if coords:
                                        # 如果有原始尺寸，进行坐标变换 (Square Padding 还原)
                                        if original_size:
                                            orig_w, orig_h = original_size
                                            max_dim = max(orig_w, orig_h)
                                            
                                            # 原理: 
                                            # LLM输出的 x 是基于 max_dim 的 0-1000
                                            # 真实像素 x_px = (coords["x1"] / 1000) * max_dim
                                            # 映射回原图 x_norm = (x_px / orig_w) * 1000
                                            # 合并公式: x_new = coords["x1"] * (max_dim / orig_w)
                                            
                                            scale_x = max_dim / orig_w
                                            scale_y = max_dim / orig_h
                                            
                                            # Y轴校准偏移量 (0-1000 scale)
                                            # 用户反馈坐标整体偏下，进行微调上移
                                            Y_BIAS = -15
                                            
                                            coords["x1"] = int(coords["x1"] * scale_x)
                                            coords["x2"] = int(coords["x2"] * scale_x)
                                            coords["y1"] = int(coords["y1"] * scale_y) + Y_BIAS
                                            coords["y2"] = int(coords["y2"] * scale_y) + Y_BIAS
                                            
                                            # 边界保护
                                            coords["y1"] = max(0, coords["y1"])
                                            coords["y2"] = max(0, coords["y2"])
                                            
                                        issue["coordinates"] = coords
                        
                        return {
                            "success": True,
                            "segment_name": segment_name,
                            "image_path": image_path,
                            "result": result
                        }
                except json.JSONDecodeError:
                    pass
                
                # 如果无法解析JSON，返回原始文本
                return {
                    "success": True,
                    "segment_name": segment_name,
                    "image_path": image_path,
                    "result": {"raw_response": content, "issues": []}
                }
            else:
                return {
                    "success": False,
                    "segment_name": segment_name,
                    "error": f"API错误: {response.code} - {response.message}"
                }
        except Exception as e:
            return {
                "success": False,
                "segment_name": segment_name,
                "error": str(e)
            }
    
    def audit_multiple_images(self, image_paths: List[str], segment_name: str, segment_type: str = "exercise") -> Dict:
        """
        审核多张图片（用于跨页内容）
        """
        content = []
        for path in image_paths:
            content.append({"image": f"file://{path}"})
        content.append({"text": self._build_prompt(segment_name, segment_type)})
        
        messages = [{"role": "user", "content": content}]
        
        try:
            response = MultiModalConversation.call(
                model=self.model,
                messages=messages,
                api_key=settings.DASHSCOPE_API_KEY
            )
            
            if response.status_code == 200:
                content = response.output.choices[0].message.content[0]["text"]
                try:
                    start = content.find("{")
                    end = content.rfind("}") + 1
                    if start >= 0 and end > start:
                        result = json.loads(content[start:end])
                        
                        # 解析坐标信息
                        if "issues" in result:
                            for issue in result["issues"]:
                                if "box" in issue and isinstance(issue["box"], str):
                                    coords = self._parse_box(issue["box"])
                                    if coords:
                                        issue["coordinates"] = coords
                        
                        return {
                            "success": True,
                            "segment_name": segment_name,
                            "result": result
                        }
                except json.JSONDecodeError:
                    pass
                
                return {
                    "success": True,
                    "segment_name": segment_name,
                    "result": {"raw_response": content, "issues": []}
                }
            else:
                return {
                    "success": False,
                    "segment_name": segment_name,
                    "error": f"API错误: {response.code} - {response.message}"
                }
        except Exception as e:
            return {
                "success": False,
                "segment_name": segment_name,
                "error": str(e)
            }
    
    def classify_issues(self, issues: List[Dict]) -> Dict[str, List[Dict]]:
        """
        对问题进行分类
        返回：{"certain": [...], "uncertain": [...]}
        """
        certain = []
        uncertain = []
        
        for issue in issues:
            if issue.get("confidence") == "high":
                issue["level"] = "CERTAIN_ERROR"
                certain.append(issue)
            else:
                issue["level"] = "UNCERTAIN"
                uncertain.append(issue)
        
        return {
            "certain": certain,
            "uncertain": uncertain
        }
