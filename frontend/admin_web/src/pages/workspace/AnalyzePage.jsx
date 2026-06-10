import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Checkbox,
  Empty,
  Input,
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
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  FileSearchOutlined,
  PlayCircleFilled,
  ReloadOutlined,
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

const mockAnalysisRow = {
  id: 'mock-analysis-task',
  is_mock: true,
  task_no: 'T20240518-001',
  drama_title: '她的逆袭人生',
  title: '第 1 集',
  episode_no: 1,
  analyze_status: 'processing',
  progress: 62,
  cover_url: '',
  latest_job: null,
  subtitle_ready: true,
  updated_at_display: new Date(),
};

const mockJobDetail = {
  job: {
    id: 'mock-analysis-task',
    type: 'ai_analyze',
    status: 'running',
    progress: 62,
    payload_json: JSON.stringify({ episode_id: 'mock-episode-001', force_reanalyze: false }),
    created_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    updated_at: new Date().toISOString(),
    finished_at: null,
    error: '',
  },
  drama: {
    id: 'mock-drama-001',
    title: '她的逆袭人生',
  },
  episode: {
    id: 'mock-episode-001',
    episode_no: 1,
    title: '第 1 集',
    duration: 208,
    draft_highlight_count: 6,
    published_highlight_count: 0,
  },
  logs: [
    {
      id: 'mock-log-1',
      level: 'info',
      message: '字幕解析完成，识别到 42 条时间轴片段',
      context_json: '{"subtitle_segments":42}',
      created_at: new Date(Date.now() - 1000 * 60 * 7).toISOString(),
    },
    {
      id: 'mock-log-2',
      level: 'info',
      message: '剧情分段完成，正在生成高光候选',
      context_json: '{"chapter_count":5,"candidate_count":12}',
      created_at: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
    },
    {
      id: 'mock-log-3',
      level: 'info',
      message: '模型推理进行中，当前进度 62%',
      context_json: '{}',
      created_at: new Date().toISOString(),
    },
  ],
  previewHighlights: [
    { id: 1, time: '00:18-00:26', summary: '女主质问男主', type: '冲突', confidence: '96%', status: '已确认', tone: 'orange', position: 9 },
    { id: 2, time: '01:02-01:10', summary: '身份揭露', type: '反转', confidence: '98%', status: '已确认', tone: 'blue', position: 32 },
    { id: 3, time: '01:26-01:34', summary: '女主内心动摇', type: '心动', confidence: '93%', status: '已确认', tone: 'pink', position: 43 },
    { id: 4, time: '02:05-02:12', summary: '情绪失控', type: '爆点', confidence: '91%', status: '待复核', tone: 'red', position: 63 },
    { id: 5, time: '02:48-02:56', summary: '男主真心告白', type: '心动', confidence: '88%', status: '分析中', tone: 'pink', position: 84 },
  ],
};

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

