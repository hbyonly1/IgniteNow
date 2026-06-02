from __future__ import annotations

import argparse
import getpass
import sys
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import urljoin

import requests


EXPECTED_EPISODES = [
    {"episode_id": 4, "episode_no": 1, "title": "E001", "highlight_count": 8},
    {"episode_id": 5, "episode_no": 2, "title": "E002", "highlight_count": 8},
    {"episode_id": 6, "episode_no": 3, "title": "E003", "highlight_count": 8},
    {"episode_id": 7, "episode_no": 4, "title": "E004", "highlight_count": 8},
    {"episode_id": 8, "episode_no": 5, "title": "E005", "highlight_count": 8},
    {"episode_id": 9, "episode_no": 6, "title": "E006", "highlight_count": 6},
    {"episode_id": 3, "episode_no": 7, "title": "E007", "highlight_count": 8},
]

HIGHLIGHT_TYPES = {"conflict", "reversal", "sweet", "satisfying", "suspense"}
EFFECTS = {"anger_bar", "screen_flash", "heart_rain", "boom_effect", "countdown"}
REVIEW_ONLY_FIELDS = {"reason", "confidence", "status"}


class VerificationError(Exception):
    pass


@dataclass
class CheckResult:
    name: str
    detail: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify the local IgniteNow E001-E007 demo chain without writing data."
    )
    parser.add_argument("--base-url", default="http://localhost:8000", help="FastAPI base URL.")
    parser.add_argument("--admin-username", default="", help="Admin username for analytics checks.")
    parser.add_argument("--admin-password", default="", help="Admin password for analytics checks.")
    parser.add_argument("--skip-admin-analytics", action="store_true", help="Skip JWT-protected admin analytics checks.")
    parser.add_argument("--drama-id", type=int, default=2, help="Main demo drama id.")
    parser.add_argument("--timeout", type=float, default=15.0, help="HTTP timeout in seconds.")
    parser.add_argument(
        "--skip-video-range",
        action="store_true",
        help="Skip video Range checks when video files are unavailable on this machine.",
    )
    return parser.parse_args()


def make_url(base_url: str, path: str) -> str:
    return urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))


