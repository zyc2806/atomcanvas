"""Tests for the cross-platform `atomcanvas serve` command.

Only the pure planning logic and CLI wiring are exercised — no test starts a
real uvicorn server.
"""
from click.testing import CliRunner

from app.cli import _plan_frontend, cli


class TestPlanFrontend:
    def test_ready_when_bundle_exists(self) -> None:
        # A staged bundle short-circuits regardless of the other inputs.
        assert _plan_frontend(True, True, True, "/usr/bin/npm") == ("ready", None)
        assert _plan_frontend(True, False, False, None) == ("ready", None)

    def test_build_when_missing_and_npm_present(self) -> None:
        assert _plan_frontend(False, True, True, "/usr/bin/npm") == ("build", None)

    def test_error_when_build_disabled(self) -> None:
        action, msg = _plan_frontend(False, False, True, "/usr/bin/npm")
        assert action == "error"
        assert msg and "Docker" in msg

    def test_error_when_frontend_source_absent(self) -> None:
        action, msg = _plan_frontend(False, True, False, "/usr/bin/npm")
        assert action == "error"
        assert msg and "bundle" in msg.lower()

    def test_error_when_npm_missing(self) -> None:
        action, msg = _plan_frontend(False, True, True, None)
        assert action == "error"
        assert msg and "npm" in msg.lower()


def test_serve_listed_in_cli_help() -> None:
    result = CliRunner().invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "serve" in result.output


def test_serve_help_lists_options() -> None:
    result = CliRunner().invoke(cli, ["serve", "--help"])
    assert result.exit_code == 0
    for flag in ("--host", "--port", "--no-build", "--reload"):
        assert flag in result.output
