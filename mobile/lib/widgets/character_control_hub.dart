import 'dart:async';
import 'package:flutter/material.dart';

class CharacterControlHub extends StatefulWidget {
  const CharacterControlHub({
    super.key,
    required this.isVisible,
    required this.onToggleVisibility,
    required this.onMove,
  });

  final bool isVisible;
  final VoidCallback onToggleVisibility;
  final Function(Offset delta) onMove;

  @override
  State<CharacterControlHub> createState() => _CharacterControlHubState();
}

class _CharacterControlHubState extends State<CharacterControlHub> {
  Timer? _moveTimer;
  final double _stepSize = 5.0;

  void _startMoving(Offset delta) {
    _moveTimer?.cancel();
    _moveTimer = Timer.periodic(const Duration(milliseconds: 30), (timer) {
      widget.onMove(delta);
    });
  }

  void _stopMoving() {
    _moveTimer?.cancel();
  }

  @override
  void dispose() {
    _moveTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // 显示/隐藏开关
        FloatingActionButton.small(
          onPressed: widget.onToggleVisibility,
          backgroundColor: widget.isVisible ? const Color(0xFFF2C14E) : Colors.grey,
          child: Icon(
            widget.isVisible ? Icons.visibility : Icons.visibility_off,
            color: const Color(0xFF10201E),
          ),
        ),
        const SizedBox(height: 12),
        // 方向键面板
        if (widget.isVisible)
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: const Color(0xAA10201E),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0x44F2C14E)),
            ),
            child: Column(
              children: [
                _MoveButton(
                  icon: Icons.keyboard_arrow_up,
                  onPressed: () => _startMoving(Offset(0, -_stepSize)),
                  onReleased: _stopMoving,
                ),
                Row(
                  children: [
                    _MoveButton(
                      icon: Icons.keyboard_arrow_left,
                      onPressed: () => _startMoving(Offset(-_stepSize, 0)),
                      onReleased: _stopMoving,
                    ),
                    const SizedBox(width: 32, height: 32), // 中心间距
                    _MoveButton(
                      icon: Icons.keyboard_arrow_right,
                      onPressed: () => _startMoving(Offset(_stepSize, 0)),
                      onReleased: _stopMoving,
                    ),
                  ],
                ),
                _MoveButton(
                  icon: Icons.keyboard_arrow_down,
                  onPressed: () => _startMoving(Offset(0, _stepSize)),
                  onReleased: _stopMoving,
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _MoveButton extends StatelessWidget {
  const _MoveButton({
    required this.icon,
    required this.onPressed,
    required this.onReleased,
  });

  final IconData icon;
  final VoidCallback onPressed;
  final VoidCallback onReleased;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => onPressed(),
      onTapUp: (_) => onReleased(),
      onTapCancel: onReleased,
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
        ),
        child: Icon(icon, color: const Color(0xFFF2C14E), size: 32),
      ),
    );
  }
}
