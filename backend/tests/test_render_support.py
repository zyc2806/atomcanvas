import base64
import pytest

from app.services.render_support import (
    parse_size, data_url_to_bytes, base64_to_bytes, find_free_port, build_style_calls,
)


def test_parse_size_ok():
    assert parse_size("1600x1000") == (1600, 1000)
    assert parse_size("800X600") == (800, 600)


@pytest.mark.parametrize("bad", ["", "1600", "1600x", "axb", "-1x10", "0x0"])
def test_parse_size_rejects_bad(bad):
    with pytest.raises(ValueError):
        parse_size(bad)


def test_data_url_to_bytes_roundtrip():
    payload = b"\x89PNG fake"
    url = "data:image/png;base64," + base64.b64encode(payload).decode()
    assert data_url_to_bytes(url) == payload


def test_data_url_to_bytes_rejects_non_data_url():
    with pytest.raises(ValueError):
        data_url_to_bytes("notadataurl")


def test_base64_to_bytes_roundtrip():
    payload = b"glb-bytes"
    assert base64_to_bytes(base64.b64encode(payload).decode()) == payload


def test_find_free_port_is_bindable():
    port = find_free_port()
    assert 1024 < port < 65536


def test_build_style_calls_orders_and_filters():
    calls = build_style_calls(display="vdw", render_style="cartoon", transparent=True, background="#ffffff")
    assert ("setDisplayMode", "vdw") in calls
    assert ("setVisParams", {"renderStyle": "cartoon"}) in calls
    assert ("setViewControls", {"forceTransparentBackground": True}) in calls
    assert ("setBackground", {"solidColor": "#ffffff"}) in calls
    # display must precede setVisParams (display resets some vis params)
    assert calls.index(("setDisplayMode", "vdw")) < calls.index(("setVisParams", {"renderStyle": "cartoon"}))


def test_build_style_calls_empty_when_no_options():
    assert build_style_calls(display=None, render_style=None, transparent=False, background=None) == []


def test_build_style_calls_forwards_brightness():
    calls = build_style_calls(
        display=None, render_style="soft", transparent=False, background=None, brightness=2.0
    )
    assert ("setGlobalBrightness", 2.0) in calls
    # render_style must precede brightness (display/style first, then scene tweaks)
    assert calls.index(("setVisParams", {"renderStyle": "soft"})) < calls.index(("setGlobalBrightness", 2.0))


def test_build_style_calls_omits_brightness_when_none():
    calls = build_style_calls(display=None, render_style=None, transparent=False, background=None)
    assert all(method != "setGlobalBrightness" for method, _ in calls)


def test_build_style_calls_forwards_camera_last():
    calls = build_style_calls(
        display="vdw", render_style=None, transparent=False, background=None,
        camera="orthographic",
    )
    assert ("setCameraType", "orthographic") in calls
    # camera goes last (after display changes the bounds)
    assert calls[-1] == ("setCameraType", "orthographic")


def test_build_style_calls_omits_camera_when_none():
    calls = build_style_calls(display="vdw", render_style=None, transparent=False, background=None)
    assert all(method != "setCameraType" for method, _ in calls)
