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

#### macOS / Linux
```bash
# 1. 后端依赖
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 2. 前端依赖
cd ../frontend
npm install
```

#### Windows
```cmd
REM 1. 后端依赖
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

REM 2. 前端依赖
cd ..\frontend
npm install
```

### 2. 配置API密钥

请在 `backend` 目录下创建 `.env` 文件（可复制 `.env` 模板），并填入以下配置：

```properties
# 通义千问API密钥（必填）
DASHSCOPE_API_KEY=your_key_here

# 九章API配置（可选，用于题目搜索）
JIUZHANG_ACCESS_KEY=your_access_key
JIUZHANG_SECRET_KEY=your_secret_key

# 阿里云OSS配置（可选，用于图片上传）
OSS_ACCESS_KEY_ID=your_oss_id
OSS_ACCESS_KEY_SECRET=your_oss_secret
OSS_ENDPOINT=oss-cn-beijing.aliyuncs.com
OSS_BUCKET_NAME=your_bucket_name
```

### 3. 启动服务

> 需要打开两个终端窗口分别运行后端和前端。

#### macOS / Linux
```bash
# 终端 1: 后端
cd backend
source venv/bin/activate
python main.py

# 终端 2: 前端
cd frontend
npm run dev
```

#### Windows
```cmd
REM 终端 1: 后端
cd backend
venv\Scripts\activate
python main.py

REM 终端 2: 前端
cd frontend
npm run dev
```

### 5. 访问

打开浏览器访问 http://localhost:5173

## 技术栈

- 后端：FastAPI + Python
- 前端：React + Vite + TypeScript
- AI：通义千问 qwen-vl-max
