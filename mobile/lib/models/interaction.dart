class InteractionPayload {
  const InteractionPayload({
    required this.userId,
    required this.episodeId,
    required this.highlightId,
    required this.actionType,
    required this.actionValue,
    required this.watchTime,
    required this.idempotencyKey,
    this.playSessionId,
  });

  final String userId;
  final int episodeId;
  final int highlightId;
  final String actionType;
  final String actionValue;
  final double watchTime;
  final String idempotencyKey;
  /// 每次进入播放页生成一个 UUID，同一播放过程的所有互动共享同一值。
  final String? playSessionId;

  Map<String, dynamic> toJson() {
    return {
      'user_id': userId,
      'episode_id': episodeId,
      'highlight_id': highlightId,
      'action_type': actionType,
      'action_value': actionValue,
      'watch_time': watchTime,
      'idempotency_key': idempotencyKey,
      if (playSessionId != null) 'play_session_id': playSessionId,
    };
  }
}
