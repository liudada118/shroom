import logo from './logo.svg';
import './App.css';
import { HashRouter, Route, Routes, Navigate } from 'react-router-dom';
import React, { useState, useCallback, useEffect } from 'react';
import Test from './page/test/Test';
import './locale/index'; // 在这里导入
import i18next from "i18next";
import Equip from './page/equip/Equip';
import Data from './page/data/Data';
import MacConfig, { hasMacConfig } from './page/equip/macConfig/MacConfig';

i18next.init({
  resources: {
    en: {
      translation: {
        connect: 'Connect',
        connecting: 'Connecting',
        connected: 'Connected',
        back: 'Back',
        sit: 'Seat',
        freq: 'Freq',
        history: 'History',
        local: 'Local',
        import: 'Import',
        filename: 'Filename',
        flip: 'Flip',
        flipV: 'FlipV',
        flipH: 'FlipH',
        zeroPre: 'Zero',
        select: 'Select',
        ruler: 'Ruler',
        upload: 'Upload',
        adjust: 'Adjust',
        blur: 'GaussianBlur',
        colorAdj: 'ColorAdj',
        denoise: 'Denoise',
        heightAdj: 'HeightAdj',
        continuity: 'Continuity',
        frame: 'Frame',
        collectSettings: 'CollectSettings',
        compare: 'Compare',
        emphSet: 'EmphasisSettings',

        // ——今天新增/长文字扩写——
        hand: 'PressureMap',
        bed: 'MattressPres.',
        bedEquip: 'BedSensor',
        handEquip: 'Sensor',
        untitled: 'Untitled',
        point3D: '3D Model',
        num2D: 'Num2D',
        viewSwitch3D: 'ViewSwitch3D',
        renameStorage: 'RenameStorage',
        storageName: 'StorageName',
        cancel: 'Cancel',
        ok: 'OK',
        rename: 'rename',
        download: 'download',
        delete: 'delete',
        car: 'Ergo Chair',
        // ——这几个写长一点——
        algoUniform: 'Algorithm for Uniform Color Distribution',
        algoRedBlue: 'Algorithm for Red-to-Blue Gradient Coloring',
        filterNoise: 'Noise Filtering Below Threshold Value',
        pointHeight: 'Point Height Representation in 3D Space',
        sensitivity: 'Sensor Response Sensitivity Value',
        all: 'overall',
        restore: 'Restore Default',
        back2D: 'back',
        sit2D: 'sit',
        back3D: 'back',
        sit3D: 'sit',
        num3D: 'num3D',
        resetView: 'ResetView',
        sizeAdj: 'SizeAdjustment',
        viewAdj: 'ViewAdjustment',
        angleAdj: 'AngleAdjustment',
        pressAver: 'pressAver',
        pressMax: 'pressMax',
        pressMin: 'pressMin',
        pressTotal: 'pressTotal',
        areaTotal: 'areaTotal',
        pointTotal: 'pointTotal',
        pressureCurve: 'Pressure Curve',
        areaCurve: 'Area Curve',
        speed: 'Speed',
        dataCollect: 'Data Collect',
        pressureCenterCurve: 'Pressure Center of Gravity',
        pressureNormalDist: 'Pressure Dist',
        pressureCenter: 'Center',
        μ: 'Mean',
        Var: 'Variance',
        Skew: 'Skewness',
        Kurt: 'Kurtosis',
        endi : 'CAR',
        carY : 'CAR Y',
        reset3D: 'Reset 3D View',
        magnifier: 'Magnifier',
        searchPlaceholder: 'Search...',
        uploadFile: 'Upload File',
        csvImport: 'CSV Import',
        storagePath: 'Storage Path',
        modify: 'Modify',
        open: 'Open',
        save: 'Save',
        notSet: 'Not Set',
        downloadSuccess: 'Download Success',
        clickToOpen: 'Click to open',
        downloadFailed: 'Download Failed',
        deleteSuccess: 'Delete Success',
        deleteFailed: 'Delete Failed',
        selectDataFirst: 'Please select data first',
        twoGroupsSelected: 'Two groups already selected',
        noSimultaneousUse: 'Do not use selection and ruler simultaneously',
        use2DMode: 'Please use in 2D mode',
        modifyInfo: 'Modify Info',
        divPressure: 'Div Pressure',
        pathUpdated: 'Download path updated',
        selected: 'Selected',
        remark: 'Remark',
        uploadSuccess: 'Upload Success',
        downloadPathSelect: 'Download Path',
        startDownload: 'Start Download',
        downloadPathHint: 'Please confirm or modify the download path:',
        browse: 'Browse',
        selectedCount: 'Selected',
        items: 'items',
        downloading: 'Downloading...',
        downloadingHint: 'Exporting data, please wait...',
        downloadedFiles: 'Downloaded files:',
        openFolder: 'Open Folder',
        openDownloadFolder: 'Open download folder',
        close: 'Close',
        noPath: 'Path is empty',
        pressAver: 'Avg Pressure',
        pressMax: 'Max Pressure',
        pressMin: 'Min Pressure',
        pressTotal: 'Press Total',
        areaTotal: 'Area',
        pointTotal: 'Points'
      },
    },
    zh: {
      translation: {
        connect: '连接',
        connecting: '连接中',
        connected: '已连接',
        back: '靠背',
        sit: '坐垫',
        freq: '采集频率',
        history: '历史数据',
        local: '本地数据',
        import: '导入数据',
        filename: '数据名称',
        flip: '画布翻转',
        flipV: '上下翻转',
        flipH: '左右翻转',
        zeroPre: '预压力置零',
        select: '框选工具',
        ruler: '量尺工具',
        upload: '图片上传',
        adjust: '可视化调节',
        blur: '图像润滑',
        colorAdj: '颜色调节',
        denoise: '噪点消除',
        heightAdj: '高度调节',
        continuity: '响应速度',
        frame: '帧',
        collectSettings: '采集参数设置',
        compare: '对比',
        emphSet: '强调设置',
        bedEquip: '床垫',

        download: '下载',
        delete: '删除',
        // ——今天新增/长文字扩写——
        rename: '修改名称',

        car: '人体工学椅',
        hand: '坐垫',
        bed: '床垫',

        untitled: '未命名',
        point3D: '3D模型',
        num2D: '2D数字',
        viewSwitch3D: '3D点图切换视角',
        renameStorage: '修改存储名称',
        storageName: '存储名称',
        handEquip: '坐垫',
        // ——这几个写长一点——
        algoUniform: '点图颜色分布均匀的算法值',
        algoRedBlue: '点图颜色由红到蓝的一个算法值',
        filterNoise: '过滤掉一些小于设置数的噪点',
        pointHeight: '点图在3D空间的高度',
        sensitivity: '点图在传感反应的灵敏度',
        cancel: '取消',
        ok: '确认',
        all: '整体',
        reset3D: '重置3D视图',
        restore: '恢复默认值',
        back2D: '靠背',
        sit2D: '坐垫',
        back3D: '靠背',
        sit3D: '坐垫',
        num3D: '3D数字',
        resetView: '重置视角',
        sizeAdj: '大小调节',
        viewAdj: '视图切换',
        angleAdj: '视角切换',
        pressAver: '平均压力',
        pressMax: '最大压力',
        pressMin: '最小压强',
        pressTotal: '压力总和',
        areaTotal: '面积',
        pointTotal: '点数',
        pressureCurve: '压力总和曲线',
        areaCurve: '面积曲线',
        speed: '倍速',
        dataCollect: '数据采集',
        pressureCenterCurve: '压力重心点',
        pressureNormalDist: '压力正态分布图',
        pressureCenter: '重心相对位置',
        μ: '均值',
        Var: '方差',
        Skew: '偏度',
        Kurt: '峰度',
        endi : '汽车座椅',
        carY : '汽车座椅Y',
        magnifier: '放大镜',
        searchPlaceholder: '搜索...',
        uploadFile: '上传文件',
        csvImport: 'CSV导入',
        storagePath: '存储路径',
        modify: '修改',
        open: '打开',
        save: '保存',
        notSet: '未设置',
        downloadSuccess: '下载成功',
        clickToOpen: '点击打开',
        downloadFailed: '下载失败',
        deleteSuccess: '删除成功',
        deleteFailed: '删除失败',
        selectDataFirst: '请先选择数据',
        twoGroupsSelected: '已经选择两组数据',
        noSimultaneousUse: '请不要同时使用框选和量尺',
        use2DMode: '请在2D模式下使用',
        modifyInfo: '修改信息',
        divPressure: '分压',
        pathUpdated: '下载路径已更新',
        selected: '框选',
        remark: '备注',
        uploadSuccess: '上传成功',
        downloadPathSelect: '下载路径选择',
        startDownload: '开始下载',
        downloadPathHint: '请确认或修改下载保存路径：',
        browse: '浏览',
        selectedCount: '已选择',
        items: '项',
        downloading: '正在下载...',
        downloadingHint: '正在导出数据，请稍候...',
        downloadedFiles: '已下载文件：',
        openFolder: '打开文件夹',
        openDownloadFolder: '打开下载文件夹',
        close: '关闭',
        noPath: '路径为空',
      },
    },
  },
  lng: localStorage.getItem('language') ? localStorage.getItem('language') : 'zh',
});

