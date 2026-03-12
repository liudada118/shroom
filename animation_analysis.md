# 座椅模型动画不流畅分析

## 问题定位

左下角加减按钮（`subShow` / `addShow`）控制 `changeCamera(value)` 来缩放3D视图。

### 涉及的组件文件：
1. **ViewSetting.js** - 加减按钮逻辑
2. **ThreeAndCarPointV2.js** (endi) - 已有平滑缩放动画 ✅
3. **ThreeAndCarPoint.js** (car) - 直接设置 position.z，无过渡 ❌
4. **ThreeAndModel.js** (bed) - 直接设置 position.z，无过渡 ❌
5. **CanvasMemo.js** (hand/bigHand/foot) - 直接设置 position.z，无过渡 ❌
6. **ThreeAndCar.js** (car旧版) - 直接设置 position.z，无过渡 ❌

### 不流畅原因：
1. **缺少缓动动画**：大部分组件的 `changeCamera` 直接设置 `camera.position.z = value`，没有过渡动画
2. **步长不连续**：ViewSetting.js 中的 `getZoomStep` 产生的步长跳跃较大（如 50%→100%→120%→140%...）
3. **ThreeAndCarPointV2.js 已优化**：它有 200ms 的 easeOutCubic 缓动动画

## 优化方案：
1. 为所有组件的 `changeCamera` 添加平滑缓动动画（使用 requestAnimationFrame + easeOutCubic）
2. 优化 ViewSetting.js 的步长算法，使缩放更均匀
3. 添加长按连续缩放功能，使加减操作更流畅
