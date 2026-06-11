import 'package:shared_preferences/shared_preferences.dart';

class AnonymousUserService {
  static const _key = 'ignitenow_anonymous_user_id';

  Future<String> getUserId() async {
    final prefs = await SharedPreferences.getInstance();
    final existing = prefs.getString(_key);
    if (existing != null && existing.isNotEmpty) {
      return existing;
    }
    final generated = 'anonymous_${DateTime.now().microsecondsSinceEpoch}';
    await prefs.setString(_key, generated);
    return generated;
  }

  /// 生成本次播放会话 ID，每次进入播放页调用一次，无需持久化。
  String generateSessionId() =>
      'session_${DateTime.now().microsecondsSinceEpoch}';
}
