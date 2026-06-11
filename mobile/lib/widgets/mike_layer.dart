import 'package:flutter/material.dart';
import 'package:flutter_3d_controller/flutter_3d_controller.dart';

enum _MikeState { scanning, pickedUp, idle }

/// Mike the cat — perches on the top edge of the video frame.
///
/// SINGLE-VIEWER design: there is only ONE Flutter3DViewer (one Android
/// platform view). The GLB `src` is swapped when needed:
///   scanning          -> mike_cat.glb       plays _scanClip
///   pickedUp / idle    -> Mike_picked_up.glb plays "cat_picked_up" / "cat_idle"
///
/// Because pickedUp and idle share the same file, dropping Mike is just a
/// playAnimation call (no reload). Only grabbing (mike_cat -> Mike_picked_up)
/// and snapping back above the player (-> mike_cat) reload the model. A
/// ValueKey on the viewer forces a clean reload (and a fresh onLoad) whenever
/// `src` changes.
///
/// Tradeoff vs. the two-viewer approach: a single viewer cannot pre-load the
/// other GLB, so there may be a brief blank while the new file loads at the
/// moment of grabbing. In return there is only one platform view, so the
/// Android "overlapping surfaces go blank" problem cannot occur.
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

  /// The "watching the screen" clip inside mike_cat.glb.
  /// NOTE: mike_cat.glb has NO clip literally named "cat_scan". Its real clips
  /// are: CAT_PEEK, CAT_TARGET_LOCK, T-Pose, CAT_PEEK_SK. Pick the perch/watch
  /// one here.
  static const String _scanClip = 'CAT_PEEK';

  final Flutter3DController _controller = Flutter3DController();

  _MikeState _mikeState = _MikeState.scanning;
  bool _mikeVisible = false;
  bool _snapping = false;

  bool _initialized = false;
  Offset _pos = Offset.zero;
  Offset _perchPos = Offset.zero;
  double _videoTopY = 0;

  String get _currentSrc =>
      _mikeState == _MikeState.scanning ? _scanGlb : _pickupGlb;

  String _clipFor(_MikeState s) {
    switch (s) {
      case _MikeState.scanning:
        return _scanClip;
      case _MikeState.pickedUp:
        return 'cat_picked_up';
      case _MikeState.idle:
        return 'cat_idle';
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────────

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

  /// Change state. If the GLB file is the same as before, just swap the clip
  /// (no reload). If the file differs, the ValueKey on the viewer triggers a
  /// reload and onLoad will play the right clip.
  void _transition(_MikeState next) {
    final fileChanged = (_mikeState == _MikeState.scanning) !=
        (next == _MikeState.scanning);
    setState(() => _mikeState = next);
    if (!fileChanged) {
      _controller.playAnimation(animationName: _clipFor(next));
    }
    // If the file changed, _onViewerLoad handles playing the clip.
  }

  void _onViewerLoad(String _) {
    _controller.playAnimation(animationName: _clipFor(_mikeState));
    if (!_mikeVisible) {
      // Reveal after the clip has had time to start, hiding the bind/T-pose.
      Future.delayed(const Duration(milliseconds: 400), () {
        if (mounted) setState(() => _mikeVisible = true);
      });
    }
  }

  // ── gesture handlers ───────────────────────────────────────────────────────

  void _onPanStart(DragStartDetails _) {
    setState(() => _snapping = false);
    _transition(_MikeState.pickedUp);
  }

  void _onPanUpdate(DragUpdateDetails d) {
    setState(() => _pos += d.delta);
  }

  void _onPanEnd(DragEndDetails _) {
    final centerY = _pos.dy + _mikeSize / 2;
    if (centerY < _videoTopY) {
      // Dragged above the video top edge -> snap back to perch and scan
      setState(() {
        _pos = _perchPos;
        _snapping = true;
      });
      _transition(_MikeState.scanning);
      Future.delayed(const Duration(milliseconds: 350), () {
        if (mounted) setState(() => _snapping = false);
      });
    } else {
      // Released inside the player -> stay put, play idle (same file, no reload)
      setState(() => _snapping = false);
      _transition(_MikeState.idle);
    }
  }

  // ── build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final stackSize = Size(constraints.maxWidth, constraints.maxHeight);
        final r = _videoRect(stackSize);
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
          if (_mikeState == _MikeState.scanning && !_snapping) {
            _pos = newPerch;
          }
        }

        return Stack(
          children: [
            AnimatedPositioned(
              duration: _snapping
                  ? const Duration(milliseconds: 300)
                  : Duration.zero,
              curve: Curves.easeOut,
              left: _pos.dx,
              top: _pos.dy,
              child: IgnorePointer(
                ignoring: !_mikeVisible,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onPanStart: _onPanStart,
                  onPanUpdate: _onPanUpdate,
                  onPanEnd: _onPanEnd,
                  // Inner IgnorePointer: WebView never receives raw touches, so
                  // model-viewer's camera rotation is fully disabled.
                  child: IgnorePointer(
                    child: AnimatedOpacity(
                      opacity: _mikeVisible ? 1.0 : 0.0,
                      duration: const Duration(milliseconds: 200),
                      child: SizedBox(
                        width: _mikeSize,
                        height: _mikeSize,
                        child: Flutter3DViewer(
                          // Key tied to src: forces a clean reload + fresh
                          // onLoad whenever the GLB file changes.
                          key: ValueKey(_currentSrc),
                          src: _currentSrc,
                          controller: _controller,
                          activeGestureInterceptor: false,
                          onLoad: _onViewerLoad,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
