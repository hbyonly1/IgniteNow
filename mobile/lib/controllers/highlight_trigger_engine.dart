import '../models/highlight.dart';

class HighlightTriggerEngine {
  HighlightTriggerEngine({this.minIntervalSeconds = 10});

  final double minIntervalSeconds;
  final Set<int> _triggeredIds = <int>{};
  double _lastTriggerTime = -9999;
  double _lastKnownTime = 0;

  Highlight? pick(double currentTime, List<Highlight> highlights) {
    // Detect backward scrub (> 2 s jump back). Un-fire highlights whose
    // window is now ahead of the playhead so they re-trigger on the next
    // forward pass.
    if (currentTime < _lastKnownTime - 2.0) {
      _triggeredIds.removeWhere((id) {
        final matches = highlights.where((h) => h.highlightId == id);
        if (matches.isEmpty) return false;
        return matches.first.startTime >= currentTime;
      });
      _lastTriggerTime = -9999;
    }
    _lastKnownTime = currentTime;

    if (currentTime - _lastTriggerTime < minIntervalSeconds) return null;

    final candidates = highlights
        .where(
          (h) =>
              currentTime >= h.startTime &&
              currentTime <= h.endTime &&
              !_triggeredIds.contains(h.highlightId),
        )
        .toList()
      ..sort((a, b) {
        final score = b.triggerScore.compareTo(a.triggerScore);
        if (score != 0) return score;
        return a.startTime.compareTo(b.startTime);
      });

    if (candidates.isEmpty) return null;

    final selected = candidates.first;
    _triggeredIds.add(selected.highlightId);
    _lastTriggerTime = currentTime;
    return selected;
  }

  void reset() {
    _triggeredIds.clear();
    _lastTriggerTime = -9999;
    _lastKnownTime = 0;
  }
}
