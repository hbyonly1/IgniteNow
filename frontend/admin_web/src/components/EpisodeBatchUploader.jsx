import { useMemo } from 'react';
import { Upload, Select, Button, Table } from 'antd';
import { CloudUploadOutlined, DeleteOutlined, FileTextOutlined, VideoCameraOutlined } from '@ant-design/icons';

function formatFileSize(size) {
  if (!size) return '-';
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)}GB`;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)}MB`;
  return `${Math.ceil(size / 1024)}KB`;
}

function extractEpisodeNumber(filename) {
  if (!filename) return null;
  const match = filename.match(/(?:第|E)?(\d+)(?:集|_|\.)?/i);
  return match ? parseInt(match[1], 10) : null;
}

export default function EpisodeBatchUploader({ pairs = [], onChange, startIndex = 1, disabled = false }) {
  const handleFilesAdded = (fileList) => {
    let newPairs = [...pairs];
    
    const videos = fileList.filter(f => f.name.match(/\.(mp4|mov|avi|mkv)$/i));
    const subtitles = fileList.filter(f => f.name.match(/\.(srt|vtt|txt)$/i));

    // Process videos
    videos.forEach(file => {
      const rawFile = file.originFileObj || file;
      const no = extractEpisodeNumber(rawFile.name);
      
      let target = newPairs.find(p => p.episodeNo === no);
      if (!target && !no) {
        target = newPairs.find(p => !p.videoFile);
      }
      
      if (target) {
        target.videoFile = rawFile;
      } else {
        newPairs.push({
          id: Math.random().toString(36).substr(2, 9),
          episodeNo: no || (newPairs.length > 0 ? Math.max(...newPairs.map(p => p.episodeNo || 0)) + 1 : startIndex),
          videoFile: rawFile,
          subtitleFile: null,
        });
      }
    });

    // Process subtitles
    subtitles.forEach(file => {
      const rawFile = file.originFileObj || file;
      const no = extractEpisodeNumber(rawFile.name);
      
      let target = newPairs.find(p => p.episodeNo === no);
      if (!target && !no) {
        target = newPairs.find(p => !p.subtitleFile);
      }
      
      if (target) {
        target.subtitleFile = rawFile;
      } else {
        newPairs.push({
          id: Math.random().toString(36).substr(2, 9),
          episodeNo: no || (newPairs.length > 0 ? Math.max(...newPairs.map(p => p.episodeNo || 0)) + 1 : startIndex),
          videoFile: null,
          subtitleFile: rawFile,
        });
      }
    });

    newPairs.sort((a, b) => (a.episodeNo || 9999) - (b.episodeNo || 9999));
    onChange(newPairs);
  };

  const allSubtitles = useMemo(() => {
    const subs = [];
    pairs.forEach(p => {
      if (p.subtitleFile) subs.push(p.subtitleFile);
    });
    return subs;
  }, [pairs]);

  const handleSubtitleChange = (pairId, subtitleName) => {
    const newPairs = [...pairs];
    const pair = newPairs.find(p => p.id === pairId);
    if (!pair) return;
    
    if (!subtitleName) {
      pair.subtitleFile = null;
    } else {
      pair.subtitleFile = allSubtitles.find(s => s.name === subtitleName) || null;
    }
    onChange(newPairs);
  };

  const removePair = (pairId) => {
    onChange(pairs.filter(p => p.id !== pairId));
  };

  return (
    <div className="episode-batch-uploader">
      <div className="upload-assets-unified" style={{ marginBottom: 16 }}>
        <Upload.Dragger
          accept=".mp4,.srt,.vtt,.txt"
          className="unified-batch-dropzone"
          beforeUpload={() => false}
          multiple
          showUploadList={false}
          fileList={[]}
          onChange={({ fileList }) => handleFilesAdded(fileList)}
          disabled={disabled}
          style={{ padding: '40px 0', background: '#fafafa' }}
        >
          <p className="ant-upload-drag-icon">
            <CloudUploadOutlined style={{ fontSize: 48, color: '#1677ff' }} />
          </p>
          <p className="ant-upload-text" style={{ fontSize: 16, marginTop: 16, color: '#333' }}>
            <strong>点击或拖拽多个视频和字幕文件到此处</strong>
          </p>
          <p className="ant-upload-hint" style={{ fontSize: 13, color: '#888', marginTop: 8 }}>
            支持同时上传 MP4 和 SRT/VTT/TXT，系统将自动基于文件名识别集数并进行智能配对
          </p>
        </Upload.Dragger>
      </div>

      {pairs.length > 0 && (
        <div className="batch-preview-table-container">
          <Table
            dataSource={pairs}
            rowKey="id"
            pagination={false}
            size="small"
            className="batch-preview-table"
            columns={[
              {
                title: '集数',
                dataIndex: 'episodeNo',
                width: 70,
                render: (no) => `第 ${no} 集`
              },
              {
                title: '视频文件',
                dataIndex: 'videoFile',
                render: (file) => file ? (
                  <div className="file-cell video-cell">
                    <VideoCameraOutlined /> {file.name}
                    <span className="file-size" style={{ marginLeft: 8, color: '#999' }}>{formatFileSize(file.size)}</span>
                  </div>
                ) : <span style={{ color: '#ff4d4f' }}>未匹配视频</span>
              },
              {
                title: '字幕匹配',
                dataIndex: 'subtitleFile',
                width: 200,
                render: (file, record) => (
                  <Select
                    style={{ width: '100%' }}
                    size="small"
                    allowClear
                    placeholder="无字幕"
                    value={file?.name || null}
                    onChange={(val) => handleSubtitleChange(record.id, val)}
                    options={allSubtitles.map(s => ({ label: s.name, value: s.name }))}
                    disabled={disabled}
                  />
                )
              },
              {
                title: '',
                key: 'action',
                width: 40,
                render: (_, record) => (
                  <Button 
                    type="text" 
                    danger 
                    icon={<DeleteOutlined />} 
                    onClick={() => removePair(record.id)} 
                    disabled={disabled}
                  />
                )
              }
            ]}
          />
        </div>
      )}
    </div>
  );
}
