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


# Named views, as the direction from the structure *towards* the camera.
#
# World +z is treated as "up" for the horizontal views, which is what crystal
# and slab work expects: `front`/`left` put the surface normal upright rather
# than laying the slab down. The up vector itself is picked in the browser (see
# autoUp in cameraViews.ts) so that `--view top` and `--view z` agree.
NAMED_VIEWS: dict[str, tuple[float, float, float]] = {
    "top": (0.0, 0.0, 1.0),
    "bottom": (0.0, 0.0, -1.0),
    "front": (0.0, -1.0, 0.0),
    "back": (0.0, 1.0, 0.0),
    "left": (-1.0, 0.0, 0.0),
    "right": (1.0, 0.0, 0.0),
    "side": (0.0, -1.0, 0.0),  # a slab seen edge-on == front
}

_CARTESIAN_AXES = {"x": (1.0, 0.0, 0.0), "y": (0.0, 1.0, 0.0), "z": (0.0, 0.0, 1.0)}
_LATTICE_AXES = {"a": (1.0, 0.0, 0.0), "b": (0.0, 1.0, 0.0), "c": (0.0, 0.0, 1.0)}

_VIEW_HELP = (
    "Use a named view (top/bottom/front/back/left/right/side), a cartesian axis "
    "(x/y/z), a lattice axis (a/b/c) — each optionally negated with a leading "
    "'-' — or three numbers as a lattice direction, e.g. '1 1 1'."
)


def parse_vec3(text: str, label: str = "vector") -> tuple[float, float, float]:
    """Parses 'x,y,z' (commas and/or whitespace) into a 3-tuple of floats."""
    parts = [p for p in text.replace(",", " ").split() if p]
    if len(parts) != 3:
        raise ValueError(f"Invalid {label} '{text}'. Expected three numbers, e.g. '0,0,1'.")
    try:
        return (float(parts[0]), float(parts[1]), float(parts[2]))
    except ValueError as exc:
        raise ValueError(f"Invalid {label} '{text}'. Expected three numbers, e.g. '0,0,1'.") from exc


def parse_view(text: str) -> dict:
    """Parses a --view/--axis spec into a camera-view spec for the browser hook.

    Returns {"direction": [x, y, z], "frame": "cartesian" | "lattice"}. Lattice
    directions are resolved against the cell in the browser (h·a + k·b + l·c),
    falling back to cartesian for a structure with no cell.
    """
    raw = text.strip().lower()
    if not raw:
        raise ValueError(f"Empty --view. {_VIEW_HELP}")

    if raw in NAMED_VIEWS:
        return {"direction": list(NAMED_VIEWS[raw]), "frame": "cartesian"}

    sign = 1.0
    body = raw
    if body.startswith(("-", "+")):
        sign = -1.0 if body[0] == "-" else 1.0
        body = body[1:].strip()

    if body in _CARTESIAN_AXES:
        return {"direction": [sign * v for v in _CARTESIAN_AXES[body]], "frame": "cartesian"}
    if body in _LATTICE_AXES:
        return {"direction": [sign * v for v in _LATTICE_AXES[body]], "frame": "lattice"}

    # A bare numeric triple is a lattice direction, so it composes with a/b/c.
    try:
        direction = parse_vec3(raw, "view direction")
    except ValueError:
        raise ValueError(f"Unrecognized --view '{text}'. {_VIEW_HELP}") from None
    if not any(direction):
        raise ValueError(f"Invalid --view '{text}': the direction must not be zero.")
    return {"direction": list(direction), "frame": "lattice"}


def build_camera_view_spec(
    *,
    view: dict | None = None,
    camera_pos: tuple[float, float, float] | None = None,
    camera_target: tuple[float, float, float] | None = None,
    up: tuple[float, float, float] | None = None,
    camera_zoom: float | None = None,
) -> dict | None:
    """Merges the camera-placement options into one spec, or None if none were given."""
    spec: dict = {}
    if view:
        spec.update(view)
    if camera_pos is not None:
        spec["position"] = list(camera_pos)
    if camera_target is not None:
        spec["target"] = list(camera_target)
    if up is not None:
        spec["up"] = list(up)
    if camera_zoom is not None:
        spec["zoom"] = camera_zoom
    return spec or None


def build_style_calls(
    *, display: str | None, render_style: str | None, transparent: bool,
    background: str | None, brightness: float | None = None,
    camera: str | None = None, ball_scale: float | None = None,
    show_pbc_bonds: bool = True, camera_view: dict | None = None,
) -> list[tuple[str, object]]:
    """Ordered (method, arg) calls to replay against window.__atomcanvas.

    Display goes first because setDisplayMode resets atomScale/bondRadius/showBonds
    (so --ball-scale rides along in the same setVisParams that follows it). The
    camera view is placed before the camera type so that switching to
    orthographic derives its zoom from the framing the view just established,
    and camera type goes last so every bounds-affecting change is already in.
    """
    calls: list[tuple[str, object]] = []
    if display:
        calls.append(("setDisplayMode", display))
    vis_params: dict[str, object] = {}
    if render_style:
        vis_params["renderStyle"] = render_style
    if ball_scale is not None:
        vis_params["atomScale"] = ball_scale
    if vis_params:
        calls.append(("setVisParams", vis_params))
    if brightness is not None:
        calls.append(("setGlobalBrightness", brightness))
    if transparent:
        calls.append(("setViewControls", {"forceTransparentBackground": True}))
    if background:
        calls.append(("setBackground", {"solidColor": background}))
    if not show_pbc_bonds:
        calls.append(("setViewControls", {"showPbcBonds": False}))
    if camera_view:
        calls.append(("setCameraView", camera_view))
    if camera:
        calls.append(("setCameraType", camera))
    return calls
