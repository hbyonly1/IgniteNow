import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Switch,
  Table,
  Tag,
  Upload,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  CloseOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DownOutlined,
  FileTextOutlined,
  InboxOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SearchOutlined,
  SendOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { getAdminUserRole } from '../../auth.js';
import { apiClient, apiErrorMessage } from '../../services/apiClient.js';

const { TextArea } = Input;

function formatDateTime(value) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
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

function hasSubtitle(episode) {
  return Boolean(episode.subtitle_content || episode.subtitle_url);
}

function formatDuration(value) {
  const seconds = Number(value ?? 0);
  if (!seconds) {
    return '-';
  }
  const minutes = Math.floor(seconds / 60);
  const remain = Math.round(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`;
}

function analysisStatusMeta(status) {
  if (status === 'processing') {
    return { label: '分析中', color: 'processing' };
  }
  if (status === 'success') {
    return { label: '已完成', color: 'success' };
  }
  if (status === 'failed') {
    return { label: '失败', color: 'error' };
  }
  return { label: '待分析', color: 'warning' };
}

function publishStatusMeta(episode) {
  if (Number(episode.published_highlight_count ?? 0) > 0) {
    return { label: '已发布', color: 'success' };
  }
  if (Number(episode.draft_highlight_count ?? 0) > 0) {
    return { label: '待发布', color: 'warning' };
  }
  return { label: '草稿', color: 'default' };
}

function episodeCompleteness(episode) {
  if (!episode) {
    return 0;
  }
  const checks = [
    Boolean(episode.video_url),
    hasSubtitle(episode),
    episode.analyze_status === 'success',
    Number(episode.draft_highlight_count ?? 0) + Number(episode.published_highlight_count ?? 0) > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export default function DramasPage() {
  const role = getAdminUserRole();
  const isAdmin = role === 'admin';
  const [dramas, setDramas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [dramaModalOpen, setDramaModalOpen] = useState(false);
  const [editingDrama, setEditingDrama] = useState(null);
  const [managingDrama, setManagingDrama] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [episodeLoading, setEpisodeLoading] = useState(false);
  const [episodeQuery, setEpisodeQuery] = useState('');
  const [episodeCurrentPage, setEpisodeCurrentPage] = useState(1);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState(null);
  const [selectedEpisodeRowKeys, setSelectedEpisodeRowKeys] = useState([]);
  const [dramaForm] = Form.useForm();

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
      return true;
    });
  }, [dramas, query]);

  const pageSize = 6;
  const maxPage = Math.max(1, Math.ceil(filteredDramas.length / pageSize));
  const effectivePage = Math.min(currentPage, maxPage);
  const pagedDramas = useMemo(() => {
    const start = (effectivePage - 1) * pageSize;
    return filteredDramas.slice(start, start + pageSize);
  }, [effectivePage, filteredDramas]);

  const filteredEpisodes = useMemo(() => {
    const keyword = episodeQuery.trim().toLowerCase();
    return episodes
      .filter((episode) => {
        if (!keyword) {
          return true;
        }
        return `${episode.title} ${episode.episode_no}`.toLowerCase().includes(keyword);
      })
      .sort((a, b) => a.episode_no - b.episode_no);
  }, [episodeQuery, episodes]);

  const episodePageSize = 8;
  const episodeMaxPage = Math.max(1, Math.ceil(filteredEpisodes.length / episodePageSize));
  const episodeEffectivePage = Math.min(episodeCurrentPage, episodeMaxPage);
  const pagedEpisodes = useMemo(() => {
    const start = (episodeEffectivePage - 1) * episodePageSize;
    return filteredEpisodes.slice(start, start + episodePageSize);
  }, [episodeEffectivePage, filteredEpisodes]);

  const selectedEpisode = useMemo(
    () => episodes.find((episode) => episode.id === selectedEpisodeId) ?? null,
    [episodes, selectedEpisodeId],
  );

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
    setEpisodeLoading(true);
    try {
      const response = await apiClient.get('/api/episodes', { params: { drama_id: drama.id } });
      const nextEpisodes = response.data.data ?? [];
      setEpisodes(nextEpisodes);
      setSelectedEpisodeId(nextEpisodes[0]?.id ?? null);
      setSelectedEpisodeRowKeys([]);
      setEpisodeCurrentPage(1);
    } catch (error) {
      message.error(apiErrorMessage(error, '剧集列表加载失败'));
    } finally {
      setEpisodeLoading(false);
    }
  };

  const openEpisodeManagement = async (drama) => {
    setManagingDrama(drama);
    setEpisodeQuery('');
    await loadEpisodes(drama);
  };

  const openDramaModal = (drama = null) => {
    setEditingDrama(drama);
    dramaForm.setFieldsValue(
      drama
        ? {
            title: drama.title,
            description: drama.description,
            cover_url: drama.cover_url,
            episode_count_hint: drama.episode_count ?? 24,
            categories: ['都市', '情感', '逆袭'],
            keywords: ['总裁', '闪婚', '反转'],
            initial_status: 'draft',
            auto_timeline: true,
            auto_highlight: true,
            generate_suggestion: true,
            analyze_after_upload: true,
          }
        : {
            title: '',
            description: '',
            cover_url: '',
            episode_count_hint: 24,
            categories: ['都市', '情感', '逆袭'],
            keywords: ['总裁', '闪婚', '反转'],
            initial_status: 'draft',
            auto_timeline: true,
            auto_highlight: true,
            generate_suggestion: true,
            analyze_after_upload: true,
          },
    );
    setDramaModalOpen(true);
  };

  const submitDrama = async (values) => {
    setSubmitting(true);
    try {
      const payload = {
        title: values.title,
        description: values.description ?? '',
        cover_url: values.cover_url ?? '',
      };
      if (editingDrama) {
        await apiClient.put(`/api/dramas/${editingDrama.id}`, payload);
        message.success('短剧已更新');
      } else {
        await apiClient.post('/api/dramas', payload);
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

  useEffect(() => {
    Promise.resolve().then(loadDramas);
  }, []);

  const dramaColumns = [
    {
      title: '剧集名称',
      dataIndex: 'title',
      width: '30%',
      render: (_, record) => (
        <div className="drama-list-title">
          <span className="drama-list-cover">
            {record.cover_url ? <img src={record.cover_url} alt="" loading="lazy" /> : <span>{record.title.slice(0, 2)}</span>}
          </span>
          <span className="drama-list-copy">
            <strong>{record.title}</strong>
            {record.description ? <span>{record.description}</span> : null}
          </span>
        </div>
      ),
    },
    {
      title: '集数',
      dataIndex: 'episode_count',
      width: '12%',
      render: (value) => `${value ?? 0} 集`,
    },
    {
      title: '状态',
      key: 'status',
      width: '16%',
      render: (_, record) => {
        const risk = dramaRisk(record);
        return (
          <Tag className="drama-list-status" color={risk.color}>
            {risk.label}
          </Tag>
        );
      },
    },
    {
      title: '最后更新时间',
      key: 'updated_at',
      width: '20%',
      render: (_, record) => formatDateTime(record.updated_at ?? record.created_at),
    },
    {
      title: '操作',
      key: 'actions',
      width: '22%',
      align: 'right',
      className: 'drama-list-action-column',
      render: (_, record) => {
        const stop = (event) => event.stopPropagation();
        return (
          <div className="drama-list-actions" onClick={stop}>
            {isAdmin ? (
              <Button
                type="link"
                className="drama-list-text-action"
                onClick={() => openDramaModal(record)}
              >
                编辑信息
              </Button>
            ) : null}
            <Button
              type="link"
              className="drama-list-text-action"
              onClick={() => openEpisodeManagement(record)}
            >
              管理剧集
            </Button>
          </div>
        );
      },
    },
  ];

  const episodeColumns = [
    {
      title: '剧集',
      dataIndex: 'episode_no',
      width: '24%',
      render: (_, record) => (
        <div className="episode-list-title">
          <span className="episode-list-cover">
            {managingDrama?.cover_url ? <img src={managingDrama.cover_url} alt="" loading="lazy" /> : <span>{record.episode_no}</span>}
          </span>
          <span className="episode-list-copy">
            <strong>第 {record.episode_no} 集</strong>
            <span>{record.title}</span>
          </span>
        </div>
      ),
    },
    {
      title: '时长',
      dataIndex: 'duration',
      width: '8%',
      render: formatDuration,
    },
    {
      title: '视频状态',
      key: 'video_url',
      width: '10%',
      render: (_, record) => (
        <Tag className="drama-list-status" color={record.video_url ? 'success' : 'error'}>
          {record.video_url ? '已上传' : '待上传'}
        </Tag>
      ),
    },
    {
      title: '字幕状态',
      key: 'subtitle',
      width: '10%',
      render: (_, record) => (
        <Tag className="drama-list-status" color={hasSubtitle(record) ? 'success' : 'warning'}>
          {hasSubtitle(record) ? '已识别' : '待识别'}
        </Tag>
      ),
    },
    {
      title: 'AI分析状态',
      dataIndex: 'analyze_status',
      width: '12%',
      render: (value) => {
        const meta = analysisStatusMeta(value);
        return (
          <Tag className="drama-list-status" color={meta.color}>
            {meta.label}
          </Tag>
        );
      },
    },
    {
      title: '发布状态',
      key: 'publish_status',
      width: '10%',
      render: (_, record) => {
        const meta = publishStatusMeta(record);
        return (
          <Tag className="drama-list-status" color={meta.color}>
            {meta.label}
          </Tag>
        );
      },
    },
    {
      title: '更新时间',
      key: 'created_at',
      width: '14%',
      render: (_, record) => formatDateTime(record.updated_at ?? record.created_at),
    },
    {
      title: '操作',
      key: 'actions',
      width: '12%',
      align: 'right',
      className: 'drama-list-action-column',
      render: (_, record) => (
        <div className="episode-row-actions" onClick={(event) => event.stopPropagation()}>
          <Button type="link" className="drama-list-text-action" onClick={() => setSelectedEpisodeId(record.id)}>
            查看
          </Button>
          <Button type="link" className="drama-list-text-action" onClick={() => message.info('剧集编辑接口待接入')}>
            编辑
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      {managingDrama ? (
        <section className="episode-management">
          <div className="content-page-header">
            <div className="content-page-title">
              <h1>剧集管理</h1>
              <p>管理短剧下的剧集信息、素材状态、字幕配置与发布进度</p>
            </div>
            <div className="content-toolbar">
              <Input
                className="content-search"
                allowClear
                suffix={<SearchOutlined />}
                placeholder="搜索剧集名称或集数"
                value={episodeQuery}
                onChange={(event) => {
                  setEpisodeQuery(event.target.value);
                  setEpisodeCurrentPage(1);
                }}
              />
              <Button icon={<UploadOutlined />} onClick={() => message.info('批量导入接口待接入')}>
                批量导入
              </Button>
              <Button type="primary" className="content-upload-action" icon={<PlusOutlined />} onClick={() => message.info('新建剧集接口待接入')}>
                新增剧集
              </Button>
            </div>
          </div>

          <section className="episode-drama-summary">
            <div className="episode-summary-cover">
              {managingDrama.cover_url ? <img src={managingDrama.cover_url} alt="" loading="lazy" /> : <span>{managingDrama.title.slice(0, 2)}</span>}
            </div>
            <div className="episode-summary-main">
              <strong>{managingDrama.title}</strong>
              <span>共 {episodes.length} 集</span>
            </div>
            <div className="episode-summary-stats">
              <span>已发布 <strong>{episodes.filter((item) => Number(item.published_highlight_count ?? 0) > 0).length}</strong> 集</span>
              <span>待分析 <strong>{episodes.filter((item) => item.analyze_status === 'pending').length}</strong> 集</span>
              <span>分析完成 <strong>{episodes.filter((item) => item.analyze_status === 'success').length}</strong> 集</span>
            </div>
            <Button onClick={() => setManagingDrama(null)} icon={<ArrowLeftOutlined />}>
              返回短剧
            </Button>
          </section>

          <div className="episode-management-grid">
            <section className="episode-table-panel">
              <div className="analysis-filterbar episode-table-toolbar">
                <span>已选择 {selectedEpisodeRowKeys.length} 项</span>
                <div className="analysis-filter-actions">
                  <Button icon={<FileTextOutlined />} disabled={!selectedEpisodeRowKeys.length}>批量设置字幕</Button>
                  <Button icon={<SendOutlined />} disabled={!selectedEpisodeRowKeys.length}>批量发起分析</Button>
                  <Button icon={<SendOutlined />} disabled={!selectedEpisodeRowKeys.length}>批量发布</Button>
                </div>
              </div>
              <Table
                className="episode-management-table"
                style={{ width: '100%', minWidth: '100%' }}
                rowKey="id"
                tableLayout="fixed"
                loading={episodeLoading}
                columns={episodeColumns}
                dataSource={pagedEpisodes}
                locale={{ emptyText: <Empty description={episodeLoading ? '加载中' : '暂无剧集'} /> }}
                rowSelection={{
                  selectedRowKeys: selectedEpisodeRowKeys,
                  onChange: setSelectedEpisodeRowKeys,
                }}
                onRow={(record) => ({
                  onClick: () => setSelectedEpisodeId(record.id),
                  className: record.id === selectedEpisode?.id ? 'episode-row-selected' : '',
                })}
                pagination={false}
              />
              <div className="drama-list-pagination">
                <span>共 {filteredEpisodes.length} 条</span>
                <Pagination
                  current={episodeEffectivePage}
                  pageSize={episodePageSize}
                  total={filteredEpisodes.length}
                  showSizeChanger={false}
                  onChange={setEpisodeCurrentPage}
                />
              </div>
            </section>

            <aside className="episode-detail-panel">
              <div className="episode-detail-header">
                <span>当前选中：第 {selectedEpisode?.episode_no ?? '-'} 集</span>
                <Button size="small" disabled={!selectedEpisode} onClick={() => setSelectedEpisodeId(null)}>取消选择</Button>
              </div>
              <div className="episode-detail-card">
                <h3>剧集信息</h3>
                <dl>
                  <dt>剧集编号</dt>
                  <dd>{selectedEpisode ? `E${String(selectedEpisode.episode_no).padStart(2, '0')}` : '-'}</dd>
                  <dt>剧集名称</dt>
                  <dd>{selectedEpisode?.title ?? '-'}</dd>
                  <dt>时长</dt>
                  <dd>{formatDuration(selectedEpisode?.duration)}</dd>
                  <dt>创建时间</dt>
                  <dd>{formatDateTime(selectedEpisode?.created_at)}</dd>
                </dl>
              </div>
              <div className="episode-detail-card">
                <h3>素材完整度</h3>
                <strong className="episode-completeness">{episodeCompleteness(selectedEpisode)}%</strong>
                <div className="episode-completeness-bar">
                  <span style={{ width: `${episodeCompleteness(selectedEpisode)}%` }} />
                </div>
                <ul>
                  <li><span>视频素材</span><Tag color={selectedEpisode?.video_url ? 'success' : 'error'}>{selectedEpisode?.video_url ? '已上传' : '待上传'}</Tag></li>
                  <li><span>字幕</span><Tag color={hasSubtitle(selectedEpisode ?? {}) ? 'success' : 'warning'}>{hasSubtitle(selectedEpisode ?? {}) ? '已识别' : '待识别'}</Tag></li>
                  <li><span>AI 分析</span><Tag color={analysisStatusMeta(selectedEpisode?.analyze_status).color}>{analysisStatusMeta(selectedEpisode?.analyze_status).label}</Tag></li>
                  <li><span>高光点</span><Tag color={Number(selectedEpisode?.draft_highlight_count ?? 0) + Number(selectedEpisode?.published_highlight_count ?? 0) > 0 ? 'success' : 'default'}>{Number(selectedEpisode?.draft_highlight_count ?? 0) + Number(selectedEpisode?.published_highlight_count ?? 0)} 个</Tag></li>
                </ul>
              </div>
              <div className="episode-detail-card">
                <h3>快速操作</h3>
                <div className="episode-quick-actions">
                  <Button type="primary" icon={<PlayCircleOutlined />}>进入编辑短剧</Button>
                  <Button icon={<UploadOutlined />}>替换视频</Button>
                  <Button icon={<FileTextOutlined />}>管理字幕</Button>
                </div>
              </div>
            </aside>
          </div>
        </section>
      ) : (
        <section className="content-management">
        <div className="content-page-header">
          <div className="content-page-title">
            <h1>内容管理</h1>
            <p>管理短剧资产、剧集配置、字幕输入和 AI 分析状态</p>
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
            {isAdmin ? (
              <Button type="primary" className="content-upload-action" icon={<CloudUploadOutlined />} onClick={() => openDramaModal()}>
                上传短剧
              </Button>
            ) : null}
          </div>
        </div>

        <div className="drama-list-panel">
          <Table
            className="drama-content-table"
            style={{ width: '100%', minWidth: '100%' }}
            rowKey="id"
            tableLayout="fixed"
            loading={loading}
            columns={dramaColumns}
            dataSource={pagedDramas}
            locale={{ emptyText: <Empty description={loading ? '加载中' : '暂无内容'} /> }}
            pagination={false}
          />
          <div className="drama-list-pagination">
            <span>共 {filteredDramas.length} 条</span>
            <Pagination
              current={effectivePage}
              pageSize={pageSize}
              total={filteredDramas.length}
              showSizeChanger={false}
              onChange={setCurrentPage}
            />
          </div>
        </div>
        </section>
      )}

      <Modal
        className="upload-drama-modal"
        title={null}
        open={dramaModalOpen}
        onCancel={() => setDramaModalOpen(false)}
        closable={false}
        footer={null}
        width={920}
        destroyOnHidden
      >
        <div className="upload-drama-header">
          <div>
            <h2>{editingDrama ? '编辑短剧' : '上传短剧'}</h2>
            <p>创建新的短剧资产，并提交素材进入 AI 分析流程</p>
          </div>
          <Button
            type="text"
            className="upload-drama-close"
            icon={<CloseOutlined />}
            onClick={() => setDramaModalOpen(false)}
          />
        </div>

        <Form form={dramaForm} layout="vertical" onFinish={submitDrama} className="upload-drama-form">
          <section className="upload-drama-card upload-drama-basic">
            <div className="upload-cover-panel">
              <h3>封面设置</h3>
              <Upload.Dragger className="upload-cover-dropzone" beforeUpload={() => false} maxCount={1} showUploadList={false}>
                <CloudUploadOutlined />
                <strong>上传封面</strong>
                <span>建议尺寸 3:4，JPG/PNG</span>
              </Upload.Dragger>
              <Form.Item label="短剧横版封面（可选）">
                <Upload.Dragger className="upload-wide-cover-dropzone" beforeUpload={() => false} maxCount={1} showUploadList={false}>
                  <InboxOutlined />
                  <strong>上传横版封面</strong>
                  <span>建议尺寸 16:9，JPG/PNG</span>
                </Upload.Dragger>
              </Form.Item>
            </div>

            <div className="upload-info-panel">
              <Form.Item name="title" label="短剧名称" rules={[{ required: true, message: '请输入短剧名称' }]}>
                <Input placeholder="请输入短剧名称" />
              </Form.Item>
              <Form.Item label="剧集数量">
                <div className="episode-count-field">
                  <Form.Item name="episode_count_hint" noStyle>
                    <InputNumber min={1} precision={0} controls={false} />
                  </Form.Item>
                  <span>集</span>
                </div>
              </Form.Item>
              <Form.Item name="categories" label="所属分类">
                <CategoryDropdown placeholder="请选择所属分类" />
              </Form.Item>
              <Form.Item name="keywords" label="主演">
                <TagInput placeholder="请输入主演" />
              </Form.Item>
              <Form.Item name="description" label="内容简介">
                <TextArea
                  rows={4}
                  maxLength={200}
                  showCount
                  placeholder="请输入短剧内容简介，帮助 AI 更好地理解剧情和角色设定。建议包含题材、核心冲突、角色关系等关键信息，50-200 字。"
                />
              </Form.Item>
            </div>
          </section>

          <section className="upload-drama-card">
            <h3>素材上传</h3>
            <div className="upload-assets-grid">
              <Upload.Dragger className="upload-asset-dropzone" beforeUpload={() => false} maxCount={1} showUploadList={false}>
                <CloudUploadOutlined />
                <strong>拖拽文件到此处或点击上传</strong>
                <span>支持 MP4 / MOV，单文件不超过 2GB</span>
              </Upload.Dragger>
              <Upload.Dragger className="upload-asset-dropzone" beforeUpload={() => false} maxCount={1} showUploadList={false}>
                <CloudUploadOutlined />
                <strong>导入 SRT / VTT / TXT</strong>
                <span>也可稍后在内容管理中补充</span>
              </Upload.Dragger>
              <Upload.Dragger className="upload-asset-dropzone" beforeUpload={() => false} maxCount={1} showUploadList={false}>
                <FileTextOutlined />
                <strong>批量导入剧集配置</strong>
                <span>Excel / CSV</span>
              </Upload.Dragger>
            </div>
            <div className="upload-file-chip">
              <span className="upload-file-icon">▶</span>
              <strong>第1集_1080p.mp4</strong>
              <span>1.24GB</span>
              <em>上传完成</em>
              <DeleteOutlined />
            </div>
          </section>

          <section className="upload-drama-card">
            <h3>AI 分析设置</h3>
            <div className="upload-ai-settings">
              <Form.Item>
                <Form.Item name="auto_timeline" valuePropName="checked" noStyle>
                  <Switch checkedChildren="" unCheckedChildren="" />
                </Form.Item>
                <span>自动时间轴对齐</span>
              </Form.Item>
              <Form.Item>
                <Form.Item name="auto_highlight" valuePropName="checked" noStyle>
                  <Switch checkedChildren="" unCheckedChildren="" />
                </Form.Item>
                <span>自动识别高光点</span>
              </Form.Item>
              <Form.Item>
                <Form.Item name="generate_suggestion" valuePropName="checked" noStyle>
                  <Switch checkedChildren="" unCheckedChildren="" />
                </Form.Item>
                <span>生成互动策略建议</span>
              </Form.Item>
              <Form.Item>
                <Form.Item name="analyze_after_upload" valuePropName="checked" noStyle>
                  <Switch checkedChildren="" unCheckedChildren="" />
                </Form.Item>
                <span>上传后立即开始分析</span>
              </Form.Item>
            </div>
          </section>

          <div className="upload-drama-footer">
            <Button onClick={() => setDramaModalOpen(false)}>取消</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              完成
            </Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}

const categoryOptions = ['都市', '情感', '逆袭', '悬疑', '甜宠'];

function CategoryDropdown({ value = [], onChange, placeholder }) {
  const [open, setOpen] = useState(false);

  const toggleItem = (item) => {
    const nextValue = value.includes(item)
      ? value.filter((current) => current !== item)
      : [...value, item];
    onChange?.(nextValue);
  };

  const removeItem = (event, item) => {
    event.stopPropagation();
    onChange?.(value.filter((current) => current !== item));
  };

  return (
    <div className={`category-dropdown${open ? ' open' : ''}`}>
      <button className="category-dropdown-trigger" type="button" onClick={() => setOpen((current) => !current)}>
        <span className="category-dropdown-values">
          {value.length ? (
            value.map((item) => (
              <span className="category-tag" key={item}>
                {item}
                <button type="button" onClick={(event) => removeItem(event, item)}>
                  ×
                </button>
              </span>
            ))
          ) : (
            <em>{placeholder}</em>
          )}
        </span>
        <DownOutlined />
      </button>
      {open ? (
        <div className="category-dropdown-menu">
          {categoryOptions.map((item) => (
            <button
              className={value.includes(item) ? 'selected' : ''}
              key={item}
              type="button"
              onClick={() => toggleItem(item)}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TagInput({ value = [], onChange, placeholder }) {
  const removeItem = (item) => {
    onChange?.(value.filter((current) => current !== item));
  };

  return (
    <div className="tag-input-field">
      {value.length ? (
        value.map((item) => (
          <span key={item}>
            {item}
            <button type="button" onClick={() => removeItem(item)}>
              ×
            </button>
          </span>
        ))
      ) : (
        <em>{placeholder}</em>
      )}
      <button className="tag-input-add" type="button">
        <PlusOutlined />
      </button>
    </div>
  );
}
