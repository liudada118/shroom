import React, { useState, useEffect } from 'react'
import {
    Checkbox, Radio, Input, Button, Card, Table, Tag,
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
    { titleKey: 'paramColor', key: 'color', unit: '', descKey: 'paramColorDesc' },
    { titleKey: 'paramFilter', key: 'filter', unit: '', descKey: 'paramFilterDesc' },
    { titleKey: 'paramHeight', key: 'height', unit: '', descKey: 'paramHeightDesc' },
    { titleKey: 'paramCoherent', key: 'coherent', unit: '', descKey: 'paramCoherentDesc' }
];

/* ────── 前端硬编码的默认值（后端不可用时的兜底） ────── */
const fallbackConfig = {
    optimalObj: {
        bed:     { gauss: 2.6, color: 355,  filter: 6,  height: 2.02, coherent: 1 },
        car:     { gauss: 2,   color: 495,  filter: 0,  height: 3.36, coherent: 1 },
        endi:    { gauss: 2,   color: 495,  filter: 0,  height: 3.36, coherent: 1 },
        carY:    { gauss: 2,   color: 495,  filter: 0,  height: 3.36, coherent: 1 },
        bigHand: { gauss: 2,   color: 495,  filter: 0,  height: 3.36, coherent: 1 },
        hand:    { gauss: 2,   color: 495,  filter: 0,  height: 3.36, coherent: 1 }
    },
    maxObj: {
        bed:     { gauss: 4, color: 2000, filter: 20, height: 8, coherent: 10 },
        car:     { gauss: 4, color: 2000, filter: 20, height: 8, coherent: 10 },
        endi:    { gauss: 4, color: 2000, filter: 20, height: 8, coherent: 10 },
        carY:    { gauss: 4, color: 2000, filter: 20, height: 8, coherent: 10 },
        bigHand: { gauss: 4, color: 2000, filter: 20, height: 8, coherent: 10 },
        hand:    { gauss: 4, color: 2000, filter: 20, height: 8, coherent: 10 },
    }
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

    useEffect(() => {
        loadConfigFromBackend();
    }, []);

    /* ────── 事件处理 ────── */
    const handleInputChange = (objType, system, paramKey, value) => {
        const obj = JSON.parse(JSON.stringify(inputValue));
        obj[objType][system][paramKey] = value;
        setInputValue(obj);
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
            key: index,
            param: t(param.titleKey),
            paramKey: param.key,
            desc: t(param.descKey),
            optimal: inputValue.optimalObj[systemKey][param.key],
            max: inputValue.maxObj[systemKey][param.key],
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
                    step={record.paramKey === 'gauss' || record.paramKey === 'height' ? 0.01 : 1}
                    onChange={(val) => handleInputChange('optimalObj', systemKey, record.paramKey, val)}
                />
            )
        },
        {
            title: t('maxValueLimit'),
            dataIndex: 'max',
            key: 'max',
            width: 160,
            render: (value, record) => (
                <InputNumber
                    value={value}
                    size="small"
                    style={{ width: '100%' }}
                    step={record.paramKey === 'gauss' || record.paramKey === 'height' ? 0.01 : 1}
                    onChange={(val) => handleInputChange('maxObj', systemKey, record.paramKey, val)}
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
                                onClick={loadConfigFromBackend}
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
