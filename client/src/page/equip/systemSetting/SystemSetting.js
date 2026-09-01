import React, { useState, useEffect } from 'react'
import {
    Checkbox, Radio, Input, Button, Card, Table, Tag, Select,
    Space, Divider, Typography, message, Collapse, Tooltip, InputNumber, Spin
} from 'antd';
import {
    SettingOutlined, SaveOutlined, AppstoreOutlined,
    ControlOutlined, FileTextOutlined,
    CopyOutlined, InfoCircleOutlined, LoadingOutlined, ReloadOutlined
} from '@ant-design/icons';
import './index.scss'
import axios from 'axios';
import { localAddress } from '../../../util/constant';
import { useTranslation } from 'react-i18next';
import { buildFallbackParams } from '../../../util/request';
import { getPressureFormulaProfileFromFile, loadPressureRuntimeConfig } from '../../../util/pressureConfig';
import {
    VISUAL_COLOR_SETTING_DEFAULT,
    VISUAL_COLOR_SETTING_MAX,
    VISUAL_COLOR_SETTING_MIN,
    VISUAL_COLOR_SETTING_STEP,
} from '../../../util/visualSettingStorage';

const { Title, Text } = Typography;

/* ────── 系统选项配置 ────── */
const systemOptions = [
    { labelKey: 'systemBed', value: 'bed' },
    { labelKey: 'systemCar', value: 'car' },
    { labelKey: 'systemEndi', value: 'endi' },
    { labelKey: 'systemCarY', value: 'carY' },
    { labelKey: 'systemBigHand', value: 'bigHand' },
    { labelKey: 'systemHand', value: 'hand' },
];

const plainOptions = ['bed', 'car', 'endi', 'carY', 'bigHand', 'hand'];

const systemNameMap = {
    bed: 'systemBed',
    car: 'systemCar',
    endi: 'systemEndi',
    carY: 'systemCarY',
    bigHand: 'systemBigHand',
    hand: 'systemHand'
};

const systemTagColor = {
    bed: 'blue',
    car: 'green',
    endi: 'orange',
    carY: 'gold',
    bigHand: 'purple',
    hand: 'cyan'
};

/* ────── 可调节参数定义 ────── */
const paramConfig = [
    { titleKey: 'paramGauss', key: 'gauss', unit: '', descKey: 'paramGaussDesc' },
    {
        titleKey: 'paramColor',
        key: 'color',
        unit: 'kPa',
        descKey: 'paramColorDesc',
        min: VISUAL_COLOR_SETTING_MIN,
        max: VISUAL_COLOR_SETTING_MAX,
        step: VISUAL_COLOR_SETTING_STEP,
        precision: 2,
    },
    { titleKey: 'paramFilter', key: 'filter', unit: '', descKey: 'paramFilterDesc' },
    { titleKey: 'paramHeight', key: 'height', unit: '', descKey: 'paramHeightDesc' },
    { titleKey: 'paramCoherent', key: 'coherent', unit: '', descKey: 'paramCoherentDesc' }
];

