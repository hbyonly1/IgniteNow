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
  Tooltip,
  Upload,
  message,
} from 'antd';
import {
  CloseOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  FileTextOutlined,
  InboxOutlined,
  MoreOutlined,
  PlusOutlined,
  SearchOutlined,
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
      width: 110,
      render: (value) => `${value ?? 0} 集`,
    },
    {
      title: '状态',
      key: 'status',
      width: 130,
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
      width: 180,
      render: (_, record) => formatDateTime(record.updated_at ?? record.created_at),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      align: 'right',
      render: (_, record) => (
        isAdmin ? (
          <Tooltip title="编辑短剧">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={(event) => {
                event.stopPropagation();
                openDramaModal(record);
              }}
            />
          </Tooltip>
        ) : null
      ),
    },
  ];

  return (
    <>
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
            rowKey="id"
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
            <Form.Item label="默认发布状态" className="upload-status-field">
              <div className="upload-status-select">
                <span>草稿</span>
                <MoreOutlined />
              </div>
            </Form.Item>
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
