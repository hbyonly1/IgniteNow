import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../controllers/highlight_trigger_engine.dart';
import '../models/episode.dart';
import '../models/highlight.dart';
import '../services/anonymous_user_service.dart';
import '../services/api_client.dart';
import '../services/interaction_logger.dart';
import '../widgets/effect_layer.dart';
import '../widgets/interaction_overlay.dart';

class PlayerPage extends StatefulWidget {
  const PlayerPage({super.key, required this.episodeId});

  final int episodeId;

  @override
  State<PlayerPage> createState() => _PlayerPageState();
}

class _PlayerPageState extends State<PlayerPage> {
  static const _interactionDisplayDuration = Duration(seconds: 4);

  final _apiClient = ApiClient();
  final _userService = AnonymousUserService();
  final _triggerEngine = HighlightTriggerEngine();
  late final InteractionLogger _logger;

  Episode? _episode;
  VideoPlayerController? _videoController;
  Highlight? _activeHighlight;
  String? _userId;
  /// 本次播放会话 ID，进入播放页时生成，用于关联同一会话的所有互动日志。
  String? _playSessionId;
  String? _error;
  int _effectKey = 0;
  bool _clickedCurrent = false;

  @override
  void initState() {
    super.initState();
    _logger = InteractionLogger(_apiClient);
    _load();
  }

  Future<void> _load() async {
    try {
      final userId = await _userService.getUserId();
      // 进入播放页时生成本次会话 ID
      final sessionId = _userService.generateSessionId();
      final episode = await _apiClient.fetchPlayerEpisode(widget.episodeId);
      final controller = VideoPlayerController.networkUrl(
        Uri.parse(episode.videoUrl),
      );
      await controller.initialize();
      controller.addListener(_onTick);
      setState(() {
        _userId = userId;
        _playSessionId = sessionId;
        _episode = episode;
        _videoController = controller;
      });
      await controller.play();
    } catch (error) {
      setState(() => _error = _friendlyError(error));
    }
  }

  String _friendlyError(Object error) {
    final raw = error.toString();
    if (raw.contains('MEDIA_ERR_SRC_NOT_SUPPORTED') ||
        raw.contains('Media load rejected')) {
      return '视频无法加载：浏览器不能直接播放本地文件路径或当前格式。请确认后端返回的是 http(s) 视频地址，或让后端代理本地 MP4 文件。';
    }
    return raw;
  }

  void _onTick() {
    final controller = _videoController;
    final episode = _episode;
    final userId = _userId;
    if (controller == null ||
        episode == null ||
        userId == null ||
        !controller.value.isInitialized) {
      return;
    }
    final seconds = controller.value.position.inMilliseconds / 1000;
    final highlight = _triggerEngine.pick(seconds, episode.highlights);
    if (highlight == null) {
      return;
    }
    setState(() {
      _activeHighlight = highlight;
      _clickedCurrent = false;
    });
    _logger.log(
      userId: userId,
      episodeId: episode.episodeId,
      highlight: highlight,
      actionType: 'impression',
      watchTime: seconds,
      playSessionId: _playSessionId,
    );
    Future<void>.delayed(_interactionDisplayDuration, () {
      if (mounted &&
          _activeHighlight?.highlightId == highlight.highlightId &&
          !_clickedCurrent) {
        _logger.log(
          userId: userId,
          episodeId: episode.episodeId,
          highlight: highlight,
          actionType: 'ignore',
          watchTime: seconds + _interactionDisplayDuration.inSeconds,
          playSessionId: _playSessionId,
        );
        setState(() => _activeHighlight = null);
      }
    });
  }

  Future<void> _clickHighlight() async {
    final episode = _episode;
    final highlight = _activeHighlight;
    final userId = _userId;
    final controller = _videoController;
    if (episode == null ||
        highlight == null ||
        userId == null ||
        controller == null) {
      return;
    }
    final seconds = controller.value.position.inMilliseconds / 1000;
    setState(() {
      _clickedCurrent = true;
      _effectKey++;
      _activeHighlight = null;
    });
    await _logger.log(
      userId: userId,
      episodeId: episode.episodeId,
      highlight: highlight,
      actionType: 'click',
      watchTime: seconds,
      playSessionId: _playSessionId,
    );
  }

  @override
  void dispose() {
    _videoController?.removeListener(_onTick);
    _videoController?.dispose();
    _logger.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final episode = _episode;
    final controller = _videoController;
    return Scaffold(
      backgroundColor: const Color(0xFF101614),
      appBar: AppBar(
        backgroundColor: const Color(0xFF101614),
        foregroundColor: Colors.white,
        title: Text(episode?.title ?? '播放页'),
      ),
      body: _error != null
          ? _PlayerError(message: _error!)
          : episode == null ||
                controller == null ||
                !controller.value.isInitialized
          ? const Center(child: CircularProgressIndicator())
          : Stack(
              children: [
                Center(
                  child: AspectRatio(
                    aspectRatio: controller.value.aspectRatio,
                    child: VideoPlayer(controller),
                  ),
                ),
                Positioned(
                  left: 18,
                  right: 18,
                  top: 16,
                  child: _PlaybackHud(
                    controller: controller,
                    highlightCount: episode.highlights.length,
                  ),
                ),
                EffectLayer(effectKey: _effectKey),
                if (_activeHighlight != null)
                  InteractionOverlay(
                    highlight: _activeHighlight!,
                    onTap: _clickHighlight,
                  ),
                Positioned(
                  left: 20,
                  right: 20,
                  bottom: 104,
                  child: VideoProgressIndicator(
                    controller,
                    allowScrubbing: true,
                    colors: const VideoProgressColors(
                      playedColor: Color(0xFFF2C14E),
                    ),
                  ),
                ),
                Positioned(
                  right: 20,
                  bottom: 148,
                  child: FloatingActionButton(
                    onPressed: () => controller.value.isPlaying
                        ? controller.pause()
                        : controller.play(),
                    child: Icon(
                      controller.value.isPlaying
                          ? Icons.pause
                          : Icons.play_arrow,
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

class _PlayerError extends StatelessWidget {
  const _PlayerError({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: const Color(0xFF13201D),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: const Color(0xFF57423C)),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              message,
              style: const TextStyle(color: Colors.white, height: 1.5),
            ),
          ),
        ),
      ),
    );
  }
}

class _PlaybackHud extends StatelessWidget {
  const _PlaybackHud({required this.controller, required this.highlightCount});

  final VideoPlayerController controller;
  final int highlightCount;

  @override
  Widget build(BuildContext context) {
    final seconds = controller.value.position.inSeconds;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xCC10201E),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          children: [
            const Icon(
              Icons.local_fire_department,
              color: Color(0xFFF2C14E),
              size: 18,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                '高光 $highlightCount 个 · 当前 ${seconds}s',
                style: const TextStyle(color: Colors.white),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
