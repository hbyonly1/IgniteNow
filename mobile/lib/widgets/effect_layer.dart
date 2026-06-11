import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';

// The 20 supported effect keys must match filenames in assets/2D_assets/2D_more/.
const _kValidEffects = {
  'shocked', 'angry', 'sweet', 'tense', 'surprised', 'curious',
  'proud', 'satisfied', 'pity', 'determined', 'awkward', 'worried',
  'expectant', 'romantic', 'flirtatious', 'helpless', 'playful',
  'serious', 'shy', 'indifferent',
};

// Safety net: map legacy/Chinese emotion labels to the nearest English key,
// in case a highlight only carries a Chinese `emotion` and no English `effect`.
const _kChineseToEffect = {
  '震惊': 'shocked', '惊讶': 'surprised', '惊喜': 'surprised',
  '愤怒': 'angry', '冷漠': 'indifferent', '委屈': 'pity',
  '甜蜜': 'sweet', '温馨': 'sweet', '感激': 'sweet',
  '暧昧': 'flirtatious', '挑逗': 'flirtatious', '调皮': 'playful',
  '好奇': 'curious', '期待': 'expectant', '担忧': 'worried',
  '悬念': 'tense', '紧张': 'tense', '尴尬': 'awkward',
  '得意': 'proud', '爽快': 'satisfied', '满足': 'satisfied',
  '坚定': 'determined', '严肃': 'serious', '害羞': 'shy',
  '幽默': 'playful', '无奈': 'helpless', '浪漫': 'romantic',
};

String _resolveEffect(String raw) {
  final lower = raw.toLowerCase().trim();
  if (_kValidEffects.contains(lower)) return lower;
  return _kChineseToEffect[raw.trim()] ?? 'surprised';
}

const _kGifSize = 220.0;
const _kPlayMs  = 2500;
const _kHoldMs  = 1500;
const _kFadeMs  = 300;

class EffectLayer extends StatefulWidget {
  const EffectLayer({
    super.key,
    required this.effectKey,
    required this.effect,
    required this.videoAspectRatio,
    this.onTap,
  });

  final int effectKey;

  /// Highlight effect key, one of the 20 App asset names.
  final String effect;

  final double videoAspectRatio;

  /// Called when the user taps the visible GIF so the parent can replay.
  final VoidCallback? onTap;

  @override
  State<EffectLayer> createState() => _EffectLayerState();
}

class _EffectLayerState extends State<EffectLayer> {
  final AudioPlayer _audio = AudioPlayer();

  Timer? _holdTimer;
  Timer? _fadeTimer;

  bool   _showing = false;
  double _opacity = 0.0;
  String? _asset;

  @override
  void initState() {
    super.initState();
    // Don't steal audio focus so the video keeps playing uninterrupted.
    _audio.setAudioContext(AudioContext(
      android: AudioContextAndroid(
        audioFocus: AndroidAudioFocus.none,
        contentType: AndroidContentType.sonification,
        usageType: AndroidUsageType.game,
      ),
      iOS: AudioContextIOS(
        category: AVAudioSessionCategory.ambient,
      ),
    ));
  }

  @override
  void didUpdateWidget(covariant EffectLayer old) {
    super.didUpdateWidget(old);
    if (old.effectKey != widget.effectKey && widget.effectKey > 0) {
      _trigger();
    }
  }

  void _trigger() {
    _holdTimer?.cancel();
    _fadeTimer?.cancel();

    final name = _resolveEffect(widget.effect);
    setState(() {
      _showing = true;
      _opacity = 1.0;
      _asset   = name;
    });

    _audio.stop();
    _audio.play(AssetSource('2D_assets/2D_more/$name.wav'));

    _holdTimer = Timer(
      const Duration(milliseconds: _kPlayMs + _kHoldMs),
      () {
        if (!mounted) return;
        setState(() => _opacity = 0.0);
        _fadeTimer = Timer(
          const Duration(milliseconds: _kFadeMs),
          () { if (mounted) setState(() => _showing = false); },
        );
      },
    );
  }

  @override
  void dispose() {
    _holdTimer?.cancel();
    _fadeTimer?.cancel();
    _audio.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_showing || _asset == null) return const SizedBox.shrink();

    return LayoutBuilder(builder: (ctx, constraints) {
      final sw = constraints.maxWidth;
      final sh = constraints.maxHeight;
      final va = widget.videoAspectRatio;
      final sa = sw / sh;

      double vLeft, vTop, vWidth, vHeight;
      if (sa > va) {
        vHeight = sh; vWidth = vHeight * va;
        vLeft = (sw - vWidth) / 2; vTop = 0;
      } else {
        vWidth = sw; vHeight = vWidth / va;
        vLeft = 0; vTop = (sh - vHeight) / 2;
      }

      final gifLeft = (vLeft + vWidth - _kGifSize).clamp(0.0, sw - _kGifSize);
      final gifTop  = (vTop + vHeight / 2 - _kGifSize / 2).clamp(0.0, sh - _kGifSize);

      return Stack(
        fit: StackFit.expand,
        children: [
          Positioned(
            left: gifLeft,
            top: gifTop,
            child: GestureDetector(
              onTap: widget.onTap,
              child: AnimatedOpacity(
                opacity: _opacity,
                duration: const Duration(milliseconds: _kFadeMs),
                child: SizedBox(
                  width: _kGifSize,
                  height: _kGifSize,
                  child: Image.asset(
                    'assets/2D_assets/2D_more/$_asset.gif',
                    fit: BoxFit.contain,
                  ),
                ),
              ),
            ),
          ),
        ],
      );
    });
  }
}
