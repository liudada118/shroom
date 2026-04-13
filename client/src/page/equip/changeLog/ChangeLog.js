import React from 'react'
import { Card, Tag, Timeline, Typography } from 'antd'
import {
  BugOutlined,
  RocketOutlined,
  ToolOutlined,
} from '@ant-design/icons'

const { Title, Text, Paragraph } = Typography

const CHANGE_TYPES = {
  feature: { color: '#52c41a', label: '新功能', icon: <RocketOutlined /> },
  fix: { color: '#ff4d4f', label: '修复', icon: <BugOutlined /> },
  optimize: { color: '#1890ff', label: '优化', icon: <ToolOutlined /> },
}

const changeLogData = [
  {
    version: 'endi1.0.0',
    date: '2026-04-13',
    changes: [
      {
        type: 'feature',
        title: 'CSV 导出表头优化',
        details: [
          '表头改为中文显示（Unicode 转义防乱码）',
          '新增原始最大压强坐标、框选区域最大压强坐标字段',
          '坐标显示为矩阵二维点位置 (行, 列)',
          '去掉压强总和字段',
        ],
      },
      {
        type: 'fix',
        title: '平均压强计算修复',
        details: [
          '修复 aver 返回字符串导致 backYToX/sitYToX 转换函数返回 0 的问题',
        ],
      },
      {
        type: 'fix',
        title: '受力面积计算修复',
        details: [
          '面积计算增加 /100 转换为 cm\u00B2，与前端 ChartsAside 保持一致',
        ],
      },
      {
        type: 'fix',
        title: 'CSV 表头 null 修复',
        details: [
          '修复只连接单个设备时，未连接设备的 type 为 null 导致 CSV 表头显示 null 的问题',
          'parseData 中跳过 type 为 null/undefined 的设备',
          'CSV 导出兜底过滤无效 key',
        ],
      },
      {
        type: 'optimize',
        title: '靠背 2D 颜色统一',
        details: [
          '靠背 NumThreeColorV4 颜色映射从 jetWhite3 改为 jet，与座椅 V3 保持一致',
        ],
      },
      {
        type: 'fix',
        title: '回放曲线颜色修复',
        details: [
          '曲线颜色从按索引分配改为按 key 名称匹配，确保 back/sit 颜色在实时和回放时一致',
        ],
      },
      {
        type: 'fix',
        title: '回放框选区域展示修复',
        details: [
          '回放历史数据时自动加载已保存的框选信息到 historySelectCache',
          '替换 DataService.js 为 yanfeng 版本，使用 getPlaybackSnapshot 注入 select 数据',
        ],
      },
      {
        type: 'fix',
        title: '靠背采集时间 NaN 修复',
        details: [
          '修复只连接靠背时 stamp 获取逻辑，遍历所有 key 找到第一个有效 stamp',
        ],
      },
      {
        type: 'fix',
        title: 'initDb async 修复',
        details: [
          '修复 initDb 改为 async 后调用方未 await 导致数据库句柄为 undefined 的问题',
          '影响 serialServer.js 和 routes.js 中的 getSystem/selectSystem/changeSystemType',
        ],
      },
      {
        type: 'optimize',
        title: '框选 z-index 调整',
        details: [
          '框选区域 z-index 从 10001 降低到 999，确保下载弹窗（Modal）不被遮挡',
        ],
      },
      {
        type: 'optimize',
        title: '同步 yanfeng 分支功能',
        details: [
          '同步 CSV 下载、一键连接、框选、采集等核心逻辑',
          '新增 request.js API 工具函数',
          '数据库损坏自动恢复、可写目录自动回退',
        ],
      },
    ],
  },
]

export default function ChangeLog() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Typography>
        <Title level={3} style={{ marginBottom: 24 }}>更新日志</Title>
      </Typography>

      {changeLogData.map((release) => (
        <Card
          key={release.version}
          style={{ marginBottom: 24, borderRadius: 8 }}
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Tag color="#108ee9" style={{ fontSize: 16, padding: '2px 12px', fontWeight: 'bold' }}>
                {release.version}
              </Tag>
              <Text type="secondary">{release.date}</Text>
            </div>
          }
        >
          <Timeline
            items={release.changes.map((change, idx) => {
              const typeConfig = CHANGE_TYPES[change.type] || CHANGE_TYPES.optimize
              return {
                key: idx,
                dot: typeConfig.icon,
                color: typeConfig.color,
                children: (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Tag color={typeConfig.color} style={{ margin: 0 }}>{typeConfig.label}</Tag>
                      <Text strong>{change.title}</Text>
                    </div>
                    <ul style={{ margin: '4px 0 0 0', paddingLeft: 20, color: '#666' }}>
                      {change.details.map((d, i) => (
                        <li key={i} style={{ fontSize: 13, lineHeight: '22px' }}>{d}</li>
                      ))}
                    </ul>
                  </div>
                ),
              }
            })}
          />
        </Card>
      ))}
    </div>
  )
}
