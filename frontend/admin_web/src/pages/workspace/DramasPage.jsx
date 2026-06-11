import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Popconfirm,
  Progress,
  Radio,
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
  PlusOutlined,
  SearchOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { getAdminUserRole } from '../../auth.js';
import { apiClient, apiErrorMessage } from '../../services/apiClient.js';
import EpisodeBatchUploader from '../../components/EpisodeBatchUploader.jsx';

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

function formatFileSize(value) {
  const size = Number(value ?? 0);
  if (!size) {
    return '-';
  }
  if (size >= 1024 * 1024 * 1024) {
    return `${(size / 1024 / 1024 / 1024).toFixed(2)}GB`;
  }
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(2)}MB`;
  }
  return `${Math.ceil(size / 1024)}KB`;
}

function getUploadAssetAction(fileList) {
  const item = fileList[0];
  if (!item) return { action: 'delete' };
  if (item.originFileObj) return { action: 'upload', file: item.originFileObj };
  if (item instanceof window.File) return { action: 'upload', file: item };
  return { action: 'keep', url: item.url };
}

function extractFilenameFromUrl(url) {
  if (!url) return '';
  const parts = url.split('/');
  return parts[parts.length - 1] || '未命名文件';
}

function episodeMaterialStatus(episode) {
  if (!episode?.video_url) {
    return { label: '缺视频', color: 'error' };
  }
  if (!hasSubtitle(episode)) {
    return { label: '缺字幕', color: 'warning' };
  }
  return { label: '完整', color: 'success' };
}

function fileDisplayName(url, originalName, fallback = '-') {
  return originalName || extractFilenameFromUrl(url) || fallback;
}

function subtitleDisplayName(episode) {
  if (episode.subtitle_original_name || episode.subtitle_url) {
    return fileDisplayName(episode.subtitle_url, episode.subtitle_original_name);
  }
  return episode.subtitle_content ? '已录入字幕' : '';
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
  const [selectedEpisodeRowKeys, setSelectedEpisodeRowKeys] = useState([]);
  const [coverFileList, setCoverFileList] = useState([]);
  const [wideCoverFileList, setWideCoverFileList] = useState([]);
  const [dramaBatchPairs, setDramaBatchPairs] = useState([]);
  const [dramaForm] = Form.useForm();

  const watchedCoverUrl = Form.useWatch('cover_url', dramaForm);
  const watchedWideCoverUrl = Form.useWatch('wide_cover_url', dramaForm);

  const [episodeModalOpen, setEpisodeModalOpen] = useState(false);
  const [episodeModalMode, setEpisodeModalMode] = useState('create');
  const [episodeSubmitting, setEpisodeSubmitting] = useState(false);
  const [episodeBatchPairs, setEpisodeBatchPairs] = useState([]);
  const [episodeForm] = Form.useForm();
  const [uploadProgress, setUploadProgress] = useState(null);

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

  const episodeMaterialSummary = useMemo(() => ({
    videoCount: episodes.filter((episode) => episode.video_url).length,
    subtitleCount: episodes.filter(hasSubtitle).length,
    incompleteCount: episodes.filter((episode) => !episode.video_url || !hasSubtitle(episode)).length,
  }), [episodes]);

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
    if (drama?.cover_url) {
      setCoverFileList([{ uid: '-1', name: '现有竖版封面', status: 'done', url: drama.cover_url }]);
    } else {
      setCoverFileList([]);
    }
    if (drama?.wide_cover_url) {
      setWideCoverFileList([{ uid: '-2', name: '现有横版封面', status: 'done', url: drama.wide_cover_url }]);
    } else {
      setWideCoverFileList([]);
    }
    setDramaBatchPairs([]);
    setUploadProgress(null);
    setDramaModalOpen(true);
  };

  const dramaInitialValues = useMemo(() => {
    return editingDrama
      ? {
        title: editingDrama.title,
        description: editingDrama.description,
        cover_url: editingDrama.cover_url,
        wide_cover_url: editingDrama.wide_cover_url,
        episode_count_hint: editingDrama.episode_count ?? undefined,
        categories: editingDrama.categories ?? [],
        keywords: editingDrama.cast_tags ?? [],
        initial_status: 'draft',
        post_upload_action: 'full',
      }
      : {
        title: '',
        description: '',
        cover_url: '',
        wide_cover_url: '',
        episode_count_hint: undefined,
        categories: [],
        keywords: [],
        initial_status: 'draft',
        post_upload_action: 'full',
      };
  }, [editingDrama]);

  useEffect(() => {
    if (dramaModalOpen) {
      window.setTimeout(() => {
        dramaForm.resetFields();
        dramaForm.setFieldsValue(dramaInitialValues);
      }, 0);
    }
  }, [dramaModalOpen, dramaInitialValues, dramaForm]);

  const closeDramaModal = () => {
    if (uploadProgress) {
      message.warning('正在上传中，请稍后再试');
      return;
    }
    setDramaModalOpen(false);
    setCoverFileList([]);
    setWideCoverFileList([]);
    setDramaBatchPairs([]);
  };

  const uploadAssetFile = async (assetType, file) => {
    const formData = new window.FormData();
    formData.append('asset_type', assetType);
    formData.append('file', file);
    const response = await apiClient.post('/api/admin/assets/files', formData);
    return response.data.data;
  };

  const uploadDramaEpisode = async (dramaId, values, videoFile, subtitleFile, episodeNo = 1) => {
    const formData = new window.FormData();
    formData.append('episode_no', String(episodeNo));
    formData.append('episode_title', values.episode_title ?? `${values.title} 第 ${episodeNo} 集`);
    formData.append('video_file', videoFile);
    if (subtitleFile) {
      formData.append('subtitle_file', subtitleFile);
    }
    const response = await apiClient.post(`/api/dramas/${dramaId}/episodes/upload`, formData);
    return response.data.data;
  };

  const enqueueAnalysisJob = async (episodeId) => {
    await apiClient.post('/api/system/jobs', {
      type: 'ai_analyze',
      payload: { episode_id: episodeId, force_reanalyze: false },
    });
  };

  const enqueueSubtitleJob = async (episodeId) => {
    await apiClient.post('/api/system/jobs', {
      type: 'subtitle_asr',
      payload: { episode_id: episodeId, force: false },
    });
  };

  const enqueueHighlightOnlyJob = async (episodeId) => {
    await apiClient.post('/api/system/jobs', {
      type: 'ai_analyze',
      payload: { episode_id: episodeId, force_reanalyze: false, skip_subtitle_asr: true },
    });
  };

  const submitPostUploadJob = async (episodeId, action) => {
    if (action === 'subtitle') {
      await enqueueSubtitleJob(episodeId);
      return;
    }
    if (action === 'highlight') {
      await enqueueHighlightOnlyJob(episodeId);
      return;
    }
    if (action === 'full') {
      await enqueueAnalysisJob(episodeId);
    }
  };

  const submitEpisodeJobs = async (episodeIds, enqueue, label) => {
    if (!episodeIds.length) {
      return;
    }
    let successCount = 0;
    let failCount = 0;
    for (const episodeId of episodeIds) {
      try {
        await enqueue(episodeId);
        successCount += 1;
      } catch (error) {
        failCount += 1;
        message.error(apiErrorMessage(error, `${label}提交失败`));
      }
    }
    if (successCount > 0) {
      message.success(failCount ? `${label}已提交 ${successCount} 项，失败 ${failCount} 项` : `${label}已提交 ${successCount} 项`);
    }
    setSelectedEpisodeRowKeys([]);
    await refreshManagingEpisodes();
  };

  const submitSubtitleJobs = async (episodeIds) => {
    const targetEpisodes = episodes.filter((episode) => episodeIds.includes(episode.id));
    const availableEpisodeIds = targetEpisodes.filter((episode) => episode.video_url).map((episode) => episode.id);
    const skippedCount = targetEpisodes.length - availableEpisodeIds.length;
    if (skippedCount > 0) {
      message.warning(`已跳过 ${skippedCount} 集缺少视频的剧集`);
    }
    await submitEpisodeJobs(availableEpisodeIds, enqueueSubtitleJob, '字幕识别');
  };

  const submitAnalysisJobs = async (episodeIds) => {
    await submitEpisodeJobs(episodeIds, enqueueAnalysisJob, 'AI 分析');
  };

  const readTextFile = (file) =>
    new Promise((resolve, reject) => {
      const reader = new window.FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, 'utf-8');
    });

  const openEpisodeModal = () => {
    if (!managingDrama) {
      return;
    }
    setEpisodeModalMode('batch');

    // Pre-fill existing episodes so they show up in the batch uploader
    const existingPairs = episodes.map(ep => ({
      id: ep.id,
      episodeNo: ep.episode_no,
      videoFile: ep.video_url ? { name: ep.video_original_name || extractFilenameFromUrl(ep.video_url), url: ep.video_url, isExisting: true } : null,
      subtitleFile: ep.subtitle_url ? { name: ep.subtitle_original_name || extractFilenameFromUrl(ep.subtitle_url), url: ep.subtitle_url, isExisting: true } : null,
      isExistingEpisode: true,
      originalData: ep,
    })).sort((a, b) => a.episodeNo - b.episodeNo);
    setEpisodeBatchPairs(existingPairs);

    setUploadProgress(null);
    setEpisodeModalOpen(true);
  };

  const episodeInitialValues = useMemo(() => {
    return {
      episode_no: Math.max(0, ...episodes.map((item) => Number(item.episode_no) || 0)) + 1,
      episode_title: '',
    };
  }, [episodes]);

  useEffect(() => {
    if (episodeModalOpen) {
      window.setTimeout(() => {
        episodeForm.resetFields();
        episodeForm.setFieldsValue(episodeInitialValues);
      }, 0);
    }
  }, [episodeModalOpen, episodeInitialValues, episodeForm]);

  const closeEpisodeModal = () => {
    if (uploadProgress) {
      message.warning('正在上传中，请稍后再试');
      return;
    }
    setEpisodeModalOpen(false);
    setEpisodeBatchPairs([]);
  };

  const refreshManagingEpisodes = async (preferredEpisodeId = null) => {
    if (!managingDrama) {
      return;
    }
    await loadEpisodes(managingDrama);
    if (preferredEpisodeId) {
      setSelectedEpisodeRowKeys([preferredEpisodeId]);
    }
    await loadDramas();
  };

  const submitEpisodeAsset = async () => {
    if (!managingDrama) {
      return;
    }

    if (episodeBatchPairs.length === 0) {
      return message.error('无可处理项');
    }

    const invalidPairs = episodeBatchPairs.filter(p => !p.isExistingEpisode && !p.videoFile);
    if (invalidPairs.length > 0) {
      return message.error('新增集数中存在未匹配视频的项，请补全视频或将其移除');
    }

    setEpisodeSubmitting(true);
    let successCount = 0;
    let failCount = 0;
    try {
      for (let i = 0; i < episodeBatchPairs.length; i++) {
        const pair = episodeBatchPairs[i];

        // Check if existing episode needs updates
        if (pair.isExistingEpisode) {
          const videoAction = getUploadAssetAction([pair.videoFile]);
          const subtitleAction = getUploadAssetAction([pair.subtitleFile]);

          if (videoAction.action === 'keep' && subtitleAction.action === 'keep') {
            // Nothing changed for this existing episode
            continue;
          }

          setUploadProgress({
            total: episodeBatchPairs.length,
            current: i + 1,
            filename: `第 ${pair.episodeNo} 集更新`,
          });

          try {
            const updates = {};
            if (videoAction.action === 'upload') {
              const asset = await uploadAssetFile('video', videoAction.file);
              updates.video_url = asset.path;
              updates.video_original_name = videoAction.file.name || '';
              updates.duration = asset.metadata?.duration ?? pair.originalData.duration;
              updates.video_width = asset.metadata?.width ?? 0;
              updates.video_height = asset.metadata?.height ?? 0;
              updates.video_file_size = asset.metadata?.file_size ?? asset.file_size ?? 0;
              updates.video_mime_type = asset.metadata?.mime_type ?? asset.mime_type ?? '';
            } else if (videoAction.action === 'delete') {
              updates.video_url = '';
              updates.video_original_name = '';
            }

            if (subtitleAction.action === 'upload') {
              const [asset, subtitleText] = await Promise.all([
                uploadAssetFile('subtitle', subtitleAction.file),
                readTextFile(subtitleAction.file),
              ]);
              updates.subtitle_url = asset.path;
              updates.subtitle_original_name = subtitleAction.file.name || '';
              updates.subtitle_content = subtitleText;
            } else if (subtitleAction.action === 'delete') {
              updates.subtitle_url = '';
              updates.subtitle_original_name = '';
              updates.subtitle_content = '';
            }

            if (Object.keys(updates).length > 0) {
              const finalVideoUrl = updates.video_url !== undefined ? updates.video_url : pair.originalData.video_url;
              const finalSubtitleUrl = updates.subtitle_url !== undefined ? updates.subtitle_url : pair.originalData.subtitle_url;
              updates.asset_status = (finalVideoUrl && finalSubtitleUrl) ? 'ready' : 'incomplete';

              await apiClient.put(`/api/episodes/${pair.id}`, updates);
            }
            successCount++;
          } catch (e) {
            failCount++;
            message.error(`更新第 ${pair.episodeNo} 集失败: ${e.response?.data?.detail || e.message}`);
          }
        } else {
          // New episode
          setUploadProgress({
            total: episodeBatchPairs.length,
            current: i + 1,
            filename: `第 ${pair.episodeNo} 集上传`,
          });

          try {
            await uploadDramaEpisode(
              managingDrama.id,
              { episode_title: `${managingDrama.title} 第 ${pair.episodeNo} 集` },
              pair.videoFile,
              pair.subtitleFile,
              pair.episodeNo
            );
            successCount++;
          } catch (e) {
            failCount++;
            message.error(`上传第 ${pair.episodeNo} 集失败: ${e.response?.data?.detail || e.message}`);
          }
        }
      }

      if (failCount > 0) {
        message.warning(`处理完毕：成功 ${successCount} 集，失败 ${failCount} 集`);
      } else if (successCount > 0) {
        message.success(`成功处理 ${successCount} 集`);
        closeEpisodeModal();
      } else {
        closeEpisodeModal(); // nothing changed, just closed
      }

      await refreshManagingEpisodes();
    } catch (error) {
      message.error(apiErrorMessage(error, '批量处理过程出现异常'));
    } finally {
      setEpisodeSubmitting(false);
      setUploadProgress(null);
    }
  };

  const submitDrama = async (values) => {
    setSubmitting(true);
    try {
      const coverAction = getUploadAssetAction(coverFileList);
      const wideCoverAction = getUploadAssetAction(wideCoverFileList);

      let coverUrl = editingDrama?.cover_url ?? '';
      let wideCoverUrl = editingDrama?.wide_cover_url ?? '';

      if (coverAction.action === 'upload') {
        const asset = await uploadAssetFile('cover', coverAction.file);
        coverUrl = asset.url;
      } else if (coverAction.action === 'delete') {
        coverUrl = '';
      }

      if (wideCoverAction.action === 'upload') {
        const asset = await uploadAssetFile('wide_cover', wideCoverAction.file);
        wideCoverUrl = asset.url;
      } else if (wideCoverAction.action === 'delete') {
        wideCoverUrl = '';
      }

      const payload = {
        title: values.title,
        description: values.description ?? '',
        cover_url: coverUrl,
        wide_cover_url: wideCoverUrl,
        categories: values.categories ?? [],
        cast_tags: values.keywords ?? [],
      };
      let dramaId = editingDrama?.id;
      if (editingDrama) {
        await apiClient.put(`/api/dramas/${editingDrama.id}`, payload);
        message.success('短剧已更新');
      } else {
        const response = await apiClient.post('/api/dramas', payload);
        dramaId = response.data.data.id;
        message.success('短剧已创建');
      }

      if (!editingDrama && dramaBatchPairs.length > 0 && dramaId) {
        const validPairs = dramaBatchPairs.filter(p => p.videoFile);
        if (dramaBatchPairs.length > validPairs.length) {
          message.warning('跳过部分未包含视频的文件对');
        }

        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < validPairs.length; i++) {
          const pair = validPairs[i];
          setUploadProgress({
            total: validPairs.length,
            current: i + 1,
            filename: pair.videoFile.name,
          });
          try {
            const episode = await uploadDramaEpisode(
              dramaId,
              { episode_title: `${values.title} 第 ${pair.episodeNo} 集` },
              pair.videoFile,
              pair.subtitleFile,
              pair.episodeNo
            );
            if (values.post_upload_action && values.post_upload_action !== 'none') {
              await submitPostUploadJob(episode.id, values.post_upload_action);
            }
            successCount++;
          } catch (e) {
            failCount++;
            message.error(`上传第 ${pair.episodeNo} 集失败: ${e.response?.data?.detail || e.message}`);
          }
        }
        if (validPairs.length > 0) {
          if (failCount > 0) {
            message.error(`素材批量上传结束：成功 ${successCount} 集，失败 ${failCount} 集`);
          } else {
            message.success(`素材批量上传结束：成功 ${successCount} 集`);
          }
        }
      }

      closeDramaModal();
      await loadDramas();
      if (managingDrama && managingDrama.id === dramaId) {
        await loadEpisodes(managingDrama);
      }
    } catch (error) {
      message.error(apiErrorMessage(error, '短剧保存失败'));
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  };

  const handleDeleteDrama = async (dramaId) => {
    try {
      await apiClient.delete(`/api/dramas/${dramaId}`);
      message.success('短剧已删除');
      if (managingDrama?.id === dramaId) {
        setManagingDrama(null);
      }
      await loadDramas();
    } catch (error) {
      message.error(apiErrorMessage(error, '删除短剧失败'));
    }
  };

  const handleDeleteSelectedEpisodes = async () => {
    if (!selectedEpisodeRowKeys.length) {
      return;
    }
    let successCount = 0;
    let failCount = 0;
    for (const episodeId of selectedEpisodeRowKeys) {
      try {
        await apiClient.delete(`/api/episodes/${episodeId}`);
        successCount += 1;
      } catch (error) {
        failCount += 1;
        message.error(apiErrorMessage(error, '删除剧集失败'));
      }
    }
    if (successCount > 0) {
      message.success(failCount ? `已删除 ${successCount} 集，失败 ${failCount} 集` : `已删除 ${successCount} 集`);
    }
    setSelectedEpisodeRowKeys([]);
    await refreshManagingEpisodes();
  };

  useEffect(() => {
    Promise.resolve().then(loadDramas);
  }, []);

  const dramaColumns = [
    {
      title: '剧集名称',
      dataIndex: 'title',
      width: '28%',
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
      width: '10%',
      render: (value) => `${value ?? 0} 集`,
    },
    {
      title: '状态',
      key: 'status',
      width: '14%',
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
      width: '18%',
      render: (_, record) => formatDateTime(record.updated_at ?? record.created_at),
    },
    {
      title: '操作',
      key: 'actions',
      width: '26%',
      align: 'right',
      className: 'drama-list-action-column',
      render: (_, record) => {
        const stop = (event) => event.stopPropagation();
        return (
          <div className="drama-list-actions" onClick={stop} style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
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
            {isAdmin ? (
              <Popconfirm
                title="确认删除该短剧？"
                description="将同时删除所有剧集和高光点，此操作不可恢复。"
                okText="确认删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDeleteDrama(record.id)}
              >
                <Button
                  danger
                  type="default"
                  className="drama-list-delete-action"
                  icon={<DeleteOutlined />}
                  title="删除短剧"
                />
              </Popconfirm>
            ) : null}
          </div>
        );
      },
    },
  ];

  const episodeColumns = [
    {
      title: '剧集',
      dataIndex: 'episode_no',
      width: 120,
      render: (_, record) => (
        <div className="episode-list-title">
          <span className="episode-list-cover">
            {managingDrama?.cover_url ? <img src={managingDrama.cover_url} alt="" loading="lazy" /> : <span>{record.episode_no}</span>}
          </span>
          <span className="episode-list-copy">
            <strong>第 {record.episode_no} 集</strong>
          </span>
        </div>
      ),
    },
    {
      title: '视频文件',
      key: 'video_file',
      render: (_, record) => {
        const filename = fileDisplayName(record.video_url, record.video_original_name, '');
        return filename ? (
          <span className="episode-file-cell">
            <strong>{filename}</strong>
            <span>{record.video_url ? '已上传' : '-'}</span>
          </span>
        ) : <span className="episode-file-empty">未上传</span>;
      },
    },
    {
      title: '字幕文件',
      key: 'subtitle_file',
      render: (_, record) => {
        const filename = subtitleDisplayName(record);
        return filename ? (
          <span className="episode-file-cell">
            <strong>{filename}</strong>
            <span>{record.subtitle_url ? '已上传' : '文本字幕'}</span>
          </span>
        ) : <span className="episode-file-empty">未上传</span>;
      },
    },
    {
      title: '时长',
      dataIndex: 'duration',
      width: 76,
      render: (value) => formatDuration(value),
    },
    {
      title: '文件大小',
      dataIndex: 'video_file_size',
      width: 88,
      render: (value) => formatFileSize(value),
    },
    {
      title: '更新时间',
      key: 'created_at',
      width: 136,
      render: (_, record) => formatDateTime(record.updated_at ?? record.created_at),
    },
    {
      title: '素材状态',
      key: 'material_status',
      width: 88,
      render: (_, record) => {
        const meta = episodeMaterialStatus(record);
        return (
          <Tag className="drama-list-status" color={meta.color}>
            {meta.label}
          </Tag>
        );
      },
    },
  ];

  return (
    <>
      {managingDrama ? (
        <section className="episode-management">
          <div className="content-page-header">
            <div className="content-page-title">
              <h1>剧集素材管理</h1>
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
              <Button type="primary" className="content-upload-action" icon={<PlusOutlined />} onClick={() => openEpisodeModal()}>
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
              <div className="episode-summary-stats">
                <span className="neutral">共 <strong>{episodes.length}</strong> 集</span>
                <span className="completed">已有视频 <strong>{episodeMaterialSummary.videoCount}</strong> 集</span>
                <span className="published">已有字幕 <strong>{episodeMaterialSummary.subtitleCount}</strong> 集</span>
                <span className="pending">待补齐 <strong>{episodeMaterialSummary.incompleteCount}</strong> 集</span>
              </div>
            </div>
            <Button onClick={() => setManagingDrama(null)} icon={<ArrowLeftOutlined />}>
              返回短剧
            </Button>
          </section>

          <section className="episode-table-panel episode-table-panel-full">
            <div className="episode-table-body">
              <div className="analysis-filterbar episode-table-toolbar">
                <span>已选择 {selectedEpisodeRowKeys.length} 项</span>
                <div className="analysis-filter-actions">
                  <Button icon={<FileTextOutlined />} disabled={!selectedEpisodeRowKeys.length} onClick={() => submitSubtitleJobs(selectedEpisodeRowKeys)}>
                    批量识别字幕
                  </Button>
                  <Button icon={<SendOutlined />} disabled={!selectedEpisodeRowKeys.length} onClick={() => submitAnalysisJobs(selectedEpisodeRowKeys)}>
                    批量分析高光
                  </Button>
                  {isAdmin ? (
                    <Popconfirm
                      title="确认删除选中的剧集？"
                      description="将同时删除对应高光点，此操作不可恢复。"
                      okText="确认删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      disabled={!selectedEpisodeRowKeys.length}
                      onConfirm={handleDeleteSelectedEpisodes}
                    >
                      <Button danger icon={<DeleteOutlined />} disabled={!selectedEpisodeRowKeys.length}>
                        批量删除
                      </Button>
                    </Popconfirm>
                  ) : null}
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
            </div>
          </section>
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
        onCancel={closeDramaModal}
        closable={false}
        footer={null}
        width={1100}
        style={{ maxWidth: '95vw', top: 20 }}
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
            onClick={closeDramaModal}
          />
        </div>

        <Form form={dramaForm} layout="vertical" onFinish={submitDrama} className="upload-drama-form" initialValues={dramaInitialValues}>
          <Form.Item name="cover_url" hidden><Input /></Form.Item>
          <Form.Item name="wide_cover_url" hidden><Input /></Form.Item>
          <section className="upload-drama-card upload-drama-basic">
            <div className="upload-cover-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ margin: 0 }}>封面设置</h3>
                {(watchedCoverUrl || coverFileList?.length > 0) && (
                  <Button
                    danger
                    type="default"
                    icon={<DeleteOutlined />}
                    title="删除封面"
                    style={{ padding: '4px 8px', height: 28 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCoverFileList([]);
                      dramaForm.setFieldsValue({ cover_url: '' });
                    }}
                  />
                )}
              </div>
              <Upload.Dragger
                accept=".jpg,.jpeg,.png,.webp"
                className="upload-cover-dropzone"
                beforeUpload={() => false}
                fileList={coverFileList}
                maxCount={1}
                showUploadList={false}
                onChange={({ fileList }) => setCoverFileList(fileList.slice(-1))}
              >
                {(() => {
                  let preview = watchedCoverUrl;
                  if (coverFileList?.length > 0) {
                    const f = coverFileList[0].originFileObj || coverFileList[0];
                    preview = f.url || window.URL.createObjectURL(f);
                  }
                  if (preview) {
                    return (
                      <div className="cover-preview-container">
                        <img src={preview} alt="封面预览" />
                        <div className="cover-preview-overlay">
                          <CloudUploadOutlined />
                          <span>点击替换封面</span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <>
                      <CloudUploadOutlined />
                      <strong>上传封面</strong>
                      <span>建议尺寸 3:4，JPG/PNG</span>
                    </>
                  );
                })()}
              </Upload.Dragger>
              <Form.Item label={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span>短剧横版封面（可选）</span>
                  {(watchedWideCoverUrl || wideCoverFileList?.length > 0) && (
                    <Button
                      danger
                      type="default"
                      icon={<DeleteOutlined />}
                      title="删除横版封面"
                      style={{ padding: '2px 8px', height: 24, fontSize: 12 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setWideCoverFileList([]);
                        dramaForm.setFieldsValue({ wide_cover_url: '' });
                      }}
                    />
                  )}
                </div>
              } style={{ width: '100%' }}>
                <Upload.Dragger
                  accept=".jpg,.jpeg,.png,.webp"
                  className="upload-wide-cover-dropzone"
                  beforeUpload={() => false}
                  fileList={wideCoverFileList}
                  maxCount={1}
                  showUploadList={false}
                  onChange={({ fileList }) => setWideCoverFileList(fileList.slice(-1))}
                >
                  {(() => {
                    let preview = watchedWideCoverUrl;
                    if (wideCoverFileList?.length > 0) {
                      const f = wideCoverFileList[0].originFileObj || wideCoverFileList[0];
                      preview = f.url || window.URL.createObjectURL(f);
                    }
                    if (preview) {
                      return (
                        <div className="cover-preview-container">
                          <img src={preview} alt="横版封面预览" />
                          <div className="cover-preview-overlay">
                            <CloudUploadOutlined />
                            <span>点击替换横版封面</span>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <>
                        <InboxOutlined />
                        <strong>上传横版封面</strong>
                        <span>建议尺寸 16:9，JPG/PNG</span>
                      </>
                    );
                  })()}
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
                    <InputNumber min={1} precision={0} controls={false} placeholder="请输入剧集数量" style={{ width: '100%' }} />
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

          {!editingDrama ? (
            <>
              <section className="upload-drama-card">
                <h3>素材批量上传</h3>
                <EpisodeBatchUploader
                  pairs={dramaBatchPairs}
                  onChange={setDramaBatchPairs}
                  disabled={submitting}
                />
              </section>

              <section className="upload-drama-card">
                <h3>AI 分析设置</h3>
                <div className="upload-ai-settings">
                  <Form.Item name="post_upload_action" noStyle>
                    <Radio.Group className="analysis-mode-group upload-post-action-group">
                      <Radio.Button value="none">不处理</Radio.Button>
                      <Radio.Button value="subtitle">仅生成字幕</Radio.Button>
                      <Radio.Button value="highlight">仅分析高光</Radio.Button>
                      <Radio.Button value="full">全部生成</Radio.Button>
                    </Radio.Group>
                  </Form.Item>
                </div>
              </section>
            </>
          ) : null}

          <div className="upload-drama-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16 }}>
            {uploadProgress ? (
              <div className="upload-progress-info" style={{ flex: 1, textAlign: 'left', fontSize: 13, color: '#666' }}>
                正在上传 {uploadProgress.filename} ({uploadProgress.current}/{uploadProgress.total})
                <Progress percent={Math.round((uploadProgress.current / uploadProgress.total) * 100)} size="small" status="active" />
              </div>
            ) : null}
            <Button onClick={closeDramaModal} disabled={submitting}>取消</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              完成
            </Button>
          </div>
        </Form>
      </Modal>

      {/* 剧集素材弹窗 */}
      <Modal
        className="upload-drama-modal episode-asset-modal"
        title={null}
        open={episodeModalOpen}
        onCancel={closeEpisodeModal}
        closable={false}
        footer={null}
        width={860}
        destroyOnHidden
        styles={{ body: { maxHeight: '80vh', overflowY: 'auto' } }}
      >
        <div className="upload-drama-header">
          <div>
            <h2>
              管理剧集素材
            </h2>
            <p>{managingDrama ? managingDrama.title : '剧集素材配置'}</p>
          </div>
          <Button
            type="text"
            className="upload-drama-close"
            icon={<CloseOutlined />}
            onClick={closeEpisodeModal}
          />
        </div>

        <Form form={episodeForm} layout="vertical" onFinish={submitEpisodeAsset} className="upload-drama-form" initialValues={episodeInitialValues}>
          {episodeModalMode === 'batch' ? (
            <section className="upload-drama-card">
              <div style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
                提示：下方列表展示所有剧集，拖拽视频或字幕可自动更新对应集数的素材。
              </div>

              <EpisodeBatchUploader
                pairs={episodeBatchPairs}
                onChange={setEpisodeBatchPairs}
                disabled={episodeSubmitting}
                startIndex={Math.max(0, ...episodes.map(e => Number(e.episode_no) || 0)) + 1}
              />
            </section>
          ) : null}

          <div className="upload-drama-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16 }}>
            {uploadProgress ? (
              <div className="upload-progress-info" style={{ flex: 1, textAlign: 'left', fontSize: 13, color: '#666' }}>
                正在上传 {uploadProgress.filename} ({uploadProgress.current}/{uploadProgress.total})
                <Progress percent={Math.round((uploadProgress.current / uploadProgress.total) * 100)} size="small" status="active" />
              </div>
            ) : null}
            <Button onClick={closeEpisodeModal} disabled={episodeSubmitting}>取消</Button>
            <Button type="primary" htmlType="submit" loading={episodeSubmitting}>
              保存
            </Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}

const categoryOptions = ['都市', '情感', '逆袭', '悬疑', '甜宠'];

function FileChip({ file, icon, label, onRemove }) {
  const rawFile = file?.originFileObj ?? file;
  return (
    <div className="upload-file-chip">
      <span className="upload-file-icon">{icon}</span>
      <strong>{rawFile?.name ?? file?.name ?? '已选择文件'}</strong>
      <span>{formatFileSize(rawFile?.size ?? file?.size)}</span>
      <em>{label}</em>
      <Button type="text" icon={<DeleteOutlined />} onClick={onRemove} />
    </div>
  );
}

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
  const [draft, setDraft] = useState('');

  const addItem = () => {
    const nextItem = draft.trim();
    if (!nextItem) {
      return;
    }
    if (!value.includes(nextItem)) {
      onChange?.([...value, nextItem]);
    }
    setDraft('');
  };

  const removeItem = (item) => {
    onChange?.(value.filter((current) => current !== item));
  };

  return (
    <div className="tag-input-field">
      {value.map((item) => (
        <span key={item}>
          {item}
          <button type="button" onClick={() => removeItem(item)}>
            ×
          </button>
        </span>
      ))}
      <input
        className="tag-input-editor"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={addItem}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            addItem();
          }
          if (event.key === 'Backspace' && !draft && value.length) {
            event.preventDefault();
            removeItem(value[value.length - 1]);
          }
        }}
        placeholder={value.length ? '' : placeholder}
      />
      <button className="tag-input-add" type="button" onMouseDown={(event) => event.preventDefault()} onClick={addItem}>
        <PlusOutlined />
      </button>
    </div>
  );
}