/**
 * 路由守卫组件：异步检查后端 serial_cache.json 是否有 MAC 配置
 * 没有配置 → 重定向到 /macConfig
 * 有配置 → 渲染子组件
 */
function RequireMacConfig({ children }) {
  const [checking, setChecking] = useState(true)
  const [hasConfig, setHasConfig] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const result = await hasMacConfig()
        if (!cancelled) {
          setHasConfig(result)
          setChecking(false)
        }
      } catch (e) {
        console.warn('[RequireMacConfig] 检查失败:', e.message)
        if (!cancelled) {
          setHasConfig(false)
          setChecking(false)
        }
      }
    }
    check()
    return () => { cancelled = true }
  }, [])

  if (checking) {
    // 加载中显示黑色背景，避免白屏闪烁
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: '#141414',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#666'
      }}>
        正在检查设备配置...
      </div>
    )
  }

  if (!hasConfig) {
    return <Navigate to="/macConfig" replace />
  }
  return children
}

/**
 * 全屏 MAC 配置页面（首次启动时展示）
 */
function MacConfigFullscreen() {
  const [configured, setConfigured] = useState(false)
  const [verified, setVerified] = useState(false)

  const handleBack = useCallback(() => {
    setConfigured(true)
  }, [])

  // 保存后异步验证后端是否确实有配置
  useEffect(() => {
    if (!configured) return
    let cancelled = false
    async function verify() {
      const result = await hasMacConfig()
      if (!cancelled) {
        setVerified(result)
      }
    }
    verify()
    return () => { cancelled = true }
  }, [configured])

  if (configured && verified) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="mac-config-fullscreen">
      <div className="fullscreen-title">
        <h1>传感器系统</h1>
        <p>请输入设备密钥以继续</p>
      </div>
      <MacConfig onBack={handleBack} />
    </div>
  )
}

function App() {
  return (
    <HashRouter>
      <Routes>

        <Route
          path="/data"
          exact
          element={
            <Data i18n={i18next} />
          }
        />

        <Route
          path="/addMac"
          exact
          element={
            <Equip i18n={i18next} />
          }
        />

        <Route
          path="/macConfig"
          exact
          element={
            <MacConfigFullscreen />
          }
        />

        <Route
          exact
          path="/"
          element={
            <RequireMacConfig>
              <Test i18n={i18next} />
            </RequireMacConfig>
          }
        />
      </Routes>
    </HashRouter>
  );
}

export default App;
