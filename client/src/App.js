import logo from './logo.svg';
import './App.css';
import { HashRouter, Route, Routes, Navigate } from 'react-router-dom';
import React, { useState, useCallback, useEffect } from 'react';
import { ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import Test from './page/test/Test';
import './locale/index'; // 在这里导入
import i18next from "i18next";
import { useTranslation } from 'react-i18next';
import Equip from './page/equip/Equip';
import Data from './page/data/Data';
import MacConfig, { hasMacConfig } from './page/equip/macConfig/MacConfig';
import CopReport from './page/report/CopReport';

const MAC_FULLSCREEN_COPY = {
  zh: {
    title: '传感器系统',
    subtitle: '请输入设备密钥以继续',
    exit: '返回主页面',
  },
  en: {
    title: 'Sensor System',
    subtitle: 'Enter the device key to continue',
    exit: 'Back to Main',
  },
}

const getLanguageKey = (language) => String(language || '').toLowerCase().startsWith('en') ? 'en' : 'zh'

i18next.init({
  resources: {
    en: {
      translation: {
        connect: 'Connect',
        connecting: 'Connecting',
        autoConnecting: 'Connecting to device...',
        connected: 'Connected',
        reconnecting: 'Reconnecting...',
        reconnectTooltip: 'Reconnect (clean dead ports / zombie devices first)',
        disconnectAllPorts: 'Disconnect all serial ports',
        noSerialDevice: 'No device detected',
        connectFailed: 'Connection failed',
        deviceMacConfig: 'Device MAC Address Settings',
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
        rotate90: 'Rotate 90° CW',
        zeroPre: 'Zero',
        cancelZero: 'Cancel Zero',
        select: 'Select',
        ruler: 'Ruler',
        upload: 'Upload',
        adjust: 'Adjust',
        blur: 'GaussianBlur',
        colorAdj: 'ColorAdj',
        autoColorAdj: 'Auto adjust',
        currentDataMax: 'Current Max',
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
        generateReport: 'Report',
        startReport: 'Generate',
        selectOneReportData: 'Please select one history record',
        reportExportSuccess: 'PDF exported',
        reportExportFailed: 'PDF export failed',
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
        resetView: 'Reset View',
        resetViewTip: 'Reset 3D and 2D views',
        sizeAdj: 'SizeAdjustment',
        viewAdj: 'ViewAdjustment',
        angleAdj: 'AngleAdjustment',
        pressureCurve: 'Total Pressure Curve',
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
        noFileSelected: 'No file selected',
        contrastRecordPair: 'Records',
        contrastSingleRecordTime: 'Time',
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
        openFolderFailed: 'Failed to open folder',
        openFileFailed: 'Failed to open file',
        grayValue: 'Gray Value',
        pressureValue: 'Pressure Value',
        probabilityDensity: 'Probability Density',
        boxShort: 'Box',
        boxSelection: 'Selection',
        selectionDefaultName: 'Selection {{index}}',
        pointUnit: '',
        areaUnit: 'cm²',
        pressureUnit: 'kPa',
        validMeasurementArea: 'Please measure within the valid area',
        validSelectionArea: 'Please select within the valid area',
        maxSelectionBoxes: 'A maximum of {{count}} selection areas can be created',
        collectStart: 'Collection started',
        collectSuccess: 'Collection completed',
        collectFailed: 'Collection failed',
        playbackFileRequired: 'Please select a playback file',
        zoomOut: 'Zoom out',
        resetZoom: 'Reset zoom',
        zoomIn: 'Zoom in',
        sensorArea: 'Sensor Area',
        sensorPressure: 'Sensor Pressure',
        choosingDataFile: 'Choose Data File',
        csvImportInvalid: 'Invalid file format. Please select a CSV file exported by this system',
        framePerSecond: 'frames/sec',
        checkingDeviceConfig: 'Checking device configuration...',
        pointConfigTitle: 'Point Configuration',
        backWithCode: 'Back (back)',
        sitWithCode: 'Seat (sit)',
        copyConfigCode: 'Copy Configuration Code',
        deviceHand: 'Glove',
        deviceSeat: 'Seat Pad',
        deviceFoot: 'Foot Pad',
        deviceUnknown: 'Unknown',
        statusDisconnected: 'Disconnected',
        statusDetecting: 'Detecting',
        statusReading: 'Reading',
        statusDone: 'Done',
        statusError: 'Error',
        error: 'Error',
        requestFailed: 'Request failed',
        macReaderTitle: 'MAC Address Reader',
        serialConnection: 'Serial Connection',
        baudRateDetectList: 'Baud rate detection list:',
        readConnectedMac: 'Read Connected Device MAC',
        reading: 'Reading...',
        standaloneReadMac: 'Standalone Detect & Read MAC (when disconnected)',
        instructions: 'Instructions',
        methodRecommended: 'Method 1 (Recommended):',
        macHelpStep1: '1. Click “One-click Connect” on the main page first',
        macHelpStep2: '2. Enter this page after the connection succeeds',
        macHelpStep3: '3. Click “Read Connected Device MAC”',
        methodStandalone: 'Method 2 (When Disconnected):',
        macHelpStandalone1: '1. Connect the device to the computer via USB',
        macHelpStandalone2: '2. Click “Standalone Detect & Read MAC”',
        macHelpStandalone3: '3. Wait for automatic baud-rate detection and MAC reading',
        baudRate: 'Baud Rate',
        readResults: 'Read Results',
        clickToCopy: 'Click to copy',
        deviceRemark: 'Device Remark',
        expireDate: 'Expiration Date',
        deviceModel: 'Device Model',
        modifyDevice: 'Modify Device',
        bindDevice: 'Bind Device',
        bindSuccess: 'Bind successful',
        bindFailed: 'Bind failed',
        modifySuccess: 'Modified successfully',
        modifyFailed: 'Modification failed',
        copiedToClipboard: 'Copied to clipboard',
        copyFailed: 'Copy failed',
        communicationLogs: 'Communication Logs',
        clear: 'Clear',
        waitingOperation: 'Waiting for operation...',
        readingConnectedMac: 'Reading MAC address from existing connection...',
        standaloneDetectingMac: 'Standalone mode: automatically detecting baud rate and reading MAC...',
        systemBed: 'Mattress',
        systemCar: 'Car Seat',
        systemEndi: 'Car Seat (endi)',
        systemCarY: 'Car Seat Y',
        systemBigHand: 'Large Matrix (bigHand)',
        systemHand: 'Small Matrix (hand)',
        paramGauss: 'Image Smoothing',
        paramGaussDesc: 'Gaussian blur coefficient. A larger value makes the image smoother.',
        paramColor: 'Color Adjustment',
        paramColorDesc: 'Color mapping range. Controls the heatmap color-scale distribution.',
        paramFilter: 'Noise Filtering',
        paramFilterDesc: 'Noise below this threshold will be filtered out.',
        paramHeight: 'Height Adjustment',
        paramHeightDesc: 'Height scaling factor for data points in the 3D view.',
        paramCoherent: 'Response Speed',
        paramCoherentDesc: 'Inter-frame smoothing. A larger value makes the response smoother.',
        loadedBackendConfig: 'Configuration loaded from backend',
        backendOfflineUseDefault: 'Backend service is not connected. Local defaults are used.',
        configGenerated: 'Configuration file generated',
        generateFailedCheckBackend: 'Generation failed. Please check whether the backend service is running.',
        copyFailedManual: 'Copy failed. Please select and copy manually.',
        parameter: 'Parameter',
        recommendedValueBest: 'Default Value',
        maxValueLimit: 'Limit Value (Max)',
        adjustableParamCount: '{{count}} adjustable parameters',
        sensorSystemConfig: 'Sensor System Configuration',
        sensorSystemConfigDesc: 'Set the default system type, dropdown options, and visualization parameter ranges for each system on this page.',
        offlineMode: 'Offline Mode',
        reloadBackendConfig: 'Reload configuration from backend',
        loadingBackendConfig: 'Loading configuration from backend...',
        systemSelection: 'System Selection',
        defaultSystem: 'Default System',
        optionalSystems: 'Optional Systems',
        selectAll: 'Select All',
        visualAdjustParams: 'Visualization Parameters',
        pressureCalcParams: 'Pressure Calculation Parameters',
        backValueMultiplier: 'Back Multiplier',
        pressureFormulaFile: 'Formula File',
        pressureFormulaProfile: 'Formula Profile',
        savePressureConfig: 'Save Pressure Config',
        pressureConfigSaved: 'Pressure configuration saved',
        pressureConfigSaveFailed: 'Failed to save pressure configuration',
        clickExpandEditParams: 'Expand a system to edit default visualization values',
        generateConfigFile: 'Generate Configuration File',
        generateConfig: 'Generate Configuration',
        copyToClipboard: 'Copy to Clipboard',
        generateConfigHint: 'After adjusting parameters, click “Generate Configuration” to output usable configuration content.',
        configFileContent: 'Configuration File Content',
        measureInValidArea: 'Please measure within the valid area',
        useIn2DMode: 'Please use this feature in 2D mode',
        maxSelectBoxes: 'You can create up to {{count}} selection areas',
        selectInValidArea: 'Please select within the valid area',
        macAddress: 'MAC Address',
        deviceType: 'Device Type',
        pressAver: 'Avg Pressure',
        pressMax: 'Max Pressure',
        pressMin: 'Min Pressure',
        pressTotal: 'Total Pressure',
        total: 'Total Pressure',
        areaTotal: 'Area',
        pointTotal: 'Points',
        timeFrame: 'Time (Frame)',
        value: 'Value',
        pressureTotalAxis: 'Total Pressure (N)',
        pointsAxis: 'Points',
        inputPath: 'Enter storage path...',
        startCompare: 'Start Compare',
        compareDataNotReady: 'Data cannot be compared',
        compareStartFailed: 'Failed to start comparison',
        selectBaseDataFirst: 'Please select baseline data A first.',
        selectCompareDataFirst: 'Please select comparison data B first.',
        compareSameRecordInvalid: 'A and B cannot be the same history record.',
        selectionUnsupportedView: 'The current view does not support selection',
        completeSelectionCoordinates: 'Please fill in all coordinates',
        selectionCoordinatesMustBeNumbers: 'Coordinates must be numbers',
        selectionCoordinatesMustBeIntegers: 'Coordinates must be integers',
        selectionCoordinatesMinZero: 'Coordinates cannot be less than 0',
        selectionTooSmall: 'Selection area is too small. Please select again',
        selectionXOutOfRange: 'X({{x}}) + Length({{w}}) exceeds horizontal sensor points ({{maxW}})',
        selectionYOutOfRange: 'Y({{y}}) + Width({{h}}) exceeds vertical sensor points ({{maxH}})',
        createSelectionFirst: 'Please create a selection area first',
        enterTemplateName: 'Please enter a template name',
        noSelectionToSave: 'No selection area can be saved',
        templateSaved: 'Template saved',
        templateNotForCurrentView: 'The template is not applicable to the current view',
        templateApplied: 'Template applied',
        applyTemplateOverwriteTitle: 'Applying this template will overwrite the current selection',
        continueQuestion: 'Continue?',
        overwrite: 'Overwrite',
        selectTemplate: 'Please select a template',
        deleteSelectionTemplate: 'Delete selection template',
        deleteTemplateConfirm: 'Delete "{{name}}"? The current canvas selection will not be cleared.',
        templateDeleted: 'Template deleted',
        templateNameExists: 'Template name already exists',
        overwriteTemplateConfirm: 'A template named "{{name}}" already exists. Overwrite it?',
        selectionRegion: 'Regions',
        clearAll: 'Clear',
        manualAddSelection: 'Add Rect',
        add: 'Add',
        selectionTemplate: 'Templates',
        templateName: 'Name',
        saveTemplate: 'Save',
        renameTemplate: 'Rename',
        templateRenamed: 'Template renamed',
        chooseTemplate: 'Select',
        noData: 'No data',
        templateMismatch: 'N/A',
        applyTemplate: 'Apply',
        deleteTemplate: 'Delete',
        selectionTipX: 'X: horizontal start point (from 0)',
        selectionTipY: 'Y: vertical start point (from 0)',
        selectionTipLength: 'Length: horizontal point count',
        selectionTipWidth: 'Width: vertical point count',
        selectionTipLimit: 'Up to 4 selections, X + Length <= {{width}}, Y + Width <= {{height}}',
        horizontalStart: 'X start',
        verticalStart: 'Y start',
        horizontalPoints: 'Len',
        verticalPoints: 'Wid',
        collectingDirectionLocked: 'Direction cannot be changed while collecting. Stop collection first.',
        noValidPressureMatrix: 'No valid pressure matrix. Cannot zero.',
        zeroSyncFailed: 'Zero state sync failed. Collection data may not record the zero baseline.',
        duplicateConnectionOperation: 'The device is connecting or already connected. Please do not repeat the operation.',
        deviceConnectingWait: 'The device is connecting. Please try again later.',
        connectTimeoutCheckDevice: 'Connection timed out. Please re-plug the device and try again.',
        connectFailedCheckDevice: 'Connection failed. Please check the device and try again.',
        reconnectFailedCheckDevice: 'Reconnect failed. Please check the device and try again.',
        disconnectFailed: 'Disconnect failed',
        selectCorrectSensorType: 'Please select the correct sensor type first',
        replaySelectionNo3D: 'This playback data contains selections and does not support 3D view',
        missingDisplayData: 'No {{label}} data available',
        missingSeatOrBackData: 'No seat or back data available',
        seatPad: 'Seat',
        backPad: 'Back',
        jacketPad: 'Jacket',
        leftHandPad: 'Left Hand',
        rightHandPad: 'Right Hand',
        leftFootPad: 'Left Foot',
        rightFootPad: 'Right Foot',
        jacket2D: 'Jacket',
        leftHand2D: 'Left Hand',
        rightHand2D: 'Right Hand',
        leftFoot2D: 'Left Foot',
        rightFoot2D: 'Right Foot',
        selectionCoordinatesInvalid: 'Invalid selection area',
        selectionOutOfValidRange: 'Selection area is out of the valid range',
        selectionPositionCalcFailed: 'Unable to calculate selection position',
        maxRulers: 'Up to {{count}} rulers are supported',
        allDevicesDisconnected: 'All devices disconnected',
        deviceDisconnectedSuffix: 'disconnected',
        deviceDisconnected: 'Device disconnected',
      },
    },
    zh: {
      translation: {
        connect: '连接',
        connecting: '连接中',
        autoConnecting: '正在连接设备...',
        connected: '已连接',
        reconnecting: '重新连接中...',
        reconnectTooltip: '重新连接（清理死端口/僵尸设备后重连）',
        disconnectAllPorts: '断开所有串口连接',
        noSerialDevice: '未检测到设备',
        connectFailed: '连接失败',
        deviceMacConfig: '设备 MAC 地址配置',
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
        rotate90: '顺时针旋转90°',
        zeroPre: '预压力置零',
        cancelZero: '取消置零',
        select: '框选工具',
        ruler: '量尺工具',
        upload: '图片上传',
        adjust: '可视化调节',
        blur: '图像润滑',
        colorAdj: '颜色调节',
        autoColorAdj: '自动调节',
        currentDataMax: '当前最大值',
        denoise: '噪点消除',
        heightAdj: '高度调节',
        continuity: '响应速度',
        frame: '帧',
        collectSettings: '采集参数设置',
        compare: '对比',
        emphSet: '强调设置',
        bedEquip: '床垫',

        download: '下载',
        generateReport: '生成报告',
        startReport: '生成报告',
        selectOneReportData: '请选择一条历史数据生成报告',
        reportExportSuccess: 'PDF 已导出',
        reportExportFailed: 'PDF 导出失败',
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
        resetView: '重置视图',
        resetViewTip: '重置3D视图和2D数字视图',
        sizeAdj: '大小调节',
        viewAdj: '视图切换',
        angleAdj: '视角切换',
        pressAver: '平均压强',
        pressMax: '最大压强',
        pressMin: '最小压强',
        pressTotal: '压力总和',
        total: '压力总和',
        areaTotal: '面积',
        pointTotal: '点数',
        timeFrame: '时间(帧)',
        value: '数值',
        pressureTotalAxis: '压力总和(N)',
        pointsAxis: '点数(个)',
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
        noFileSelected: '未选择文件',
        contrastRecordPair: '跨记录',
        contrastSingleRecordTime: '同记录时间',
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
        openFolderFailed: '打开文件夹失败',
        openFileFailed: '打开文件失败',
        grayValue: '灰度值',
        pressureValue: '压力值',
        probabilityDensity: '概率密度',
        boxShort: '框',
        boxSelection: '框选',
        selectionDefaultName: '框选{{index}}',
        pointUnit: '个',
        areaUnit: 'cm²',
        pressureUnit: 'Kpa',
        validMeasurementArea: '请在有效区域内测量',
        validSelectionArea: '请在有效区域内框选',
        maxSelectionBoxes: '最多只能创建 {{count}} 个框选区域',
        collectStart: '开始采集',
        collectSuccess: '采集成功',
        collectFailed: '采集失败',
        playbackFileRequired: '请选择回放文件',
        zoomOut: '缩小',
        resetZoom: '重置',
        zoomIn: '放大',
        sensorArea: '传感面积',
        sensorPressure: '传感压力',
        choosingDataFile: '选择数据文件',
        csvImportInvalid: '导入文件格式不正确，请选择系统导出的CSV文件',
        framePerSecond: '帧/秒',
        checkingDeviceConfig: '正在检查设备配置...',
        pointConfigTitle: '点位配置',
        backWithCode: '靠背 (back)',
        sitWithCode: '坐垫 (sit)',
        copyConfigCode: '复制配置代码',
        deviceHand: '手套',
        deviceSeat: '坐垫',
        deviceFoot: '脚垫',
        deviceUnknown: '未知',
        statusDisconnected: '未连接',
        statusDetecting: '探测中',
        statusReading: '读取中',
        statusDone: '完成',
        statusError: '错误',
        error: '错误',
        requestFailed: '请求失败',
        macReaderTitle: 'MAC 地址读取',
        serialConnection: '串口连接',
        baudRateDetectList: '探测波特率列表：',
        readConnectedMac: '读取已连接设备 MAC',
        reading: '读取中...',
        standaloneReadMac: '独立探测 & 读取 MAC（未连接时用）',
        instructions: '使用说明',
        methodRecommended: '方式一（推荐）：',
        macHelpStep1: '1. 先在主页面点击“一键连接”',
        macHelpStep2: '2. 连接成功后进入此页面',
        macHelpStep3: '3. 点击“读取已连接设备 MAC”',
        methodStandalone: '方式二（未连接时）：',
        macHelpStandalone1: '1. 将设备通过 USB 连接到电脑',
        macHelpStandalone2: '2. 点击“独立探测 & 读取 MAC”',
        macHelpStandalone3: '3. 等待自动探测波特率和读取 MAC',
        baudRate: '波特率',
        readResults: '读取结果',
        clickToCopy: '点击复制',
        deviceRemark: '设备备注',
        expireDate: '截止日期',
        deviceModel: '设备型号',
        modifyDevice: '修改设备',
        bindDevice: '绑定设备',
        bindSuccess: '绑定成功',
        bindFailed: '绑定失败',
        modifySuccess: '修改成功',
        modifyFailed: '修改失败',
        copiedToClipboard: '已复制到剪贴板',
        copyFailed: '复制失败',
        communicationLogs: '通信日志',
        clear: '清空',
        waitingOperation: '等待操作...',
        readingConnectedMac: '通过已有连接读取 MAC 地址...',
        standaloneDetectingMac: '独立模式：自动探测波特率 & 读取 MAC...',
        systemBed: '床垫',
        systemCar: '汽车座椅',
        systemEndi: '汽车座椅(endi)',
        systemCarY: '汽车座椅Y',
        systemBigHand: '大矩阵(bigHand)',
        systemHand: '小矩阵(hand)',
        paramGauss: '图像润滑',
        paramGaussDesc: '高斯模糊系数，数值越大画面越平滑',
        paramColor: '颜色调节',
        paramColorDesc: '色彩映射范围，控制热力图色阶分布',
        paramFilter: '噪点消除',
        paramFilterDesc: '低于该阈值的噪点将被过滤',
        paramHeight: '高度调节',
        paramHeightDesc: '3D 视图中数据点的高度缩放系数',
        paramCoherent: '响应速度',
        paramCoherentDesc: '帧间平滑度，数值越大响应越平缓',
        loadedBackendConfig: '已从后端加载配置',
        backendOfflineUseDefault: '后端服务未连接，使用本地默认值',
        configGenerated: '配置文件已生成',
        generateFailedCheckBackend: '生成失败，请检查后端服务是否正常',
        copyFailedManual: '复制失败，请手动选中复制',
        parameter: '参数',
        recommendedValueBest: '默认值',
        maxValueLimit: '上限值（最大）',
        adjustableParamCount: '共 {{count}} 项可调参数',
        sensorSystemConfig: '传感器系统配置',
        sensorSystemConfigDesc: '在此页面可设置默认系统类型、下拉选项，以及各系统的可视化调节参数范围',
        offlineMode: '离线模式',
        reloadBackendConfig: '重新从后端加载配置',
        loadingBackendConfig: '正在从后端加载配置...',
        systemSelection: '系统选择',
        defaultSystem: '默认系统',
        optionalSystems: '可选系统',
        selectAll: '全选',
        visualAdjustParams: '可视化调节参数',
        pressureCalcParams: '压强计算参数',
        backValueMultiplier: '靠背乘数',
        pressureFormulaFile: '公式文件',
        pressureFormulaProfile: '公式版本',
        savePressureConfig: '保存压强配置',
        pressureConfigSaved: '压强配置已保存',
        pressureConfigSaveFailed: '保存压强配置失败',
        clickExpandEditParams: '点击展开对应系统，编辑可视化默认值',
        generateConfigFile: '生成配置文件',
        generateConfig: '生成配置',
        copyToClipboard: '复制到剪贴板',
        generateConfigHint: '调整好参数后点击“生成配置”，将输出可用的配置内容',
        configFileContent: '配置文件内容',
        measureInValidArea: '请在有效区域内测量',
        useIn2DMode: '请在2D模式下使用',
        maxSelectBoxes: '最多只能创建 {{count}} 个框选区域',
        selectInValidArea: '请在有效区域内框选',
        macAddress: 'MAC地址',
        deviceType: '设备类型',
        inputPath: '输入存储路径...',
        startCompare: '开始对比',
        compareDataNotReady: '数据不可对比',
        compareStartFailed: '开始对比失败',
        selectBaseDataFirst: '请先选择基准数据 A。',
        selectCompareDataFirst: '请先选择对比数据 B。',
        compareSameRecordInvalid: 'A 和 B 不能是同一条历史记录。',
        selectionUnsupportedView: '当前视图不支持框选',
        completeSelectionCoordinates: '请填写完整坐标',
        selectionCoordinatesMustBeNumbers: '坐标必须为数字',
        selectionCoordinatesMustBeIntegers: '坐标必须为整数',
        selectionCoordinatesMinZero: '坐标不能小于 0',
        selectionTooSmall: '框选区域过小，请重新框选',
        selectionXOutOfRange: 'X({{x}}) + 长({{w}}) 超过横向传感点数({{maxW}})',
        selectionYOutOfRange: 'Y({{y}}) + 宽({{h}}) 超过纵向传感点数({{maxH}})',
        createSelectionFirst: '请先创建框选区域',
        enterTemplateName: '请输入模板名称',
        noSelectionToSave: '当前没有可保存的框选区域',
        templateSaved: '模板保存成功',
        templateNotForCurrentView: '模板不适用于当前视图',
        templateApplied: '模板已应用',
        applyTemplateOverwriteTitle: '应用模板会覆盖当前框选',
        continueQuestion: '是否继续？',
        overwrite: '覆盖',
        selectTemplate: '请选择模板',
        deleteSelectionTemplate: '删除框选模板',
        deleteTemplateConfirm: '确认删除「{{name}}」？当前画布框选不会被清除。',
        templateDeleted: '模板已删除',
        templateNameExists: '模板名称已存在',
        overwriteTemplateConfirm: '已存在同名模板「{{name}}」，是否覆盖原有模板？',
        selectionRegion: '框选区域',
        clearAll: '清除全部',
        manualAddSelection: '手动添加框选',
        add: '添加',
        selectionTemplate: '框选模板',
        templateName: '模板名称',
        saveTemplate: '保存模板',
        renameTemplate: '重命名模板',
        templateRenamed: '模板已重命名',
        chooseTemplate: '选择模板',
        noData: '暂无数据',
        templateMismatch: '不匹配',
        applyTemplate: '应用模板',
        deleteTemplate: '删除模板',
        selectionTipX: 'X: 横向起点（从0开始）',
        selectionTipY: 'Y: 纵向起点（从0开始）',
        selectionTipLength: '长: 框选横向点数',
        selectionTipWidth: '宽: 框选纵向点数',
        selectionTipLimit: '最多4个框选，X+长 ≤ {{width}}，Y+宽 ≤ {{height}}',
        horizontalStart: '横向起点',
        verticalStart: '纵向起点',
        horizontalPoints: '横向点数',
        verticalPoints: '纵向点数',
        collectingDirectionLocked: '采集中禁止翻转/旋转，请停止采集后再修改方向',
        noValidPressureMatrix: '暂无有效压力矩阵，不能置零',
        zeroSyncFailed: '置零状态同步失败，采集数据可能不会记录置零口径',
        duplicateConnectionOperation: '设备正在连接或已连接，请勿重复操作',
        deviceConnectingWait: '设备正在连接，请稍后再试',
        connectTimeoutCheckDevice: '连接超时，请重新插拔设备后重试',
        connectFailedCheckDevice: '连接失败，请检查设备后重试',
        reconnectFailedCheckDevice: '重新连接失败，请检查设备后重试',
        disconnectFailed: '断开连接失败',
        selectCorrectSensorType: '请先选择正确的传感器类型',
        replaySelectionNo3D: '当前回放数据带有框选，不支持 3D 视图',
        missingDisplayData: '当前没有{{label}}数据',
        missingSeatOrBackData: '当前没有坐垫或靠背数据',
        seatPad: '坐垫',
        backPad: '靠背',
        jacketPad: '外套',
        leftHandPad: '左手',
        rightHandPad: '右手',
        leftFootPad: '左脚',
        rightFootPad: '右脚',
        jacket2D: '外套',
        leftHand2D: '左手',
        rightHand2D: '右手',
        leftFoot2D: '左脚',
        rightFoot2D: '右脚',
        selectionCoordinatesInvalid: '框选区域无效',
        selectionOutOfValidRange: '框选区域超出有效范围',
        selectionPositionCalcFailed: '无法计算框选位置',
        maxRulers: '最多支持 {{count}} 条量尺',
        allDevicesDisconnected: '全部设备断开',
        deviceDisconnectedSuffix: '已断开',
        deviceDisconnected: '设备断开',
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
        {i18next.t('checkingDeviceConfig')}
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
  const { i18n } = useTranslation()
  const copy = MAC_FULLSCREEN_COPY[getLanguageKey(i18n.language || localStorage.getItem('language'))]
  const [configured, setConfigured] = useState(false)
  const [verified, setVerified] = useState(false)
  const [hasExistingConfig, setHasExistingConfig] = useState(false)

  const handleBack = useCallback(() => {
    setConfigured(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function checkExistingConfig() {
      try {
        const result = await hasMacConfig()
        if (!cancelled) {
          setHasExistingConfig(result)
        }
      } catch (e) {
        if (!cancelled) {
          setHasExistingConfig(false)
        }
      }
    }
    checkExistingConfig()
    return () => { cancelled = true }
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
      {hasExistingConfig && (
        <button type="button" className="mac-fullscreen-exit" onClick={handleBack}>
          {copy.exit}
        </button>
      )}
      <div className="fullscreen-title">
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
      </div>
      <MacConfig onBack={handleBack} showBackButton={hasExistingConfig} />
    </div>
  )
}

function App() {
  const { i18n } = useTranslation()
  const antdLocale = getLanguageKey(i18n.language || localStorage.getItem('language')) === 'en' ? enUS : zhCN

  return (
    <ConfigProvider locale={antdLocale} theme={{ token: { zIndexPopupBase: 200000 } }}>
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
            path="/copReport"
            exact
            element={
              <CopReport />
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
    </ConfigProvider>
  );
}

export default App;
