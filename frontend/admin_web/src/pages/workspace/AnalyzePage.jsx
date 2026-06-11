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
  Tooltip,
  message,
} from 'antd';
import {
  AimOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  DownOutlined,
  FileSearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  RotateRightOutlined,
  SaveOutlined,
  SearchOutlined,
  SendOutlined,
  StarOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { apiClient, apiErrorMessage } from '../../services/apiClient.js';
import { HighlightTimelineEditor } from '../../components/HighlightTimelineEditor.jsx';
import { timelineLaneForHighlight } from '../../components/highlightTimelineUtils.js';

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
const highlightTypeOptions = Object.entries(highlightTypeMeta).map(([value, meta]) => ({ value, label: meta.label }));

const highlightStatusMeta = {
  draft: { label: '待审核', color: 'warning' },
  published: { label: '已通过', color: 'success' },
  rejected: { label: '已拒绝', color: 'error' },
  archived: { label: '已归档', color: 'default' },
};

const editableHighlightStatuses = ['draft', 'published', 'rejected'];

function notifyApiError(error) {
  message.error(apiErrorMessage(error));
}

function settledErrorMessage(results) {
  const errors = results
    .filter((result) => result.status === 'rejected')
    .map((result) => apiErrorMessage(result.reason))
    .filter(Boolean);
  return Array.from(new Set(errors)).join('；');
}

function emotionForHighlightType(type) {
  return highlightTypeMeta[type]?.label ?? highlightTypeMeta.satisfying.label;
}

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
  const [subtitleEpisode, setSubtitleEpisode] = useState(null);

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
      notifyApiError(error);
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
      const results = await Promise.allSettled(
        episodes.map((episode) =>
          apiClient.post('/api/system/jobs', {
            type: 'ai_analyze',
            payload: { episode_id: episode.id, force_reanalyze: true },
          }),
        ),
      );
      const successCount = results.filter((result) => result.status === 'fulfilled').length;
      if (successCount) {
        message.success(`已批量重试 ${successCount} 个任务`);
      }
      const errorMessage = settledErrorMessage(results);
      if (errorMessage) {
        message.error(errorMessage);
      }
      setSelectedRowKeys([]);
      await loadData();
    } catch (error) {
      notifyApiError(error);
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
      const results = await Promise.allSettled(
        episodes.map((episode) =>
          apiClient.post('/api/system/jobs', {
            type: 'ai_analyze',
            payload: { episode_id: episode.id, force_reanalyze: episode.analyze_status === 'failed' },
          }),
        ),
      );
      const successCount = results.filter((result) => result.status === 'fulfilled').length;
      if (successCount) {
        message.success(`已批量提交 ${successCount} 个分析任务`);
      }
      const errorMessage = settledErrorMessage(results);
      if (errorMessage) {
        message.error(errorMessage);
      }
      setSelectedRowKeys([]);
      await loadData();
    } catch (error) {
      notifyApiError(error);
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
      const results = await Promise.allSettled(
        episodes.map((episode) =>
          apiClient.post('/api/system/jobs', {
            type: 'ai_analyze',
            payload: { episode_id: episode.id, force_reanalyze: episode.analyze_status === 'failed' },
          }),
        ),
      );
      const successCount = results.filter((result) => result.status === 'fulfilled').length;
      if (successCount) {
        message.success(`已提交 ${successCount} 集分析任务`);
      }
      const errorMessage = settledErrorMessage(results);
      if (errorMessage) {
        message.error(errorMessage);
      }
      await loadData();
    } catch (error) {
      notifyApiError(error);
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
      notifyApiError(error);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '短剧名称 / 剧集',
      dataIndex: 'drama_title',
      width: '40%',
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
      width: '15%',
      render: (_, record) => {
        if (record.is_drama_group) {
          return `${record.finished_episodes} / ${record.total_episodes} 集`;
        } else {
          const meta = stageMeta[record.analyze_status] ?? stageMeta.pending;
          const failureReason = record.analyze_error || record.latest_job?.error;
          const tag = <Tag className="analysis-stage-tag" color={meta.color}>{meta.label}</Tag>;
          return record.analyze_status === 'failed' && failureReason ? (
            <Tooltip title={failureReason}>{tag}</Tooltip>
          ) : tag;
        }
      },
    },
    {
      title: '整体状态',
      width: '18%',
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
      width: 360,
      align: 'right',
      className: 'analysis-action-column',
      render: (_, record) => {
        if (record.is_drama_group) {
          return (
            <Button
              className="analysis-drama-action"
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
              <Button
                size="small"
                className="analysis-subtitle-action"
                icon={<FileSearchOutlined />}
                onClick={() => setSubtitleEpisode(record)}
              >
                字幕识别
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
      <SubtitleAsrModal
        episode={subtitleEpisode}
        open={Boolean(subtitleEpisode)}
        onClose={() => {
          setSubtitleEpisode(null);
          Promise.resolve().then(loadData);
        }}
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

const jobStatusMeta = {
  pending: { label: '排队中', color: 'default' },
  running: { label: '识别中', color: 'processing' },
  success: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
  canceled: { label: '已取消', color: 'default' },
};

function SubtitleAsrModal({ episode, open, onClose, onUpdated }) {
  const [currentEpisode, setCurrentEpisode] = useState(null);
  const [job, setJob] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!episode?.id) {
      return;
    }
    setLoading(true);
    try {
      const [queueResponse, jobsResponse] = await Promise.all([
        apiClient.get('/api/analysis/queue', { params: { limit: 500 } }),
        apiClient.get('/api/system/jobs', { params: { type: 'subtitle_asr', limit: 200 } }),
      ]);
      const nextEpisode = (queueResponse.data.data ?? []).find((item) => item.id === episode.id) ?? episode;
      const nextJob = (jobsResponse.data.data ?? []).find((item) => parsePayload(item.payload_json).episode_id === episode.id) ?? null;
      const nextLogs = nextJob
        ? (await apiClient.get(`/api/system/jobs/${nextJob.id}/logs`)).data.data ?? []
        : [];
      setCurrentEpisode(nextEpisode);
      setJob(nextJob);
      setLogs(nextLogs);
    } catch (error) {
      message.error(apiErrorMessage(error, '字幕识别结果加载失败'));
    } finally {
      setLoading(false);
    }
  }, [episode]);

  useEffect(() => {
    if (open) {
      Promise.resolve().then(loadDetail);
    }
  }, [loadDetail, open]);

  useEffect(() => {
    if (!open || !['pending', 'running'].includes(job?.status)) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      Promise.resolve().then(loadDetail);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [job?.status, loadDetail, open]);

  const submitSubtitleAsr = async (force = false) => {
    if (!episode?.id) {
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiClient.post('/api/system/jobs', {
        type: 'subtitle_asr',
        payload: { episode_id: episode.id, force },
      });
      setJob(response.data.data);
      setLogs([]);
      message.success('字幕识别任务已提交');
      await loadDetail();
      await onUpdated?.();
    } catch (error) {
      notifyApiError(error);
    } finally {
      setSubmitting(false);
    }
  };

  const requestSubtitleAsr = () => {
    const sourceEpisode = currentEpisode ?? episode;
    if (!sourceEpisode?.video_url) {
      message.warning('当前剧集没有可识别的视频文件');
      return;
    }
    if (hasSubtitle(sourceEpisode)) {
      Modal.confirm({
        title: '覆盖已有字幕？',
        content: '当前剧集已经有字幕内容，重新识别会覆盖现有字幕。',
        okText: '覆盖并识别',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => submitSubtitleAsr(true),
      });
      return;
    }
    submitSubtitleAsr(false);
  };

  const sourceEpisode = currentEpisode ?? episode;
  const statusMeta = jobStatusMeta[job?.status] ?? jobStatusMeta.pending;
  const subtitleContent = sourceEpisode?.subtitle_content?.trim() ?? '';
  const cueCount = subtitleContent ? (subtitleContent.match(/-->/g) ?? []).length : 0;
  const canStart = Boolean(sourceEpisode?.video_url);

  return (
    <Modal
      className="upload-drama-modal subtitle-asr-modal"
      title={null}
      open={open}
      onCancel={onClose}
      width={920}
      destroyOnHidden
      footer={null}
    >
      <div className="upload-drama-header">
        <div>
          <h2>字幕识别</h2>
          <p>查看本地语音识别结果并重新提交字幕识别任务</p>
        </div>
        <Button type="text" className="upload-drama-close" icon={<CloseOutlined />} onClick={onClose} />
      </div>

      <div className="upload-drama-form subtitle-asr-form">
        <section className="upload-drama-card subtitle-asr-summary">
          <div className="subtitle-asr-title">
            <strong>{sourceEpisode?.drama_title ?? '-'}</strong>
            <span>第 {sourceEpisode?.episode_no ?? '-'} 集</span>
          </div>
          <div className="subtitle-asr-meta">
            <Tag color={hasSubtitle(sourceEpisode ?? {}) ? 'success' : 'warning'}>
              {hasSubtitle(sourceEpisode ?? {}) ? '字幕已写回' : '暂无字幕'}
            </Tag>
            <Tag color={statusMeta.color}>{job ? statusMeta.label : '未提交'}</Tag>
            <span>字幕段落 {cueCount}</span>
            <span>更新时间 {sourceEpisode?.updated_at ? new Date(sourceEpisode.updated_at).toLocaleString() : '-'}</span>
          </div>
        </section>

        {job?.error ? (
          <Alert type="error" showIcon message="字幕识别失败" description={job.error} />
        ) : null}

        <section className="upload-drama-card subtitle-asr-result">
          <div className="subtitle-asr-section-title">
            <h3>识别字幕</h3>
            <span>{sourceEpisode?.subtitle_original_name || sourceEpisode?.subtitle_url || '-'}</span>
          </div>
          <Input.TextArea value={subtitleContent || '暂无识别结果'} readOnly autoSize={false} />
        </section>

        <section className="upload-drama-card subtitle-asr-log-card">
          <div className="subtitle-asr-section-title">
            <h3>执行日志</h3>
            <span>{job?.id ? `任务 #${job.id}` : '暂无任务'}</span>
          </div>
          <div className="subtitle-asr-logs">
            {logs.length ? logs.map((log) => (
              <div key={log.id} className="subtitle-asr-log-row">
                <Tag color={log.level === 'error' ? 'error' : log.level === 'warning' ? 'warning' : 'processing'}>
                  {log.level}
                </Tag>
                <span>{log.created_at ? new Date(log.created_at).toLocaleString() : '-'}</span>
                <p>{log.message}</p>
              </div>
            )) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无执行日志" />
            )}
          </div>
        </section>
      </div>

      <div className="upload-drama-footer">
        <Button onClick={onClose}>关闭</Button>
        <Button icon={<ReloadOutlined />} onClick={loadDetail} loading={loading}>重新加载</Button>
        <Button
          type="primary"
          icon={<FileSearchOutlined />}
          onClick={requestSubtitleAsr}
          loading={submitting}
          disabled={!canStart}
        >
          开始识别
        </Button>
      </div>
    </Modal>
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
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [draft, setDraft] = useState(null);
  const [dirtyDrafts, setDirtyDrafts] = useState({});
  const [historyStack, setHistoryStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [selectedHighlightKeys, setSelectedHighlightKeys] = useState([]);

  const snapshotTimeline = useCallback(() => ({
    highlights,
    dirtyDrafts,
    selectedId,
    draft,
  }), [dirtyDrafts, draft, highlights, selectedId]);

  const pushHistory = useCallback(() => {
    const snapshot = snapshotTimeline();
    setHistoryStack((current) => [...current.slice(-24), snapshot]);
    setRedoStack([]);
  }, [snapshotTimeline]);

  const restoreSnapshot = (snapshot) => {
    setHighlights(snapshot.highlights);
    setDirtyDrafts(snapshot.dirtyDrafts);
    setSelectedId(snapshot.selectedId);
    setDraft(snapshot.draft);
  };

  const undoTimeline = () => {
    setHistoryStack((current) => {
      if (!current.length) {
        return current;
      }
      const previous = current[current.length - 1];
      setRedoStack((redoCurrent) => [...redoCurrent, snapshotTimeline()]);
      restoreSnapshot(previous);
      return current.slice(0, -1);
    });
  };

  const redoTimeline = () => {
    setRedoStack((current) => {
      if (!current.length) {
        return current;
      }
      const next = current[current.length - 1];
      setHistoryStack((historyCurrent) => [...historyCurrent, snapshotTimeline()]);
      restoreSnapshot(next);
      return current.slice(0, -1);
    });
  };

  const loadHighlights = useCallback(async () => {
    if (!episode?.id) {
      return;
    }
    setLoading(true);
    try {
      const response = await apiClient.get(`/api/episodes/${episode.id}/highlights`);
      const nextHighlights = response.data.data ?? [];
      setHighlights(nextHighlights);
      setSelectedId(null);
      setDraft(null);
      setDirtyDrafts({});
      setHistoryStack([]);
      setRedoStack([]);
      setSelectedHighlightKeys([]);
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

  const displayHighlights = useMemo(() => highlights.map((highlight) => {
    const itemDraft = dirtyDrafts[highlight.id];
    if (itemDraft?._deleted) {
      return null;
    }
    if (!itemDraft) {
      return highlight;
    }
    return {
      ...highlight,
      start_time: parseTimecode(itemDraft.start_time),
      end_time: parseTimecode(itemDraft.end_time),
      highlight_type: itemDraft.highlight_type,
      confidence: Number(itemDraft.confidence ?? 0) / 100,
      reason: itemDraft.reason,
      status: itemDraft.status,
    };
  }).filter(Boolean), [dirtyDrafts, highlights]);

  const filteredHighlights = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return displayHighlights.filter((highlight) => {
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
  }, [displayHighlights, keyword, statusFilter, typeFilter]);

  const stats = useMemo(() => ({
    all: displayHighlights.length,
    published: displayHighlights.filter((item) => item.status === 'published').length,
    draft: displayHighlights.filter((item) => item.status === 'draft').length,
    rejected: displayHighlights.filter((item) => item.status === 'rejected').length,
  }), [displayHighlights]);

  const hasUnsavedChanges = Object.keys(dirtyDrafts).length > 0;

  const requestClose = () => {
    if (!hasUnsavedChanges) {
      onClose();
      return;
    }
    Modal.confirm({
      title: '有未保存的高光修改',
      content: '关闭后，当前已修改但未保存的高光内容会丢失。',
      okText: '放弃修改',
      cancelText: '继续编辑',
      okButtonProps: { danger: true },
      onOk: onClose,
    });
  };

  const selectHighlight = (highlight) => {
    setSelectedId(highlight.id);
    setDraft(dirtyDrafts[highlight.id] ?? highlightToDraft(highlight));
    if (videoRef.current) {
      videoRef.current.currentTime = Number(highlight.start_time ?? 0);
    }
  };

  const writeDraftForHighlight = (highlight, patch, options = {}) => {
    if (!highlight?.id) {
      return;
    }
    if (options.history !== false) {
      pushHistory();
    }
    const baseDraft = dirtyDrafts[highlight.id] ?? highlightToDraft(highlight);
    const nextDraft = { ...baseDraft, ...patch };
    setDirtyDrafts((current) => ({ ...current, [highlight.id]: nextDraft }));
    setHighlights((current) => current.map((item) => (item.id === highlight.id ? { ...item, ...draftToHighlightFields(nextDraft) } : item)));
    if (options.select) {
      setSelectedId(highlight.id);
      setDraft(nextDraft);
    } else if (selectedId === highlight.id) {
      setDraft(nextDraft);
    }
  };

  const updateDraft = (patch, options = {}) => {
    if (!draft || !selectedId) {
      return;
    }
    if (options.history !== false) {
      pushHistory();
    }
    const nextDraft = { ...draft, ...patch };
    setDraft(nextDraft);
    setDirtyDrafts((current) => ({ ...current, [selectedId]: nextDraft }));
    setHighlights((current) => current.map((item) => (item.id === selectedId ? { ...item, ...draftToHighlightFields(nextDraft) } : item)));
  };

  const syncDraftTime = (field) => {
    const nextTime = formatTimecode(videoRef.current?.currentTime ?? currentTime ?? 0);
    updateDraft({ [field]: nextTime });
  };

  const draftToPayload = (nextDraft, override = {}) => ({
    start_time: parseTimecode(nextDraft.start_time),
    end_time: parseTimecode(nextDraft.end_time),
    highlight_type: nextDraft.highlight_type,
    reason: nextDraft.reason,
    confidence: Number(nextDraft.confidence ?? 0) / 100,
    status: nextDraft.status,
    ...override,
  });

  const saveCurrentChange = async () => {
    if (!selectedId || !draft) {
      message.warning('请先选择需要保存的高光');
      return;
    }
    const nextDraft = dirtyDrafts[selectedId] ?? draft;
    if (parseTimecode(nextDraft.end_time) <= parseTimecode(nextDraft.start_time)) {
      message.warning('结束时间必须大于开始时间');
      return;
    }
    setSaving(true);
    try {
      if (String(selectedId).startsWith('tmp-')) {
        const response = await apiClient.post(`/api/episodes/${episode.id}/highlights`, {
          start_time: parseTimecode(nextDraft.start_time),
          end_time: parseTimecode(nextDraft.end_time),
          highlight_type: nextDraft.highlight_type,
          emotion: nextDraft.emotion || emotionForHighlightType(nextDraft.highlight_type),
          intensity: 0.5,
          confidence: Number(nextDraft.confidence ?? 0) / 100,
          trigger_score: 0.5,
          reason: nextDraft.reason || '手动创建高光区间',
          button_text: '精彩片段',
          effect: 'boom_effect',
          status: nextDraft.status,
        });
        const created = response.data.data;
        setHighlights((current) => [
          ...current.filter((item) => item.id !== selectedId),
          created,
        ].sort((a, b) => a.start_time - b.start_time));
        setSelectedId(created.id);
        setDraft(highlightToDraft(created));
        setSelectedHighlightKeys((current) => current.map((key) => (key === selectedId ? created.id : key)));
        setDirtyDrafts((current) => {
          const next = { ...current };
          delete next[selectedId];
          return next;
        });
      } else {
        const response = await apiClient.put(`/api/highlights/${selectedId}`, draftToPayload(nextDraft));
        const updated = response.data.data;
        setHighlights((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setDraft(highlightToDraft(updated));
        setDirtyDrafts((current) => {
          const next = { ...current };
          delete next[selectedId];
          return next;
        });
      }
      message.success('当前高光已保存');
      await onUpdated?.();
    } catch (error) {
      message.error(apiErrorMessage(error, '当前高光保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const saveAllChanges = async () => {
    const entries = Object.entries(dirtyDrafts);
    if (!entries.length) {
      message.info('没有需要保存的修改');
      return;
    }
    const invalid = entries.find(([, item]) => !item._deleted && parseTimecode(item.end_time) <= parseTimecode(item.start_time));
    if (invalid) {
      message.warning('结束时间必须大于开始时间');
      return;
    }
    setSaving(true);
    try {
      const responses = await Promise.all(entries.map(([id, item]) => {
        if (item._deleted) {
          return apiClient.put(`/api/highlights/${id}`, draftToPayload(item, { status: 'archived' }));
        }
        if (String(id).startsWith('tmp-')) {
          return apiClient.post(`/api/episodes/${episode.id}/highlights`, {
            start_time: parseTimecode(item.start_time),
            end_time: parseTimecode(item.end_time),
            highlight_type: item.highlight_type,
            emotion: item.emotion || emotionForHighlightType(item.highlight_type),
            intensity: 0.5,
            confidence: Number(item.confidence ?? 0) / 100,
            trigger_score: 0.5,
            reason: item.reason || '手动创建高光区间',
            button_text: '精彩片段',
            effect: 'boom_effect',
            status: item.status,
          });
        }
        return apiClient.put(`/api/highlights/${id}`, draftToPayload(item));
      }));
      const deletedIds = new Set(entries.filter(([, item]) => item._deleted).map(([id]) => id));
      const tempIds = new Set(entries.filter(([id]) => String(id).startsWith('tmp-')).map(([id]) => id));
      const updatedItems = responses.map((response) => response.data.data).filter((item) => item.status !== 'archived');
      const updatedMap = new Map(updatedItems.map((item) => [item.id, item]));
      setHighlights((current) => [
        ...current.filter((item) => !deletedIds.has(String(item.id)) && !tempIds.has(String(item.id))).map((item) => updatedMap.get(item.id) ?? item),
        ...updatedItems.filter((item) => !current.some((currentItem) => currentItem.id === item.id)),
      ].sort((a, b) => a.start_time - b.start_time));
      if (selectedId && updatedMap.has(selectedId)) {
        setDraft(highlightToDraft(updatedMap.get(selectedId)));
      } else if (selectedId && (deletedIds.has(String(selectedId)) || tempIds.has(String(selectedId)))) {
        setSelectedId(null);
        setDraft(null);
      }
      setDirtyDrafts({});
      setHistoryStack([]);
      setRedoStack([]);
      message.success(`已保存 ${updatedItems.length} 条高光修改`);
      await onUpdated?.();
    } catch (error) {
      message.error(apiErrorMessage(error, '高光保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const updateSelectedHighlightsStatus = async (status) => {
    const selectedRecords = displayHighlights.filter((item) => selectedHighlightKeys.includes(item.id));
    if (!selectedRecords.length) {
      message.warning('请先选择高光区间');
      return;
    }
    setSaving(true);
    try {
      const temporaryRecords = selectedRecords.filter((item) => String(item.id).startsWith('tmp-'));
      const savedRecords = selectedRecords.filter((item) => !String(item.id).startsWith('tmp-'));
      if (temporaryRecords.length) {
        setHighlights((current) => current.map((item) => (
          temporaryRecords.some((record) => record.id === item.id) ? { ...item, status } : item
        )));
        setDirtyDrafts((current) => {
          const next = { ...current };
          temporaryRecords.forEach((record) => {
            next[record.id] = { ...(next[record.id] ?? highlightToDraft(record)), status };
          });
          return next;
        });
      }
      if (savedRecords.length) {
        const responses = await Promise.all(savedRecords.map((record) => apiClient.put(`/api/highlights/${record.id}`, {
          start_time: record.start_time,
          end_time: record.end_time,
          highlight_type: record.highlight_type,
          reason: record.reason,
          confidence: record.confidence,
          status,
        })));
        const updatedItems = responses.map((response) => response.data.data);
        const updatedMap = new Map(updatedItems.map((item) => [item.id, item]));
        setHighlights((current) => current.map((item) => updatedMap.get(item.id) ?? item));
        setDirtyDrafts((current) => {
          const next = { ...current };
          updatedItems.forEach((item) => {
            delete next[item.id];
          });
          return next;
        });
        if (selectedId && updatedMap.has(selectedId)) {
          setDraft(highlightToDraft(updatedMap.get(selectedId)));
        }
      }
      message.success(status === 'published' ? '已通过选中高光' : '已拒绝选中高光');
      await onUpdated?.();
    } catch (error) {
      message.error(apiErrorMessage(error, '批量处理失败'));
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
  const selectedMeta = draft
    ? (highlightTypeMeta[draft.highlight_type] ?? highlightTypeMeta.conflict)
    : null;

  const createOneSecondHighlight = () => {
    if (!episode?.id) {
      return;
    }
    pushHistory();
    let startTime = Math.max(0, Number(videoRef.current?.currentTime ?? currentTime ?? 0));
    let endTime = startTime + 1;
    if (resolvedDuration && endTime > resolvedDuration) {
      endTime = resolvedDuration;
      startTime = Math.max(0, endTime - 1);
    }
    if (endTime <= startTime) {
      endTime = startTime + 1;
    }
    const nextType = draft?.highlight_type && highlightTypeMeta[draft.highlight_type] ? draft.highlight_type : 'satisfying';
    const created = {
      id: `tmp-${Date.now()}`,
      episode_id: episode.id,
      start_time: startTime,
      end_time: endTime,
      highlight_type: nextType,
      emotion: emotionForHighlightType(nextType),
      intensity: 0.5,
      confidence: 0.5,
      trigger_score: 0.5,
      reason: draft?.reason || '手动创建高光区间',
      button_text: '精彩片段',
      effect: 'boom_effect',
      status: draft?.status ?? 'draft',
    };
    const nextDraft = highlightToDraft(created);
    setHighlights((current) => [...current, created].sort((a, b) => a.start_time - b.start_time));
    setDirtyDrafts((current) => ({ ...current, [created.id]: { ...nextDraft, emotion: created.emotion } }));
    setSelectedId(created.id);
    setDraft(nextDraft);
    if (videoRef.current) {
      videoRef.current.currentTime = Number(created.start_time ?? 0);
    }
    message.success('已添加人工高光区间，保存后生效');
  };

  const deleteSelectedHighlight = () => {
    const selected = displayHighlights.find((item) => item.id === selectedId);
    if (!selected) {
      message.warning('请先选择高光区间');
      return;
    }
    pushHistory();
    if (String(selected.id).startsWith('tmp-')) {
      setHighlights((current) => current.filter((item) => item.id !== selected.id));
      setDirtyDrafts((current) => {
        const next = { ...current };
        delete next[selected.id];
        return next;
      });
    } else {
      const nextDraft = { ...(dirtyDrafts[selected.id] ?? highlightToDraft(selected)), _deleted: true };
      setDirtyDrafts((current) => ({ ...current, [selected.id]: nextDraft }));
    }
    setSelectedId(null);
    setDraft(null);
  };

  const splitSelectedHighlight = () => {
    const selected = displayHighlights.find((item) => item.id === selectedId);
    const splitTime = Number(videoRef.current?.currentTime ?? currentTime ?? 0);
    if (!selected || splitTime <= selected.start_time || splitTime >= selected.end_time) {
      message.warning('播放时间需要位于选中区间内部');
      return;
    }
    pushHistory();
    const leftDraft = { ...(dirtyDrafts[selected.id] ?? highlightToDraft(selected)), end_time: formatTimecode(splitTime) };
    const right = {
      ...selected,
      id: `tmp-${Date.now()}`,
      start_time: splitTime,
      reason: selected.reason || '拆分高光区间',
      status: 'draft',
      emotion: selected.emotion || emotionForHighlightType(selected.highlight_type),
    };
    const rightDraft = highlightToDraft(right);
    setHighlights((current) => [...current.map((item) => (item.id === selected.id ? { ...item, end_time: splitTime } : item)), right].sort((a, b) => a.start_time - b.start_time));
    setDirtyDrafts((current) => ({ ...current, [selected.id]: leftDraft, [right.id]: { ...rightDraft, emotion: right.emotion } }));
    setSelectedId(right.id);
    setDraft(rightDraft);
  };

  const mergeAdjacentHighlight = () => {
    const selected = displayHighlights.find((item) => item.id === selectedId);
    if (!selected) {
      message.warning('请先选择高光区间');
      return;
    }
    const sameLane = displayHighlights
      .filter((item) => timelineLaneForHighlight(item) === timelineLaneForHighlight(selected) && item.id !== selected.id)
      .sort((a, b) => Math.abs(a.start_time - selected.end_time) - Math.abs(b.start_time - selected.end_time));
    const target = sameLane.find((item) => Math.abs(item.start_time - selected.end_time) <= 3 || Math.abs(selected.start_time - item.end_time) <= 3);
    if (!target) {
      message.warning('没有可合并的相邻同轨道区间');
      return;
    }
    pushHistory();
    const mergedStart = Math.min(selected.start_time, target.start_time);
    const mergedEnd = Math.max(selected.end_time, target.end_time);
    const mergedDraft = {
      ...(dirtyDrafts[selected.id] ?? highlightToDraft(selected)),
      start_time: formatTimecode(mergedStart),
      end_time: formatTimecode(mergedEnd),
    };
    setHighlights((current) => current
      .filter((item) => item.id !== target.id)
      .map((item) => (item.id === selected.id ? { ...item, start_time: mergedStart, end_time: mergedEnd } : item)));
    setDirtyDrafts((current) => {
      const next = { ...current, [selected.id]: mergedDraft };
      if (String(target.id).startsWith('tmp-')) {
        delete next[target.id];
      } else {
        next[target.id] = { ...(current[target.id] ?? highlightToDraft(target)), _deleted: true };
      }
      return next;
    });
    setDraft(mergedDraft);
  };

  return (
    <Modal
      className="upload-drama-modal analysis-review-modal"
      title={null}
      open={open}
      onCancel={requestClose}
      closable={false}
      footer={null}
      width="min(1480px, calc(100vw - 48px))"
      destroyOnHidden
    >
      <div className="upload-drama-header">
        <div className="analysis-review-titleline">
          <h2>高光播放编辑器</h2>
          <p>基于视频内容识别的高光片段，可进行审核、修改、拒绝或手动添加高光点</p>
        </div>
        <Button type="text" className="upload-drama-close" icon={<CloseOutlined />} onClick={requestClose} />
      </div>

      <div className="upload-drama-form analysis-review-form">
        <div className="highlight-review-body">
          <section className="highlight-review-left">
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
            <div className="upload-drama-card highlight-video-panel">
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
            </div>
            <HighlightTimelineEditor
              currentTime={currentTime}
              duration={resolvedDuration}
              highlights={displayHighlights}
              selectedId={selectedId}
              onCreate={createOneSecondHighlight}
              onDelete={deleteSelectedHighlight}
              onMerge={mergeAdjacentHighlight}
              onRedo={redoTimeline}
              onSeek={(time) => {
                setCurrentTime(time);
                if (videoRef.current) {
                  videoRef.current.currentTime = time;
                }
              }}
              onSelect={selectHighlight}
              onSplit={splitSelectedHighlight}
              onUndo={undoTimeline}
              onUpdate={writeDraftForHighlight}
              redoDisabled={!redoStack.length}
              undoDisabled={!historyStack.length}
            />
          </section>

          <aside className="highlight-review-side">
            <div className="upload-drama-card highlight-edit-panel">
              <div className="highlight-edit-heading">
                <h3>区间编辑</h3>
                <div className="highlight-edit-heading-actions">
                  <Button
                    aria-label="新增高光"
                    className="highlight-add-action"
                    icon={<PlusOutlined />}
                    size="small"
                    title="新增高光"
                    type="primary"
                    onClick={createOneSecondHighlight}
                    loading={saving}
                  />
                  <Button
                    className="highlight-save-action"
                    icon={<SaveOutlined />}
                    size="small"
                    onClick={saveCurrentChange}
                    loading={saving}
                    disabled={!draft}
                  >
                    保存
                  </Button>
                </div>
              </div>
              {draft ? (
                <>
                  <div className={`highlight-edit-current edit ${draft.highlight_type}`}>
                    <span>正在编辑：{selectedMeta?.label ?? '高光'}</span>
                    <strong>{`${draft.start_time} - ${draft.end_time}`}</strong>
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
                      <Input value={draft.start_time} onChange={(event) => updateDraft({ start_time: event.target.value })} />
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
                      <Input value={draft.end_time} onChange={(event) => updateDraft({ end_time: event.target.value })} />
                    </label>
                    <label>
                      <span>高光类型</span>
                      <Select
                        className="upload-category-select"
                        value={draft.highlight_type}
                        options={highlightTypeOptions}
                        onChange={(value) => updateDraft({ highlight_type: value })}
                      />
                    </label>
                    <label>
                      <span>置信度</span>
                      <InputNumber min={0} max={100} value={draft.confidence} addonAfter="%" onChange={(value) => updateDraft({ confidence: value ?? 0 })} />
                    </label>
                    <label className="highlight-edit-reason">
                      <span>识别依据</span>
                      <Input.TextArea
                        maxLength={200}
                        rows={2}
                        showCount
                        value={draft.reason}
                        onChange={(event) => updateDraft({ reason: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>审核状态</span>
                      <Select
                        className="upload-category-select"
                        value={draft.status}
                        options={editableHighlightStatuses.map((value) => ({ value, label: highlightStatusMeta[value].label }))}
                        onChange={(value) => updateDraft({ status: value })}
                      />
                    </label>
                  </div>
                </>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择高光区间，或点击右上角 + 新增" />
              )}
            </div>
            <section className="upload-drama-card highlight-review-right">
              <div className="highlight-list-title">
                <div className="highlight-list-heading">
                  <h3>区间列表（共 {filteredHighlights.length} 条）</h3>
                  <div className="highlight-list-actions">
                    <Button
                      aria-label="通过选中高光"
                      className="highlight-row-icon pass"
                      disabled={!selectedHighlightKeys.length}
                      icon={<CheckOutlined />}
                      size="small"
                      title="通过选中高光"
                      onClick={() => updateSelectedHighlightsStatus('published')}
                    />
                    <Button
                      aria-label="拒绝选中高光"
                      className="highlight-row-icon reject"
                      disabled={!selectedHighlightKeys.length}
                      icon={<CloseCircleOutlined />}
                      size="small"
                      title="拒绝选中高光"
                      onClick={() => updateSelectedHighlightsStatus('rejected')}
                    />
                  </div>
                </div>
                <div className="highlight-list-filters">
                  <Select
                    value={typeFilter}
                    onChange={setTypeFilter}
                    options={[{ value: 'all', label: '全部类型' }, ...highlightTypeOptions]}
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
                tableLayout="fixed"
                rowSelection={{
                  selectedRowKeys: selectedHighlightKeys,
                  onChange: setSelectedHighlightKeys,
                  columnWidth: 38,
                }}
                scroll={{ y: '100%' }}
                onRow={(record) => ({ onClick: () => selectHighlight(record) })}
                rowClassName={(record) => (record.id === selectedId ? 'active' : '')}
                columns={[
                  { title: '时间', width: 104, render: (_, record) => formatRange(record).replace(' - ', '-') },
                  { title: '类型', width: 70, render: (_, record) => <Tag color={highlightTypeMeta[record.highlight_type]?.color}>{highlightTypeMeta[record.highlight_type]?.label ?? record.highlight_type}</Tag> },
                  { title: '置信度', width: 70, render: (_, record) => `${Math.round(Number(record.confidence ?? 0) * 100)}%` },
                  { title: '状态', width: 78, render: (_, record) => <Tag color={highlightStatusMeta[record.status]?.color}>{highlightStatusMeta[record.status]?.label ?? record.status}</Tag> },
                ]}
              />
            </section>
          </aside>
        </div>

        <div className="upload-drama-footer highlight-review-footer">
          <div className="highlight-review-stats">
            <span>全部 <b>{stats.all}</b></span>
            <span className="success">已通过 <b>{stats.published}</b></span>
            <span className="error">已拒绝 <b>{stats.rejected}</b></span>
            <span className="warning">待审核 <b>{stats.draft}</b></span>
          </div>
          <div>
            <Button onClick={requestClose}>取消</Button>
            <Button loading={saving} disabled={!hasUnsavedChanges} onClick={saveAllChanges}>保存所有修改</Button>
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
    emotion: highlight.emotion ?? '',
  };
}

function draftToHighlightFields(draft) {
  return {
    start_time: parseTimecode(draft.start_time),
    end_time: parseTimecode(draft.end_time),
    highlight_type: draft.highlight_type,
    confidence: Number(draft.confidence ?? 0) / 100,
    reason: draft.reason,
    status: draft.status,
    emotion: draft.emotion,
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
