import importlib
import subprocess
import sys

PY = "/Users/zhangyichen/miniconda3/envs/ase-view-env/bin/python"


def test_importing_app_does_not_import_rdkit():
    code = (
        "import sys; import app.main; "
        "assert not any(m == 'rdkit' or m.startswith('rdkit.') for m in sys.modules), "
        "'rdkit imported at startup'"
    )
    result = subprocess.run([PY, "-c", code], capture_output=True, text=True,
                            cwd="/Users/zhangyichen/Desktop/Scripts/atomcanvas/backend")
    assert result.returncode == 0, result.stderr