def request_json(
    session: requests.Session,
    method: str,
    base_url: str,
    path: str,
    timeout: float,
    *,
    headers: Optional[dict[str, str]] = None,
    json: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    url = make_url(base_url, path)
    try:
        response = session.request(method, url, timeout=timeout, headers=headers, json=json)
    except requests.RequestException as exc:
        raise VerificationError(f"{method} {url} failed: {exc}") from exc
    if response.status_code >= 400:
        raise VerificationError(f"{method} {url} returned {response.status_code}: {response.text[:300]}")
    try:
        return response.json()
    except ValueError as exc:
        raise VerificationError(f"{method} {url} did not return JSON") from exc


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise VerificationError(message)


def unwrap_data(body: dict[str, Any], name: str) -> Any:
    assert_true(body.get("success") is True, f"{name} response success is not true")
    assert_true("data" in body, f"{name} response has no data field")
    return body["data"]


def check_backend_health(session: requests.Session, args: argparse.Namespace) -> CheckResult:
    body = request_json(session, "GET", args.base_url, "/health", args.timeout)
    assert_true(body.get("status") == "ok", "health status is not ok")
    return CheckResult("backend health", body.get("service", "ok"))


def check_player_catalog(session: requests.Session, args: argparse.Namespace) -> CheckResult:
    dramas = unwrap_data(request_json(session, "GET", args.base_url, "/api/player/dramas", args.timeout), "dramas")
    assert_true(isinstance(dramas, list), "player dramas data is not a list")
    assert_true(any(item.get("drama_id") == args.drama_id for item in dramas), f"drama {args.drama_id} not found")

    episodes = unwrap_data(
        request_json(session, "GET", args.base_url, f"/api/player/dramas/{args.drama_id}/episodes", args.timeout),
        "episode summaries",
    )
    assert_true(isinstance(episodes, list), "player episode summaries data is not a list")
    assert_true(len(episodes) >= len(EXPECTED_EPISODES), "not enough player episode summaries")

    by_episode_no = {item.get("episode_no"): item for item in episodes}
    for expected in EXPECTED_EPISODES:
        item = by_episode_no.get(expected["episode_no"])
        assert_true(item is not None, f"missing E{expected['episode_no']:03d} in episode summaries")
        assert_true(item.get("episode_id") == expected["episode_id"], f"E{expected['episode_no']:03d} episode_id mismatch")
        assert_true(item.get("title") == expected["title"], f"E{expected['episode_no']:03d} title mismatch")
        assert_true(
            item.get("published_highlight_count") == expected["highlight_count"],
            f"E{expected['episode_no']:03d} published_highlight_count mismatch",
        )
    return CheckResult("player catalog", "E001-E007 summaries match expected published counts")


def check_episode_detail(session: requests.Session, args: argparse.Namespace, expected: dict[str, Any]) -> CheckResult:
    episode_id = expected["episode_id"]
    data = unwrap_data(
        request_json(session, "GET", args.base_url, f"/api/player/episodes/{episode_id}", args.timeout),
        f"episode {episode_id}",
    )
    assert_true(data.get("episode_id") == episode_id, f"episode {episode_id} id mismatch")
    assert_true(data.get("title") == expected["title"], f"episode {episode_id} title mismatch")

    video_url = data.get("video_url", "")
    assert_true(isinstance(video_url, str) and video_url.startswith(("http://", "https://")), f"episode {episode_id} video_url is not HTTP")
    assert_true(video_url.endswith(f"/api/player/episodes/{episode_id}/video"), f"episode {episode_id} video_url is not proxied")

    highlights = data.get("highlights")
    assert_true(isinstance(highlights, list), f"episode {episode_id} highlights is not a list")
    assert_true(len(highlights) == expected["highlight_count"], f"episode {episode_id} highlight count mismatch")
    previous_start = -1.0
    for highlight in highlights:
        leaked = REVIEW_ONLY_FIELDS.intersection(highlight)
        assert_true(not leaked, f"episode {episode_id} leaks review-only fields: {sorted(leaked)}")
        start_time = float(highlight.get("start_time", -1))
        end_time = float(highlight.get("end_time", -1))
        assert_true(start_time >= previous_start, f"episode {episode_id} highlights are not sorted")
        assert_true(start_time < end_time, f"episode {episode_id} highlight {highlight.get('highlight_id')} has invalid time range")
        assert_true(highlight.get("highlight_type") in HIGHLIGHT_TYPES, f"episode {episode_id} has illegal highlight_type")
        assert_true(highlight.get("effect") in EFFECTS, f"episode {episode_id} has illegal effect")
        assert_true(bool(str(highlight.get("button_text", "")).strip()), f"episode {episode_id} has empty button_text")
        previous_start = start_time
    return CheckResult(f"episode {expected['title']} detail", f"{len(highlights)} highlights, no review fields leaked")


def check_video_range(session: requests.Session, args: argparse.Namespace, expected: dict[str, Any]) -> CheckResult:
    episode_id = expected["episode_id"]
    url = make_url(args.base_url, f"/api/player/episodes/{episode_id}/video")
    try:
        response = session.get(url, headers={"Range": "bytes=0-1023"}, timeout=args.timeout, stream=True)
    except requests.RequestException as exc:
        raise VerificationError(f"GET {url} failed: {exc}") from exc
    finally:
        pass
    try:
        assert_true(response.status_code == 206, f"episode {episode_id} video Range returned {response.status_code}")
        content_type = response.headers.get("Content-Type", "")
        content_range = response.headers.get("Content-Range", "")
        assert_true(content_type.startswith("video/mp4"), f"episode {episode_id} video Content-Type is {content_type!r}")
        assert_true(content_range.startswith("bytes 0-1023/"), f"episode {episode_id} Content-Range is {content_range!r}")
        return CheckResult(f"episode {expected['title']} video Range", content_range)
    finally:
        response.close()


def check_admin_analytics(session: requests.Session, args: argparse.Namespace) -> CheckResult:
    url = make_url(args.base_url, "/api/analytics/overview")
    try:
        forbidden = session.get(url, timeout=args.timeout)
    except requests.RequestException as exc:
        raise VerificationError(f"GET {url} failed: {exc}") from exc
    assert_true(forbidden.status_code == 401, f"analytics without token returned {forbidden.status_code}, expected 401")

    admin_password = args.admin_password
    if args.admin_username and not admin_password:
        admin_password = getpass.getpass("Admin password: ")
    if not args.admin_username or not admin_password:
        raise VerificationError("admin analytics check requires --admin-username and --admin-password")

    login = unwrap_data(
        request_json(
            session,
            "POST",
            args.base_url,
            "/api/auth/login",
            args.timeout,
            json={"username": args.admin_username, "password": admin_password},
        ),
        "admin login",
    )
    if login.get("role") != "admin":
        raise VerificationError("provided account is not admin")

    headers = {"Authorization": f"Bearer {login['access_token']}"}
    data = unwrap_data(
        request_json(session, "GET", args.base_url, "/api/analytics/overview", args.timeout, headers=headers),
        "analytics overview",
    )
    for key in (
        "drama_count",
        "episode_count",
        "highlight_count",
        "published_highlight_count",
        "interaction_count",
        "click_count",
        "ignore_count",
        "avg_click_rate",
    ):
        assert_true(key in data, f"analytics overview missing {key}")
    assert_true(data["published_highlight_count"] >= 54, "published_highlight_count is lower than E001-E007 baseline")
    assert_true(data["highlight_count"] >= data["published_highlight_count"], "highlight_count is lower than published count")

    types = unwrap_data(
        request_json(session, "GET", args.base_url, "/api/analytics/highlight-types", args.timeout, headers=headers),
        "highlight types",
    )
    assert_true(isinstance(types, list), "highlight types data is not a list")
    type_names = {item.get("highlight_type") for item in types}
    assert_true(type_names.intersection(HIGHLIGHT_TYPES), "highlight types do not include known highlight types")

    actions = unwrap_data(
        request_json(session, "GET", args.base_url, "/api/analytics/top-actions", args.timeout, headers=headers),
        "top actions",
    )
    assert_true(isinstance(actions, list), "top actions data is not a list")

    ranking = unwrap_data(
        request_json(session, "GET", args.base_url, "/api/analytics/highlight-ranking", args.timeout, headers=headers),
        "highlight ranking",
    )
    assert_true(isinstance(ranking, list), "highlight ranking data is not a list")
    assert_true(len(ranking) > 0, "highlight ranking is empty")
    first_highlight_id = ranking[0].get("highlight_id")
    for key in ("impression_count", "click_count", "ignore_count", "click_rate"):
        assert_true(key in ranking[0], f"highlight ranking missing {key}")

    timeline_episode_id = EXPECTED_EPISODES[0]["episode_id"]
    timeline = unwrap_data(
        request_json(
            session,
            "GET",
            args.base_url,
            f"/api/analytics/episodes/{timeline_episode_id}/timeline",
            args.timeout,
            headers=headers,
        ),
        "episode timeline",
    )
    assert_true(isinstance(timeline, list), "episode timeline data is not a list")
    assert_true(len(timeline) >= EXPECTED_EPISODES[0]["highlight_count"], "episode timeline is missing highlights")
    assert_true(timeline == sorted(timeline, key=lambda item: item.get("start_time", 0)), "episode timeline is not sorted")

    highlight_stats = unwrap_data(
        request_json(
            session,
            "GET",
            args.base_url,
            f"/api/analytics/highlights/{first_highlight_id}",
            args.timeout,
            headers=headers,
        ),
        "highlight stats",
    )
    assert_true(highlight_stats.get("highlight_id") == first_highlight_id, "highlight stats id mismatch")
    return CheckResult(
        "admin analytics",
        f"published={data['published_highlight_count']} interactions={data['interaction_count']} ranking={len(ranking)}",
    )


def run_check(results: list[CheckResult], name: str, fn) -> None:
    try:
        result = fn()
    except VerificationError as exc:
        print(f"[FAIL] {name}: {exc}")
        raise
    print(f"[OK] {result.name}: {result.detail}")
    results.append(result)


def main() -> int:
    args = parse_args()
    results: list[CheckResult] = []
    session = requests.Session()

    try:
        run_check(results, "backend health", lambda: check_backend_health(session, args))
        run_check(results, "player catalog", lambda: check_player_catalog(session, args))
        for expected in EXPECTED_EPISODES:
            run_check(
                results,
                f"episode {expected['title']} detail",
                lambda expected=expected: check_episode_detail(session, args, expected),
            )
            if not args.skip_video_range:
                run_check(
                    results,
                    f"episode {expected['title']} video Range",
                    lambda expected=expected: check_video_range(session, args, expected),
                )
        if not args.skip_admin_analytics:
            run_check(results, "admin analytics", lambda: check_admin_analytics(session, args))
    except VerificationError:
        print("\nDemo verification failed.")
        return 1

    print(f"\nDemo verification passed: {len(results)} checks.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
