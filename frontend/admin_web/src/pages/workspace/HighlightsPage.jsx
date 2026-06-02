import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Select,
  Space,
  Tabs,
  Tag,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  EditOutlined,
  InboxOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { apiClient, apiErrorMessage } from '../../services/apiClient.js';

const { TextArea } = Input;

const highlightTypes = ['conflict', 'reversal', 'sweet', 'satisfying', 'suspense'];
const effects = ['anger_bar', 'screen_flash', 'heart_rain', 'boom_effect', 'countdown'];
const statuses = ['draft', 'published', 'rejected', 'archived'];

const statusColors = {
  draft: 'warning',
  published: 'success',
  rejected: 'error',
  archived: 'default',
  pending: 'default',
  processing: 'processing',
  success: 'success',
  failed: 'error',
};

function formatTime(value) {
  const seconds = Math.max(0, Math.round(Number(value ?? 0)));
  const minute = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minute).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function sumBy(items, key) {
  return items.reduce((total, item) => total + Number(item[key] ?? 0), 0);
}

export default function HighlightsPage() {
  const { dramaId } = useParams();
  return dramaId ? <DramaReviewDetail dramaId={Number(dramaId)} /> : <ReviewQueue />;
}

function ReviewQueue() {
  const navigate = useNavigate();
  const [dramas, setDramas] = useState([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  const loadDramas = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/dramas');
      setDramas(response.data.data ?? []);
    } catch (error) {
      message.error(apiErrorMessage(error, '审核队列加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(loadDramas);
  }, []);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return dramas.filter((drama) => {
      if (keyword && !`${drama.title} ${drama.description}`.toLowerCase().includes(keyword)) {
        return false;
      }
      if (filter === 'draft') {
        return drama.draft_highlight_count > 0;
      }
      if (filter === 'failed') {
        return drama.failed_episode_count > 0;
      }
      if (filter === 'published') {
        return drama.published_highlight_count > 0;
      }
      return true;
    });
  }, [dramas, filter, query]);

  const metrics = useMemo(
    () => ({
      drama: dramas.filter((item) => item.draft_highlight_count > 0).length,
      draft: sumBy(dramas, 'draft_highlight_count'),
      published: sumBy(dramas, 'published_highlight_count'),
      failed: sumBy(dramas, 'failed_episode_count'),
    }),
    [dramas],
  );

  return (
    <section className="review-page">
      <div className="workflow-overview">
        <div className="workflow-hero">
          <span>审核队列</span>
          <strong>{metrics.draft}</strong>
          <p>待审核高光</p>
        </div>
        <div className="workflow-metrics">
          <div>
            <span>待审核短剧</span>
            <strong>{metrics.drama}</strong>
          </div>
          <div className="danger">
            <span>分析失败剧集</span>
            <strong>{metrics.failed}</strong>
          </div>
          <div className="success">
            <span>已发布高光</span>
            <strong>{metrics.published}</strong>
          </div>
        </div>
      </div>

      <div className="content-toolbar">
        <Input.Search className="content-search" allowClear placeholder="搜索短剧" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Select
          className="content-filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: '全部' },
            { value: 'draft', label: '待审核' },
            { value: 'failed', label: '有失败' },
            { value: 'published', label: '已发布' },
          ]}
        />
        <Button icon={<ReloadOutlined />} loading={loading} onClick={loadDramas}>
          刷新
        </Button>
      </div>

      {filtered.length ? (
        <div className="review-drama-grid">
          {filtered.map((drama) => (
            <article className="review-drama-card" key={drama.id} onClick={() => navigate(`/workspace/highlights/dramas/${drama.id}`)}>
              <div className="review-drama-cover">
                {drama.cover_url ? <img src={drama.cover_url} alt="" loading="lazy" /> : <span>{drama.title.slice(0, 2)}</span>}
              </div>
              <div className="review-drama-body">
                <h3>{drama.title}</h3>
                <p>{drama.description || '暂无简介'}</p>
                <Space size={6} wrap>
                  <Tag>{drama.episode_count ?? 0} 集</Tag>
                  <Tag color="warning">{drama.draft_highlight_count ?? 0} 待审核</Tag>
                  <Tag color="success">{drama.published_highlight_count ?? 0} 已发布</Tag>
                  {drama.failed_episode_count ? <Tag color="error">{drama.failed_episode_count} 失败</Tag> : null}
                </Space>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="content-empty">
          <Empty description="暂无审核内容" />
        </div>
      )}
    </section>
  );
}

function DramaReviewDetail({ dramaId }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const [drama, setDrama] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState(Number(searchParams.get('episode_id')) || null);
  const [selectedHighlight, setSelectedHighlight] = useState(null);
  const [statusTab, setStatusTab] = useState('draft');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedEpisode = episodes.find((item) => item.id === selectedEpisodeId);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dramasResponse, episodesResponse] = await Promise.all([
        apiClient.get('/api/dramas'),
        apiClient.get('/api/episodes', { params: { drama_id: dramaId } }),
      ]);
      const nextDrama = (dramasResponse.data.data ?? []).find((item) => item.id === dramaId);
      const nextEpisodes = episodesResponse.data.data ?? [];
      const nextEpisodeId = selectedEpisodeId || nextEpisodes[0]?.id || null;
      setDrama(nextDrama ?? null);
      setEpisodes(nextEpisodes);
      setSelectedEpisodeId(nextEpisodeId);
      if (nextEpisodeId) {
        const highlightsResponse = await apiClient.get(`/api/episodes/${nextEpisodeId}/highlights`);
        const nextHighlights = highlightsResponse.data.data ?? [];
        setHighlights(nextHighlights);
        const preferred = nextHighlights.find((item) => item.status === statusTab) ?? nextHighlights[0] ?? null;
        setSelectedHighlight(preferred);
        if (preferred) {
          form.setFieldsValue(preferred);
        }
      }
    } catch (error) {
      message.error(apiErrorMessage(error, '审核详情加载失败'));
    } finally {
      setLoading(false);
    }
  };

  const loadHighlights = async (episodeId, keepHighlightId = null) => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/api/episodes/${episodeId}/highlights`);
      const nextHighlights = response.data.data ?? [];
      const preferred =
        nextHighlights.find((item) => item.id === keepHighlightId) ??
        nextHighlights.find((item) => item.status === statusTab) ??
        nextHighlights[0] ??
        null;
      setHighlights(nextHighlights);
      setSelectedHighlight(preferred);
      if (preferred) {
        form.setFieldsValue(preferred);
      } else {
        form.resetFields();
      }
    } catch (error) {
      message.error(apiErrorMessage(error, '高光加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(loadData);
    // The initial detail load should not refetch when local selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dramaId]);

  const visibleHighlights = useMemo(
    () => highlights.filter((item) => (statusTab === 'all' ? true : item.status === statusTab)),
    [highlights, statusTab],
  );

  const reviewMetrics = useMemo(
    () => ({
      draft: episodes.reduce((total, item) => total + Number(item.draft_highlight_count ?? 0), 0),
      published: episodes.reduce((total, item) => total + Number(item.published_highlight_count ?? 0), 0),
      failed: episodes.filter((item) => item.analyze_status === 'failed').length,
    }),
    [episodes],
  );

  const handleEpisodeSelect = async (episodeId) => {
    setSelectedEpisodeId(episodeId);
    await loadHighlights(episodeId);
  };

  const handleHighlightSelect = (highlight) => {
    setSelectedHighlight(highlight);
    form.setFieldsValue(highlight);
  };

  const saveHighlight = async (values) => {
    if (!selectedHighlight) {
      return;
    }
    setSaving(true);
    try {
      const response = await apiClient.put(`/api/highlights/${selectedHighlight.id}`, values);
      message.success('高光已保存');
      await loadHighlights(selectedEpisodeId, response.data.data.id);
    } catch (error) {
      message.error(apiErrorMessage(error, '高光保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const updateHighlightStatus = async (status) => {
    if (!selectedHighlight) {
      return;
    }
    await saveHighlight({ ...form.getFieldsValue(), status });
  };

  const bulkStatus = async (status) => {
    if (!selectedEpisodeId) {
      return;
    }
    setSaving(true);
    try {
      await apiClient.post(`/api/episodes/${selectedEpisodeId}/highlights/bulk-status`, { status });
      message.success(`当前剧集高光已更新为 ${status}`);
      await Promise.all([loadHighlights(selectedEpisodeId), loadData()]);
    } catch (error) {
      message.error(apiErrorMessage(error, '批量更新失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="review-detail-page">
      <div className="detail-topbar">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/workspace/highlights')}>
          返回审核队列
        </Button>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>
            刷新
          </Button>
          <Button type="primary" icon={<CheckCircleOutlined />} loading={saving} onClick={() => bulkStatus('published')}>
            发布当前剧集
          </Button>
          <Button icon={<StopOutlined />} loading={saving} onClick={() => bulkStatus('rejected')}>
            驳回当前剧集
          </Button>
        </Space>
      </div>

      <div className="review-detail-header">
        <div>
          <span>短剧审核</span>
          <h2>{drama?.title ?? `短剧 #${dramaId}`}</h2>
        </div>
        <Space size={8} wrap>
          <Tag color="warning">{reviewMetrics.draft} 待审核</Tag>
          <Tag color="success">{reviewMetrics.published} 已发布</Tag>
          <Tag color={reviewMetrics.failed ? 'error' : 'default'}>{reviewMetrics.failed} 失败剧集</Tag>
        </Space>
      </div>

      <div className="review-workbench">
        <aside className="review-episode-list">
          <h3>剧集</h3>
          <List
            loading={loading}
            dataSource={episodes}
            renderItem={(episode) => (
              <button
                type="button"
                className={`review-episode-item ${episode.id === selectedEpisodeId ? 'active' : ''}`}
                onClick={() => handleEpisodeSelect(episode.id)}
              >
                <strong>E{String(episode.episode_no).padStart(3, '0')} {episode.title}</strong>
                <span>
                  草稿 {episode.draft_highlight_count ?? 0} · 发布 {episode.published_highlight_count ?? 0}
                </span>
                <Tag color={statusColors[episode.analyze_status] ?? 'default'}>{episode.analyze_status}</Tag>
              </button>
            )}
          />
        </aside>

        <section className="review-highlight-list">
          <div className="review-list-toolbar">
            <div>
              <h3>{selectedEpisode ? selectedEpisode.title : '高光列表'}</h3>
              <p>{selectedEpisode ? `E${String(selectedEpisode.episode_no).padStart(3, '0')}` : ''}</p>
            </div>
            <Tabs
              activeKey={statusTab}
              onChange={setStatusTab}
              items={[
                { key: 'draft', label: '待审核' },
                { key: 'published', label: '已发布' },
                { key: 'rejected', label: '已驳回' },
                { key: 'archived', label: '已归档' },
                { key: 'all', label: '全部' },
              ]}
            />
          </div>
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            {visibleHighlights.length ? (
              visibleHighlights.map((highlight) => (
                <button
                  type="button"
                  className={`highlight-review-item ${selectedHighlight?.id === highlight.id ? 'active' : ''}`}
                  key={highlight.id}
                  onClick={() => handleHighlightSelect(highlight)}
                >
                  <span>{formatTime(highlight.start_time)} - {formatTime(highlight.end_time)}</span>
                  <strong>{highlight.button_text || '未配置按钮文案'}</strong>
                  <p>{highlight.reason || '暂无 AI 理由'}</p>
                  <Space size={6} wrap>
                    <Tag>{highlight.highlight_type}</Tag>
                    <Tag>{highlight.effect}</Tag>
                    <Tag color={statusColors[highlight.status] ?? 'default'}>{highlight.status}</Tag>
                  </Space>
                </button>
              ))
            ) : (
              <Empty description="当前状态下暂无高光" />
            )}
          </Space>
        </section>

        <aside className="review-editor">
          <h3>高光详情</h3>
          {selectedHighlight ? (
            <Form form={form} layout="vertical" onFinish={saveHighlight}>
              <div className="review-editor-grid">
                <Form.Item name="start_time" label="开始秒" rules={[{ required: true }]}>
                  <InputNumber min={0} precision={2} />
                </Form.Item>
                <Form.Item name="end_time" label="结束秒" rules={[{ required: true }]}>
                  <InputNumber min={0} precision={2} />
                </Form.Item>
              </div>
              <Form.Item name="highlight_type" label="高光类型" rules={[{ required: true }]}>
                <Select options={highlightTypes.map((value) => ({ value, label: value }))} />
              </Form.Item>
              <Form.Item name="emotion" label="情绪">
                <Input />
              </Form.Item>
              <div className="review-editor-grid">
                <Form.Item name="intensity" label="强度">
                  <InputNumber min={0} max={1} step={0.1} />
                </Form.Item>
                <Form.Item name="confidence" label="置信度">
                  <InputNumber min={0} max={1} step={0.1} />
                </Form.Item>
              </div>
              <Form.Item name="trigger_score" label="触发分">
                <InputNumber min={0} max={1} step={0.1} />
              </Form.Item>
              <Form.Item name="button_text" label="按钮文案" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="effect" label="播放端特效" rules={[{ required: true }]}>
                <Select options={effects.map((value) => ({ value, label: value }))} />
              </Form.Item>
              <Form.Item name="reason" label="AI 理由">
                <TextArea rows={5} />
              </Form.Item>
              <Form.Item name="status" label="状态">
                <Select options={statuses.map((value) => ({ value, label: value }))} />
              </Form.Item>
              <div className="player-preview-card">
                <span>播放端预览</span>
                <strong>{form.getFieldValue('button_text') || selectedHighlight.button_text}</strong>
                <p>{form.getFieldValue('effect') || selectedHighlight.effect}</p>
              </div>
              <Space wrap>
                <Button type="primary" htmlType="submit" icon={<EditOutlined />} loading={saving}>
                  保存
                </Button>
                <Button icon={<CheckCircleOutlined />} loading={saving} onClick={() => updateHighlightStatus('published')}>
                  发布
                </Button>
                <Button icon={<StopOutlined />} loading={saving} onClick={() => updateHighlightStatus('rejected')}>
                  驳回
                </Button>
                <Button icon={<InboxOutlined />} loading={saving} onClick={() => updateHighlightStatus('archived')}>
                  归档
                </Button>
              </Space>
            </Form>
          ) : (
            <Empty description="请选择高光" />
          )}
        </aside>
      </div>
    </section>
  );
}
