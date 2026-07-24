import base64
import pytest

from app.services.render_support import (
    parse_size, data_url_to_bytes, base64_to_bytes, find_free_port, build_style_calls,
    build_camera_view_spec, parse_vec3, parse_view,
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


# --- --view / --axis grammar -------------------------------------------------

@pytest.mark.parametrize(
    "text,direction",
    [
        ("top", [0.0, 0.0, 1.0]),
        ("bottom", [0.0, 0.0, -1.0]),
        ("front", [0.0, -1.0, 0.0]),
        ("back", [0.0, 1.0, 0.0]),
        ("left", [-1.0, 0.0, 0.0]),
        ("right", [1.0, 0.0, 0.0]),
        ("TOP", [0.0, 0.0, 1.0]),
        (" top ", [0.0, 0.0, 1.0]),
    ],
)
def test_parse_view_named(text, direction):
    assert parse_view(text) == {"direction": direction, "frame": "cartesian"}


def test_parse_view_side_is_an_edge_on_slab_view():
    # 'side' must agree with 'front': a slab seen edge-on, surface normal up.
    assert parse_view("side") == parse_view("front")


@pytest.mark.parametrize(
    "text,direction",
    [("x", [1.0, 0.0, 0.0]), ("y", [0.0, 1.0, 0.0]), ("z", [0.0, 0.0, 1.0]), ("-z", [0.0, 0.0, -1.0])],
)
def test_parse_view_cartesian_axes(text, direction):
    assert parse_view(text) == {"direction": direction, "frame": "cartesian"}


@pytest.mark.parametrize(
    "text,direction",
    [("a", [1.0, 0.0, 0.0]), ("b", [0.0, 1.0, 0.0]), ("c", [0.0, 0.0, 1.0]), ("-c", [0.0, 0.0, -1.0])],
)
def test_parse_view_lattice_axes(text, direction):
    # Lattice axes stay in the lattice frame; the browser resolves them against
    # the cell, so 'c' is the real c axis and not merely +z.
    assert parse_view(text) == {"direction": direction, "frame": "lattice"}


@pytest.mark.parametrize("text", ["1 1 1", "1,1,1", "1, 1 ,1"])
def test_parse_view_hkl_triple_is_a_lattice_direction(text):
    assert parse_view(text) == {"direction": [1.0, 1.0, 1.0], "frame": "lattice"}


def test_parse_view_hkl_accepts_negatives_and_floats():
    assert parse_view("-1 0 2.5") == {"direction": [-1.0, 0.0, 2.5], "frame": "lattice"}


@pytest.mark.parametrize("bad", ["", "   ", "sideways", "w", "1 1", "1 1 1 1", "a b c", "0 0 0"])
def test_parse_view_rejects_bad(bad):
    with pytest.raises(ValueError):
        parse_view(bad)


@pytest.mark.parametrize(
    "text,expected",
    [("1,2,3", (1.0, 2.0, 3.0)), ("1 2 3", (1.0, 2.0, 3.0)), (" -1.5, 0 ,2 ", (-1.5, 0.0, 2.0))],
)
def test_parse_vec3(text, expected):
    assert parse_vec3(text) == expected


@pytest.mark.parametrize("bad", ["", "1,2", "1,2,3,4", "a,b,c"])
def test_parse_vec3_rejects_bad(bad):
    with pytest.raises(ValueError):
        parse_vec3(bad)


# --- camera placement --------------------------------------------------------

def test_build_camera_view_spec_merges_options():
    spec = build_camera_view_spec(
        view={"direction": [0.0, 0.0, 1.0], "frame": "cartesian"},
        camera_target=(1.0, 2.0, 3.0), up=(0.0, 1.0, 0.0), camera_zoom=2.5,
    )
    assert spec == {
        "direction": [0.0, 0.0, 1.0], "frame": "cartesian",
        "target": [1.0, 2.0, 3.0], "up": [0.0, 1.0, 0.0], "zoom": 2.5,
    }


def test_build_camera_view_spec_is_none_without_options():
    assert build_camera_view_spec() is None


def test_build_style_calls_places_view_before_camera_type():
    # Switching to orthographic derives its zoom from the current framing, so
    # the view has to be established first.
    calls = build_style_calls(
        display=None, render_style=None, transparent=False, background=None,
        camera="orthographic", camera_view={"direction": [0.0, 0.0, 1.0], "frame": "cartesian"},
    )
    assert calls.index(("setCameraView", {"direction": [0.0, 0.0, 1.0], "frame": "cartesian"})) < calls.index(
        ("setCameraType", "orthographic")
    )


def test_build_style_calls_omits_view_when_none():
    calls = build_style_calls(display=None, render_style=None, transparent=False, background=None)
    assert all(method != "setCameraView" for method, _ in calls)


# --- --ball-scale ------------------------------------------------------------

def test_build_style_calls_ball_scale_rides_with_vis_params_after_display():
    # setDisplayMode resets atomScale, so the scale must be applied after it.
    calls = build_style_calls(
        display="ball-stick", render_style="cartoon", transparent=False, background=None,
        ball_scale=0.4,
    )
    assert ("setVisParams", {"renderStyle": "cartoon", "atomScale": 0.4}) in calls
    assert calls.index(("setDisplayMode", "ball-stick")) < calls.index(
        ("setVisParams", {"renderStyle": "cartoon", "atomScale": 0.4})
    )


def test_build_style_calls_ball_scale_alone_still_emits_vis_params():
    calls = build_style_calls(
        display=None, render_style=None, transparent=False, background=None, ball_scale=0.4
    )
    assert ("setVisParams", {"atomScale": 0.4}) in calls


def test_build_style_calls_omits_atom_scale_when_none():
    calls = build_style_calls(display=None, render_style="soft", transparent=False, background=None)
    assert ("setVisParams", {"renderStyle": "soft"}) in calls


# --- --no-pbc-bonds ----------------------------------------------------------

def test_build_style_calls_hides_pbc_bonds_when_disabled():
    calls = build_style_calls(
        display=None, render_style=None, transparent=False, background=None, show_pbc_bonds=False
    )
    assert ("setViewControls", {"showPbcBonds": False}) in calls


def test_build_style_calls_leaves_pbc_bonds_alone_by_default():
    calls = build_style_calls(display=None, render_style=None, transparent=False, background=None)
    assert all(arg != {"showPbcBonds": False} for _, arg in calls)
