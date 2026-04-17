import React, { useState } from 'react';
import { PlusCircleOutlined, UnorderedListOutlined, SettingOutlined, FileTextOutlined, WifiOutlined } from '@ant-design/icons';
import { Menu, Layout } from 'antd';
import Addequip from './addEquip/Addequip';
import EquipList from './equipList/EquipList';
import SystemSetting from './systemSetting/SystemSetting';
import ChangeLog from './changeLog/ChangeLog';
import MacConfig from './macConfig/MacConfig';

const { Sider, Content } = Layout;

const items = [
    {
        key: 'grp',
        label: '设备管理',
        type: 'group',
        children: [
            { key: '0', label: '设备添加', icon: <PlusCircleOutlined /> },
            { key: '1', label: '设备列表', icon: <UnorderedListOutlined /> },
            { key: '2', label: '配置系统', icon: <SettingOutlined /> },
            { key: '3', label: '更新日志', icon: <FileTextOutlined /> },
            { key: '4', label: 'MAC地址配置', icon: <WifiOutlined /> },
        ],
    },
];

const componentArr = {
    0: <Addequip />,
    1: <EquipList />,
    2: <SystemSetting />,
    3: <ChangeLog />,
    4: <MacConfig />
}

const App = () => {
    const [key, setKey] = useState('2')
    const onClick = e => {
        setKey(e.key)
    };
    return (
        <Layout style={{ minHeight: '100vh', background: '#f5f7fa' }}>
            <Sider
                width={200}
                style={{
                    background: '#fff',
                    borderRight: '1px solid #f0f0f0',
                    boxShadow: '2px 0 8px rgba(0,0,0,0.04)'
                }}
            >
                <Menu
                    onClick={onClick}
                    style={{ borderRight: 'none', paddingTop: 8 }}
                    defaultSelectedKeys={[key]}
                    defaultOpenKeys={[key]}
                    mode="inline"
                    items={items}
                />
            </Sider>
            <Content style={{ padding: '16px 24px', overflow: 'auto' }}>
                {componentArr[key]}
            </Content>
        </Layout>
    );
};
export default App;
