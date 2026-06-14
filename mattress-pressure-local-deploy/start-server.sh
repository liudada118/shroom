#!/bin/bash
echo "============================================"
echo "  1024床垫压力采集系统 - 本地部署"
echo "  矩侨工业 / 神兴隆"
echo "============================================"
echo ""
echo "正在启动本地服务器..."
echo "请在 Chrome 浏览器中访问: http://localhost:8080"
echo ""
echo "注意: Web Serial API 需要 HTTPS 或 localhost 环境"
echo "请使用 Chrome 89+ 或 Edge 89+ 浏览器"
echo ""
echo "按 Ctrl+C 停止服务器"
echo "============================================"
echo ""

# 尝试使用 Python
if command -v python3 &> /dev/null; then
    echo "[使用 Python3 HTTP 服务器]"
    open "http://localhost:8080" 2>/dev/null || xdg-open "http://localhost:8080" 2>/dev/null || true
    cd "$(dirname "$0")"
    python3 -m http.server 8080
elif command -v python &> /dev/null; then
    echo "[使用 Python HTTP 服务器]"
    open "http://localhost:8080" 2>/dev/null || xdg-open "http://localhost:8080" 2>/dev/null || true
    cd "$(dirname "$0")"
    python -m http.server 8080
elif command -v npx &> /dev/null; then
    echo "[使用 npx serve]"
    open "http://localhost:8080" 2>/dev/null || xdg-open "http://localhost:8080" 2>/dev/null || true
    cd "$(dirname "$0")"
    npx serve -s . -l 8080
else
    echo "错误: 未找到 Python 或 Node.js"
    echo "请安装 Python 3 或 Node.js 后重试"
    echo "  Mac: brew install python3"
    echo "  Ubuntu: sudo apt install python3"
fi
