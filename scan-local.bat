@echo off
REM ============================================================
REM  本地 SonarQube 扫描（扫到 localhost:9000 的自建服务器）
REM
REM  前提：SonarQube 服务端已启动
REM        双击 StartSonar.bat，等到日志出现 "SonarQube is operational"
REM
REM  用法：在项目根目录双击本文件，或在终端执行 scan-local.bat
REM
REM  令牌来源（按顺序找，找到就用）：
REM    1. 环境变量 SONAR_TOKEN
REM    2. 项目根目录的 .sonar-token 文件（已在 .gitignore 里，不会被提交）
REM    3. 现场提示你输入，并问你要不要存进 .sonar-token
REM
REM  本仓库是公开仓库，所以令牌绝不能写进本文件。
REM ============================================================

setlocal

set "SONAR_HOST=http://localhost:9000"

REM --- 找令牌 ---
if not "%SONAR_TOKEN%"=="" (
    echo [scan-local] 使用环境变量 SONAR_TOKEN
    goto :have_token
)

if exist ".sonar-token" (
    set /p SONAR_TOKEN=<.sonar-token
    echo [scan-local] 使用 .sonar-token 文件里的令牌
    goto :have_token
)

echo.
echo 没有找到令牌。请到 %SONAR_HOST% 登录后，
echo 在「我的账号 - 安全」里生成一个令牌，粘贴到下面。
echo.
set /p SONAR_TOKEN=请输入令牌:
if "%SONAR_TOKEN%"=="" (
    echo [错误] 没有输入令牌，退出。
    pause
    exit /b 1
)

set /p SAVE=要把它存进 .sonar-token 以后免输吗? [y/N]:
if /i "%SAVE%"=="y" (
    echo %SONAR_TOKEN%> .sonar-token
    echo [scan-local] 已存入 .sonar-token（该文件不会被 git 提交）
)

:have_token

echo [scan-local] 目标服务器: %SONAR_HOST%
echo [scan-local] 正在检查服务端是否在线...

curl -s -o nul -m 10 "%SONAR_HOST%/api/system/status"
if errorlevel 1 (
    echo.
    echo [错误] 连不上 %SONAR_HOST%
    echo        请先双击 StartSonar.bat 启动服务端，等它输出
    echo        "SonarQube is operational" 之后再跑本脚本。
    echo.
    pause
    exit /b 1
)

echo [scan-local] 服务端在线，开始扫描...
echo.

sonar-scanner -D"sonar.host.url=%SONAR_HOST%" -D"sonar.token=%SONAR_TOKEN%"

if errorlevel 1 (
    echo.
    echo [错误] 扫描失败，请往上翻日志看 ERROR 行。
    pause
    exit /b 1
)

echo.
echo [scan-local] 扫描完成。结果地址：
echo     %SONAR_HOST%/dashboard?id=SHROOM-HUMAN
echo.
pause
