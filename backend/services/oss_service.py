"""
阿里云 OSS 服务
负责将本地图片上传至 OSS 并获取访问链接
"""
import oss2
import uuid
from pathlib import Path
from config import settings

class OssService:
    def __init__(self):
        self.access_key_id = settings.OSS_ACCESS_KEY_ID
        self.access_key_secret = settings.OSS_ACCESS_KEY_SECRET
        self.endpoint = settings.OSS_ENDPOINT
        self.bucket_name = settings.OSS_BUCKET_NAME
        
        if self.access_key_id and self.access_key_secret and self.bucket_name:

            self.auth = oss2.Auth(self.access_key_id, self.access_key_secret)
            # 设置超时时间：连接 5s，读取 15s
            self.bucket = oss2.Bucket(self.auth, self.endpoint, self.bucket_name, connect_timeout=5, app_name="audit-system")
        else:
            self.bucket = None
            print("⚠️ OSS未配置，无法使用 OSS 服务")

    def upload_image(self, file_path: str) -> str:
        """
        上传图片到 OSS
        :param file_path: 本地文件绝对路径
        :return: OSS 公网访问 URL
        """
        if not self.bucket:
            raise ValueError("OSS 未配置 (AccessKey/Secret/Bucket)")

        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        # 生成 OSS 存储路径 (Object Name)
        # 结构: audit_images/YYYYMMDD/<uuid>.<ext>
        import datetime
        date_str = datetime.datetime.now().strftime("%Y%m%d")
        ext = path.suffix
        object_name = f"audit_images/{date_str}/{uuid.uuid4()}{ext}"

        try:
            # 上传文件
            print(f"[DEBUG] Starting OSS upload: {object_name} to bucket {self.bucket_name}")
            result = self.bucket.put_object_from_file(object_name, str(path))
            print(f"[DEBUG] OSS upload successful. Result status: {result.status}")
            
            # 生成带签名的URL (有效期 1小时)
            # 这样即使 Bucket 是私有的，九章 API 也能访问
            url = self.bucket.sign_url('GET', object_name, 3600)
            
            # sign_url 生成的可能是 http，有些环境强制 https
            # 为了安全，如果 endpoint 是 https，我们确保 url 也是 https
            if self.endpoint.startswith("https://") and url.startswith("http://"):
                url = url.replace("http://", "https://", 1)
                
            return url
            
        except oss2.exceptions.OssError as e:
            print(f"OSS Upload Failed: {e}")
            raise e
