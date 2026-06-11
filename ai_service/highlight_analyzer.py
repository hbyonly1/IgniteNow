from typing import Optional

from .llm_client import analyze_with_llm


def analyze_subtitle_text(content: str, llm_config: Optional[dict] = None) -> dict:
    """调用 LLM 对字幕内容进行高光识别。
    未配置 LLM_API_KEY 或 LLM 调用失败时直接抛出异常，由调用方将任务标记为 failed。
    """
    return analyze_with_llm(content, llm_config=llm_config)
