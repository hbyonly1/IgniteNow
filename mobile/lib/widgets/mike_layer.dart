import 'package:flutter/material.dart';
import 'package:flutter_3d_controller/flutter_3d_controller.dart';

enum _MikeState { scanning, pickedUp, idle }

/// Mike the cat — perches on the top edge of the video and can be dragged.
///
/// DUAL-VIEWER, ALWAYS-ALIVE design (two GLB files, two platform views):
///   * scan viewer -> mike_cat.glb        (CAT_PEEK)                  — perched
///   * pick viewer -> Mike_picked_up.glb  (cat_picked_up / cat_idle)  — dragged
///
/// Both viewers are mounted for the whole lifetime and are NEVER hidden via
/// Offstage or opacity:0 — hiding is exactly what makes an Android platform-view
/// surface go blank (the "Mike disappears" / "viewer #2 won't render" bug).
/// Instead the INACTIVE viewer is moved OFF-SCREEN at full size (opacity stays
/// 1), so it keeps rendering and stays loaded. Grabbing / dropping just moves
/// the right viewer onto the cat position and plays a clip — no reload.
class MikeLayer extends StatefulWidget {
  const MikeLayer({super.key, required this.videoAspectRatio});

  final double videoAspectRatio;

  @override
  State<MikeLayer> createState() => _MikeLayerState();
}

class _MikeLayerState extends State<MikeLayer> {
  static const double _mikeSize = 110.0;

  static const String _scanGlb = 'assets/mike_cat.glb';
  static const String _pickupGlb = 'assets/Mike_picked_up.glb';

  // Clip names (case-sensitive) verified from the GLB files.
  static const String _scanClip = 'CAT_PEEK';
  static const String _pickedUpClip = 'cat_picked_up';
  static const String _idleClip = 'cat_idle';

  final Flutter3DController _scanCtl = Flutter3DController();
  final Flutter3DController _pickCtl = Flutter3DController();

  _MikeState _state = _MikeState.scanning;
  bool _scanLoaded = false;
  bool _pickLoaded = false;
  bool _snapping = false;

  bool _initialized = false;
  Offset _pos = Offset.zero;
  Offset _perchPos = Offset.zero;
  double _videoTopY = 0;

  bool get _scanActive => _state == _MikeState.scanning;

  // Off-screen parking spot for the inactive viewer (full size, never hidden).
  Offset get _parkPos => Offset(-_mikeSize - 60, _perchPos.dy);

  void _onScanLoad(String _) {
    _scanLoaded = true;
    _scanCtl.playAnimation(animationName: _scanClip);
  }

  void _onPickLoad(String _) {
    _pickLoaded = true;
    // Park on idle so it isn't T-posing when first brought on-screen.
    _pickCtl.playAnimation(animationName: _idleClip);
  }

  ({double ox, double oy, double dw, double dh}) _videoRect(Size s) {
    final va = widget.videoAspectRatio;
    final sa = s.width / s.height;
    double ox = 0, oy = 0, dw, dh;
    if (sa > va) {
      dh = s.height;
      dw = dh * va;
      ox = (s.width - dw) / 2;
    } else {
      dw = s.width;
      dh = dw / va;
      oy = (s.height - dh) / 2;
    }
    return (ox: ox, oy: oy, dw: dw, dh: dh);
  }

  // ── gestures ─────────────────────────────────────────────────────────────

  void _onPanStart(DragStartDetails _) {
    setState(() {
      _snapping = false;
      _state = _MikeState.pickedUp; // pick viewer slides in from off-screen
    });
    if (_pickLoaded) _pickCtl.playAnimation(animationName: _pickedUpClip);
  }

  void _onPanUpdate(DragUpdateDetails d) {
    setState(() => _pos += d.delta);
  }

  void _onPanEnd(DragEndDetails _) {
    final centerY = _pos.dy + _mikeSize / 2;
    if (centerY < _videoTopY) {
      // Dragged above the video top edge -> snap back to perch and scan.
      setState(() {
        _pos = _perchPos;
        _snapping = true;
        _state = _MikeState.scanning;
      });
      if (_scanLoaded) _scanCtl.playAnimation(animationName: _scanClip);
      Future.delayed(const Duration(milliseconds: 350), () {
        if (mounted) setState(() => _snapping = false);
      });
    } else {
      // Released inside the player -> stay put and play idle.
      setState(() {
        _snapping = false;
        _state = _MikeState.idle;
      });
      if (_pickLoaded) _pickCtl.playAnimation(animationName: _idleClip);
    }
  }

  // ── build ────────────────────────────────────────────────────────────────

  Widget _viewer({
    required bool active,
    required String src,
    required Flutter3DController controller,
    required void Function(String) onLoad,
  }) {
    final Offset at = active ? _pos : _parkPos;
    final Widget body = IgnorePointer(
      // WebView never gets raw touches -> model-viewer camera rotation disabled.
      child: SizedBox(
        width: _mikeSize,
        height: _mikeSize,
        child: Flutter3DViewer(
          src: src,
          controller: controller,
          activeGestureInterceptor: false,
          onLoad: onLoad,
        ),
      ),
    );

    return AnimatedPositioned(
      duration: (active && _snapping)
          ? const Duration(milliseconds: 300)
          : Duration.zero,
      curve: Curves.easeOut,
      left: at.dx,
      top: at.dy,
      child: active
          ? GestureDetector(
              behavior: HitTestBehavior.opaque,
              onPanStart: _onPanStart,
              onPanUpdate: _onPanUpdate,
              onPanEnd: _onPanEnd,
              child: body,
            )
          : body,
    );
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final r = _videoRect(Size(constraints.maxWidth, constraints.maxHeight));
        _videoTopY = r.oy;
        final newPerch = Offset(
          r.ox + r.dw / 2 - _mikeSize / 2,
          r.oy - _mikeSize / 2,
        );
        if (!_initialized) {
          _pos = newPerch;
          _perchPos = newPerch;
          _initialized = true;
        } else {
          _perchPos = newPerch;
          if (_state == _MikeState.scanning && !_snapping) {
            _pos = newPerch;
          }
        }

        final scanViewer = _viewer(
          active: _scanActive,
          src: _scanGlb,
          controller: _scanCtl,
          onLoad: _onScanLoad,
        );
        final pickViewer = _viewer(
          active: !_scanActive,
          src: _pickupGlb,
          controller: _pickCtl,
          onLoad: _onPickLoad,
        );

        // Inactive viewer first (bottom), active one on top.
        return Stack(
          children: _scanActive
              ? [pickViewer, scanViewer]
              : [scanViewer, pickViewer],
        );
      },
    );
  }
}
