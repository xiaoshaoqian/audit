"""
配置文件
"""
import os
from pathlib import Path
from pydantic_settings import BaseSettings

# 获取backend目录的绝对路径
BASE_DIR = Path(__file__).parent.absolute()


def find_poppler_path():
    """自动查找Poppler路径（跨平台）"""
    import platform
    system = platform.system()
    
    if system == "Windows":
        possible_paths = [
            r"C:\poppler-25.12.0\Library\bin",  # 用户实际安装位置
            r"C:\poppler\Library\bin",
            r"C:\poppler\bin",
            r"C:\Program Files\poppler\Library\bin",
            r"C:\Program Files\poppler\bin",
            str(BASE_DIR / "poppler" / "Library" / "bin"),
            str(BASE_DIR / "poppler" / "bin"),
        ]
        exe_name = "pdftoppm.exe"
    else:  # macOS or Linux
        possible_paths = [
            "/opt/homebrew/bin",  # Apple Silicon Mac
            "/usr/local/bin",      # Intel Mac
            "/usr/bin",            # Linux
            str(BASE_DIR / "poppler" / "bin"),
        ]
        exe_name = "pdftoppm"
    
    for path in possible_paths:
        if os.path.exists(path) and os.path.exists(os.path.join(path, exe_name)):
            return path
    
    return None


class Settings(BaseSettings):
    # 通义千问API配置
    DASHSCOPE_API_KEY: str = os.getenv("DASHSCOPE_API_KEY", "your-api-key-here")
    
    # Poppler路径
    POPPLER_PATH: str = os.getenv("POPPLER_PATH", find_poppler_path() or "")
    
    # 文件存储路径
    UPLOAD_DIR: str = str(BASE_DIR / "data" / "uploads")
    IMAGES_DIR: str = str(BASE_DIR / "data" / "images")
    SPLITS_DIR: str = str(BASE_DIR / "data" / "splits")
    RESULTS_DIR: str = str(BASE_DIR / "data" / "results")
    
    # 图片转换配置
    IMAGE_DPI: int = 150
    MAX_PAGES_PER_SEGMENT: int = 5
    
    # 服务器配置
    HOST: str = "0.0.0.0"
    PORT: int = 8001
    
    class Config:
        env_file = ".env"


settings = Settings()

# 检查Poppler
if settings.POPPLER_PATH:
    print(f"✅ Poppler路径: {settings.POPPLER_PATH}")
else:
    import platform
    if platform.system() == "Darwin":  # macOS
        print("⚠️ 未找到Poppler，请使用 Homebrew 安装: brew install poppler")
    else:  # Windows
        print("⚠️ 未找到Poppler，请下载并解压到 C:\\poppler\\")

# 确保目录存在
for dir_path in [settings.UPLOAD_DIR, settings.IMAGES_DIR, 
                 settings.SPLITS_DIR, settings.RESULTS_DIR]:
    os.makedirs(dir_path, exist_ok=True)
