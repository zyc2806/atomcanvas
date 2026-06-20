import subprocess
import sys
from pathlib import Path

# backend/ — tests/ lives directly under it. Derive from __file__ so this is
# portable (CI runners, any clone location); never hardcode an absolute path.
BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_importing_app_does_not_import_rdkit():
    code = (
        "import sys; import app.main; "
        "assert not any(m == 'rdkit' or m.startswith('rdkit.') for m in sys.modules), "
        "'rdkit imported at startup'"
    )
    # Use the interpreter running the tests (has the app deps installed) and
    # backend/ as cwd so `import app.main` resolves via the -c cwd-on-path rule.
    result = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        cwd=str(BACKEND_DIR),
    )
    assert result.returncode == 0, result.stderr
