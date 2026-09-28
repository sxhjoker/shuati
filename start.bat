@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动本地刷题服务器...
echo 浏览器打开 http://localhost:8000 即可使用（关闭本窗口即停止服务）
start "" http://localhost:8000
python -m http.server 8000
pause
