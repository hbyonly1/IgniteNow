import 'dart:async';

import '../models/interaction.dart';
import 'api_client.dart';

/// 互动日志本地重试队列。
/// 网络请求失败时将 payload 保存到内存队列，并定期重试直到成功或达到最大次数。
class InteractionQueue {
  InteractionQueue(this._apiClient);

  final ApiClient _apiClient;

  /// 待重试队列：(payload, 已重试次数)
  final List<_QueueEntry> _queue = [];

  /// 最大重试次数
  static const int _maxRetries = 5;

  /// 重试间隔（秒）
  static const Duration _retryInterval = Duration(seconds: 10);

  Timer? _timer;

  /// 提交互动日志；失败时加入重试队列。
  Future<void> submit(InteractionPayload payload) async {
    try {
      await _apiClient.postInteraction(payload);
    } catch (_) {
      _enqueue(payload, 0);
      _startTimer();
    }
  }

  void _enqueue(InteractionPayload payload, int retries) {
    if (retries >= _maxRetries) return;
    _queue.add(_QueueEntry(payload: payload, retries: retries));
  }

  void _startTimer() {
    _timer ??= Timer.periodic(_retryInterval, (_) => _flush());
  }

  Future<void> _flush() async {
    if (_queue.isEmpty) {
      _timer?.cancel();
      _timer = null;
      return;
    }

    // 复制当前队列后清空，避免 flush 期间写入冲突
    final batch = List<_QueueEntry>.from(_queue);
    _queue.clear();

    for (final entry in batch) {
      try {
        await _apiClient.postInteraction(entry.payload);
      } catch (_) {
        // 仍然失败，重新入队（retries + 1）
        _enqueue(entry.payload, entry.retries + 1);
      }
    }

    if (_queue.isEmpty) {
      _timer?.cancel();
      _timer = null;
    }
  }

  /// 页面销毁时调用，停止重试定时器（队列中未发送的日志将丢失）。
  void dispose() {
    _timer?.cancel();
    _timer = null;
  }
}

class _QueueEntry {
  const _QueueEntry({required this.payload, required this.retries});

  final InteractionPayload payload;
  final int retries;
}
