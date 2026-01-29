@echo off
echo ========================================
echo AI辅助物理教辅审稿系统 - 启动脚本
echo ========================================
echo.

REM 检查Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到Python，请先安装Python 3.10+
    pause
    exit /b 1
)

REM 检查Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到Node.js，请先安装Node.js 18+
    pause
    exit /b 1
)

echo [1/5] 创建Python虚拟环境...
cd backend
if not exist "venv" (
    python -m venv venv
    echo 虚拟环境创建成功
) else (
    echo 虚拟环境已存在，跳过创建
)

echo.
echo [2/5] 激活虚拟环境并安装后端依赖...
call venv\Scripts\activate.bat
pip install -r requirements.txt
if errorlevel 1 (
    echo [错误] 后端依赖安装失败
    pause
    exit /b 1
)

echo.
echo [3/5] 安装前端依赖...
cd ..\frontend
call npm install
if errorlevel 1 (
    echo [错误] 前端依赖安装失败
    pause
    exit /b 1
)

echo.
echo [4/5] 启动后端服务（虚拟环境）...
cd ..\backend
start "后端服务" cmd /k "call venv\Scripts\activate.bat && python main.py"

echo.
echo [5/5] 启动前端服务...
cd ..\frontend
start "前端服务" cmd /k "npm run dev"

echo.
echo ========================================
echo 启动完成！
echo 后端API: http://localhost:8001
echo 前端界面: http://localhost:5173
echo ========================================
echo.
echo 请在浏览器中打开 http://localhost:5173
pause
