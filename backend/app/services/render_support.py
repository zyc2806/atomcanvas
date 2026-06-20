"""Pure, browser-free helpers for the headless `render` CLI command.

Kept separate from the Playwright driver so this logic is unit-testable in CI
(no browser, no playwright import)."""
from __future__ import annotations

import base64
import socket


def parse_size(text: str) -> tuple[int, int]:
    parts = text.lower().split("x")
    if len(parts) != 2:
        raise ValueError(f"Invalid size '{text}'. Use WxH, e.g. 1600x1000.")
    try:
        w, h = int(parts[0]), int(parts[1])
    except ValueError as exc:
        raise ValueError(f"Invalid size '{text}'. Use WxH, e.g. 1600x1000.") from exc
    if w <= 0 or h <= 0:
        raise ValueError(f"Invalid size '{text}'. Width and height must be positive.")
    return (w, h)


def data_url_to_bytes(data_url: str) -> bytes:
    marker = ";base64,"
    if not data_url.startswith("data:") or marker not in data_url:
        raise ValueError("Expected a base64 data URL (data:...;base64,...).")
    return base64.b64decode(data_url.split(marker, 1)[1])


def base64_to_bytes(b64: str) -> bytes:
    return base64.b64decode(b64)


def find_free_port(host: str = "127.0.0.1") -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((host, 0))
        return int(s.getsockname()[1])


def build_style_calls(
    *, display: str | None, render_style: str | None, transparent: bool, background: str | None
) -> list[tuple[str, object]]:
    """Ordered (method, arg) calls to replay against window.__atomcanvas.

    Display goes first because setDisplayMode resets atomScale/bondRadius/showBonds.
    """
    calls: list[tuple[str, object]] = []
    if display:
        calls.append(("setDisplayMode", display))
    if render_style:
        calls.append(("setVisParams", {"renderStyle": render_style}))
    if transparent:
        calls.append(("setViewControls", {"forceTransparentBackground": True}))
    if background:
        calls.append(("setBackground", {"solidColor": background}))
    return calls
