import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Checkbox,
  Empty,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Radio,
  Select,
  Switch,
  Table,
  Tag,
  message,
} from 'antd';
import {
  AimOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  DownOutlined,
  FileSearchOutlined,
  ReloadOutlined,
  RightOutlined,
  RotateRightOutlined,
  SearchOutlined,
  SendOutlined,
  StarOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { apiClient, apiErrorMessage } from '../../services/apiClient.js';

const stageMeta = {
  pending: { label: '未分析', color: 'default' },
  processing: { label: '分析中', color: 'processing' },
  success: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
};

const highlightTypeMeta = {
  conflict: { label: '冲突', color: 'blue' },
  reversal: { label: '反转', color: 'purple' },
  sweet: { label: '心动', color: 'magenta' },
  satisfying: { label: '爆点', color: 'orange' },
  suspense: { label: '悬念', color: 'cyan' },
};

const highlightStatusMeta = {
  draft: { label: '待审核', color: 'warning' },
  published: { label: '已通过', color: 'success' },
  rejected: { label: '已拒绝', color: 'error' },
  archived: { label: '已归档', color: 'default' },
};

const editableHighlightStatuses = ['draft', 'published', 'rejected'];

function parsePayload(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

function formatClock(value) {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Math.round(Number(seconds ?? 0)));
  const minutes = Math.floor(totalSeconds / 60);
  const rest = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function formatTimecode(seconds) {
  const value = Math.max(0, Number(seconds ?? 0));
  const minutes = Math.floor(value / 60);
  const rest = value - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`;
}

function parseTimecode(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return 0;
  }
  if (!text.includes(':')) {
    return Number(text) || 0;
  }
  const [minutes, seconds] = text.split(':');
  return (Number(minutes) || 0) * 60 + (Number(seconds) || 0);
}

function formatRange(record) {
  return `${formatTimecode(record.start_time)} - ${formatTimecode(record.end_time)}`;
}

function hasSubtitle(episode) {
  return Boolean(episode.subtitle_content || episode.subtitle_url);
}

function progressForEpisode(episode, latestJob) {
  if (latestJob?.status === 'running') {
    return Math.max(1, Math.round(latestJob.progress ?? 0));
  }
  if (episode.analyze_status === 'success') {
    return 100;
  }
  if (episode.analyze_status === 'processing') {
    return Math.max(15, Math.round(latestJob?.progress ?? 62));
  }
  if (episode.analyze_status === 'failed') {
    return 0;
  }
  return latestJob ? Math.round(latestJob.progress ?? 15) : 0;
}

function coverText(title) {
  return String(title || '短剧').slice(0, 2);
}

function previewRowsForEpisode(episode, job) {
  const draftCount = Number(episode?.draft_highlight_count ?? 0);
  const publishedCount = Number(episode?.published_highlight_count ?? 0);
  const count = Math.max(3, Math.min(5, draftCount + publishedCount || Math.round((job?.progress ?? 0) / 20)));
  const labels = [
    ['00:12-00:20', '剧情冲突升级', '冲突', 'orange'],
    ['00:46-00:55', '关键身份反转', '反转', 'blue'],
    ['01:18-01:26', '情绪递进', '心动', 'pink'],
    ['01:52-02:00', '爆点台词出现', '爆点', 'red'],
    ['02:26-02:34', '互动建议生成', '心动', 'pink'],
  ];
  return labels.slice(0, count).map(([time, summary, type, tone], index) => ({
    id: `preview-${index}`,
    time,
    summary,
    type,
    confidence: `${Math.max(82, 96 - index * 3)}%`,
    status: job?.status === 'success' ? '已确认' : index === count - 1 ? '分析中' : '待复核',
    tone,
    position: 12 + index * 18,
  }));
}

export default function AnalyzePage() {
  const { jobId } = useParams();
  return jobId ? <AnalyzeJobDetail jobId={jobId} /> : <AnalyzeQueue />;
}

function AnalyzeQueue() {
  const navigate = useNavigate();
  const [queueItems, setQueueItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [expandedRowKeys, setExpandedRowKeys] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState(null);
  const [assetQuery, setAssetQuery] = useState('');
  const [assetDramaFilter, setAssetDramaFilter] = useState('all');
  const [onlyReadyAssets, setOnlyReadyAssets] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewEpisode, setReviewEpisode] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/analysis/queue', { params: { limit: 500 } });
      const nextItems = response.data.data ?? [];
      setQueueItems(nextItems);
      setSelectedEpisodeId((current) => current ?? nextItems.find(hasSubtitle)?.id ?? nextItems[0]?.id ?? null);
    } catch (error) {
      message.error(apiErrorMessage(error, 'AI 分析任务加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(loadData);
  }, [loadData]);

  const dramas = useMemo(() => {
    const map = new Map();
    queueItems.forEach((item) => {
      map.set(item.drama_id, { id: item.drama_id, title: item.drama_title, cover_url: item.cover_url });
    });
    return Array.from(map.values());
  }, [queueItems]);

  const rows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const nextEpisodes = queueItems.map((episode, index) => {
      const latestJob = episode.latest_job;
      const progress = progressForEpisode(episode, latestJob);
      const updatedAt = episode.updated_at ?? latestJob?.updated_at ?? latestJob?.created_at ?? episode.created_at;
      return {
        ...episode,
        task_no: `T${String(updatedAt ? new Date(updatedAt).getFullYear() : 2024)}${String(index + 1).padStart(4, '0')}`,
        latest_job: latestJob,
        subtitle_ready: Boolean(episode.subtitle_ready ?? hasSubtitle(episode)),
        progress,
        updated_at_display: updatedAt,
      };
    });

    const groupsMap = new Map();
    nextEpisodes.forEach((ep) => {
      if (keyword && !`${ep.drama_title} ${ep.title}`.toLowerCase().includes(keyword)) {
        return;
      }
      if (statusFilter !== 'all' && ep.analyze_status !== statusFilter) {
        return;
      }

      if (!groupsMap.has(ep.drama_id)) {
        groupsMap.set(ep.drama_id, {
          is_drama_group: true,
          id: `drama-${ep.drama_id}`,
          drama_id: ep.drama_id,
          drama_title: ep.drama_title,
          cover_url: ep.cover_url,
          episodes: [],
          total_episodes: 0,
          finished_episodes: 0,
          processing_episodes: 0,
          failed_episodes: 0,
          pending_episodes: 0,
          updated_at_display: 0,
        });
      }
      const group = groupsMap.get(ep.drama_id);
      group.episodes.push(ep);
      group.total_episodes++;
      if (ep.analyze_status === 'success') group.finished_episodes++;
      else if (ep.analyze_status === 'processing') group.processing_episodes++;
      else if (ep.analyze_status === 'failed') group.failed_episodes++;
      else group.pending_episodes++;

      if (!group.updated_at_display || new Date(ep.updated_at_display).getTime() > new Date(group.updated_at_display).getTime()) {
        group.updated_at_display = ep.updated_at_display;
      }
    });

    const result = Array.from(groupsMap.values()).sort((a, b) => new Date(b.updated_at_display ?? 0) - new Date(a.updated_at_display ?? 0));
    result.forEach((group) => {
      group.children = group.episodes.sort((a, b) => a.episode_no - b.episode_no).map(ep => ({ ...ep, is_drama_group: false }));
    });
    return result;
  }, [queueItems, query, statusFilter]);

  const metrics = useMemo(() => {
    const processing = queueItems.filter((episode) => episode.analyze_status === 'processing').length;
    const pending = queueItems.filter((episode) => episode.analyze_status === 'pending').length;
    const highlights = queueItems.reduce(
      (total, episode) => total + Number(episode.draft_highlight_count ?? 0) + Number(episode.published_highlight_count ?? 0),
      0,
    );
    const finished = queueItems.filter((episode) => episode.analyze_status === 'success').length;
    const confidence = queueItems.length ? Math.round((finished / queueItems.length) * 1000) / 10 : 0;
    return { processing, pending, highlights, confidence };
  }, [queueItems]);

  const selectedEpisode = useMemo(
    () => queueItems.find((episode) => episode.id === selectedEpisodeId) ?? queueItems[0] ?? null,
    [queueItems, selectedEpisodeId],
  );

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const effectivePage = Math.min(currentPage, totalPages);
  const pagedRows = useMemo(
    () => rows.slice((effectivePage - 1) * pageSize, effectivePage * pageSize),
    [effectivePage, rows],
  );
  const hasSelectedRows = selectedRowKeys.length > 0;

  const assetRows = useMemo(() => {
    const keyword = assetQuery.trim().toLowerCase();
    return queueItems
      .map((episode) => {
        const subtitleReady = Boolean(episode.subtitle_ready ?? hasSubtitle(episode));
        return {
          ...episode,
          subtitle_ready: subtitleReady,
          asset_completion: subtitleReady ? 96 : 62,
        };
      })
      .filter((episode) => {
        if (assetDramaFilter !== 'all' && episode.drama_id !== assetDramaFilter) {
          return false;
        }
        if (onlyReadyAssets && !episode.subtitle_ready) {
          return false;
        }
        if (keyword && !`${episode.drama_title} ${episode.title}`.toLowerCase().includes(keyword)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => Number(b.subtitle_ready) - Number(a.subtitle_ready) || a.episode_no - b.episode_no);
  }, [assetDramaFilter, assetQuery, queueItems, onlyReadyAssets]);

  const submitAnalysis = async () => {
    if (!selectedEpisode) {
      message.warning('请选择内容资产');
      return;
    }
    if (!hasSubtitle(selectedEpisode)) {
      message.warning('请选择已上传字幕的内容资产');
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiClient.post('/api/system/jobs', {
        type: 'ai_analyze',
        payload: { episode_id: selectedEpisode.id, force_reanalyze: false },
      });
      message.success('分析任务已提交');
      setTaskModalOpen(false);
      await loadData();
      navigate(`/workspace/analyze/jobs/${response.data.data.id}`);
    } catch (error) {
      message.error(apiErrorMessage(error, '提交分析失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const submitBatchRetry = async () => {
    if (!selectedRowKeys.length) {
      message.warning('请选择任务');
      return;
    }
    const selectedIds = new Set(selectedRowKeys);
    const episodes = queueItems.filter(ep => selectedIds.has(ep.id) && ep.analyze_status !== 'pending' && ep.analyze_status !== 'processing');
    if (!episodes.length) {
      message.warning('所选短剧中没有可重试的剧集');
      return;
    }
    setLoading(true);
    try {
      await Promise.all(
        episodes.map((episode) =>
          apiClient.post('/api/system/jobs', {
            type: 'ai_analyze',
            payload: { episode_id: episode.id, force_reanalyze: true },
          }),
        ),
      );
      message.success(`已批量重试 ${episodes.length} 个任务`);
      setSelectedRowKeys([]);
      await loadData();
    } catch (error) {
      message.error(apiErrorMessage(error, '批量重试失败'));
    } finally {
      setLoading(false);
    }
  };

  const submitBatchAnalysis = async () => {
    if (!selectedRowKeys.length) {
      message.warning('请选择任务');
      return;
    }
    const selectedIds = new Set(selectedRowKeys);
    const episodes = queueItems.filter(ep => selectedIds.has(ep.id) && (ep.analyze_status === 'pending' || ep.analyze_status === 'failed'));
    if (!episodes.length) {
      message.warning('所选短剧中没有需要提交的剧集');
      return;
    }
    setLoading(true);
    try {
      await Promise.all(
        episodes.map((episode) =>
          apiClient.post('/api/system/jobs', {
            type: 'ai_analyze',
            payload: { episode_id: episode.id, force_reanalyze: episode.analyze_status === 'failed' },
          }),
        ),
      );
      message.success(`已批量提交 ${episodes.length} 个分析任务`);
      setSelectedRowKeys([]);
      await loadData();
    } catch (error) {
      message.error(apiErrorMessage(error, '批量提交失败'));
    } finally {
      setLoading(false);
    }
  };

  const submitDramaAnalysis = async (dramaGroup) => {
    const episodes = dramaGroup.episodes.filter(ep => ep.analyze_status === 'pending' || ep.analyze_status === 'failed');
    if (!episodes.length) {
      message.info('该剧暂无可分析的集数');
      return;
    }
    setLoading(true);
    try {
      await Promise.all(
        episodes.map((episode) =>
          apiClient.post('/api/system/jobs', {
            type: 'ai_analyze',
            payload: { episode_id: episode.id, force_reanalyze: episode.analyze_status === 'failed' },
          }),
        ),
      );
      message.success(`已提交 ${episodes.length} 集分析任务`);
      await loadData();
    } catch (error) {
      message.error(apiErrorMessage(error, '全剧提交失败'));
    } finally {
      setLoading(false);
    }
  };

  const cancelBatchAnalysis = () => {
    if (!selectedRowKeys.length) {
      message.warning('请选择任务');
      return;
    }
    message.warning('批量取消接口尚未接入');
  };

  const submitSingleRetry = async (episode) => {
    setLoading(true);
    try {
      await apiClient.post('/api/system/jobs', {
        type: 'ai_analyze',
        payload: { episode_id: episode.id, force_reanalyze: true },
      });
      message.success('已提交重新分析任务');
      await loadData();
    } catch (error) {
      message.error(apiErrorMessage(error, '重新分析失败'));
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '短剧名称 / 剧集',
      dataIndex: 'drama_title',
      width: '42%',
      render: (_, record) => {
        if (record.is_drama_group) {
          const isExpanded = expandedRowKeys.includes(record.id);
          const toggleExpand = (e) => {
            e.stopPropagation();
            setExpandedRowKeys(prev =>
              isExpanded ? prev.filter(k => k !== record.id) : [...prev, record.id]
            );
          };
          return (
            <div className="analysis-drama-cell">
              <span
                onClick={toggleExpand}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 20,
                  height: 20,
                  marginRight: 10,
                  border: '1.5px solid #222',
                  borderRadius: 4,
                  cursor: 'pointer',
                  flexShrink: 0,
                  color: '#222',
                  fontSize: 10,
                  userSelect: 'none',
                }}
              >
                {isExpanded ? <DownOutlined /> : <RightOutlined />}
              </span>
              <span className="analysis-cover">
                {record.cover_url ? <img src={record.cover_url} alt="" loading="lazy" /> : <span>{coverText(record.drama_title)}</span>}
              </span>
              <strong>{record.drama_title}</strong>
            </div>
          );
        } else {
          return <span style={{ paddingLeft: 8 }}>第 {record.episode_no} 集</span>;
        }
      },
    },
    {
      title: '分析进度 / 阶段',
      width: '16%',
      render: (_, record) => {
        if (record.is_drama_group) {
          return `${record.finished_episodes} / ${record.total_episodes} 集`;
        } else {
          const meta = stageMeta[record.analyze_status] ?? stageMeta.pending;
          return <Tag className="analysis-stage-tag" color={meta.color}>{meta.label}</Tag>;
        }
      },
    },
    {
      title: '整体状态',
      width: '22%',
      render: (_, record) => {
        if (!record.is_drama_group) return null;
        if (record.processing_episodes > 0) return <Tag color="processing">分析中 ({record.processing_episodes})</Tag>;
        if (record.failed_episodes > 0) return <Tag color="error">含失败 ({record.failed_episodes})</Tag>;
        if (record.finished_episodes === record.total_episodes && record.total_episodes > 0) return <Tag color="success">全部完成</Tag>;
        return <Tag color="default">未分析 / 待处理</Tag>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: '20%',
      align: 'right',
      className: 'analysis-action-column',
      render: (_, record) => {
        if (record.is_drama_group) {
          return (
            <Button
              type="primary"
              size="small"
              disabled={record.pending_episodes === 0 && record.failed_episodes === 0}
              onClick={(e) => { e.stopPropagation(); submitDramaAnalysis(record); }}
            >
              一键分析全剧
            </Button>
          );
        } else {
          return (
            <div className="analysis-row-actions">
              <Button
                size="small"
                className="analysis-icon-action"
                icon={<ReloadOutlined />}
                onClick={() => submitSingleRetry(record)}
              >
                重新分析
              </Button>
              <Button
                size="small"
                className="analysis-detail-action"
                onClick={() => setReviewEpisode(record)}
              >
                高光审核
              </Button>
            </div>
          );
        }
      },
    },
  ];

  return (
    <section className="analysis-page">
      <div className="content-page-header">
        <div className="content-page-title">
          <h1>AI 分析</h1>
          <p>分析字幕、剧情时间轴与高光片段识别结果</p>
        </div>
        <div className="content-toolbar">
          <Input
            className="content-search"
            allowClear
            suffix={<SearchOutlined />}
            placeholder="搜索短剧名称或关键词"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCurrentPage(1);
            }}
          />
          <Button type="primary" className="content-upload-action" icon={<FileSearchOutlined />} onClick={() => setTaskModalOpen(true)}>
            新建分析任务
          </Button>
        </div>
      </div>

      <div className="analysis-metrics">
        <MetricCard icon={<ClockCircleOutlined />} tone="purple" label="待分析任务" value={metrics.pending} />
        <MetricCard icon={<SyncOutlined />} tone="blue" label="分析中" value={metrics.processing} />
        <MetricCard icon={<StarOutlined />} tone="green" label="已识别高光点" value={metrics.highlights} />
        <MetricCard icon={<CheckCircleOutlined />} tone="orange" label="平均置信度" value={`${metrics.confidence}%`} />
      </div>

      <section className="analysis-table-panel">
        <div className="analysis-filterbar">
          <Radio.Group
            className="analysis-status-tabs"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setCurrentPage(1);
            }}
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: '全部', value: 'all' },
              { label: '未分析', value: 'pending' },
              { label: '分析中', value: 'processing' },
              { label: '已完成', value: 'success' },
              { label: '失败', value: 'failed' },
            ]}
          />
          <div className="analysis-filter-actions">
            <Button
              type="primary"
              className="analysis-bulk-action"
              icon={<SendOutlined />}
              disabled={!hasSelectedRows}
              onClick={submitBatchAnalysis}
            >
              批量分析
            </Button>
            <Button
              danger
              className="analysis-bulk-action"
              icon={<CloseOutlined />}
              disabled={!hasSelectedRows}
              onClick={cancelBatchAnalysis}
            >
              批量取消
            </Button>
            <Button
              className="analysis-bulk-action"
              icon={<RotateRightOutlined />}
              disabled={!hasSelectedRows}
              onClick={submitBatchRetry}
            >
              批量重试
            </Button>
            <Button className="analysis-reload-action" icon={<ReloadOutlined />} onClick={loadData} />
          </div>
        </div>

        <Table
          className="analysis-queue-table"
          style={{ width: '100%', minWidth: '100%' }}
          rowKey="id"
          tableLayout="fixed"
          loading={loading}
          columns={columns}
          dataSource={pagedRows}
          expandable={{
            expandIconColumnIndex: -1,
            expandedRowKeys,
            onExpandedRowsChange: setExpandedRowKeys,
          }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
            checkStrictly: false,
          }}
          pagination={false}
          locale={{
            emptyText: (
              <div className="analysis-empty-state">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无真实分析任务" />
              </div>
            ),
          }}
        />
        <div className="analysis-list-pagination">
          <span>共 {rows.length} 条</span>
          <Pagination
            current={effectivePage}
            pageSize={pageSize}
            total={rows.length}
            showSizeChanger={false}
            onChange={setCurrentPage}
          />
        </div>
      </section>

      <Modal
        className="upload-drama-modal analysis-task-modal"
        title={null}
        open={taskModalOpen}
        closable={false}
        footer={null}
        width={760}
        onCancel={() => setTaskModalOpen(false)}
        destroyOnHidden
      >
        <div className="upload-drama-header">
          <div>
            <h2>新建分析任务</h2>
          </div>
          <Button type="text" className="upload-drama-close" icon={<CloseOutlined />} onClick={() => setTaskModalOpen(false)} />
        </div>
        <div className="analysis-task-modal-body">
          <section className="analysis-task-card">
            <h3>选择内容资产</h3>
            <div className="analysis-asset-toolbar">
              <Input
                className="analysis-asset-search"
                allowClear
                placeholder="搜索短剧或剧集"
                prefix={<SearchOutlined />}
                value={assetQuery}
                onChange={(event) => setAssetQuery(event.target.value)}
              />
              <Select
                value={assetDramaFilter}
                options={[{ value: 'all', label: '全部短剧' }, ...dramas.map((drama) => ({ value: drama.id, label: drama.title }))]}
                onChange={setAssetDramaFilter}
              />
              <Checkbox checked={onlyReadyAssets} onChange={(event) => setOnlyReadyAssets(event.target.checked)}>
                只看可分析
              </Checkbox>
            </div>
            {assetRows.length ? (
              <Radio.Group className="analysis-asset-list" value={selectedEpisode?.id} onChange={(event) => setSelectedEpisodeId(event.target.value)}>
                {assetRows.map((episode) => (
                  <Radio key={episode.id} value={episode.id} disabled={!episode.subtitle_ready}>
                    <span className="analysis-asset-item">
                      <span className="analysis-cover">
                        {episode.cover_url ? <img src={episode.cover_url} alt="" loading="lazy" /> : <span>{coverText(episode.drama_title)}</span>}
                      </span>
                      <span className="analysis-asset-main">
                        <strong>{episode.drama_title}</strong>
                        <em>第 {episode.episode_no} 集 · {episode.title || '未命名剧集'}</em>
                      </span>
                      <span>{episode.asset_completion}%</span>
                      <Tag color={episode.subtitle_ready ? 'success' : 'warning'}>{episode.subtitle_ready ? '可分析' : '待补充'}</Tag>
                    </span>
                  </Radio>
                ))}
              </Radio.Group>
            ) : (
              <Empty className="analysis-asset-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可分析素材，请先在内容管理中上传字幕" />
            )}
          </section>
          <section className="analysis-task-card">
            <h3>分析配置</h3>
            <div className="analysis-config-checks">
              <Checkbox defaultChecked>字幕解析</Checkbox>
              <Checkbox defaultChecked>时间轴对齐</Checkbox>
              <Checkbox defaultChecked>剧情分段</Checkbox>
              <Checkbox defaultChecked>高光识别</Checkbox>
              <Checkbox defaultChecked>互动建议生成</Checkbox>
            </div>
            <div className="analysis-config-switch">
              <span>人工复核</span>
              <Switch defaultChecked />
            </div>
            <div className="analysis-config-switch">
              <span>结果回写</span>
              <Switch defaultChecked />
            </div>
          </section>
        </div>
        <div className="upload-drama-footer analysis-task-footer">
          <Button>保存为草稿</Button>
          <Button onClick={() => setTaskModalOpen(false)}>取消</Button>
          <Button type="primary" loading={submitting} onClick={submitAnalysis}>
            提交分析
          </Button>
        </div>
      </Modal>

      <HighlightReviewModal
        episode={reviewEpisode}
        open={Boolean(reviewEpisode)}
        onClose={() => setReviewEpisode(null)}
        onUpdated={loadData}
      />
    </section>
  );
}

function MetricCard({ icon, tone, label, value }) {
  return (
    <article className={`analysis-metric-card ${tone}`}>
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function HighlightReviewModal({ episode, open, onClose, onUpdated }) {
  const videoRef = useRef(null);
  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [lastSelectedId, setLastSelectedId] = useState(null);
  const [editorMode, setEditorMode] = useState('edit');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [draft, setDraft] = useState(null);

  const loadHighlights = useCallback(async () => {
    if (!episode?.id) {
      return;
    }
    setLoading(true);
    try {
      const response = await apiClient.get(`/api/episodes/${episode.id}/highlights`);
      const nextHighlights = response.data.data ?? [];
      setHighlights(nextHighlights);
      const nextSelected = nextHighlights[0] ?? null;
      setSelectedId(nextSelected?.id ?? null);
      setLastSelectedId(nextSelected?.id ?? null);
      setEditorMode('edit');
      setDraft(nextSelected ? highlightToDraft(nextSelected) : null);
    } catch (error) {
      message.error(apiErrorMessage(error, '高光列表加载失败'));
    } finally {
      setLoading(false);
    }
  }, [episode]);

  useEffect(() => {
    if (open) {
      Promise.resolve().then(loadHighlights);
    }
  }, [loadHighlights, open]);

  const selectedHighlight = useMemo(
    () => highlights.find((highlight) => highlight.id === selectedId) ?? null,
    [highlights, selectedId],
  );

  const filteredHighlights = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return highlights.filter((highlight) => {
      if (typeFilter !== 'all' && highlight.highlight_type !== typeFilter) {
        return false;
      }
      if (statusFilter !== 'all' && highlight.status !== statusFilter) {
        return false;
      }
      if (normalizedKeyword && !`${highlight.reason} ${highlight.button_text} ${highlight.emotion}`.toLowerCase().includes(normalizedKeyword)) {
        return false;
      }
      return true;
    });
  }, [highlights, keyword, statusFilter, typeFilter]);

  const stats = useMemo(() => ({
    all: highlights.length,
    published: highlights.filter((item) => item.status === 'published').length,
    draft: highlights.filter((item) => item.status === 'draft').length,
    rejected: highlights.filter((item) => item.status === 'rejected').length,
  }), [highlights]);

  const selectHighlight = (highlight) => {
    setEditorMode('edit');
    setSelectedId(highlight.id);
    setLastSelectedId(highlight.id);
    setDraft(highlightToDraft(highlight));
    if (videoRef.current) {
      videoRef.current.currentTime = Number(highlight.start_time ?? 0);
    }
  };

  const syncDraftTime = (field) => {
    const nextTime = formatTimecode(videoRef.current?.currentTime ?? currentTime ?? 0);
    setDraft((current) => current ? { ...current, [field]: nextTime } : current);
  };

  const saveHighlight = async (override = {}) => {
    if (editorMode !== 'edit' || !selectedHighlight || !draft) {
      return;
    }
    const payload = {
      start_time: parseTimecode(draft.start_time),
      end_time: parseTimecode(draft.end_time),
      highlight_type: draft.highlight_type,
      reason: draft.reason,
      confidence: Number(draft.confidence ?? 0) / 100,
      status: draft.status,
      ...override,
    };
    setSaving(true);
    try {
      const response = await apiClient.put(`/api/highlights/${selectedHighlight.id}`, payload);
      const updated = response.data.data;
      setHighlights((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setDraft(highlightToDraft(updated));
      message.success('高光已保存');
      await onUpdated?.();
    } catch (error) {
      message.error(apiErrorMessage(error, '高光保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const updateHighlightRecord = async (record, override = {}) => {
    const payload = {
      start_time: record.start_time,
      end_time: record.end_time,
      highlight_type: record.highlight_type,
      reason: record.reason,
      confidence: record.confidence,
      status: record.status,
      ...override,
    };
    setSaving(true);
    try {
      const response = await apiClient.put(`/api/highlights/${record.id}`, payload);
      const updated = response.data.data;
      setHighlights((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedId(updated.id);
      setDraft(highlightToDraft(updated));
      message.success('高光已保存');
      await onUpdated?.();
    } catch (error) {
      message.error(apiErrorMessage(error, '高光保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const submitReview = async () => {
    if (!episode?.id) {
      return;
    }
    setSaving(true);
    try {
      const draftIds = highlights.filter((item) => item.status === 'draft').map((item) => item.id);
      if (draftIds.length) {
        await apiClient.post(`/api/episodes/${episode.id}/highlights/bulk-status`, {
          highlight_ids: draftIds,
          status: 'published',
        });
      }
      message.success(draftIds.length ? `已通过 ${draftIds.length} 条待审核高光` : '没有待提交的审核结果');
      await loadHighlights();
      await onUpdated?.();
    } catch (error) {
      message.error(apiErrorMessage(error, '提交审核结果失败'));
    } finally {
      setSaving(false);
    }
  };

  const duration = Number(episode?.duration ?? 0);
  const resolvedDuration = duration || videoDuration || 0;
  const rawVideoUrl = String(episode?.video_url ?? '');
  const videoUrl = rawVideoUrl
    ? (rawVideoUrl.startsWith('http')
      ? rawVideoUrl
      : rawVideoUrl.startsWith('/uploads')
        ? `${apiClient.defaults.baseURL}${rawVideoUrl}`
        : `${apiClient.defaults.baseURL}/api/player/episodes/${episode.id}/video`)
    : '';
  const progressPercent = resolvedDuration ? Math.min(100, Math.max(0, (currentTime / resolvedDuration) * 100)) : 0;
  const selectedMeta = draft
    ? (highlightTypeMeta[draft.highlight_type] ?? highlightTypeMeta.conflict)
    : null;
  const createStartTime = parseTimecode(draft?.start_time);
  const createEndTime = parseTimecode(draft?.end_time);
  const canCreateHighlight = editorMode !== 'create' || createEndTime > createStartTime;

  const startCreateHighlight = () => {
    if (!episode?.id) {
      return;
    }
    const timecode = formatTimecode(Math.max(0, Number(videoRef.current?.currentTime ?? currentTime ?? 0)));
    setLastSelectedId(selectedId ?? lastSelectedId);
    setSelectedId(null);
    setEditorMode('create');
    setDraft({
      start_time: timecode,
      end_time: timecode,
      highlight_type: 'satisfying',
      confidence: 50,
      reason: '',
      status: 'draft',
    });
  };

  const cancelCreateHighlight = () => {
    const fallback = highlights.find((item) => item.id === lastSelectedId) ?? highlights[0] ?? null;
    if (fallback) {
      selectHighlight(fallback);
      return;
    }
    setEditorMode('edit');
    setSelectedId(null);
    setDraft(null);
  };

  const createHighlight = async () => {
    if (!episode?.id || !draft) {
      return;
    }
    const startTime = parseTimecode(draft.start_time);
    const endTime = parseTimecode(draft.end_time);
    if (endTime <= startTime) {
      message.warning('结束时间必须大于开始时间');
      return;
    }
    setSaving(true);
    try {
      const response = await apiClient.post(`/api/episodes/${episode.id}/highlights`, {
        start_time: startTime,
        end_time: endTime,
        highlight_type: draft.highlight_type,
        emotion: '人工添加',
        intensity: 0.5,
        confidence: 0.5,
        trigger_score: 0.5,
        reason: draft.reason || '人工添加高光点',
        button_text: '精彩片段',
        effect: 'boom_effect',
        status: draft.status,
      });
      const created = response.data.data;
      setHighlights((current) => [...current, created].sort((a, b) => a.start_time - b.start_time));
      setEditorMode('edit');
      setSelectedId(created.id);
      setLastSelectedId(created.id);
      setDraft(highlightToDraft(created));
      message.success('已添加人工高光点');
      await onUpdated?.();
    } catch (error) {
      message.error(apiErrorMessage(error, '人工添加失败'));
    } finally {
      setSaving(false);
    }
  };

  const saveEditor = () => {
    if (editorMode === 'create') {
      return createHighlight();
    }
    return saveHighlight();
  };

  return (
    <Modal
      className="upload-drama-modal analysis-review-modal"
      title={null}
      open={open}
      onCancel={onClose}
      closable={false}
      footer={null}
      width="min(1480px, calc(100vw - 48px))"
      destroyOnHidden
    >
      <div className="upload-drama-header">
        <div>
          <h2>高光审核详情</h2>
          <p>基于视频内容识别的高光片段，可进行审核、修改、拒绝或手动添加高光点</p>
        </div>
        <Button type="text" className="upload-drama-close" icon={<CloseOutlined />} onClick={onClose} />
      </div>

      <div className="upload-drama-form analysis-review-form">
        <section className="upload-drama-card highlight-review-summary">
          <span className="highlight-review-cover">
            {episode?.cover_url ? <img src={episode.cover_url} alt="" /> : <span>{coverText(episode?.drama_title)}</span>}
          </span>
          <strong>{episode?.drama_title ?? '-'}</strong>
          <div><b>第 {episode?.episode_no ?? '-'} 集</b><span>集数</span></div>
          <div><b>{formatDuration(duration)}</b><span>时长</span></div>
          <div><b>{stageMeta[episode?.analyze_status]?.label ?? '-'}</b><span>分析状态</span></div>
          <time>分析完成时间：{episode?.latest_job?.updated_at ? new Date(episode.latest_job.updated_at).toLocaleString() : '-'}</time>
        </section>

        <div className="highlight-review-body">
          <section className="highlight-review-left">
            <div className="upload-drama-card highlight-video-panel">
              <h3>视频时间轴</h3>
              <div className="highlight-video-frame">
                {videoUrl ? (
                  <video
                    ref={videoRef}
                    controls
                    preload="metadata"
                    src={videoUrl}
                    poster={episode?.cover_url || undefined}
                    onLoadedMetadata={(event) => {
                      setCurrentTime(event.currentTarget.currentTime);
                      setVideoDuration(Number(event.currentTarget.duration || 0));
                    }}
                    onDurationChange={(event) => setVideoDuration(Number(event.currentTarget.duration || 0))}
                    onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                  />
                ) : (
                  <div className="highlight-video-empty">暂无可播放视频</div>
                )}
              </div>
              <div className="highlight-review-timeline">
                <div className="highlight-progress-track">
                  <span className="highlight-progress-fill" style={{ width: `${progressPercent}%` }} />
                  {highlights.map((highlight) => {
                    const left = resolvedDuration ? Math.min(98, Math.max(2, (highlight.start_time / resolvedDuration) * 100)) : 8;
                    const width = resolvedDuration ? Math.max(2, ((highlight.end_time - highlight.start_time) / resolvedDuration) * 100) : 5;
                    const meta = highlightTypeMeta[highlight.highlight_type] ?? highlightTypeMeta.conflict;
                    return (
                      <button
                        key={highlight.id}
                        className={`highlight-range ${highlight.highlight_type}${highlight.id === selectedId ? ' active' : ''}`}
                        style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                        title={`${meta.label} ${formatRange(highlight)}`}
                        type="button"
                        onClick={() => selectHighlight(highlight)}
                      >
                        <span>{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="highlight-timeline-axis">
                  <span>{formatDuration(currentTime)}</span>
                  <span>{formatDuration(resolvedDuration)}</span>
                </div>
              </div>
            </div>

          <div className="upload-drama-card highlight-edit-panel">
            <div className="highlight-edit-heading">
              <h3>{editorMode === 'create' ? '新增高光' : '编辑高光'}</h3>
              <div className="highlight-edit-heading-actions">
                {editorMode === 'create' ? (
                  <Button size="small" onClick={cancelCreateHighlight}>取消新增</Button>
                ) : null}
                <Button className="highlight-manual-action" size="small" type="primary" onClick={startCreateHighlight} loading={saving}>
                  新增高光
                </Button>
              </div>
            </div>
            {draft ? (
              <>
                <div className={`highlight-edit-current ${draft.highlight_type}`}>
                  <span>{editorMode === 'create' ? '正在新增' : '正在编辑'}：{selectedMeta?.label ?? '高光'}</span>
                  <strong>{editorMode === 'edit' && selectedHighlight ? formatRange(selectedHighlight) : `${draft.start_time} - ${draft.end_time}`}</strong>
                  <Tag color={highlightStatusMeta[draft.status]?.color}>{highlightStatusMeta[draft.status]?.label ?? draft.status}</Tag>
                </div>
                <div className="highlight-edit-grid">
                  <label>
                    <span className="highlight-field-title">
                      <span>开始时间</span>
                      <Button
                        className="highlight-time-sync"
                        icon={<AimOutlined />}
                        size="small"
                        type="text"
                        onClick={() => syncDraftTime('start_time')}
                      />
                    </span>
                    <Input value={draft.start_time} onChange={(event) => setDraft({ ...draft, start_time: event.target.value })} />
                  </label>
                  <label>
                    <span className="highlight-field-title">
                      <span>结束时间</span>
                      <Button
                        className="highlight-time-sync"
                        icon={<AimOutlined />}
                        size="small"
                        type="text"
                        onClick={() => syncDraftTime('end_time')}
                      />
                    </span>
                    <Input value={draft.end_time} onChange={(event) => setDraft({ ...draft, end_time: event.target.value })} />
                  </label>
                  <label>
                    <span>高光类型</span>
                    <Select
                      value={draft.highlight_type}
                      options={Object.entries(highlightTypeMeta).map(([value, meta]) => ({ value, label: meta.label }))}
                      onChange={(value) => setDraft({ ...draft, highlight_type: value })}
                    />
                  </label>
                  <label>
                    <span>置信度</span>
                    <InputNumber min={0} max={100} value={draft.confidence} addonAfter="%" disabled />
                  </label>
                  <label className="highlight-edit-reason">
                    <span>识别依据</span>
                    <Input.TextArea
                      maxLength={200}
                      rows={4}
                      showCount
                      value={draft.reason}
                      onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>审核状态</span>
                    <Select
                      value={draft.status}
                      options={editableHighlightStatuses.map((value) => ({ value, label: highlightStatusMeta[value].label }))}
                      onChange={(value) => setDraft({ ...draft, status: value })}
                    />
                  </label>
                </div>
              </>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无高光可编辑" />
            )}
          </div>
          </section>

        <section className="upload-drama-card highlight-review-right">
          <div className="highlight-list-title">
            <h3>高光列表（共 {filteredHighlights.length} 条）</h3>
            <div>
              <Select
                value={typeFilter}
                onChange={setTypeFilter}
                options={[{ value: 'all', label: '全部类型' }, ...Object.entries(highlightTypeMeta).map(([value, meta]) => ({ value, label: meta.label }))]}
              />
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                options={[{ value: 'all', label: '全部状态' }, ...editableHighlightStatuses.map((value) => ({ value, label: highlightStatusMeta[value].label }))]}
              />
              <Input
                className="highlight-review-search"
                allowClear
                suffix={<SearchOutlined />}
                placeholder="搜索识别依据关键词"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </div>
          </div>
          <Table
            className="highlight-review-table"
            rowKey="id"
            loading={loading}
            dataSource={filteredHighlights}
            pagination={false}
            onRow={(record) => ({ onClick: () => selectHighlight(record) })}
            rowClassName={(record) => (record.id === selectedId ? 'active' : '')}
            columns={[
              { title: '时间范围', width: 130, render: (_, record) => formatRange(record) },
              { title: '类型', width: 92, render: (_, record) => <Tag color={highlightTypeMeta[record.highlight_type]?.color}>{highlightTypeMeta[record.highlight_type]?.label ?? record.highlight_type}</Tag> },
              { title: '识别依据', dataIndex: 'reason', ellipsis: true },
              { title: '置信度', width: 88, render: (_, record) => `${Math.round(Number(record.confidence ?? 0) * 100)}%` },
              { title: '状态', width: 96, render: (_, record) => <Tag color={highlightStatusMeta[record.status]?.color}>{highlightStatusMeta[record.status]?.label ?? record.status}</Tag> },
              {
                title: '操作',
                width: 150,
                render: (_, record) => (
                  <div className="highlight-row-actions" onClick={(event) => event.stopPropagation()}>
                    {record.status === 'draft' ? (
                      <>
                        <Button size="small" onClick={() => updateHighlightRecord(record, { status: 'published' })}>通过</Button>
                        <Button size="small" onClick={() => selectHighlight(record)}>修改</Button>
                        <Button size="small" danger onClick={() => updateHighlightRecord(record, { status: 'rejected' })}>拒绝</Button>
                      </>
                    ) : <span>-</span>}
                  </div>
                ),
              },
            ]}
          />
        </section>
      </div>

      <div className="upload-drama-footer highlight-review-footer">
        <div className="highlight-review-stats">
          <span>全部 <b>{stats.all}</b></span>
          <span className="success">已通过 <b>{stats.published}</b></span>
          <span className="error">已拒绝 <b>{stats.rejected}</b></span>
          <span className="warning">待审核 <b>{stats.draft}</b></span>
        </div>
        <div>
          <Button onClick={onClose}>取消</Button>
          <Button loading={saving} disabled={!canCreateHighlight} onClick={saveEditor}>{editorMode === 'create' ? '创建高光' : '保存修改'}</Button>
          <Button type="primary" loading={saving} onClick={submitReview}>提交审核结果</Button>
        </div>
      </div>
      </div>
    </Modal>
  );
}

function highlightToDraft(highlight) {
  return {
    start_time: formatTimecode(highlight.start_time),
    end_time: formatTimecode(highlight.end_time),
    highlight_type: highlight.highlight_type,
    confidence: Math.round(Number(highlight.confidence ?? 0) * 100),
    reason: highlight.reason ?? '',
    status: highlight.status,
  };
}

function AnalyzeJobDetail({ jobId }) {
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [logs, setLogs] = useState([]);
  const [episode, setEpisode] = useState(null);
  const [drama, setDrama] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const [jobResponse, logsResponse, queueResponse] = await Promise.all([
        apiClient.get(`/api/system/jobs/${jobId}`),
        apiClient.get(`/api/system/jobs/${jobId}/logs`),
        apiClient.get('/api/analysis/queue', { params: { limit: 500 } }),
      ]);
      const nextJob = jobResponse.data.data;
      const payload = parsePayload(nextJob.payload_json);
      const nextEpisode = (queueResponse.data.data ?? []).find((item) => item.id === payload.episode_id);
      const nextDrama = nextEpisode
        ? { id: nextEpisode.drama_id, title: nextEpisode.drama_title, cover_url: nextEpisode.cover_url }
        : null;
      setJob(nextJob);
      setLogs(logsResponse.data.data ?? []);
      setEpisode(nextEpisode ?? null);
      setDrama(nextDrama ?? null);
    } catch (error) {
      message.error(apiErrorMessage(error, '任务详情加载失败'));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    Promise.resolve().then(loadDetail);
  }, [loadDetail]);

  if (!job && !loading) {
    return (
      <section className="workspace-table-panel">
        <Empty description="任务不存在或无权限查看" />
      </section>
    );
  }

  const payload = parsePayload(job?.payload_json);
  const previewRows = previewRowsForEpisode(episode, job);
  const timelineLogs = logs.length
    ? logs
    : [
        {
          id: 'job-created',
          level: 'info',
          message: '任务创建成功',
          context_json: '{}',
          created_at: job?.created_at,
        },
        {
          id: 'job-current',
          level: 'info',
          message: `当前状态 ${job?.status ?? 'pending'}，进度 ${Math.round(job?.progress ?? 0)}%`,
          context_json: '{}',
          created_at: job?.updated_at ?? job?.created_at,
        },
      ];
  const contentTags = ['高光识别', hasSubtitle(episode ?? {}) ? '字幕已同步' : '待补字幕', job?.status ?? 'pending'];
  const duration = formatDuration(episode?.duration);
  const createdClock = formatClock(job?.created_at);
  const coverTitle = drama?.title ?? '未知短剧';

  return (
    <section className="job-detail-page">
      <div className="job-detail-header">
        <div className="content-page-title">
          <h1>任务详情</h1>
        </div>
        <div className="job-detail-actions">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/workspace/analyze')}>
            返回任务队列
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadDetail}>
            重新分析
          </Button>
          <Button type="primary" className="content-upload-action" icon={<SendOutlined />}>
            提交人工复核
          </Button>
        </div>
      </div>

      <div className="job-detail-stack">
        <section className="job-detail-card job-content-card">
          <h3>内容信息</h3>
          <div className="job-content-body">
            <div className="job-content-cover">
              {coverTitle ? <span>{coverTitle}</span> : null}
            </div>
            <div className="job-content-main">
              <div className="job-content-meta-grid">
                <dl className="job-content-meta">
                  <div>
                    <dt>短剧名称:</dt>
                    <dd>{coverTitle}</dd>
                  </div>
                  <div>
                    <dt>剧集:</dt>
                    <dd>第 {episode?.episode_no ?? payload.episode_id ?? '-'} 集</dd>
                  </div>
                  <div>
                    <dt>时长:</dt>
                    <dd>{duration}</dd>
                  </div>
                  <div>
                    <dt>创建时间:</dt>
                    <dd>{createdClock}</dd>
                  </div>
                </dl>
              </div>
              <div className="job-content-tags">
                {contentTags.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="job-detail-card job-log-card">
          <h3>执行日志</h3>
          <div className="job-log-timeline">
            {timelineLogs.map((log, index) => {
              const active = index === Math.max(0, timelineLogs.length - 1);
              return (
                <div className={`job-timeline-row ${active ? 'active' : ''}`} key={log.id}>
                  <time>{formatClock(log.created_at)}</time>
                  <strong>{log.message}</strong>
                </div>
              );
            })}
            {job?.status !== 'success' ? (
              <div className="job-timeline-row muted">
                <time>{formatClock(job?.updated_at ?? job?.created_at)}</time>
                <strong>预计 1 分钟后进入互动建议生成</strong>
              </div>
            ) : null}
          </div>
          {job?.error ? <Alert type="error" showIcon message={job.error} /> : null}
        </section>

        <section className="job-detail-card job-result-card">
          <h3>识别结果预览</h3>
          <div className="job-result-layout">
            <div className="job-video-preview">
              <div className="job-video-frame">
                <span>{coverTitle}</span>
                <PlayCircleFilled />
                <em>{duration} / {duration}</em>
              </div>
            </div>
            <div className="job-waveform">
              {previewRows.map((row) => (
                <span className={`job-marker ${row.tone}`} style={{ left: `${row.position}%` }} key={row.id}>
                  <b>{row.type}</b>
                </span>
              ))}
              <div className="job-wave-bars">
                {Array.from({ length: 92 }, (_, index) => (
                  <i key={index} style={{ height: `${12 + ((index * 7) % 34)}px` }} />
                ))}
              </div>
              <div className="job-wave-times">
                <span>00:00</span>
                <span>00:55</span>
                <span>01:50</span>
                <span>02:45</span>
                <span>{duration}</span>
              </div>
            </div>
          </div>
          <div className="job-result-table">
            <div className="job-result-head">
              <span>时间段</span>
              <span>摘要</span>
              <span>类型</span>
              <span>置信度</span>
              <span>状态</span>
            </div>
            {previewRows.map((row) => (
              <div className="job-result-row" key={row.id}>
                <span>{row.time}</span>
                <strong>{row.summary}</strong>
                <Tag className={`job-type-tag ${row.tone}`}>{row.type}</Tag>
                <span>{row.confidence}</span>
                <Tag className="job-status-tag">{row.status}</Tag>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
