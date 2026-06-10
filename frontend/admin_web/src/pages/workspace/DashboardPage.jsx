import { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Spin, Table, Tag, message } from 'antd';
import {
  BarChartOutlined,
  BulbOutlined,
  FieldTimeOutlined,
  FireOutlined,
  LikeOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { apiClient, apiErrorMessage } from '../../services/apiClient.js';

const highlightTypeLabels = {
  conflict: '冲突',
  reversal: '反转',
  sweet: '心动',
  satisfying: '爽点',
  suspense: '悬念',
};

const highlightTypeColors = {
  conflict: 'error',
  reversal: 'processing',
  sweet: 'magenta',
  satisfying: 'success',
  suspense: 'warning',
};

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString('zh-CN');
}

function formatPercent(value) {
  return `${Math.round(Number(value ?? 0) * 100)}%`;
}

function formatTimeRange(record) {
  const start = Number(record.start_time ?? 0).toFixed(0);
  const end = Number(record.end_time ?? 0).toFixed(0);
  return `${start}s - ${end}s`;
}

async function fetchDashboardData() {
  const [overviewResponse, typesResponse, actionsResponse, rankingResponse] = await Promise.all([
    apiClient.get('/api/analytics/overview'),
    apiClient.get('/api/analytics/highlight-types'),
    apiClient.get('/api/analytics/top-actions'),
    apiClient.get('/api/analytics/highlight-ranking', { params: { limit: 8 } }),
  ]);
  return {
    overview: overviewResponse.data.data ?? {},
    highlightTypes: typesResponse.data.data ?? [],
    topActions: actionsResponse.data.data ?? [],
    ranking: rankingResponse.data.data ?? [],
  };
}

function DashboardBarList({ items, labelKey, valueKey, emptyText }) {
  const maxValue = Math.max(...items.map((item) => Number(item[valueKey] ?? 0)), 1);

  if (!items.length) {
    return <Empty className="dashboard-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />;
  }

  return (
    <div className="dashboard-bars">
      {items.map((item) => {
        const value = Number(item[valueKey] ?? 0);
        const percent = Math.max(4, Math.round((value / maxValue) * 100));
        const rawLabel = item[labelKey];
        const label = highlightTypeLabels[rawLabel] ?? rawLabel ?? 'unknown';
        return (
          <div className="dashboard-bar-row" key={rawLabel || label}>
            <div className="dashboard-bar-meta">
              <span>{label}</span>
              <strong>{formatNumber(value)}</strong>
            </div>
            <div className="dashboard-bar-track">
              <span style={{ width: `${percent}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const [overview, setOverview] = useState(null);
  const [highlightTypes, setHighlightTypes] = useState([]);
  const [topActions, setTopActions] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const data = await fetchDashboardData();
      setOverview(data.overview);
      setHighlightTypes(data.highlightTypes);
      setTopActions(data.topActions);
      setRanking(data.ranking);
    } catch (error) {
      message.error(apiErrorMessage(error, '仪表盘数据加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetchDashboardData()
      .then((data) => {
        if (!active) {
          return;
        }
        setOverview(data.overview);
        setHighlightTypes(data.highlightTypes);
        setTopActions(data.topActions);
        setRanking(data.ranking);
      })
      .catch((error) => {
        if (active) {
          message.error(apiErrorMessage(error, '仪表盘数据加载失败'));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const metricCards = useMemo(
    () => [
      {
        label: '短剧总数',
        value: overview?.drama_count,
        hint: '内容库已入库短剧',
        icon: <VideoCameraOutlined />,
        tone: 'blue',
      },
      {
        label: '剧集总数',
        value: overview?.episode_count,
        hint: '可配置与分析剧集',
        icon: <PlayCircleOutlined />,
        tone: 'purple',
      },
      {
        label: '已发布高光',
        value: overview?.published_highlight_count,
        hint: `全部高光 ${formatNumber(overview?.highlight_count)}`,
        icon: <BulbOutlined />,
        tone: 'green',
      },
      {
        label: '互动次数',
        value: overview?.interaction_count,
        hint: `点击 ${formatNumber(overview?.click_count)} / 忽略 ${formatNumber(overview?.ignore_count)}`,
        icon: <LikeOutlined />,
        tone: 'orange',
      },
      {
        label: '平均点击率',
        value: formatPercent(overview?.avg_click_rate),
        hint: 'click / impression',
        icon: <ThunderboltOutlined />,
        tone: 'red',
      },
    ],
    [overview],
  );

  const rankingColumns = [
    {
      title: '高光',
      key: 'highlight',
      render: (_, record) => (
        <div className="dashboard-highlight-cell">
          <strong>#{record.highlight_id}</strong>
          <span>第 {record.episode_id} 集 / {formatTimeRange(record)}</span>
        </div>
      ),
    },
    {
      title: '类型',
      dataIndex: 'highlight_type',
      width: 92,
      render: (value) => (
        <Tag color={highlightTypeColors[value] ?? 'default'}>
          {highlightTypeLabels[value] ?? value}
        </Tag>
      ),
    },
    {
      title: '按钮',
      dataIndex: 'button_text',
      width: 150,
      ellipsis: true,
    },
    {
      title: '曝光',
      dataIndex: 'impression_count',
      width: 90,
      render: formatNumber,
    },
    {
      title: '点击',
      dataIndex: 'click_count',
      width: 90,
      render: formatNumber,
    },
    {
      title: '点击率',
      dataIndex: 'click_rate',
      width: 90,
      render: formatPercent,
    },
  ];

  return (
    <section className="dashboard-page">
      <div className="content-page-header">
        <div className="content-page-title">
          <h1>仪表盘</h1>
          <p>汇总短剧、剧集、高光和互动数据，跟踪播放端回流表现</p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={loadDashboard} loading={loading}>
          刷新
        </Button>
      </div>

      <Spin spinning={loading && !overview}>
        <div className="dashboard-metrics">
          {metricCards.map((metric) => (
            <article className={`analysis-metric-card ${metric.tone}`} key={metric.label}>
              <span>{metric.icon}</span>
              <div>
                <p>{metric.label}</p>
                <strong>{typeof metric.value === 'string' ? metric.value : formatNumber(metric.value)}</strong>
                <em>{metric.hint}</em>
              </div>
            </article>
          ))}
        </div>

        <div className="dashboard-grid">
          <section className="dashboard-panel">
            <div className="dashboard-panel-header">
              <h2><BarChartOutlined /> 高光类型分布</h2>
            </div>
            <DashboardBarList
              items={highlightTypes}
              labelKey="highlight_type"
              valueKey="count"
              emptyText="暂无高光类型数据"
            />
          </section>

          <section className="dashboard-panel">
            <div className="dashboard-panel-header">
              <h2><FireOutlined /> 热门互动按钮</h2>
            </div>
            <DashboardBarList
              items={topActions}
              labelKey="action_value"
              valueKey="count"
              emptyText="暂无点击回流数据"
            />
          </section>
        </div>

        <section className="dashboard-panel dashboard-ranking-panel">
          <div className="dashboard-panel-header">
            <h2><FieldTimeOutlined /> 高光表现排行</h2>
          </div>
          <Table
            rowKey="highlight_id"
            className="dashboard-ranking-table"
            columns={rankingColumns}
            dataSource={ranking}
            pagination={false}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无已发布高光回流数据" /> }}
          />
        </section>
      </Spin>
    </section>
  );
}
