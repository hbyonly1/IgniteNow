import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd';
import {
  EditOutlined,
  FileTextOutlined,
  PlusOutlined,
  ReloadOutlined,
  RocketOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { getAdminUserRole } from '../../auth.js';
import { apiClient, apiErrorMessage } from '../../services/apiClient.js';

const { TextArea } = Input;

const analyzeStatusColors = {
  pending: 'default',
  processing: 'processing',
  success: 'success',
  failed: 'error',
};

const filterOptions = [
  { value: 'all', label: '全部短剧' },
  { value: 'needs_action', label: '待处理' },
  { value: 'failed', label: '分析失败' },
  { value: 'processing', label: '分析中' },
  { value: 'published', label: '已发布' },
];

function sumBy(items, key) {
  return items.reduce((total, item) => total + Number(item[key] ?? 0), 0);
}

function formatDuration(value) {
  const seconds = Math.round(Number(value ?? 0));
  if (!seconds) {
    return '-';
  }
  const minute = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minute}:${String(rest).padStart(2, '0')}`;
}

function dramaRisk(drama) {
  if (drama.failed_episode_count > 0) {
    return { color: 'error', label: '分析失败' };
  }
  if (drama.draft_highlight_count > 0) {
    return { color: 'warning', label: '待审核' };
  }
  if (drama.processing_episode_count > 0) {
    return { color: 'processing', label: '分析中' };
  }
  if (drama.published_highlight_count > 0) {
    return { color: 'success', label: '已发布' };
  }
  return { color: 'default', label: '待配置' };
}

export default function DramasPage() {
  const navigate = useNavigate();
  const role = getAdminUserRole();
  const isAdmin = role === 'admin';
  const [dramas, setDramas] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedDrama, setSelectedDrama] = useState(null);
  const [drawerMode, setDrawerMode] = useState('list');
  const [editingEpisode, setEditingEpisode] = useState(null);
  const [dramaModalOpen, setDramaModalOpen] = useState(false);
  const [editingDrama, setEditingDrama] = useState(null);
  const [dramaForm] = Form.useForm();
  const [episodeForm] = Form.useForm();

  const metrics = useMemo(
    () => ({
      dramaCount: dramas.length,
      episodeCount: sumBy(dramas, 'episode_count'),
      pendingEpisodeCount: sumBy(dramas, 'pending_episode_count'),
      processingEpisodeCount: sumBy(dramas, 'processing_episode_count'),
      failedEpisodeCount: sumBy(dramas, 'failed_episode_count'),
      draftHighlightCount: sumBy(dramas, 'draft_highlight_count'),
      publishedHighlightCount: sumBy(dramas, 'published_highlight_count'),
    }),
    [dramas],
  );

  const actionCount =
    metrics.pendingEpisodeCount + metrics.failedEpisodeCount + metrics.draftHighlightCount;

  const filteredDramas = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return dramas.filter((drama) => {
      const matchesKeyword =
        !keyword ||
        drama.title.toLowerCase().includes(keyword) ||
        (drama.description ?? '').toLowerCase().includes(keyword);
      if (!matchesKeyword) {
        return false;
      }
      if (filter === 'needs_action') {
        return drama.pending_episode_count > 0 || drama.failed_episode_count > 0 || drama.draft_highlight_count > 0;
      }
      if (filter === 'failed') {
        return drama.failed_episode_count > 0;
      }
      if (filter === 'processing') {
        return drama.processing_episode_count > 0;
      }
      if (filter === 'published') {
        return drama.published_highlight_count > 0;
      }
      return true;
    });
  }, [dramas, filter, query]);

  const loadDramas = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/dramas');
      setDramas(response.data.data ?? []);
    } catch (error) {
      message.error(apiErrorMessage(error, '内容列表加载失败'));
    } finally {
      setLoading(false);
    }
  };

  const loadEpisodes = async (drama) => {
    setEpisodesLoading(true);
    try {
      const response = await apiClient.get('/api/episodes', { params: { drama_id: drama.id } });
      setEpisodes(response.data.data ?? []);
    } catch (error) {
      message.error(apiErrorMessage(error, '剧集列表加载失败'));
    } finally {
      setEpisodesLoading(false);
    }
  };

  const openDrama = async (drama) => {
    setSelectedDrama(drama);
    setDrawerMode('list');
    setEditingEpisode(null);
    await loadEpisodes(drama);
  };

  const closeDrawer = () => {
    setSelectedDrama(null);
    setEpisodes([]);
    setDrawerMode('list');
    setEditingEpisode(null);
  };

  const openDramaModal = (drama = null) => {
    setEditingDrama(drama);
    dramaForm.setFieldsValue(
      drama ?? {
        title: '',
        description: '',
        cover_url: '',
      },
    );
    setDramaModalOpen(true);
  };

  const submitDrama = async (values) => {
    setSubmitting(true);
    try {
      if (editingDrama) {
        await apiClient.put(`/api/dramas/${editingDrama.id}`, values);
        message.success('短剧已更新');
      } else {
        await apiClient.post('/api/dramas', values);
        message.success('短剧已创建');
      }
      setDramaModalOpen(false);
      await loadDramas();
    } catch (error) {
      message.error(apiErrorMessage(error, '短剧保存失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const openEpisodeForm = (episode = null) => {
    setEditingEpisode(episode);
    episodeForm.setFieldsValue(
      episode ?? {
        episode_no: episodes.length + 1,
        title: '',
        video_url: '',
        subtitle_url: '',
        subtitle_content: '',
        duration: 0,
      },
    );
    setDrawerMode('episodeForm');
  };

  const submitEpisode = async (values) => {
    if (!selectedDrama) {
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...values,
        drama_id: selectedDrama.id,
        subtitle_url: values.subtitle_url ?? '',
        subtitle_content: values.subtitle_content ?? '',
        duration: values.duration ?? 0,
      };
      if (editingEpisode) {
        await apiClient.put(`/api/episodes/${editingEpisode.id}`, payload);
        message.success('剧集配置已更新');
      } else {
        await apiClient.post('/api/episodes', payload);
        message.success('剧集已创建');
      }
      setDrawerMode('list');
      setEditingEpisode(null);
      await Promise.all([loadEpisodes(selectedDrama), loadDramas()]);
    } catch (error) {
      message.error(apiErrorMessage(error, '剧集保存失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const submitAnalyzeJob = async (episode, forceReanalyze = false) => {
    try {
      await apiClient.post('/api/system/jobs', {
        type: 'ai_analyze',
        payload: {
          episode_id: episode.id,
          force_reanalyze: forceReanalyze,
        },
      });
      message.success(forceReanalyze ? '强制重跑任务已提交' : 'AI 分析任务已提交');
      navigate('/workspace/jobs');
    } catch (error) {
      message.error(apiErrorMessage(error, 'AI 任务提交失败'));
    }
  };

  useEffect(() => {
    Promise.resolve().then(loadDramas);
  }, []);

  const episodeColumns = [
    {
      title: '集数',
      dataIndex: 'episode_no',
      width: 76,
      sorter: (a, b) => a.episode_no - b.episode_no,
      render: (value) => `E${String(value).padStart(3, '0')}`,
    },
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
    },
    {
      title: '时长',
      dataIndex: 'duration',
      width: 88,
      render: formatDuration,
    },
    {
      title: '视频',
      dataIndex: 'video_url',
      width: 88,
      render: (value) => <Tag color={value ? 'success' : 'error'}>{value ? '已配置' : '缺失'}</Tag>,
    },
    {
      title: '字幕',
      key: 'subtitle',
      width: 88,
      render: (_, record) => (
        <Tag color={record.subtitle_content || record.subtitle_url ? 'success' : 'warning'}>
          {record.subtitle_content || record.subtitle_url ? '已配置' : '缺失'}
        </Tag>
      ),
    },
    {
      title: 'AI',
      dataIndex: 'analyze_status',
      width: 112,
      render: (value, record) => (
        <Tooltip title={value === 'failed' ? record.analyze_error : ''}>
          <Tag color={analyzeStatusColors[value] ?? 'default'}>{value}</Tag>
        </Tooltip>
      ),
    },
    {
      title: '高光',
      key: 'highlights',
      width: 170,
      render: (_, record) => (
        <Space size={4} wrap>
          <Tag>草稿 {record.draft_highlight_count ?? 0}</Tag>
          <Tag color="success">发布 {record.published_highlight_count ?? 0}</Tag>
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 250,
      fixed: 'right',
      render: (_, record) => (
        <Space size={8}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEpisodeForm(record)}>
            配置
          </Button>
          <Tooltip title="触发 AI 分析">
            <Button size="small" icon={<RocketOutlined />} onClick={() => submitAnalyzeJob(record)} />
          </Tooltip>
          <Tooltip title="强制重跑">
            <Button size="small" icon={<ThunderboltOutlined />} onClick={() => submitAnalyzeJob(record, true)} />
          </Tooltip>
          {isAdmin ? (
            <Tooltip title="去审核">
              <Button
                size="small"
                icon={<FileTextOutlined />}
                onClick={() => navigate(`/workspace/highlights/dramas/${selectedDrama.id}?episode_id=${record.id}`)}
              />
            </Tooltip>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <>
      <section className="content-management">
        <div className="content-overview">
          <div className="content-overview-primary">
            <span>内容资产</span>
            <strong>{metrics.dramaCount} 部短剧</strong>
            <div className="content-overview-pills">
              <Tag>{metrics.processingEpisodeCount} 分析中</Tag>
              <Tag color="success">{metrics.publishedHighlightCount} 已发布高光</Tag>
            </div>
          </div>
          <div className="content-overview-focus">
            <div className="content-focus-main">
              <span>待处理</span>
              <strong>{actionCount}</strong>
            </div>
            <div className="content-focus-grid">
              <div className="content-focus-item">
                <span>待分析剧集</span>
                <strong>{metrics.pendingEpisodeCount}</strong>
              </div>
              <div className="content-focus-item danger">
                <span>分析失败</span>
                <strong>{metrics.failedEpisodeCount}</strong>
              </div>
              <div className="content-focus-item warning">
                <span>待审核高光</span>
                <strong>{metrics.draftHighlightCount}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="content-toolbar">
          <Input
            className="content-search"
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索短剧"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select className="content-filter" value={filter} options={filterOptions} onChange={setFilter} />
          <Button icon={<ReloadOutlined />} onClick={loadDramas} loading={loading}>
            刷新
          </Button>
          {isAdmin ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openDramaModal()}>
              新建短剧
            </Button>
          ) : null}
        </div>

        {filteredDramas.length ? (
          <div className="drama-card-grid">
            {filteredDramas.map((drama) => {
              const risk = dramaRisk(drama);
              return (
                <article className="drama-card" key={drama.id} onClick={() => openDrama(drama)}>
                  <div className="drama-cover">
                    {drama.cover_url ? <img src={drama.cover_url} alt="" loading="lazy" /> : <span>{drama.title.slice(0, 2)}</span>}
                    <Tag className="drama-risk" color={risk.color}>
                      {risk.label}
                    </Tag>
                  </div>
                  <div className="drama-card-body">
                    <div className="drama-card-title-row">
                      <h3>{drama.title}</h3>
                      {isAdmin ? (
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          onClick={(event) => {
                            event.stopPropagation();
                            openDramaModal(drama);
                          }}
                        />
                      ) : null}
                    </div>
                    <p>{drama.description || '暂无简介'}</p>
                    <div className="drama-stats">
                      <span>{drama.episode_count ?? 0} 集</span>
                      <span>{drama.pending_episode_count ?? 0} 待分析</span>
                      <span>{drama.failed_episode_count ?? 0} 失败</span>
                      <span>{drama.draft_highlight_count ?? 0} 待审核</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="content-empty">
            <Empty description={loading ? '加载中' : '暂无内容'} />
          </div>
        )}
      </section>

      <Drawer
        title={selectedDrama?.title ?? '剧集配置'}
        open={Boolean(selectedDrama)}
        onClose={closeDrawer}
        width={920}
        className="episode-config-drawer"
        extra={
          drawerMode === 'list' ? (
            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => selectedDrama && loadEpisodes(selectedDrama)}>
                刷新
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openEpisodeForm()}>
                新增剧集
              </Button>
            </Space>
          ) : null
        }
      >
        {drawerMode === 'list' ? (
          <>
            {selectedDrama ? (
              <div className="drawer-drama-summary">
                <p>{selectedDrama.description || '暂无简介'}</p>
                <Space size={8} wrap>
                  <Tag>{selectedDrama.episode_count ?? 0} 集</Tag>
                  <Tag color="warning">{selectedDrama.draft_highlight_count ?? 0} 待审核</Tag>
                  <Tag color="success">{selectedDrama.published_highlight_count ?? 0} 已发布</Tag>
                  <Tag color={selectedDrama.failed_episode_count ? 'error' : 'default'}>
                    {selectedDrama.failed_episode_count ?? 0} 失败
                  </Tag>
                </Space>
              </div>
            ) : null}
            <Table
              rowKey="id"
              loading={episodesLoading}
              columns={episodeColumns}
              dataSource={episodes}
              pagination={{ pageSize: 8 }}
              scroll={{ x: 980 }}
            />
          </>
        ) : (
          <Form form={episodeForm} layout="vertical" onFinish={submitEpisode} className="episode-form">
            {editingEpisode?.analyze_status === 'failed' && editingEpisode.analyze_error ? (
              <Alert type="error" showIcon message={editingEpisode.analyze_error} />
            ) : null}
            <div className="episode-form-grid">
              <Form.Item name="episode_no" label="集数" rules={[{ required: true, message: '请输入集数' }]}>
                <InputNumber min={1} precision={0} />
              </Form.Item>
              <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="duration" label="时长（秒）">
                <InputNumber min={0} precision={2} />
              </Form.Item>
            </div>
            <Form.Item name="video_url" label="视频 URL / 服务端路径" rules={[{ required: true, message: '请输入视频地址' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="subtitle_url" label="字幕 URL / 服务端路径">
              <Input />
            </Form.Item>
            <Form.Item name="subtitle_content" label="字幕正文">
              <TextArea rows={12} />
            </Form.Item>
            <div className="episode-form-actions">
              <Button onClick={() => setDrawerMode('list')}>取消</Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                保存
              </Button>
            </div>
          </Form>
        )}
      </Drawer>

      <Modal
        title={editingDrama ? '编辑短剧' : '新建短剧'}
        open={dramaModalOpen}
        onCancel={() => setDramaModalOpen(false)}
        onOk={() => dramaForm.submit()}
        confirmLoading={submitting}
        destroyOnHidden
      >
        <Form form={dramaForm} layout="vertical" onFinish={submitDrama}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="简介">
            <TextArea rows={4} />
          </Form.Item>
          <Form.Item name="cover_url" label="封面 URL">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
