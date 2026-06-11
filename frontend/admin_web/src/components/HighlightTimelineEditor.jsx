import { useMemo, useRef, useState } from 'react';
import { Button } from 'antd';
import {
  DeleteOutlined,
  PlusOutlined,
  RotateRightOutlined,
  UndoOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import { timelineLaneForHighlight, timelineLaneKeys, timelineLaneMeta } from './highlightTimelineUtils.js';

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

function formatRange(record) {
  return `${formatTimecode(record.start_time)} - ${formatTimecode(record.end_time)}`;
}

function ScissorIcon() {
  return <span className="inline-symbol-icon">╋</span>;
}

function MergeIcon() {
  return <span className="inline-symbol-icon">⇄</span>;
}

export function HighlightTimelineEditor({
  currentTime,
  duration,
  highlights,
  selectedId,
  onCreate,
  onDelete,
  onMerge,
  onRedo,
  onSeek,
  onSelect,
  onSplit,
  onUndo,
  onUpdate,
  redoDisabled,
  undoDisabled,
}) {
  const trackRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const safeDuration = Math.max(1, Number(duration || 0));
  const playheadLeft = Math.min(100, Math.max(0, (Number(currentTime || 0) / safeDuration) * 100));
  const timelineWidth = `${Math.round(100 * zoom)}%`;
  const ticks = useMemo(() => {
    const count = Math.min(8, Math.max(4, Math.ceil(safeDuration / 60) + 1));
    return Array.from({ length: count }, (_, index) => {
      const value = (safeDuration / (count - 1)) * index;
      return { value, left: (value / safeDuration) * 100 };
    });
  }, [safeDuration]);
  const laneItems = useMemo(() => timelineLaneKeys.reduce((result, key) => {
    result[key] = highlights.filter((item) => timelineLaneForHighlight(item) === key);
    return result;
  }, {}), [highlights]);

  const startDrag = (event, item, mode) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(item);
    const trackRect = trackRef.current?.getBoundingClientRect();
    if (!trackRect?.width) {
      return;
    }
    const startX = event.clientX;
    const originalStart = Number(item.start_time || 0);
    const originalEnd = Number(item.end_time || 0);
    const minLength = 0.2;
    onUpdate(item, {}, { history: true, select: true });

    const onPointerMove = (moveEvent) => {
      const deltaSeconds = ((moveEvent.clientX - startX) / trackRect.width) * safeDuration;
      let nextStart = originalStart;
      let nextEnd = originalEnd;
      if (mode === 'move') {
        const length = originalEnd - originalStart;
        nextStart = Math.min(Math.max(0, originalStart + deltaSeconds), Math.max(0, safeDuration - length));
        nextEnd = nextStart + length;
      } else if (mode === 'start') {
        nextStart = Math.min(Math.max(0, originalStart + deltaSeconds), originalEnd - minLength);
      } else {
        nextEnd = Math.max(Math.min(safeDuration, originalEnd + deltaSeconds), originalStart + minLength);
      }
      onUpdate(item, {
        start_time: formatTimecode(nextStart),
        end_time: formatTimecode(nextEnd),
      }, { history: false, select: true });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const seekFromPointer = (event) => {
    if (event.target?.closest?.('.highlight-track-segment')) {
      return;
    }
    const trackRect = trackRef.current?.getBoundingClientRect();
    if (!trackRect?.width) {
      return;
    }
    const nextTime = Math.min(safeDuration, Math.max(0, ((event.clientX - trackRect.left) / trackRect.width) * safeDuration));
    onSeek?.(nextTime);
  };

  return (
    <div className="upload-drama-card highlight-timeline-editor">
      <div className="highlight-timeline-toolbar">
        <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>从当前时间创建区间</Button>
        <Button icon={<ScissorIcon />} onClick={onSplit}>拆分区间</Button>
        <Button icon={<MergeIcon />} onClick={onMerge}>合并相邻区间</Button>
        <Button danger icon={<DeleteOutlined />} onClick={onDelete}>删除</Button>
        <span className="highlight-timeline-spacer" />
        <Button icon={<UndoOutlined />} disabled={undoDisabled} onClick={onUndo}>撤销</Button>
        <Button icon={<RotateRightOutlined />} disabled={redoDisabled} onClick={onRedo}>重做</Button>
      </div>
      <div className="highlight-timeline-zoom">
        <div className="highlight-zoom-actions">
          <Button
            aria-label="缩小时间轴"
            disabled={zoom <= 1}
            icon={<ZoomOutOutlined />}
            size="small"
            title="缩小时间轴"
            onClick={() => setZoom((current) => Math.max(1, Number((current - 0.25).toFixed(2))))}
          />
          <Button
            aria-label="放大时间轴"
            disabled={zoom >= 3}
            icon={<ZoomInOutlined />}
            size="small"
            title="放大时间轴"
            onClick={() => setZoom((current) => Math.min(3, Number((current + 0.25).toFixed(2))))}
          />
        </div>
        <span>当前播放时间：<b>{formatTimecode(currentTime)}</b></span>
      </div>
      <div className="highlight-track-grid">
        <div className="highlight-track-labels">
          {timelineLaneKeys.map((key) => (
            <span key={key} className={`highlight-track-label ${key}`}>
              <i />
              {timelineLaneMeta[key].label}
            </span>
          ))}
        </div>
        <div className="highlight-track-scroll">
          <div
            ref={trackRef}
            className="highlight-track-stage"
            style={{ width: timelineWidth }}
            onClick={seekFromPointer}
          >
            <div className="highlight-track-ruler">
              {ticks.map((tick, index) => (
                <span
                  key={tick.value}
                  className={index === 0 ? 'first' : index === ticks.length - 1 ? 'last' : undefined}
                  style={{ left: `${tick.left}%` }}
                >
                  {formatDuration(tick.value)}
                </span>
              ))}
            </div>
            <div className="highlight-playhead" style={{ left: `${playheadLeft}%` }}>
              <i />
            </div>
            {timelineLaneKeys.map((key) => (
              <div key={key} className="highlight-track-lane">
                {ticks.map((tick) => <span key={tick.value} className="highlight-track-gridline" style={{ left: `${tick.left}%` }} />)}
                {(laneItems[key] ?? []).map((item) => {
                  const left = Math.min(99, Math.max(0, (Number(item.start_time || 0) / safeDuration) * 100));
                  const width = Math.max(1.4, ((Number(item.end_time || 0) - Number(item.start_time || 0)) / safeDuration) * 100);
                  const meta = timelineLaneMeta[key];
                  return (
                    <button
                      key={item.id}
                      className={`highlight-track-segment ${key}${item.id === selectedId ? ' active' : ''}`}
                      style={{
                        left: `${left}%`,
                        width: `${Math.min(width, 100 - left)}%`,
                        '--track-color': meta.color,
                        '--track-soft': meta.soft,
                      }}
                      type="button"
                      onClick={() => onSelect(item)}
                      onPointerDown={(event) => startDrag(event, item, 'move')}
                    >
                      <span
                        className="highlight-segment-handle left"
                        onPointerDown={(event) => startDrag(event, item, 'start')}
                      />
                      <em>{formatRange(item)}</em>
                      <span
                        className="highlight-segment-handle right"
                        onPointerDown={(event) => startDrag(event, item, 'end')}
                      />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="highlight-timeline-legend">
        {timelineLaneKeys.map((key) => (
          <span key={key} className={key}><i />{timelineLaneMeta[key].label}</span>
        ))}
      </div>
    </div>
  );
}
