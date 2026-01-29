"""
AI辅助物理教辅审稿系统 - 后端主入口
"""
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import settings
from api import upload_router, split_router, audit_router


app = FastAPI(
    title="AI辅助物理教辅审稿系统",
    description="基于通义千问VL的智能审稿工具",
    version="1.0.0"
)

# CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(upload_router)
app.include_router(split_router)
app.include_router(audit_router)

# 静态文件服务
app.mount("/static/images", StaticFiles(directory=settings.IMAGES_DIR), name="images")


@app.get("/")
async def root():
    return {
        "message": "AI辅助物理教辅审稿系统",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True
    )
