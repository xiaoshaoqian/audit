"""
九章模型 (MathGPT) 服务
负责调用好未来AI开放平台接口进行题目解答
"""
import time
import uuid
import json
import base64
import hmac
import requests
from hashlib import sha1
from urllib.parse import quote
from typing import Dict, List, Optional
from pathlib import Path

from config import settings


class JiuzhangService:
    """九章模型服务"""
    
    def __init__(self):
        self.api_url = settings.JIUZHANG_API_URL
        self.access_key_id = settings.JIUZHANG_ACCESS_KEY
        self.access_key_secret = settings.JIUZHANG_SECRET_KEY
        
        # 默认Header
        self.headers = {'content-type': "application/json"}
    
    @property
    def timestamp(self):
        # 获取当前时间（东8区）
        return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime())
    
    @staticmethod
    def url_format(params):
        """
        对params进行format
        对 params key 进行从小到大排序
        a=b&c=d
        """
        sorted_parameters = sorted(params.items(), key=lambda d: d[0], reverse=False)
        param_list = ["{}={}".format(key, value) for key, value in sorted_parameters]
        string_to_sign = '&'.join(param_list)
        return string_to_sign

    def _generate_signature(self, parameters: Dict) -> str:
        """生成签名"""
        # 计算证书签名
        string_to_sign = self.url_format(parameters)
        
        # 进行base64 encode
        secret = self.access_key_secret + "&"
        h = hmac.new(secret.encode('utf-8'), string_to_sign.encode('utf-8'), sha1)
        signature = base64.b64encode(h.digest()).strip()
        signature = str(signature, encoding="utf8")
        return signature

    def _encode_image(self, image_path: str) -> str:
        """读取图片并转为Base64 Data URI"""
        path = Path(image_path)
        if not path.exists():
            raise FileNotFoundError(f"Image not found: {image_path}")
            
        with open(path, "rb") as f:
            img_data = f.read()
            base64_str = base64.b64encode(img_data).decode("utf-8")
            
        # 根据文件扩展名确定MIME type
        mime_type = "image/png"  # 默认为png
        if path.suffix.lower() == ".jpg" or path.suffix.lower() == ".jpeg":
            mime_type = "image/jpeg"
            
        return base64_str

    def get_solution(self, image_path: str, context_text: str = "请详细解答这道题") -> Dict:
        """
        调用九章接口获取解答
        """
        if not self.access_key_id or not self.access_key_secret:
            return {
                "success": False,
                "error": "未配置九章API Key (JIUZHANG_ACCESS_KEY, JIUZHANG_SECRET_KEY)"
            }

        # 1. 准备 Request Body
        # 使用 OSS 上传图片
        from services.oss_service import OssService
        try:
            oss_service = OssService()
            if not oss_service.bucket:
                 return {"success": False, "error": "OSS未配置，无法上传图片"}
                 
            image_url = oss_service.upload_image(image_path)
            print(f"[DEBUG] Image Uploaded to OSS: {image_url}")
            
        except Exception as e:
            return {"success": False, "error": f"图片上传OSS失败: {str(e)}"}
            
        body_params = {
            "messages": [
                {
                    "role": "user",
                    "content": context_text
                },
                {
                    "role": "user", 
                    "type": "image_url",
                    "image_url": image_url
                }
            ],
            "n": 0, # 多次采样
            "solved_subjects": ["物理"]
        }
        
        # 2. 准备 URL Params (公共参数)
        url_params = {
            "access_key_id": self.access_key_id,
            "timestamp": self.timestamp,
            "signature_nonce": str(uuid.uuid1())
        }
        
        # 3. 计算签名
        # 注意：根据Demo，签名计算时包含 request_body
        sign_param = {
            "request_body": json.dumps(body_params)
        }
        sign_param.update(url_params)
        
        signature = self._generate_signature(sign_param)
        
        # 4. 将签名添加到 URL Params
        url_params['signature'] = quote(signature, 'utf-8')
        
        # 5. 生成完整 URL
        # 注意: requests会将params自动拼接到URL后，但这里因为有quote处理过的signature，
        # 为了保证精确匹配Demo逻辑，我们手动拼接或让requests处理。
        # Demo中是手动拼接：url = self.url + '?' + self.url_format(self.url_params)
        req_url = self.api_url + '?' + self.url_format(url_params)
        
        try:
            # 发送请求
            # 注意: requests.post json=body_params 会自动做 dumps
            # 增加超时设置 30s
            response = requests.post(req_url, json=body_params, headers=self.headers, timeout=30)
            
            if response.status_code == 200:
                # 强制设置响应编码为 utf-8，防止中文乱码 (requests 默认可能识别为 ISO-8859-1)
                response.encoding = "utf-8"
                
                # 针对返回多行JSON的情况（NDJSON/Streaming）
                # 我们尝试解析每一行，并取最后一条有效结果
                try:
                    lines = response.text.strip().split('\n')
                    last_json = None
                    full_text_buffer = "" # 如果是流式输出，可能需要拼接
                    
                    for line in lines:
                        if not line.strip(): continue
                        try:
                            line_json = json.loads(line)
                            
                            # 累积数据 logic (视API具体返回而定)
                            # 如果是流式，通常每行是 delta，或者最后一行是 complete
                            # 这里假设最后一行包含完整结果或最终状态
                            last_json = line_json
                            
                        except json.JSONDecodeError:
                            continue

                    if last_json:
                        res_json = last_json
                        if res_json.get("code") == 20000:
                            return {
                                "success": True,
                                "data": res_json.get("data", {})
                            }
                        else:
                            return {
                                "success": False,
                                "error": f"API Error: {res_json.get('msg')} ({res_json.get('code')})",
                                "raw": res_json
                            }
                    else:
                        return {
                            "success": False,
                            "error": "Empty or Invalid JSON response",
                            "raw": response.text
                        }
                except Exception as parse_e:
                     return {
                        "success": False,
                        "error": f"Parse Error: {str(parse_e)}",
                        "raw": response.text
                     }
            else:
                return {
                    "success": False,
                    "error": f"HTTP Error: {response.status_code}",
                    "raw": response.text
                }
                
        except Exception as e:
            return {
                "success": False,
                "error": f"Request Failed: {str(e)}"
            }