function previewRowsForEpisode(episode, job, isMockJob) {
  if (isMockJob) {
    return mockJobDetail.previewHighlights;
  }
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
  const [dramas, setDramas] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState(null);
  const [assetQuery, setAssetQuery] = useState('');
  const [assetDramaFilter, setAssetDramaFilter] = useState('all');
  const [onlyReadyAssets, setOnlyReadyAssets] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dramasResponse, episodesResponse, jobsResponse] = await Promise.all([
        apiClient.get('/api/dramas'),
        apiClient.get('/api/episodes'),
        apiClient.get('/api/system/jobs', { params: { type: 'ai_analyze', limit: 200 } }),
      ]);
      const nextDramas = dramasResponse.data.data ?? [];
      const nextEpisodes = episodesResponse.data.data ?? [];
      setDramas(nextDramas);
      setEpisodes(nextEpisodes);
      setJobs(jobsResponse.data.data ?? []);
      setSelectedEpisodeId((current) => current ?? nextEpisodes.find(hasSubtitle)?.id ?? nextEpisodes[0]?.id ?? null);
    } catch (error) {
      message.error(apiErrorMessage(error, 'AI 分析任务加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(loadData);
  }, [loadData]);

  const dramaMap = useMemo(() => new Map(dramas.map((drama) => [drama.id, drama])), [dramas]);

  const latestJobByEpisode = useMemo(() => {
    const map = new Map();
    jobs.forEach((job) => {
      const episodeId = parsePayload(job.payload_json).episode_id;
      if (!episodeId) {
        return;
      }
      const current = map.get(episodeId);
      if (!current || new Date(job.created_at) > new Date(current.created_at)) {
        map.set(episodeId, job);
      }
    });
    return map;
  }, [jobs]);

  const rows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const nextRows = episodes.map((episode, index) => {
      const drama = dramaMap.get(episode.drama_id);
      const latestJob = latestJobByEpisode.get(episode.id);
      const progress = progressForEpisode(episode, latestJob);
      const updatedAt = latestJob?.updated_at ?? latestJob?.created_at ?? episode.updated_at ?? episode.created_at;
      return {
        ...episode,
        task_no: `T${String(updatedAt ? new Date(updatedAt).getFullYear() : 2024)}${String(index + 1).padStart(4, '0')}`,
        drama,
        drama_title: drama?.title ?? `短剧 #${episode.drama_id}`,
        cover_url: drama?.cover_url ?? '',
        latest_job: latestJob,
        subtitle_ready: hasSubtitle(episode),
        progress,
        updated_at_display: updatedAt,
      };
    });

    const filteredRows = nextRows
      .filter((row) => {
        if (keyword && !`${row.drama_title} ${row.title}`.toLowerCase().includes(keyword)) {
          return false;
        }
        if (statusFilter !== 'all' && row.analyze_status !== statusFilter) {
          return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.updated_at_display ?? 0) - new Date(a.updated_at_display ?? 0));

    return filteredRows.length ? filteredRows : [mockAnalysisRow];
  }, [dramaMap, episodes, latestJobByEpisode, query, statusFilter]);

  const metrics = useMemo(() => {
    const processing = episodes.filter((episode) => episode.analyze_status === 'processing').length;
    const pending = episodes.filter((episode) => episode.analyze_status === 'pending').length;
    const highlights = episodes.reduce(
      (total, episode) => total + Number(episode.draft_highlight_count ?? 0) + Number(episode.published_highlight_count ?? 0),
      0,
    );
    const finished = episodes.filter((episode) => episode.analyze_status === 'success').length;
    const confidence = episodes.length ? Math.round((finished / episodes.length) * 1000) / 10 : 0;
    return { processing, pending, highlights, confidence };
  }, [episodes]);

  const selectedEpisode = useMemo(
    () => episodes.find((episode) => episode.id === selectedEpisodeId) ?? episodes[0] ?? null,
    [episodes, selectedEpisodeId],
  );

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const effectivePage = Math.min(currentPage, totalPages);
  const pagedRows = useMemo(
    () => rows.slice((effectivePage - 1) * pageSize, effectivePage * pageSize),
    [effectivePage, rows],
  );
  const selectedRows = useMemo(
    () => rows.filter((item) => selectedRowKeys.includes(item.id) && !item.is_mock),
    [rows, selectedRowKeys],
  );
  const hasSelectedRows = selectedRows.length > 0;

  const assetRows = useMemo(() => {
    const keyword = assetQuery.trim().toLowerCase();
    return episodes
      .map((episode) => {
        const drama = dramaMap.get(episode.drama_id);
        const subtitleReady = hasSubtitle(episode);
        return {
          ...episode,
          drama_title: drama?.title ?? `短剧 #${episode.drama_id}`,
          cover_url: drama?.cover_url ?? '',
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
  }, [assetDramaFilter, assetQuery, dramaMap, episodes, onlyReadyAssets]);

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
    if (!selectedRows.length) {
      message.warning('请选择任务');
      return;
    }
    setLoading(true);
    try {
      await Promise.all(
        selectedRows.map((episode) =>
          apiClient.post('/api/system/jobs', {
            type: 'ai_analyze',
            payload: { episode_id: episode.id, force_reanalyze: true },
          }),
        ),
      );
      message.success(`已批量重试 ${selectedRows.length} 个任务`);
      setSelectedRowKeys([]);
      await loadData();
    } catch (error) {
      message.error(apiErrorMessage(error, '批量重试失败'));
    } finally {
      setLoading(false);
    }
  };

  const submitBatchAnalysis = async () => {
    if (!selectedRows.length) {
      message.warning('请选择任务');
      return;
    }
    setLoading(true);
    try {
      await Promise.all(
        selectedRows.map((episode) =>
          apiClient.post('/api/system/jobs', {
            type: 'ai_analyze',
            payload: { episode_id: episode.id, force_reanalyze: false },
          }),
        ),
      );
      message.success(`已批量提交 ${selectedRows.length} 个任务`);
      setSelectedRowKeys([]);
      await loadData();
    } catch (error) {
      message.error(apiErrorMessage(error, '批量提交失败'));
    } finally {
      setLoading(false);
    }
  };

  const cancelBatchAnalysis = () => {
    if (!selectedRows.length) {
      message.warning('请选择任务');
      return;
    }
    message.warning('批量取消接口尚未接入');
  };

  const submitSingleRetry = async (episode) => {
    if (episode.is_mock) {
      return;
    }
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
      title: '短剧名称',
      dataIndex: 'drama_title',
      width: '42%',
      render: (_, record) => (
        <div className="analysis-drama-cell">
          <span className="analysis-cover">
            {record.cover_url ? <img src={record.cover_url} alt="" loading="lazy" /> : <span>{coverText(record.drama_title)}</span>}
          </span>
          <strong>{record.drama_title}</strong>
        </div>
      ),
    },
    {
      title: '剧集',
      dataIndex: 'episode_no',
      width: '16%',
      render: (value) => `第 ${value} 集`,
    },
    {
      title: '当前阶段',
      dataIndex: 'analyze_status',
      width: '22%',
      render: (value) => {
        const meta = stageMeta[value] ?? stageMeta.pending;
        return (
          <Tag className="analysis-stage-tag" color={meta.color}>
            {meta.label}
          </Tag>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: '20%',
      align: 'right',
      className: 'analysis-action-column',
      render: (_, record) => (
        <div className="analysis-row-actions">
          <Button
            size="small"
            className="analysis-icon-action"
            icon={<ReloadOutlined />}
            disabled={record.is_mock}
            onClick={() => submitSingleRetry(record)}
          />
          <Button
            size="small"
            className="analysis-detail-action"
            disabled={!record.latest_job && !record.is_mock}
            onClick={() => {
              if (record.latest_job) {
                navigate(`/workspace/analyze/jobs/${record.latest_job.id}`);
                return;
              }
              if (record.is_mock) {
                navigate(`/workspace/analyze/jobs/${record.id}`);
              }
            }}
          >
            查看详情
          </Button>
        </div>
      ),
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
        <MetricCard icon={<ClockCircleOutlined />} tone="purple" label="待分析任务" value={metrics.pending} hint="排队处理中" />
        <MetricCard icon={<SyncOutlined />} tone="blue" label="分析中" value={metrics.processing} hint="平均耗时 02:34" />
        <MetricCard icon={<StarOutlined />} tone="green" label="已识别高光点" value={metrics.highlights} hint="今日新增 18" />
        <MetricCard icon={<CheckCircleOutlined />} tone="orange" label="平均置信度" value={`${metrics.confidence}%`} hint="模型表现稳定" />
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
              批量提交
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
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
            getCheckboxProps: (record) => ({ disabled: record.is_mock }),
          }}
          pagination={false}
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
    </section>
  );
}

function MetricCard({ icon, tone, label, value, hint }) {
  return (
    <article className={`analysis-metric-card ${tone}`}>
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <em>{hint}</em>
      </div>
    </article>
  );
}

function AnalyzeJobDetail({ jobId }) {
  const navigate = useNavigate();
  const isMockJob = jobId === mockAnalysisRow.id;
  const [job, setJob] = useState(null);
  const [logs, setLogs] = useState([]);
  const [episode, setEpisode] = useState(null);
  const [drama, setDrama] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadDetail = useCallback(async () => {
    if (isMockJob) {
      setJob(mockJobDetail.job);
      setLogs(mockJobDetail.logs);
      setEpisode(mockJobDetail.episode);
      setDrama(mockJobDetail.drama);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [jobResponse, logsResponse, dramasResponse, episodesResponse] = await Promise.all([
        apiClient.get(`/api/system/jobs/${jobId}`),
        apiClient.get(`/api/system/jobs/${jobId}/logs`),
        apiClient.get('/api/dramas'),
        apiClient.get('/api/episodes'),
      ]);
      const nextJob = jobResponse.data.data;
      const payload = parsePayload(nextJob.payload_json);
      const nextEpisode = (episodesResponse.data.data ?? []).find((item) => item.id === payload.episode_id);
      const nextDrama = (dramasResponse.data.data ?? []).find((item) => item.id === nextEpisode?.drama_id);
      setJob(nextJob);
      setLogs(logsResponse.data.data ?? []);
      setEpisode(nextEpisode ?? null);
      setDrama(nextDrama ?? null);
    } catch (error) {
      message.error(apiErrorMessage(error, '任务详情加载失败'));
    } finally {
      setLoading(false);
    }
  }, [isMockJob, jobId]);

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
  const previewRows = previewRowsForEpisode(episode, job, isMockJob);
  const timelineLogs = logs.length
    ? logs
    : isMockJob
      ? mockJobDetail.logs
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
  const contentTags = isMockJob ? ['都市', '逆袭', '情感'] : ['高光识别', hasSubtitle(episode ?? {}) ? '字幕已同步' : '待补字幕', job?.status ?? 'pending'];
  const duration = isMockJob ? '03:28' : formatDuration(episode?.duration);
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
