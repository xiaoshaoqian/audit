"""
Application configuration.
"""
import os
from pathlib import Path

from pydantic_settings import BaseSettings


# Absolute path to backend directory
BASE_DIR = Path(__file__).parent.absolute()


def find_poppler_path() -> str | None:
    """Find Poppler binary path across platforms."""
    import platform

    system = platform.system()

    if system == "Windows":
        possible_paths = [
            r"C:\poppler-25.12.0\Library\bin",
            r"C:\poppler\Library\bin",
            r"C:\poppler\bin",
            r"C:\Program Files\poppler\Library\bin",
            r"C:\Program Files\poppler\bin",
            str(BASE_DIR / "poppler" / "Library" / "bin"),
            str(BASE_DIR / "poppler" / "bin"),
        ]
        exe_name = "pdftoppm.exe"
    else:
        possible_paths = [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin",
            str(BASE_DIR / "poppler" / "bin"),
        ]
        exe_name = "pdftoppm"

    for path in possible_paths:
        if os.path.exists(path) and os.path.exists(os.path.join(path, exe_name)):
            return path

    return None


class Settings(BaseSettings):
    BASE_DIR: Path = BASE_DIR

    # Qwen API
    DASHSCOPE_API_KEY: str = os.getenv("DASHSCOPE_API_KEY", "your-api-key-here")

    # Poppler
    POPPLER_PATH: str = os.getenv("POPPLER_PATH", find_poppler_path() or "")

    # Storage
    UPLOAD_DIR: str = str(BASE_DIR / "data" / "uploads")
    IMAGES_DIR: str = str(BASE_DIR / "data" / "images")
    SPLITS_DIR: str = str(BASE_DIR / "data" / "splits")
    RESULTS_DIR: str = str(BASE_DIR / "data" / "results")
    DOC_INDEX_PATH: str = str(BASE_DIR / "data" / "documents.json")

    # Image conversion
    IMAGE_DPI: int = 150
    MAX_PAGES_PER_SEGMENT: int = 5

    # Jiuzhang API
    JIUZHANG_API_URL: str = "http://openai.100tal.com/ai/backend/answer/http"
    JIUZHANG_ACCESS_KEY: str = os.getenv("JIUZHANG_ACCESS_KEY", "")
    JIUZHANG_SECRET_KEY: str = os.getenv("JIUZHANG_SECRET_KEY", "")

    # OSS
    OSS_ACCESS_KEY_ID: str = os.getenv("OSS_ACCESS_KEY_ID", "")
    OSS_ACCESS_KEY_SECRET: str = os.getenv("OSS_ACCESS_KEY_SECRET", "")
    OSS_ENDPOINT: str = os.getenv("OSS_ENDPOINT", "")
    OSS_BUCKET_NAME: str = os.getenv("OSS_BUCKET_NAME", "")

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8001

    class Config:
        env_file = ".env"


settings = Settings()


# Poppler status (plain ASCII logs to avoid Windows console encoding issues)
if settings.POPPLER_PATH:
    print(f"[INFO] Poppler path: {settings.POPPLER_PATH}")
else:
    import platform

    if platform.system() == "Darwin":
        print("[WARN] Poppler not found. Install via: brew install poppler")
    else:
        print("[WARN] Poppler not found. Please install to C:\\poppler\\")


# Ensure required directories exist
for dir_path in [
    settings.UPLOAD_DIR,
    settings.IMAGES_DIR,
    settings.SPLITS_DIR,
    settings.RESULTS_DIR,
]:
    os.makedirs(dir_path, exist_ok=True)
