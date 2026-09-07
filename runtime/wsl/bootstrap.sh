#!/usr/bin/env bash
set -euo pipefail

export UV_HTTP_TIMEOUT="${UV_HTTP_TIMEOUT:-300}"
export UV_HTTP_RETRIES="${UV_HTTP_RETRIES:-5}"

product_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
runtime_root="${HAJIMI_RUNTIME_ROOT:-$HOME/.hajimi}"
venv_root="$runtime_root/venv"
bin_root="$runtime_root/bin"

mkdir -p "$bin_root"
if [[ ! -x "$bin_root/uv" ]]; then
  curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR="$bin_root" INSTALLER_NO_MODIFY_PATH=1 sh
fi

"$bin_root/uv" venv --clear --python python3 "$venv_root"
"$bin_root/uv" pip install --python "$venv_root/bin/python" -r "$product_root/runtime/wsl/requirements.lock"
"$bin_root/uv" pip install --python "$venv_root/bin/python" -e "$product_root/toolkit"

export PATH="$bin_root:$venv_root/bin:$HOME/.local/bin:$PATH"

"$venv_root/bin/python" - <<'PY'
import json
import shutil
import sys

import matplotlib
import numpy
import pandas
import scipy

print(json.dumps({
    "python": sys.version.split()[0],
    "numpy": numpy.__version__,
    "pandas": pandas.__version__,
    "scipy": scipy.__version__,
    "matplotlib": matplotlib.__version__,
    "xelatex": shutil.which("xelatex"),
}, indent=2))
PY
