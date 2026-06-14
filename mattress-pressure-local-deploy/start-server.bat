@echo off
title 1024床垫压力采集系统 - 本地服务器
echo ============================================
echo   1024床垫压力采集系统 - 本地部署
echo   矩侨工业 / 神兴隆
echo ============================================
echo.
echo 正在启动本地服务器...
echo 请在 Chrome 浏览器中访问: http://localhost:8080
echo.
echo 注意: Web Serial API 需要 HTTPS 或 localhost 环境
echo 请使用 Chrome 89+ 或 Edge 89+ 浏览器
echo.
echo 按 Ctrl+C 停止服务器
echo ============================================
echo.

:: 尝试使用 Python
where python >nul 2>nul
if %errorlevel% equ 0 (
    echo [使用 Python HTTP 服务器]
    start http://localhost:8080
    python -m http.server 8080
    goto :end
)

where python3 >nul 2>nul
if %errorlevel% equ 0 (
    echo [使用 Python3 HTTP 服务器]
    start http://localhost:8080
    python3 -m http.server 8080
    goto :end
)

:: 尝试使用 Node.js
where npx >nul 2>nul
if %errorlevel% equ 0 (
    echo [使用 npx serve]
    start http://localhost:8080
    npx serve -s . -l 8080
    goto :end
)

echo 错误: 未找到 Python 或 Node.js
echo 请安装 Python 3 或 Node.js 后重试
echo 下载 Python: https://www.python.org/downloads/
echo 下载 Node.js: https://nodejs.org/
pause

:end
