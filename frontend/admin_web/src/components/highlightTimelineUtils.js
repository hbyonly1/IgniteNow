export const timelineLaneKeys = ['conflict', 'reversal', 'sweet', 'satisfying'];

export const timelineLaneMeta = {
  conflict: { label: '冲突', color: '#2563eb', soft: 'rgba(37, 99, 235, 0.16)' },
  reversal: { label: '反转', color: '#7c3aed', soft: 'rgba(124, 58, 237, 0.16)' },
  sweet: { label: '心动', color: '#ec4899', soft: 'rgba(236, 72, 153, 0.16)' },
  satisfying: { label: '爆点', color: '#f97316', soft: 'rgba(249, 115, 22, 0.16)' },
};

export function timelineLaneForHighlight(highlight) {
  if (highlight.highlight_type === 'suspense') {
    return 'satisfying';
  }
  return timelineLaneMeta[highlight.highlight_type] ? highlight.highlight_type : 'satisfying';
}
