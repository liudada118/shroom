@echo off
REM ============================================================
REM  把扫描结果推到 SonarQube Cloud（公开 URL，别人随时能看）
REM
REM  适用场景：你不是 liudada118/shroom 的 owner，装不了 GitHub App、
REM  加不了仓库 Secret，所以走不了 GitHub Actions。改成在本机扫描、
REM  直接上传到 Cloud 上一个「手动创建」的项目 —— 这条路不需要任何仓库权限。
REM
REM  前置步骤（浏览器里做一次）：
REM    1. https://sonarcloud.io 右上角 + 号 - Analyze new project
REM    2. 页面右侧点「create a project manually」
REM    3. 组织选 chiyusiguyuanya1，填 Project key，Visibility 选 Public
REM    4. New code definition 默认即可，点 Create project
REM    5. 头像 - My Account - Security - Generate Token，把令牌存到
REM       项目根目录的 .sonar-cloud-token 文件里（该文件已被 gitignore）
REM
REM  如果第 3 步你填的 key 不是下面这个，改 SONAR_PROJECT_KEY 这一行。
REM ============================================================

setlocal

set "SONAR_HOST=https://sonarcloud.io"
set "SONAR_ORG=chiyusiguyuanya1"
set "SONAR_PROJECT_KEY=chiyusiguyuanya1_shroom"

REM --- 找令牌：环境变量 SONAR_CLOUD_TOKEN 优先，其次 .sonar-cloud-token 文件 ---
if not "%SONAR_CLOUD_TOKEN%"=="" (
    echo [scan-cloud] 使用环境变量 SONAR_CLOUD_TOKEN
    goto :have_token
)

if exist ".sonar-cloud-token" (
    set /p SONAR_CLOUD_TOKEN=<.sonar-cloud-token
    echo [scan-cloud] 使用 .sonar-cloud-token 文件里的令牌
    goto :have_token
)

echo.
echo 没有找到 Cloud 令牌。
echo 请到 https://sonarcloud.io 右上头像 - My Account - Security
echo 生成一个令牌，然后粘贴到下面。
echo.
set /p SONAR_CLOUD_TOKEN=请输入令牌:
if "%SONAR_CLOUD_TOKEN%"=="" (
    echo [错误] 没有输入令牌，退出。
    pause
    exit /b 1
)

set /p SAVE=要把它存进 .sonar-cloud-token 以后免输吗? [y/N]:
if /i "%SAVE%"=="y" (
    echo %SONAR_CLOUD_TOKEN%> .sonar-cloud-token
    echo [scan-cloud] 已存入 .sonar-cloud-token（该文件不会被 git 提交）
)

:have_token

echo.
echo [scan-cloud] 目标   : %SONAR_HOST%
echo [scan-cloud] 组织   : %SONAR_ORG%
echo [scan-cloud] 项目key: %SONAR_PROJECT_KEY%
echo [scan-cloud] 开始扫描，首次大约需要半小时，请耐心等...
echo.

REM organization 和 projectKey 在这里覆盖 sonar-project.properties 里的本地配置
sonar-scanner ^
  -D"sonar.host.url=%SONAR_HOST%" ^
  -D"sonar.organization=%SONAR_ORG%" ^
  -D"sonar.projectKey=%SONAR_PROJECT_KEY%" ^
  -D"sonar.token=%SONAR_CLOUD_TOKEN%"

if errorlevel 1 (
    echo.
    echo [错误] 扫描失败，往上翻日志看 ERROR 行。
    echo        常见原因：项目 key 填错，或令牌没有该项目的执行分析权限。
    pause
    exit /b 1
)

echo.
echo [scan-cloud] 完成。把下面这个地址发给别人，谁都能打开：
echo     %SONAR_HOST%/project/overview?id=%SONAR_PROJECT_KEY%
echo.
pause
