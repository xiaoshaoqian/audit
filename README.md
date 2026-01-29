# AI辅助物理教辅审稿系统

基于通义千问VL的智能审稿工具，帮助审核高中物理教辅材料。

## 功能特点

- 📄 DOCX文档转图片预览
- ✂️ 人工标记分割点（支持页内分割）
- 🤖 AI智能审稿（qwen-vl-max）
- 🎨 问题分级标注（红色确定/黄色待复核）
- 📝 审稿报告导出

## 快速开始

### 1. 安装依赖

```bash
# 后端（使用虚拟环境）
cd backend
python -m venv venv
# Windows激活
venv\Scripts\activate
# Linux/Mac激活
# source venv/bin/activate
pip install -r requirements.txt

# 前端
cd frontend
npm install
```

### 2. 配置API密钥

编辑 `backend/config.py`，填入通义千问API密钥。

### 3. 启动服务

```bash
# 后端（先激活虚拟环境）
cd backend
venv\Scripts\activate
python main.py

# 前端
cd frontend
npm run dev
```

### 4. 访问

打开浏览器访问 http://localhost:5173

## 技术栈

- 后端：FastAPI + Python
- 前端：React + Vite + TypeScript
- AI：通义千问 qwen-vl-max
