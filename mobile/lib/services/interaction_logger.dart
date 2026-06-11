import '../models/highlight.dart';
import '../models/interaction.dart';
import 'api_client.dart';
import 'interaction_queue.dart';

/// 互动日志记录器，支持 play_session_id 和本地失败重试队列。
class InteractionLogger {
  InteractionLogger(ApiClient apiClient)
      : _queue = InteractionQueue(apiClient);

  final InteractionQueue _queue;

  /// 记录互动事件。
  /// [playSessionId] 为本次播放会话 ID，同一播放过程的所有事件使用同一值。
  Future<void> log({
    required String userId,
    required int episodeId,
    required Highlight highlight,
    required String actionType,
    required double watchTime,
    String? playSessionId,
  }) {
    final minuteBucket = DateTime.now().millisecondsSinceEpoch ~/ 60000;
    final key = '${userId}_${highlight.highlightId}_${actionType}_$minuteBucket';
    return _queue.submit(
      InteractionPayload(
        userId: userId,
        episodeId: episodeId,
        highlightId: highlight.highlightId,
        actionType: actionType,
        actionValue: actionType == 'click' ? highlight.buttonText : '',
        watchTime: watchTime,
        idempotencyKey: key,
        playSessionId: playSessionId,
      ),
    );
  }

  /// 销毁时释放重试定时器资源。
  void dispose() => _queue.dispose();
}
