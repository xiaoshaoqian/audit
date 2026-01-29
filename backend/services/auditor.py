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
    
    def _build_prompt(self, segment_name: str) -> str:
        """构建审稿提示词"""
        return f"""你是高中物理教辅审稿专家。请仔细检查这张图片中的内容。

【审稿区域】{segment_name}

【检查项目】
1. 物理公式是否正确（注意符号、下标、单位）
2. 物理概念和定律表述是否准确
3. 题目答案是否正确
4. 解析过程是否有逻辑错误或计算错误
5. 图表是否与文字描述一致
6. 是否有错别字或表述不当

【输出要求】
请以JSON格式输出检查结果，并使用<ref>和<box>标签标注问题位置：
{{
    "issues": [
        {{
            "location": "问题所在位置的描述",
            "box": "<ref>问题相关文字</ref><box>(x1,y1),(x2,y2)</box>",
            "confidence": "high/medium/low",
            "type": "公式错误/概念错误/答案错误/计算错误/图文不符/表述问题",
            "description": "问题的具体描述",
            "suggestion": "修改建议",
            "reasoning": "你的判断依据（必填）"
        }}
    ],
    "summary": "整体检查总结（1-2句话）"
}}

【坐标说明】
- 使用<ref>标签包裹问题相关的文字内容
- 使用<box>标签返回该文字在图片中的坐标
- 坐标格式：(x1,y1),(x2,y2)，范围0-1000
- 如果无法确定精确位置，box字段可省略

【重要原则】
- 如果你不完全确定某处是否有问题，请将confidence设为"medium"或"low"
- 宁可标注为疑似问题供人工复核，也不要产生幻觉
- 必须提供判断依据（reasoning字段）
- 如果没有发现问题，issues数组为空"""
    
    def audit_segment(self, image_path: str, segment_name: str) -> Dict:
        """
        审核单个分割区块
        """
        messages = [
            {
                "role": "user",
                "content": [
                    {"image": f"file://{image_path}"},
                    {"text": self._build_prompt(segment_name)}
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
    
    def audit_multiple_images(self, image_paths: List[str], segment_name: str) -> Dict:
        """
        审核多张图片（用于跨页内容）
        """
        content = []
        for path in image_paths:
            content.append({"image": f"file://{path}"})
        content.append({"text": self._build_prompt(segment_name)})
        
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
