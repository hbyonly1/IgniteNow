import 'package:flutter/material.dart';

class InteractiveCharacterLayer extends StatefulWidget {
  const InteractiveCharacterLayer({
    super.key,
    required this.videoAspectRatio,
    required this.onInteractionTriggered,
  });

  final double videoAspectRatio;
  final VoidCallback onInteractionTriggered;

  @override
  State<InteractiveCharacterLayer> createState() => _InteractiveCharacterLayerState();
}

class _InteractiveCharacterLayerState extends State<InteractiveCharacterLayer> {
  Offset _position = const Offset(100, 100);
  final double _characterRadius = 30.0;
  bool _isInitialized = false;

  void _updatePosition(Offset delta, Size size) {
    // 计算视频的实际显示区域（处理黑边）
    double viewWidth = size.width;
    double viewHeight = size.height;
    double viewAspectRatio = viewWidth / viewHeight;

    double drawWidth, drawHeight;
    double offsetX = 0, offsetY = 0;

    if (viewAspectRatio > widget.videoAspectRatio) {
      // 屏幕太宽，左右有黑边
      drawHeight = viewHeight;
      drawWidth = drawHeight * widget.videoAspectRatio;
      offsetX = (viewWidth - drawWidth) / 2;
    } else {
      // 屏幕太高，上下有黑边
      drawWidth = viewWidth;
      drawHeight = drawWidth / widget.videoAspectRatio;
      offsetY = (viewHeight - drawHeight) / 2;
    }

    setState(() {
      double newX = (_position.dx + delta.dx).clamp(
        offsetX + _characterRadius,
        offsetX + drawWidth - _characterRadius,
      );
      double newY = (_position.dy + delta.dy).clamp(
        offsetY + _characterRadius,
        offsetY + drawHeight - _characterRadius,
      );
      _position = Offset(newX, newY);
    });
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final size = Size(constraints.maxWidth, constraints.maxHeight);
        
        // 初始位置设置到视频中央
        if (!_isInitialized) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) {
              setState(() {
                _position = Offset(size.width / 2, size.height / 2);
                _isInitialized = true;
              });
            }
          });
        }

        return GestureDetector(
          onPanUpdate: (details) => _updatePosition(details.delta, size),
          onTap: widget.onInteractionTriggered,
          child: CustomPaint(
            size: Size.infinite,
            painter: _CharacterPainter(
              position: _position,
              radius: _characterRadius,
            ),
          ),
        );
      },
    );
  }
}

class _CharacterPainter extends CustomPainter {
  _CharacterPainter({required this.position, required this.radius});

  final Offset position;
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFFF2C14E)
      ..style = PaintingStyle.fill
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);

    final borderPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3;

    // 绘制阴影/发光效果
    canvas.drawCircle(position, radius, paint);
    // 绘制主体
    canvas.drawCircle(position, radius, paint..maskFilter = null);
    // 绘制边框
    canvas.drawCircle(position, radius, borderPaint);
    
    // 简单的“眼睛”示意方向
    final eyePaint = Paint()..color = const Color(0xFF10201E);
    canvas.drawCircle(Offset(position.dx - 8, position.dy - 5), 4, eyePaint);
    canvas.drawCircle(Offset(position.dx + 8, position.dy - 5), 4, eyePaint);
  }

  @override
  bool shouldRepaint(covariant _CharacterPainter oldDelegate) {
    return oldDelegate.position != position;
  }
}
