import {
  BarChartOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  FieldTimeOutlined,
  SettingOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';

export const workspaceModules = [
  {
    id: 'dashboard',
    path: '/workspace/dashboard',
    title: '仪表盘',
    eyebrow: 'DASHBOARD',
    description: '汇总短剧、剧集、高光和互动数据，快速查看系统核心指标。',
    icon: <BarChartOutlined />,
    roles: ['admin'],
    status: '待接 API',
  },
  {
    id: 'dramas',
    path: '/workspace/dramas',
    title: '内容管理',
    eyebrow: 'CONTENT',
    description: '管理短剧资产、剧集配置、字幕输入和 AI 分析状态。',
    icon: <VideoCameraOutlined />,
    roles: ['admin', 'uploader'],
    status: '内容库',
  },
  {
    id: 'analyze',
    path: '/workspace/analyze',
    title: 'AI 生产',
    eyebrow: 'AI OPS',
    description: '批量识别剧集高光，追踪 AI 任务状态、失败原因和生成结果。',
    icon: <ExperimentOutlined />,
    roles: ['admin', 'uploader'],
    status: '生产队列',
  },
  {
    id: 'highlights',
    path: '/workspace/highlights',
    title: '审核发布',
    eyebrow: 'REVIEW',
    description: '按短剧和剧集审核 AI 高光，编辑互动配置并发布到播放端。',
    icon: <FileTextOutlined />,
    roles: ['admin'],
    status: '质检台',
  },
  {
    id: 'jobs',
    path: '/workspace/jobs',
    title: '后台任务',
    eyebrow: 'JOBS',
    description: '提交 AI 分析等耗时任务，查看 RQ 队列执行状态与任务日志。',
    icon: <FieldTimeOutlined />,
    roles: ['admin', 'uploader'],
    status: 'RQ',
  },
  {
    id: 'settings',
    path: '/workspace/settings',
    title: '系统设置',
    eyebrow: 'SETTINGS',
    description: '维护系统级配置、日志策略和后续演示环境参数。',
    icon: <SettingOutlined />,
    roles: ['admin'],
    status: '待接 API',
  }
];

export function canAccessWorkspaceModule(module, role) {
  return module.roles.includes(role);
}

export function getWorkspaceModulesForRole(role) {
  return workspaceModules.filter((module) => canAccessWorkspaceModule(module, role));
}

export function getDefaultWorkspacePath(role) {
  return getWorkspaceModulesForRole(role)[0]?.path ?? '/login';
}

export function getWorkspaceModuleById(id) {
  return workspaceModules.find((module) => module.id === id) ?? workspaceModules[0];
}

export function getWorkspaceModuleByPath(pathname) {
  return (
    workspaceModules.find((module) => pathname.startsWith(module.path)) ??
    workspaceModules[0]
  );
}
