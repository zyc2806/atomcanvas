import sys
from pathlib import Path
import importlib
from typing import cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

backend_root = Path(__file__).resolve().parents[1]
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

# app.main (routers) is wired up in Task 2; until then importing it at
# collection time would block the pure-service tests. Import lazily inside the
# fixture so service-level tests can run now. (re-enabled eagerly in Task 2)
try:
    app = cast(FastAPI, importlib.import_module("app.main").app)
except ModuleNotFoundError:
    app = None


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client
