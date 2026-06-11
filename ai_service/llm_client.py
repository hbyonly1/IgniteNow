import json
import os
import re
from pathlib import Path
from typing import Any, Optional

import requests


DEFAULT_BASE_URL = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-4o-mini"
ALLOWED_EFFECTS = {"anger_bar", "screen_flash", "heart_rain", "boom_effect", "countdown"}
ALLOWED_TYPES = {"conflict", "reversal", "sweet", "satisfying", "suspense"}


class LLMResponseError(RuntimeError):
    pass


def _load_prompt_template() -> str:
    path = Path(__file__).with_name("prompt_template.md")
    return path.read_text(encoding="utf-8")


def _strip_json_fence(content: str) -> str:
    match = re.search(r"```(?:json)?\s*(.*?)\s*```", content, flags=re.DOTALL)
    return match.group(1) if match else content


def _normalize_number(value: Any, default: float = 0.5) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _normalize_highlight(item: dict[str, Any]) -> dict[str, Any]:
    highlight_type = str(item.get("highlight_type", "")).strip()
    effect = str(item.get("effect", "")).strip()
    if highlight_type not in ALLOWED_TYPES:
        raise ValueError(f"illegal highlight_type from LLM: {highlight_type}")
    if effect not in ALLOWED_EFFECTS:
        effect = {
            "conflict": "anger_bar",
            "reversal": "screen_flash",
            "sweet": "heart_rain",
            "satisfying": "boom_effect",
            "suspense": "countdown",
        }[highlight_type]

    start_time = _normalize_number(item.get("start_time"), -1)
    end_time = _normalize_number(item.get("end_time"), -1)
    if start_time < 0 or end_time <= start_time:
        raise ValueError("LLM returned invalid highlight time range")

    confidence = max(0.0, min(1.0, _normalize_number(item.get("confidence"))))
    intensity = max(0.0, min(1.0, _normalize_number(item.get("intensity"), confidence)))
    trigger_score = max(0.0, min(1.0, _normalize_number(item.get("trigger_score"), confidence)))

    return {
        "start_time": start_time,
        "end_time": end_time,
        "highlight_type": highlight_type,
        "emotion": str(item.get("emotion") or highlight_type),
        "intensity": intensity,
        "confidence": confidence,
        "trigger_score": trigger_score,
        "reason": str(item.get("reason") or "LLM 识别出的剧情高光"),
        "button_text": str(item.get("button_text") or "我有感觉"),
        "effect": effect,
    }


def analyze_with_llm(subtitle_payload: str, llm_config: Optional[dict[str, Any]] = None) -> dict[str, list[dict[str, Any]]]:
    config = llm_config or {}
    if config.get("enabled") is False:
        raise RuntimeError("LLM analysis is disabled in system settings")

    api_key = str(config.get("api_key") or os.getenv("LLM_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("LLM API key is not configured; set it in System Settings or LLM_API_KEY")

    base_url = str(config.get("base_url") or os.getenv("LLM_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
    model = str(config.get("model") or os.getenv("LLM_MODEL") or DEFAULT_MODEL)
    timeout = float(config.get("timeout_seconds") or os.getenv("LLM_TIMEOUT_SECONDS", "90"))

    system_prompt = _load_prompt_template()
    user_prompt = (
        "请分析以下短剧字幕，输出 JSON 对象，顶层字段必须只有 highlights。\n"
        "每个 highlight 必须包含 start_time、end_time、highlight_type、emotion、intensity、"
        "confidence、trigger_score、reason、button_text、effect。\n"
        "请最多输出 8 条最适合在播放端触发互动的高光。\n\n"
        f"{subtitle_payload}"
    )
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 2200,
        "stream": False,
    }
    if bool(config.get("use_response_format", False)):
        payload["response_format"] = {"type": "json_object"}

    response = requests.post(
        f"{base_url}/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=timeout,
    )
    if response.status_code >= 400:
        raise LLMResponseError(f"LLM API error {response.status_code}: {response.text[:500]}")

    body = response.json()
    try:
        content = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LLMResponseError("LLM response missing choices[0].message.content") from exc

    parsed = json.loads(_strip_json_fence(content))
    raw_highlights = parsed.get("highlights")
    if not isinstance(raw_highlights, list):
        raise LLMResponseError("LLM JSON missing highlights array")

    highlights = [_normalize_highlight(item) for item in raw_highlights if isinstance(item, dict)]
    if not highlights:
        raise LLMResponseError("LLM returned no usable highlights")
    highlights.sort(key=lambda item: (item["start_time"], -item["trigger_score"]))
    return {"highlights": highlights[:8]}
