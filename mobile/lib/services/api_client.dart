import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import '../models/drama.dart';
import '../models/episode.dart';
import '../models/episode_summary.dart';
import '../models/interaction.dart';

class ApiClient {
  ApiClient({String? baseUrl}) : baseUrl = baseUrl ?? AppConfig.baseUrl;

  final String baseUrl;

  Map<String, dynamic> _decodeBody(http.Response response) {
    return jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
  }

  String _errorMessage(http.Response response, String fallback) {
    try {
      final body = _decodeBody(response);
      final detail = body['detail'];
      if (detail is String && detail.isNotEmpty) {
        return detail;
      }
      final message = body['message'];
      if (message is String && message.isNotEmpty) {
        return message;
      }
    } catch (_) {
      // Keep the fallback when the server returns non-JSON.
    }
    return '$fallback：${response.statusCode}';
  }

  Future<List<DramaSummary>> fetchDramas() async {
    final uri = Uri.parse('$baseUrl/api/player/dramas');
    final response = await http.get(uri);
    if (response.statusCode >= 400) {
      throw Exception('短剧列表请求失败：${response.statusCode}');
    }
    final body = _decodeBody(response);
    return ((body['data'] as List<dynamic>? ?? <dynamic>[])
            .cast<Map<String, dynamic>>())
        .map(DramaSummary.fromJson)
        .toList();
  }

  Future<List<EpisodeSummary>> fetchEpisodes(int dramaId) async {
    final uri = Uri.parse('$baseUrl/api/player/dramas/$dramaId/episodes');
    final response = await http.get(uri);
    if (response.statusCode >= 400) {
      throw Exception('剧集列表请求失败：${response.statusCode}');
    }
    final body = _decodeBody(response);
    return ((body['data'] as List<dynamic>? ?? <dynamic>[])
            .cast<Map<String, dynamic>>())
        .map(EpisodeSummary.fromJson)
        .toList();
  }

  Future<Episode> fetchPlayerEpisode(int episodeId) async {
    final uri = Uri.parse('$baseUrl/api/player/episodes/$episodeId');
    final response = await http.get(uri);
    if (response.statusCode >= 400) {
      throw Exception('播放数据请求失败：${response.statusCode}');
    }
    final body = _decodeBody(response);
    return Episode.fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<void> postInteraction(InteractionPayload payload) async {
    final uri = Uri.parse('$baseUrl/api/interactions');
    final response = await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(payload.toJson()),
    );
    if (response.statusCode >= 400) {
      throw Exception(_errorMessage(response, '互动回传失败'));
    }
  }
}
