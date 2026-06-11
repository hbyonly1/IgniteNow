import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, DatePicker, Modal, Pagination, Radio, Table, Tag, message } from 'antd';
import {
  CalendarOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  ReloadOutlined,
  SettingOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { apiClient, apiErrorMessage } from '../../services/apiClient.js';

const publishStatusMeta = {
  publishing: { label: '发布中', color: 'processing' },
  unpublished: { label: '未发布', color: 'default' },
  published: { label: '已发布', color: 'success' },
  failed: { label: '失败', color: 'error' },
};

const publishJobStatusMeta = {
  pending: { label: '待发布', tone: 'warning' },
  publishing: { label: '发布中', tone: 'blue' },
  success: { label: '已上线', tone: 'success' },
  failed: { label: '发布失败', tone: 'error' },
  canceled: { label: '已取消', tone: 'default' },
};

function formatDateTime(value) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hour}:${minute}`;
}

function formatPercent(value) {
  return `${Math.round(Number(value ?? 0) * 100)}%`;
}

function isFailedPublishJob(job) {
  return job?.status === 'failed' || Number(job?.failed_count ?? 0) > 0;
}

function publishFailureMessage(job, fallback) {
  const itemError = job?.items?.find((item) => item.status === 'failed' && item.error)?.error;
  const detail = job?.error || itemError;
  return detail ? `${fallback}：${detail}` : fallback;
}

async function fetchPublishCenter(statusFilter) {
  const [itemsResponse, jobsResponse] = await Promise.all([
    apiClient.get('/api/publish/pending-items', { params: { status: statusFilter } }),
    apiClient.get('/api/publish/jobs', { params: { limit: 10 } }),
  ]);
  return {
    publishItems: itemsResponse.data.data ?? [],
    recentRecords: jobsResponse.data.data ?? [],
  };
}

export default function HighlightsPage() {
  const [publishItems, setPublishItems] = useState([]);
  const [recentRecords, setRecentRecords] = useState([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [configOpen, setConfigOpen] = useState(false);
  const [configItem, setConfigItem] = useState(null);
  const [scheduledAt, setScheduledAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const pageSize = 6;
  const filteredItems = publishItems;
  const effectivePage = Math.min(currentPage, Math.max(1, Math.ceil(filteredItems.length / pageSize)));
  const pagedItems = useMemo(
    () => filteredItems.slice((effectivePage - 1) * pageSize, effectivePage * pageSize),
    [effectivePage, filteredItems],
  );
  const selectedItems = useMemo(
    () => publishItems.filter((item) => selectedRowKeys.includes(item.episode_id)),
    [publishItems, selectedRowKeys],
  );
  const activeItem = configItem ?? selectedItems[0] ?? publishItems[0] ?? null;

  const publishMetrics = useMemo(() => {
    const waitCount = publishItems.filter((item) => item.status === 'unpublished').length;
    const publishingCount = publishItems.filter((item) => item.status === 'publishing').length;
    const publishedCount = publishItems.filter((item) => item.status === 'published').length;
    const failedCount = publishItems.filter((item) => item.status === 'failed').length;
    return [
      { label: '待发布', value: waitCount, icon: <CalendarOutlined />, tone: 'blue' },
      { label: '发布中', value: publishingCount, icon: <CloudUploadOutlined />, tone: 'purple' },
      { label: '已发布', value: publishedCount, icon: <CheckCircleOutlined />, tone: 'green' },
      { label: '异常回流', value: failedCount, icon: <WarningOutlined />, tone: 'red' },
    ];
  }, [publishItems]);

  const loadPublishCenter = async (nextStatus = statusFilter) => {
    setLoading(true);
    try {
      const data = await fetchPublishCenter(nextStatus);
      setPublishItems(data.publishItems);
      setRecentRecords(data.recentRecords);
    } catch (error) {
      message.error(apiErrorMessage(error, '发布中心数据加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetchPublishCenter('all')
      .then((data) => {
        if (!active) {
          return;
        }
        setPublishItems(data.publishItems);
        setRecentRecords(data.recentRecords);
      })
      .catch((error) => {
        if (active) {
          message.error(apiErrorMessage(error, '发布中心数据加载失败'));
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

  const openConfig = (item) => {
    setConfigItem(item);
    setScheduledAt(null);
    setConfigOpen(true);
  };

  const publishEpisodes = async (episodeIds) => {
    if (!episodeIds.length) {
      message.info('请选择待发布内容');
      return;
    }
    try {
      const response = await apiClient.post('/api/publish/jobs', {
        episode_ids: episodeIds,
        channel: 'android',
        scheduled_at: scheduledAt,
      });
      const publishJob = response.data.data;
      if (isFailedPublishJob(publishJob)) {
        message.error(publishFailureMessage(publishJob, '发布任务执行失败'));
      } else {
        message.success(publishJob?.status === 'pending' ? '发布任务已提交' : '发布成功');
        setConfigOpen(false);
      }
      setSelectedRowKeys([]);
      loadPublishCenter();
    } catch (error) {
      message.error(apiErrorMessage(error, '发布任务提交失败'));
    }
  };

  const savePublishConfig = async () => {
    if (!activeItem) {
      return;
    }
    try {
      await apiClient.post(`/api/publish/items/${activeItem.episode_id}/config`, {
        channel: 'android',
        scheduled_at: scheduledAt,
        strategy_tags: ['高光弹幕', '投票选择', '心动打点'],
        cover_checked: true,
        summary_checked: true,
      });
      message.success('发布配置已保存');
    } catch (error) {
      message.error(apiErrorMessage(error, '发布配置保存失败'));
    }
  };

  const pendingColumns = [
    {
      title: '内容名称',
      dataIndex: 'title',
      render: (value) => <strong className="publish-content-name">{value}</strong>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 104,
      render: (value) => {
        const meta = publishStatusMeta[value] ?? publishStatusMeta.unpublished;
        return (
          <Tag className="analysis-stage-tag" color={meta.color}>
            {meta.label}
          </Tag>
        );
      },
    },
    {
      title: '草稿高光',
      dataIndex: 'draft_highlight_count',
      width: 88,
      align: 'center',
      render: (value) => (
        <span style={{ color: value > 0 ? '#fa8c16' : '#bbb', fontWeight: value > 0 ? 700 : 400 }}>
          {value ?? 0}
        </span>
      ),
    },
    {
      title: '已发布高光',
      dataIndex: 'published_highlight_count',
      width: 96,
      align: 'center',
      render: (value) => (
        <span style={{ color: value > 0 ? '#52c41a' : '#bbb', fontWeight: value > 0 ? 700 : 400 }}>
          {value ?? 0}
        </span>
      ),
    },
    {
      title: '最后更新时间',
      dataIndex: 'updated_at',
      width: 132,
      render: formatDateTime,
    },
    {
      title: '操作',
      key: 'actions',
      width: 176,
      align: 'right',
      className: 'publish-action-column',
      render: (_, record) => (
        <div className="publish-row-actions">
          <Button icon={<SettingOutlined />} onClick={() => openConfig(record)}>
            修改配置
          </Button>
          <Button type="primary" onClick={() => publishEpisodes([record.episode_id])}>
            发布
          </Button>
        </div>
      ),
    },
  ];


  const recordColumns = [
    {
      title: '发布单号',
      dataIndex: 'id',
      width: 100,
      render: (value) => `PUB-${value}`,
    },
    { title: '内容', dataIndex: 'content' },
    {
      title: '渠道',
      dataIndex: 'channel',
      width: 120,
      render: (value) => (value === 'android' ? 'Android' : value),
    },
    {
      title: '上线结果',
      dataIndex: 'status',
      width: 100,
      render: (value) => {
        const meta = publishJobStatusMeta[value] ?? publishJobStatusMeta.pending;
        return <Tag className={`publish-record-tag ${meta.tone}`}>{meta.label}</Tag>;
      },
    },
    {
      title: '曝光',
      dataIndex: 'impressions',
      width: 70,
      align: 'center',
      render: (value) => <span style={{ fontWeight: 600 }}>{value ?? 0}</span>,
    },
    {
      title: '点击',
      dataIndex: 'clicks',
      width: 70,
      align: 'center',
      render: (value) => <span style={{ fontWeight: 600, color: '#1677ff' }}>{value ?? 0}</span>,
    },
    {
      title: '点击率',
      dataIndex: 'click_rate',
      width: 80,
      align: 'center',
      render: (value) => (
        <span style={{ color: value > 0 ? '#52c41a' : '#bbb', fontWeight: 600 }}>
          {formatPercent(value)}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'record_actions',
      width: 80,
      align: 'center',
      render: (_, record) =>
        record.status === 'failed' ? (
          <Button
            size="small"
            type="link"
            onClick={async () => {
              try {
                await apiClient.post(`/api/publish/jobs/${record.id}/retry`);
                message.success('重试已提交');
                loadPublishCenter();
              } catch (error) {
                message.error(apiErrorMessage(error, '重试失败'));
              }
            }}
          >
            重试
          </Button>
        ) : null,
    },
  ];


  return (
    <section className="publish-center-page">
      <div className="content-page-header">
        <div className="content-page-title">
          <h1>发布中心</h1>
          <p>管理发布编排、渠道配置、定时发布与上线状态，衔接 AI 分析结果与数据回流</p>
        </div>
      </div>

      <div className="publish-metrics">
        {publishMetrics.map((metric) => (
          <article className={`analysis-metric-card ${metric.tone}`} key={metric.label}>
            <span>{metric.icon}</span>
            <div>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
            </div>
          </article>
        ))}
      </div>

      <section className="publish-pending-panel">
        <div className="analysis-filterbar">
          <Radio.Group
            className="analysis-status-tabs"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setCurrentPage(1);
              loadPublishCenter(event.target.value);
            }}
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: '全部', value: 'all' },
              { label: '发布中', value: 'publishing' },
              { label: '未发布', value: 'unpublished' },
              { label: '失败', value: 'failed' },
              { label: '已发布', value: 'published' },
            ]}
          />
          <div className="analysis-filter-actions">
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => loadPublishCenter()} />
            <Button
              type="primary"
              className="publish-one-click-action"
              loading={loading}
              onClick={async () => {
                try {
                  const response = await apiClient.post('/api/publish/jobs/one-click');
                  const publishJob = response.data.data;
                  if (publishJob?.created === false) {
                    message.info('暂无待发布内容');
                  } else if (isFailedPublishJob(publishJob)) {
                    message.error(publishFailureMessage(publishJob, '一键发布执行失败'));
                  } else {
                    message.success(publishJob?.status === 'pending' ? '已提交一键发布任务' : '一键发布完成');
                  }
                  loadPublishCenter();
                } catch (error) {
                  message.error(apiErrorMessage(error, '一键发布失败'));
                }
              }}
            >
              一键发布
            </Button>
          </div>
        </div>
        <Table
          rowKey="episode_id"
          className="publish-content-table"
          tableLayout="fixed"
          columns={pendingColumns}
          dataSource={pagedItems}
          loading={loading}
          pagination={false}
          scroll={{ y: 320 }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
        />
        <div className="analysis-list-pagination">
          <span>共 {filteredItems.length} 条内容，已选择 {selectedRowKeys.length} 条</span>
          <Pagination
            current={effectivePage}
            pageSize={pageSize}
            total={filteredItems.length}
            showSizeChanger={false}
            onChange={setCurrentPage}
          />
        </div>
      </section>

      <section className="publish-panel publish-record-panel">
        <div className="publish-record-header">
          <h2>最近发布记录与回流</h2>
          <Button type="link">查看全部发布记录</Button>
        </div>
        <Table rowKey="id" className="publish-record-table" columns={recordColumns} dataSource={recentRecords} pagination={false} />
      </section>

      <Modal
        className="publish-config-modal"
        title="发布配置"
        open={configOpen}
        onCancel={() => setConfigOpen(false)}
        footer={null}
        width={640}
        destroyOnHidden
      >
        <div className="publish-config-grid">
          <span>标题</span>
          <strong>{activeItem?.title ?? '-'}</strong>

          <span>发布渠道</span>
          <Checkbox.Group
            className="publish-check-group"
            defaultValue={['android']}
            options={[
              { label: 'Android 播放端', value: 'android' },
            ]}
          />

          <span>发布时间</span>
          <DatePicker
            className="publish-config-input"
            showTime
            format="YYYY-MM-DD HH:mm"
            placeholder="选择发布时间"
            onChange={(value) => setScheduledAt(value ? value.toISOString() : null)}
          />

          <span>互动策略挂载</span>
          <div className="publish-strategy-tags">
            <Tag closable>高光弹幕</Tag>
            <Tag closable>投票选择</Tag>
            <Tag closable>心动打点</Tag>
          </div>

          <span>封面与简介检查</span>
          <div className="publish-check-status">
            <Tag color="success">封面已完成</Tag>
            <Tag color="success">简介已完成</Tag>
          </div>
        </div>
        <div className="publish-config-actions">
          <Button onClick={savePublishConfig}>保存配置</Button>
          <Button>预览效果</Button>
          <Button
            type="primary"
            onClick={() => publishEpisodes(activeItem ? [activeItem.episode_id] : [])}
          >
            提交发布
          </Button>
        </div>
      </Modal>
    </section>
  );
}
