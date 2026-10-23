#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
V=$(node -p "require('./package.json').version")
rm -rf dist && mkdir -p dist
python3 - "$V" <<'PY'
import sys, os, zipfile
v = sys.argv[1]
def z(name, roots, base=''):
    with zipfile.ZipFile(f'dist/{name}', 'w', zipfile.ZIP_DEFLATED) as zf:
        for r in roots:
            if os.path.isfile(r): zf.write(r, r); continue
            for d, _, fs in os.walk(r):
                for f in fs:
                    p = os.path.join(d, f); zf.write(p, os.path.relpath(p, base) if base else p)
z(f'open-email-harvester-extension-v{v}.zip', ['extension'], 'extension')
z(f'open-email-harvester-v{v}.zip', ['extension', 'server', 'package.json', 'README.md', 'LICENSE'])
PY
ls -l dist
