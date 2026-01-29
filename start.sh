#!/bin/bash

echo "========================================"
echo "AI辅助物理教辅审稿系统 - 启动脚本 (macOS)"
echo "========================================"
echo ""

# 检查Python
if ! command -v python3 &> /dev/null; then
    echo "[错误] 未检测到Python，请先安装Python 3.10+"
    exit 1
fi

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "[错误] 未检测到Node.js，请先安装Node.js 18+"
    exit 1
fi

echo "[1/5] 创建Python虚拟环境..."
cd backend
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "虚拟环境创建成功"
else
    echo "虚拟环境已存在，跳过创建"
fi

echo ""
echo "[2/5] 激活虚拟环境并安装后端依赖..."
source venv/bin/activate
pip install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "[错误] 后端依赖安装失败"
    exit 1
fi

echo ""
echo "[3/5] 安装前端依赖..."
cd ../frontend
npm install
if [ $? -ne 0 ]; then
    echo "[错误] 前端依赖安装失败"
    exit 1
fi

echo ""
echo "[4/5] 启动后端服务（虚拟环境）..."
cd ../backend
osascript -e 'tell app "Terminal" to do script "cd '$(pwd)' && source venv/bin/activate && python main.py"' &

echo ""
echo "[5/5] 启动前端服务..."
cd ../frontend
osascript -e 'tell app "Terminal" to do script "cd '$(pwd)' && npm run dev"' &

echo ""
echo "========================================"
echo "启动完成！"
echo "后端API: http://localhost:8001"
echo "前端界面: http://localhost:5173"
echo "========================================"
echo ""
echo "请在浏览器中打开 http://localhost:5173"
