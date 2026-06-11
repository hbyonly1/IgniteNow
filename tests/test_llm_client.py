import json

from ai_service import llm_client


class _FakeResponse:
    status_code = 200
    text = ""

    def json(self):
        return {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "highlights": [
                                    {
                                        "start_time": 1,
                                        "end_time": 2,
                                        "highlight_type": "satisfying",
                                        "emotion": "爽感",
                                        "intensity": 0.8,
                                        "confidence": 0.9,
                                        "trigger_score": 0.85,
                                        "reason": "测试",
                                        "button_text": "爽了",
                                        "effect": "satisfied",
                                    }
                                ]
                            },
                            ensure_ascii=False,
                        )
                    }
                }
            ]
        }


def test_llm_response_format_is_optional(monkeypatch):
    captured_payloads = []

    def fake_post(_url, headers, json, timeout):
        captured_payloads.append(json)
        return _FakeResponse()

    monkeypatch.setattr(llm_client.requests, "post", fake_post)

    llm_client.analyze_with_llm(
        "字幕",
        llm_config={
            "enabled": True,
            "api_key": "sk-test",
            "base_url": "https://api.example.com/v1",
            "model": "test-model",
            "timeout_seconds": 30,
            "use_response_format": False,
        },
    )
    assert "response_format" not in captured_payloads[-1]

    llm_client.analyze_with_llm(
        "字幕",
        llm_config={
            "enabled": True,
            "api_key": "sk-test",
            "base_url": "https://api.example.com/v1",
            "model": "test-model",
            "timeout_seconds": 30,
            "use_response_format": True,
        },
    )
    assert captured_payloads[-1]["response_format"] == {"type": "json_object"}
