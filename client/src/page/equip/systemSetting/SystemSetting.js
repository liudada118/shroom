import React, { useState } from 'react'
import {
    Checkbox, Radio, Input, Button, Card, Table, Tag,
    Space, Divider, Typography, message, Collapse, Tooltip, InputNumber
} from 'antd';
import {
    SettingOutlined, SaveOutlined, AppstoreOutlined,
    ControlOutlined, FileTextOutlined,
    CopyOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import './index.scss'
import axios from 'axios';
import { localAddress } from '../../../util/constant';

const { Title, Text } = Typography;

/* ────── 系统选项配置 ────── */
const systemOptions = [
    { label: '床垫', value: 'bed' },
    { label: '汽车座椅', value: 'car' },
    { label: '汽车座椅(endi)', value: 'endi' },
    { label: '大矩阵(bigHand)', value: 'bigHand' },
    { label: '小矩阵(hand)', value: 'hand' },
];

const plainOptions = ['bed', 'car', 'endi', 'bigHand', 'hand'];
const defaultCheckedList = ['bed', 'car', 'endi', 'bigHand', 'hand'];

const systemNameMap = {
    bed: '床垫',
    car: '汽车座椅',
    endi: '汽车座椅(endi)',
    bigHand: '大矩阵(bigHand)',
    hand: '小矩阵(hand)'
};

const systemTagColor = {
    bed: 'blue',
    car: 'green',
    endi: 'orange',
    bigHand: 'purple',
    hand: 'cyan'
};

/* ────── 可调节参数定义 ────── */
const paramConfig = [
    { title: '图像润滑', key: 'gauss', unit: '', desc: '高斯模糊系数，数值越大画面越平滑' },
    { title: '颜色调节', key: 'color', unit: '', desc: '色彩映射范围，控制热力图色阶分布' },
    { title: '噪点消除', key: 'filter', unit: '', desc: '低于该阈值的噪点将被过滤' },
    { title: '高度调节', key: 'height', unit: '', desc: '3D 视图中数据点的高度缩放系数' },
    { title: '响应速度', key: 'coherent', unit: '', desc: '帧间平滑度，数值越大响应越平缓' }
];

const CheckboxGroup = Checkbox.Group;

export default function SystemSetting() {
    const [checkedList, setCheckedList] = useState(defaultCheckedList);
    const checkAll = plainOptions.length === checkedList.length;
    const indeterminate = checkedList.length > 0 && checkedList.length < plainOptions.length;
    const [sysValue, setSysValue] = useState('bed');
    const [config, setConfig] = useState('');
    const [loading, setLoading] = useState(false);

    const [inputValue, setInputValue] = useState({
        optimalObj: {
            bed:     { gauss: 2.6, color: 355,  filter: 6,  height: 2.02, coherent: 1 },
            car:     { gauss: 2,   color: 495,  filter: 0,  height: 3.36, coherent: 1 },
            endi:    { gauss: 2,   color: 495,  filter: 0,  height: 3.36, coherent: 1 },
            bigHand: { gauss: 2,   color: 495,  filter: 0,  height: 3.36, coherent: 1 },
            hand:    { gauss: 2,   color: 495,  filter: 0,  height: 3.36, coherent: 1 }
        },
        maxObj: {
            bed:     { gauss: 4, color: 2000, filter: 20, height: 8, coherent: 10 },
            car:     { gauss: 4, color: 2000, filter: 20, height: 8, coherent: 10 },
            endi:    { gauss: 4, color: 2000, filter: 20, height: 8, coherent: 10 },
            bigHand: { gauss: 4, color: 2000, filter: 20, height: 8, coherent: 10 },
            hand:    { gauss: 4, color: 2000, filter: 20, height: 8, coherent: 10 },
        }
    });

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
        axios({
            method: 'post',
            url: `${localAddress}/getSysconfig`,
            data: { config: newObj }
        }).then((res) => {
            setConfig(res.data.data);
            message.success('配置文件已生成');
        }).catch(() => {
            message.error('生成失败，请检查后端服务是否正常');
        }).finally(() => {
            setLoading(false);
        });
    };

    const handleCopyConfig = () => {
        if (config) {
            navigator.clipboard.writeText(config).then(() => {
                message.success('已复制到剪贴板');
            }).catch(() => {
                message.warning('复制失败，请手动选中复制');
            });
        }
    };

    /* ────── 表格数据 & 列定义 ────── */
    const getTableData = (systemKey) =>
        paramConfig.map((param, index) => ({
            key: index,
            param: param.title,
            paramKey: param.key,
            desc: param.desc,
            optimal: inputValue.optimalObj[systemKey][param.key],
            max: inputValue.maxObj[systemKey][param.key],
        }));

    const getColumns = (systemKey) => [
        {
            title: '参数',
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
            title: '推荐值（最佳）',
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
            title: '上限值（最大）',
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
                <Tag color={systemTagColor[sysKey]} style={{ marginRight: 0 }}>{systemNameMap[sysKey]}</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>
                    共 {paramConfig.length} 项可调参数
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
                    <Title level={4} style={{ margin: 0 }}>传感器系统配置</Title>
                </Space>
                <Text type="secondary" style={{ fontSize: 13, marginTop: 2 }}>
                    在此页面可设置默认系统类型、下拉选项，以及各系统的可视化调节参数范围
                </Text>
            </div>

            {/* 卡片 1：默认系统 & 下拉选项 */}
            <Card
                size="small"
                title={<Space><AppstoreOutlined style={{ color: '#1677ff' }} /><span>系统选择</span></Space>}
                className="setting-card"
            >
                {/* 默认系统 */}
                <div className="setting-row">
                    <Text className="setting-label">默认系统</Text>
                    <Radio.Group
                        onChange={(e) => setSysValue(e.target.value)}
                        value={sysValue}
                        optionType="button"
                        buttonStyle="solid"
                        size="middle"
                    >
                        {systemOptions.map(opt => (
                            <Radio.Button key={opt.value} value={opt.value}>
                                {opt.label}
                            </Radio.Button>
                        ))}
                    </Radio.Group>
                </div>

                <Divider style={{ margin: '12px 0' }} />

                {/* 下拉可选系统 */}
                <div className="setting-row">
                    <Text className="setting-label">可选系统</Text>
                    <div className="checkbox-area">
                        <Checkbox
                            indeterminate={indeterminate}
                            onChange={(e) => setCheckedList(e.target.checked ? plainOptions : [])}
                            checked={checkAll}
                        >
                            全选
                        </Checkbox>
                        <Divider type="vertical" />
                        <CheckboxGroup
                            options={plainOptions.map(p => ({
                                label: <Tag color={systemTagColor[p]}>{systemNameMap[p]}</Tag>,
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
                title={<Space><ControlOutlined style={{ color: '#1677ff' }} /><span>可视化调节参数</span></Space>}
                extra={
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        点击展开对应系统，编辑推荐值与上限值
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
                title={<Space><FileTextOutlined style={{ color: '#1677ff' }} /><span>生成配置文件</span></Space>}
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
                            生成配置
                        </Button>
                        {config && (
                            <Button icon={<CopyOutlined />} onClick={handleCopyConfig}>
                                复制到剪贴板
                            </Button>
                        )}
                        {!config && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                调整好参数后点击"生成配置"，将输出可用的配置内容
                            </Text>
                        )}
                    </div>

                    {config && (
                        <div className="config-output">
                            <div className="config-output-header">
                                <Text style={{ color: '#8caaee', fontSize: 12 }}>配置文件内容</Text>
                            </div>
                            <pre>{config}</pre>
                        </div>
                    )}
                </Space>
            </Card>
        </div>
    )
}
