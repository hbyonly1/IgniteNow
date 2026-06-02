from typing import Optional

from .llm_client import LLMNotConfigured, analyze_with_llm, is_llm_configured
from .subtitle_parser import SubtitleCue, parse_subtitle_text


KEYWORD_RULES = {
    "conflict": {
        "keywords": ["羞辱", "威胁", "争吵", "滚", "讨回公道", "反击", "误会"],
        "emotion": "愤怒",
        "button_text": "替她反击",
        "effect": "anger_bar",
    },
    "reversal": {
        "keywords": ["身份", "曝光", "真相", "竟然", "反转", "原来", "输了"],
        "emotion": "震惊",
        "button_text": "反转了",
        "effect": "screen_flash",
    },
    "sweet": {
        "keywords": ["保护", "表白", "喜欢", "抱", "亲", "甜", "锁死"],
        "emotion": "甜蜜",
        "button_text": "磕到了",
        "effect": "heart_rain",
    },
    "satisfying": {
        "keywords": ["打脸", "复仇", "终于", "爽", "逆袭", "报应"],
        "emotion": "爽感",
        "button_text": "爽",
        "effect": "boom_effect",
    },
    "suspense": {
        "keywords": ["危险", "秘密", "谜", "别走", "下一集", "等一下", "谁"],
        "emotion": "期待",
        "button_text": "快更",
        "effect": "countdown",
    },
}


def _score(cue: SubtitleCue, keywords: list[str]) -> float:
    matches = sum(1 for keyword in keywords if keyword in cue.text)
    return min(1.0, 0.45 + matches * 0.18 + min(len(cue.text), 60) / 300)


def _cue_to_highlight(cue: SubtitleCue, highlight_type: str, rule: dict) -> dict:
    confidence = round(_score(cue, rule["keywords"]), 2)
    return {
        "start_time": cue.start_time,
        "end_time": max(cue.end_time, cue.start_time + 2),
        "highlight_type": highlight_type,
        "emotion": rule["emotion"],
        "intensity": min(1, round(confidence + 0.08, 2)),
        "confidence": confidence,
        "trigger_score": confidence,
        "reason": f"命中 {highlight_type} 关键词规则：{cue.text[:60]}",
        "button_text": rule["button_text"],
        "effect": rule["effect"],
    }


def _analyze_with_rules(cues: list[SubtitleCue]) -> dict:
    highlights: list[dict] = []
    for cue in cues:
        best_type = None
        best_rule = None
        best_hits = 0
        for highlight_type, rule in KEYWORD_RULES.items():
            hits = sum(1 for keyword in rule["keywords"] if keyword in cue.text)
            if hits > best_hits:
                best_hits = hits
                best_type = highlight_type
                best_rule = rule
        if best_type and best_rule:
            highlights.append(_cue_to_highlight(cue, best_type, best_rule))
    if not highlights:
        longest = max(cues, key=lambda item: len(item.text))
        highlights.append(_cue_to_highlight(longest, "suspense", KEYWORD_RULES["suspense"]))
    highlights.sort(key=lambda item: (-item["trigger_score"], item["start_time"]))
    return {"highlights": highlights[:8], "provider": "fallback_rules"}


def analyze_subtitle_text(content: str, prefer_llm: Optional[bool] = None) -> dict:
    cues = parse_subtitle_text(content)
    should_use_llm = is_llm_configured() if prefer_llm is None else prefer_llm
    if should_use_llm:
        try:
            result = analyze_with_llm(content)
            result["provider"] = "llm"
            return result
        except LLMNotConfigured:
            pass
        except Exception as exc:
            fallback = _analyze_with_rules(cues)
            fallback["llm_error"] = str(exc)
            return fallback
    return _analyze_with_rules(cues)