/* ────── 前端硬编码的默认值（后端不可用时的兜底） ────── */
const fallbackConfig = {
    optimalObj: {
        bed:     { gauss: 2, color: VISUAL_COLOR_SETTING_DEFAULT, filter: 30, height: 80, coherent: 1, autoColor: 1 },
        car:     { gauss: 2, color: VISUAL_COLOR_SETTING_DEFAULT, filter: 30, height: 80, coherent: 1, autoColor: 1 },
        endi:    { gauss: 2, color: VISUAL_COLOR_SETTING_DEFAULT, filter: 30, height: 80, coherent: 1, autoColor: 1 },
        carY:    { gauss: 2, color: VISUAL_COLOR_SETTING_DEFAULT, filter: 30, height: 80, coherent: 1, autoColor: 1 },
        bigHand: { gauss: 2, color: VISUAL_COLOR_SETTING_DEFAULT, filter: 30, height: 80, coherent: 1, autoColor: 1 },
        hand:    { gauss: 2, color: VISUAL_COLOR_SETTING_DEFAULT, filter: 30, height: 80, coherent: 1, autoColor: 1 }
    },
    maxObj: {
        bed:     { gauss: 4, color: VISUAL_COLOR_SETTING_MAX, filter: 200, height: 2000, coherent: 10, autoColor: 1 },
        car:     { gauss: 4, color: VISUAL_COLOR_SETTING_MAX, filter: 200, height: 2000, coherent: 10, autoColor: 1 },
        endi:    { gauss: 4, color: VISUAL_COLOR_SETTING_MAX, filter: 200, height: 2000, coherent: 10, autoColor: 1 },
        carY:    { gauss: 4, color: VISUAL_COLOR_SETTING_MAX, filter: 200, height: 2000, coherent: 10, autoColor: 1 },
        bigHand: { gauss: 4, color: VISUAL_COLOR_SETTING_MAX, filter: 200, height: 2000, coherent: 10, autoColor: 1 },
        hand:    { gauss: 4, color: VISUAL_COLOR_SETTING_MAX, filter: 200, height: 2000, coherent: 10, autoColor: 1 },
    }
};

const fallbackPressureConfig = {
    pressureFormulaFile: 'point_pressure_calibration.js',
    pressureFormulaProfile: 'point_pressure_calibration',
};

const CheckboxGroup = Checkbox.Group;

