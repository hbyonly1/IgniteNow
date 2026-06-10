import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Button, Dropdown, Layout, Menu } from 'antd';
import { DoubleLeftOutlined, DoubleRightOutlined, LogoutOutlined } from '@ant-design/icons';
import {
  getWorkspaceModuleByPath,
  getWorkspaceModulesForRole,
} from '../workspaceModules.jsx';
import { clearAdminSession, getAdminUserName, getAdminUserRole } from '../auth.js';
import { logoutAdmin } from '../services/authApi.js';

const { Sider, Content } = Layout;

export default function WorkspaceLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const userRole = getAdminUserRole();
  const accessibleModules = getWorkspaceModulesForRole(userRole);
  const currentModule = getWorkspaceModuleByPath(location.pathname);
  const userName = getAdminUserName();
  const userInitial = userName.trim().charAt(0).toUpperCase() || 'A';

  const menuItems = useMemo(
    () =>
      accessibleModules.map((module) => ({
        key: module.id,
        icon: module.icon,
        label: module.title,
      })),
    [accessibleModules],
  );

  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
    },
  ];

  const handleUserMenuClick = async ({ key }) => {
    if (key === 'logout') {
      try {
        await logoutAdmin();
      } catch {
        // Local logout still succeeds when the backend is already unavailable.
      }
      clearAdminSession();
      navigate('/login', { replace: true });
    }
  };

  return (
    <Layout className="workspace-shell">
      <Sider
        width={236}
        collapsedWidth={76}
        collapsed={collapsed}
        trigger={null}
        className="workspace-sider"
      >
        <div className="workspace-brand">
          <Dropdown
            trigger={['click']}
            placement="bottomLeft"
            menu={{ items: userMenuItems, onClick: handleUserMenuClick }}
          >
            <button className="workspace-user-trigger" type="button">
              <Avatar className="workspace-user-avatar" size={34}>
                {userInitial}
              </Avatar>
              <span className="workspace-brand-copy">
                <strong>IgniteNow</strong>
                <span>v0.1</span>
              </span>
            </button>
          </Dropdown>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[currentModule.id]}
          items={menuItems}
          onClick={({ key }) => {
            const targetModule = accessibleModules.find((module) => module.id === key);
            if (targetModule) {
              navigate(targetModule.path);
            }
          }}
        />
        <div className="workspace-sider-footer">
          <Button
            type="text"
            className="workspace-collapse-button"
            icon={collapsed ? <DoubleRightOutlined /> : <DoubleLeftOutlined />}
            onClick={() => setCollapsed((value) => !value)}
          >
            {!collapsed && '收起'}
          </Button>
        </div>
      </Sider>
      <Layout className="workspace-main workspace-main-plain">
        <Content className="workspace-content workspace-content-plain">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
