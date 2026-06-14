# 1024床垫压力采集系统 — 本地部署版

## 系统要求

- **浏览器**: Chrome 89+ 或 Edge 89+（必须，Web Serial API 仅支持这些浏览器）
- **运行环境**: Python 3 或 Node.js（任选其一，用于启动本地HTTP服务器）

## 快速启动

### Windows

双击 `start-server.bat`，浏览器会自动打开 http://localhost:8080

### Mac / Linux

```bash
chmod +x start-server.sh
./start-server.sh
```

### 手动启动（如果脚本不工作）

```bash
# 方法1: Python（推荐）
cd 本目录
python3 -m http.server 8080

# 方法2: Node.js
npx serve -s . -l 8080
```

然后在 Chrome 浏览器中打开: http://localhost:8080

## 重要说明

1. **必须通过 localhost 访问**：Web Serial API 仅在 HTTPS 或 localhost 环境下工作，直接双击 index.html 打开（file:// 协议）无法使用串口功能。

2. **串口连接参数**：
   - 波特率: 1,500,000 bps
   - 帧结构: 2048字节数据 + 8字节帧尾 (AA 00 55 00 03 00 99 00)
   - 每点2字节，小端序，12bit (0~4095)
   - 矩阵: 32×32 = 1024点

3. **压强标定公式（V2.7.54 人体段）**：
   - 平均压强: P_avg = 25 / (1 + exp(-0.010637 × (ADC_avg − 438.05))) × 2
   - 最大压强: P_max = P_avg × (ADC_max / ADC_avg)
   - 每点压强: P_点 = P_avg × (ADC_点 / ADC_avg)

4. **功能列表**：
   - 实时热力图（Jet色谱 + 动态归一化 + Gamma 2.0）
   - 每点显示压强数值（kPa）
   - 热力图旋转（0°/90°/180°/270°）
   - ADC数值点阵视图
   - 单帧/多帧采集
   - CSV + Excel 导出
   - 模拟演示模式（无设备时）

## 文件结构

```
├── index.html          # 主页面（单页应用）
├── assets/             # JS/CSS 资源
├── start-server.bat    # Windows 启动脚本
├── start-server.sh     # Mac/Linux 启动脚本
└── README.md           # 本文件
```

## 版本信息

- 软件版本: V2.7.54
- 传感器: 矩侨床垫 jq-bed-32x32
- 开发: 神兴隆 / 矩侨工业