export default function SystemSetting() {
    const { t } = useTranslation();
    const [checkedList, setCheckedList] = useState(plainOptions);
    const checkAll = plainOptions.length === checkedList.length;
    const indeterminate = checkedList.length > 0 && checkedList.length < plainOptions.length;
    const [sysValue, setSysValue] = useState('bed');
    const [config, setConfig] = useState('');
    const [loading, setLoading] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);

    const [inputValue, setInputValue] = useState(fallbackConfig);
    const [pressureConfig, setPressureConfig] = useState(fallbackPressureConfig);
    const [pressureFormulaFiles, setPressureFormulaFiles] = useState([fallbackPressureConfig.pressureFormulaFile]);
    const [pressureSaving, setPressureSaving] = useState(false);

    /* ────── 页面加载时从后端读取默认配置 ────── */
    const loadConfigFromBackend = () => {
        setPageLoading(true);
        setLoadError(false);
        axios.get(`${localAddress}/getSystem`)
            .then((res) => {
                const result = res.data.data;
                if (result) {
                    // 读取默认系统类型
                    if (result.value) {
                        setSysValue(result.value);
                    }
                    // 读取可选系统列表
                    if (result.typeArr && Array.isArray(result.typeArr)) {
                        setCheckedList(result.typeArr);
                    }
                    // 读取 optimalObj 和 maxObj
                    const newInputValue = { optimalObj: {}, maxObj: {} };
                    for (const sysKey of plainOptions) {
                        // optimalObj: 后端数据优先，缺失则用 fallback
                        newInputValue.optimalObj[sysKey] = {
                            ...fallbackConfig.optimalObj[sysKey],
                            ...(result.optimalObj && result.optimalObj[sysKey] ? result.optimalObj[sysKey] : {})
                        };
                        // maxObj: 后端数据优先，缺失则用 fallback
                        newInputValue.maxObj[sysKey] = {
                            ...fallbackConfig.maxObj[sysKey],
                            ...(result.maxObj && result.maxObj[sysKey] ? result.maxObj[sysKey] : {})
                        };
                        newInputValue.maxObj[sysKey].height = Math.max(
                            Number(newInputValue.maxObj[sysKey].height) || 0,
                            fallbackConfig.maxObj[sysKey].height
                        );
                        newInputValue.maxObj[sysKey].filter = Math.max(
                            Number(newInputValue.maxObj[sysKey].filter) || 0,
                            fallbackConfig.maxObj[sysKey].filter
                        );
                    }
                    setInputValue(newInputValue);
                    message.success(t('loadedBackendConfig'));
                }
            })
            .catch((err) => {
                console.warn('load backend config failed, use defaults:', err.message);
                setLoadError(true);
                message.warning(t('backendOfflineUseDefault'));
            })
            .finally(() => {
                setPageLoading(false);
            });
    };

    const loadPressureConfigFromBackend = () => {
        axios.get(`${localAddress}/getPressureConfig`)
            .then((res) => {
                if (res.data?.code !== 0) return;
                const data = res.data?.data || {};
                const pressureFormulaFile = data.config?.pressureFormulaFile || fallbackPressureConfig.pressureFormulaFile;
                const nextPressureConfig = {
                    pressureFormulaFile,
                    pressureFormulaProfile: getPressureFormulaProfileFromFile(pressureFormulaFile),
                };
                setPressureConfig(nextPressureConfig);
                setPressureFormulaFiles(
                    Array.from(new Set([
                        ...(data.formulaFiles || []),
                        nextPressureConfig.pressureFormulaFile,
                    ].filter(Boolean)))
                );
            })
            .catch((err) => {
                console.warn('load pressure config failed:', err.message);
            });
    };

    useEffect(() => {
        loadConfigFromBackend();
        loadPressureConfigFromBackend();
    }, []);

    /* ────── 事件处理 ────── */
    const handleInputChange = (system, paramKey, value) => {
        const obj = JSON.parse(JSON.stringify(inputValue));
        obj.optimalObj[system][paramKey] = value;
        setInputValue(obj);
    };

    const handlePressureConfigChange = (key, value) => {
        setPressureConfig(prev => {
            const next = { ...prev, [key]: value };
            if (key === 'pressureFormulaFile') {
                next.pressureFormulaProfile = getPressureFormulaProfileFromFile(value);
            }
            return next;
        });
    };

    const handleSavePressureConfig = async () => {
        setPressureSaving(true);
        const payload = {
            pressureFormulaFile: pressureConfig.pressureFormulaFile,
            pressureFormulaProfile: getPressureFormulaProfileFromFile(pressureConfig.pressureFormulaFile),
        };
        try {
            const res = await axios({
                method: 'post',
                url: `${localAddress}/setPressureConfig`,
                params: buildFallbackParams({ config: payload }),
                data: { config: payload },
            });
            if (res.data?.code !== 0) {
                throw new Error(res.data?.message || t('pressureConfigSaveFailed'));
            }
            const data = res.data?.data || {};
            const pressureFormulaFile = data.config?.pressureFormulaFile || payload.pressureFormulaFile;
            const nextPressureConfig = {
                pressureFormulaFile,
                pressureFormulaProfile: getPressureFormulaProfileFromFile(pressureFormulaFile),
            };
            setPressureConfig(nextPressureConfig);
            setPressureFormulaFiles(
                Array.from(new Set([
                    ...(data.formulaFiles || pressureFormulaFiles),
                    nextPressureConfig.pressureFormulaFile,
                ].filter(Boolean)))
            );
            await loadPressureRuntimeConfig();
            message.success(t('pressureConfigSaved'));
        } catch (err) {
            message.error(err?.message || t('pressureConfigSaveFailed'));
        } finally {
            setPressureSaving(false);
        }
    };

    const handleGenerate = () => {
        setLoading(true);
        const newObj = {
            value: sysValue,
            typeArr: checkedList,
            ...JSON.parse(JSON.stringify(inputValue))
        };
        for (const objName of ['optimalObj', 'maxObj']) {
            for (const type in newObj[objName]) {
                for (const key in newObj[objName][type]) {
                    newObj[objName][type][key] = Number(newObj[objName][type][key]);
                }
            }
        }
        const payload = { config: newObj };

        axios({
            method: 'post',
            url: `${localAddress}/getSysconfig`,
            params: buildFallbackParams(payload),
            data: payload
        }).then((res) => {
            setConfig(res.data.data);
            message.success(t('configGenerated'));
        }).catch(() => {
            message.error(t('generateFailedCheckBackend'));
        }).finally(() => {
            setLoading(false);
        });
    };

    const handleCopyConfig = () => {
        if (config) {
            navigator.clipboard.writeText(config).then(() => {
                message.success(t('copiedToClipboard'));
            }).catch(() => {
                message.warning(t('copyFailedManual'));
            });
        }
    };

    /* ────── 表格数据 & 列定义 ────── */
    const getTableData = (systemKey) =>
        paramConfig.map((param, index) => ({
            ...param,
            key: index,
            param: t(param.titleKey),
            paramKey: param.key,
            desc: t(param.descKey),
            optimal: inputValue.optimalObj[systemKey][param.key],
        }));

    const getColumns = (systemKey) => [
        {
            title: t('parameter'),
            dataIndex: 'param',
            key: 'param',
            width: 140,
            render: (text, record) => (
                <Space size={4}>
                    <Text strong>{text}</Text>
                    <Tooltip title={record.desc}>
                        <InfoCircleOutlined style={{ color: '#999', fontSize: 12, cursor: 'help' }} />
                    </Tooltip>
                </Space>
            )
        },
        {
            title: t('recommendedValueBest'),
            dataIndex: 'optimal',
            key: 'optimal',
            width: 160,
            render: (value, record) => (
                <InputNumber
                    value={value}
                    size="small"
                    style={{ width: '100%' }}
                    min={record.min}
                    max={record.max}
                    step={record.step ?? (record.paramKey === 'gauss' || record.paramKey === 'height' ? 0.01 : 1)}
                    precision={record.precision}
                    onChange={(val) => handleInputChange(systemKey, record.paramKey, val)}
                />
            )
        }
    ];

    /* ────── 折叠面板 ────── */
    const collapseItems = plainOptions.map((sysKey) => ({
        key: sysKey,
        label: (
            <Space>
                <Tag color={systemTagColor[sysKey]} style={{ marginRight: 0 }}>{t(systemNameMap[sysKey])}</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('adjustableParamCount', { count: paramConfig.length })}
                </Text>
            </Space>
        ),
        children: (
            <Table
                columns={getColumns(sysKey)}
                dataSource={getTableData(sysKey)}
                pagination={false}
                size="small"
                bordered
                className="param-table"
            />
        )
    }));

    /* ────── 渲染 ────── */
    return (
        <div className='sys-setting-container'>
            {/* 页面标题区 */}
            <div className="page-header">
                <Space align="center" size={8}>
                    <SettingOutlined style={{ fontSize: 20, color: '#1677ff' }} />
                    <Title level={4} style={{ margin: 0 }}>{t('sensorSystemConfig')}</Title>
                </Space>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                        {t('sensorSystemConfigDesc')}
                    </Text>
                    {loadError && (
                        <Tag color="warning" style={{ fontSize: 11 }}>{t('offlineMode')}</Tag>
                    )}
                    {!pageLoading && (
                        <Tooltip title={t('reloadBackendConfig')}>
                            <Button
                                type="text"
                                size="small"
                                icon={<ReloadOutlined />}
                                onClick={() => {
                                    loadConfigFromBackend();
                                    loadPressureConfigFromBackend();
                                }}
                                style={{ color: '#1677ff' }}
                            />
                        </Tooltip>
                    )}
                </div>
            </div>

            <Spin spinning={pageLoading} tip={t('loadingBackendConfig')} indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />}>
                {/* 卡片 1：默认系统 & 下拉选项 */}
                <Card
                    size="small"
                    title={<Space><AppstoreOutlined style={{ color: '#1677ff' }} /><span>{t('systemSelection')}</span></Space>}
                    className="setting-card"
                >
                    {/* 默认系统 */}
                    <div className="setting-row">
                        <Text className="setting-label">{t('defaultSystem')}</Text>
                        <Radio.Group
                            onChange={(e) => setSysValue(e.target.value)}
                            value={sysValue}
                            optionType="button"
                            buttonStyle="solid"
                            size="middle"
                        >
                            {systemOptions.map(opt => (
                                <Radio.Button key={opt.value} value={opt.value}>
                                    {t(opt.labelKey)}
                                </Radio.Button>
                            ))}
                        </Radio.Group>
                    </div>

                    <Divider style={{ margin: '12px 0' }} />

                    {/* 下拉可选系统 */}
                    <div className="setting-row">
                        <Text className="setting-label">{t('optionalSystems')}</Text>
                        <div className="checkbox-area">
                            <Checkbox
                                indeterminate={indeterminate}
                                onChange={(e) => setCheckedList(e.target.checked ? plainOptions : [])}
                                checked={checkAll}
                            >
                                {t('selectAll')}
                            </Checkbox>
                            <Divider type="vertical" />
                            <CheckboxGroup
                                options={plainOptions.map(p => ({
                                    label: <Tag color={systemTagColor[p]}>{t(systemNameMap[p])}</Tag>,
                                    value: p
                                }))}
                                value={checkedList}
                                onChange={setCheckedList}
                            />
                        </div>
                    </div>
                </Card>

                {/* 卡片 2：各系统调节参数 */}
                <Card
                    size="small"
                    title={<Space><ControlOutlined style={{ color: '#1677ff' }} /><span>{t('visualAdjustParams')}</span></Space>}
                    extra={
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {t('clickExpandEditParams')}
                        </Text>
                    }
                    className="setting-card"
                >
                    <Collapse
                        items={collapseItems}
                        defaultActiveKey={['bed']}
                        className="system-collapse"
                    />
                </Card>

                <Card
                    size="small"
                    title={<Space><ControlOutlined style={{ color: '#1677ff' }} /><span>{t('pressureCalcParams') || '压强计算参数'}</span></Space>}
                    className="setting-card"
                >
                    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                        <div className="setting-row">
                            <Text className="setting-label">{t('pressureFormulaFile') || '公式文件'}</Text>
                            <Select
                                value={pressureConfig.pressureFormulaFile}
                                style={{ width: 320 }}
                                options={pressureFormulaFiles.map(file => ({ label: file, value: file }))}
                                onChange={(value) => handlePressureConfigChange('pressureFormulaFile', value)}
                            />
                        </div>
                        <div className="setting-row">
                            <Text className="setting-label">{t('pressureFormulaProfile') || '公式版本'}</Text>
                            <Input
                                value={pressureConfig.pressureFormulaProfile}
                                style={{ width: 220 }}
                                readOnly
                            />
                        </div>
                        <div className="setting-row">
                            <Text className="setting-label" />
                            <Button type="primary" icon={<SaveOutlined />} loading={pressureSaving} onClick={handleSavePressureConfig}>
                                {t('savePressureConfig') || '保存压强配置'}
                            </Button>
                        </div>
                    </Space>
                </Card>

                {/* 卡片 3：生成 & 输出 */}
                <Card
                    size="small"
                    title={<Space><FileTextOutlined style={{ color: '#1677ff' }} /><span>{t('generateConfigFile')}</span></Space>}
                    className="setting-card"
                >
                    <Space direction="vertical" style={{ width: '100%' }} size="middle">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <Button
                                type="primary"
                                icon={<SaveOutlined />}
                                onClick={handleGenerate}
                                loading={loading}
                            >
                                {t('generateConfig')}
                            </Button>
                            {config && (
                                <Button icon={<CopyOutlined />} onClick={handleCopyConfig}>
                                    {t('copyToClipboard')}
                                </Button>
                            )}
                            {!config && (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {t('generateConfigHint')}
                                </Text>
                            )}
                        </div>

                        {config && (
                            <div className="config-output">
                                <div className="config-output-header">
                                    <Text style={{ color: '#8caaee', fontSize: 12 }}>{t('configFileContent')}</Text>
                                </div>
                                <pre>{config}</pre>
                            </div>
                        )}
                    </Space>
                </Card>
            </Spin>
        </div>
    )
}
