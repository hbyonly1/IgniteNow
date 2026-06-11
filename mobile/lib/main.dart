import 'package:flutter/material.dart';

import 'models/drama.dart';
import 'models/episode_summary.dart';
import 'pages/player_page.dart';
import 'services/api_client.dart';

void main() {
  runApp(const IgniteNowApp());
}

class IgniteNowApp extends StatelessWidget {
  const IgniteNowApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'IgniteNow',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFF2C14E),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: const DemoEntryPage(),
    );
  }
}

class DemoEntryPage extends StatefulWidget {
  const DemoEntryPage({super.key});

  @override
  State<DemoEntryPage> createState() => _DemoEntryPageState();
}

class _DemoEntryPageState extends State<DemoEntryPage> {
  final _apiClient = ApiClient();
  late Future<List<DramaWithEpisodes>> _catalogFuture;

  @override
  void initState() {
    super.initState();
    _catalogFuture = _loadCatalog();
  }

  Future<List<DramaWithEpisodes>> _loadCatalog() async {
    final dramas = await _apiClient.fetchDramas();
    final result = <DramaWithEpisodes>[];
    for (final drama in dramas) {
      final episodes = await _apiClient.fetchEpisodes(drama.dramaId);
      result.add(DramaWithEpisodes(drama: drama, episodes: episodes));
    }
    return result;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF101614),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'IgniteNow',
                style: TextStyle(
                  fontSize: 38,
                  fontWeight: FontWeight.w900,
                  color: Color(0xFFF2C14E),
                ),
              ),
              const SizedBox(height: 10),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Expanded(
                    child: Text(
                      '选择数据库中的短剧和剧集，进入播放页验证时间轴触发和互动回传。',
                      style: TextStyle(color: Color(0xFFD8E1DC), fontSize: 16),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 32),
              Expanded(
                child: FutureBuilder<List<DramaWithEpisodes>>(
                  future: _catalogFuture,
                  builder: (context, snapshot) {
                    if (snapshot.connectionState != ConnectionState.done) {
                      return const Center(child: CircularProgressIndicator());
                    }
                    if (snapshot.hasError) {
                      return _MessagePanel(message: '加载短剧失败：${snapshot.error}');
                    }
                    final catalog = snapshot.data ?? <DramaWithEpisodes>[];
                    if (catalog.isEmpty) {
                      return const _MessagePanel(
                        message: '暂无短剧数据，请先在后台创建短剧和剧集。',
                      );
                    }
                    return ListView.separated(
                      itemCount: catalog.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 18),
                      itemBuilder: (context, index) =>
                          _DramaSection(item: catalog[index]),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class DramaWithEpisodes {
  const DramaWithEpisodes({required this.drama, required this.episodes});

  final DramaSummary drama;
  final List<EpisodeSummary> episodes;
}

class _DramaSection extends StatelessWidget {
  const _DramaSection({required this.item});

  final DramaWithEpisodes item;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFF13201D),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF2E4740)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              item.drama.title,
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
            ),
            if (item.drama.description.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                item.drama.description,
                style: const TextStyle(color: Color(0xFFBFD0CA)),
              ),
            ],
            const SizedBox(height: 14),
            if (item.episodes.isEmpty)
              const Text('暂无剧集', style: TextStyle(color: Color(0xFFBFD0CA)))
            else
              for (final episode in item.episodes)
                _EpisodeTile(episode: episode),
          ],
        ),
      ),
    );
  }
}

class _EpisodeTile extends StatelessWidget {
  const _EpisodeTile({required this.episode});

  final EpisodeSummary episode;

  @override
  Widget build(BuildContext context) {
    final hasHighlights = episode.publishedHighlightCount > 0;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: const Color(0xFF0F1715),
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => PlayerPage(episodeId: episode.episodeId),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    // 无高光时使用灰色底，提示联调时注意
                    color: hasHighlights
                        ? const Color(0xFFF2C14E)
                        : const Color(0xFF2E4740),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '${episode.episodeNo}',
                    style: TextStyle(
                      color: hasHighlights
                          ? const Color(0xFF10201E)
                          : const Color(0xFF8BADA6),
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        episode.title,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Text(
                            '${episode.duration.toStringAsFixed(0)}s',
                            style: const TextStyle(
                              color: Color(0xFFBFD0CA),
                              fontSize: 13,
                            ),
                          ),
                          const SizedBox(width: 8),
                          if (hasHighlights)
                            // 有已发布高光：金色标签
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 1),
                              decoration: BoxDecoration(
                                color: const Color(0x33F2C14E),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                '${episode.publishedHighlightCount} 个高光',
                                style: const TextStyle(
                                  color: Color(0xFFF2C14E),
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            )
                          else
                            // 无已发布高光：灰色提示
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 1),
                              decoration: BoxDecoration(
                                color: const Color(0xFF1E2D2A),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: const Text(
                                '暂无高光',
                                style: TextStyle(
                                  color: Color(0xFF8BADA6),
                                  fontSize: 12,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right,
                  color: hasHighlights
                      ? const Color(0xFFF2C14E)
                      : const Color(0xFF2E4740),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MessagePanel extends StatelessWidget {
  const _MessagePanel({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: const Color(0xFF13201D),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text(
            message,
            style: const TextStyle(color: Color(0xFFD8E1DC)),
          ),
        ),
      ),
    );
  }
}
