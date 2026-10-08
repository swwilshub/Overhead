# Shared paths for the browser tests. Run them from the repo root after `npm run build`.
# OVERHEAD_HTML overrides the built page; CHROMIUM_PATH points Playwright at a browser it did not download.
import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = pathlib.Path(os.environ.get('OVERHEAD_HTML', ROOT / 'dist' / 'overhead.html')).resolve()
URL = HTML.as_uri()
AXE_PATH = str(ROOT / 'node_modules' / 'axe-core' / 'axe.min.js')
AXE = open(AXE_PATH).read()
SHOTS = ROOT / 'test' / 'shots'
SHOTS.mkdir(exist_ok=True)

def launch_opts(**kw):
    exe = os.environ.get('CHROMIUM_PATH')
    if exe: kw['executable_path'] = exe
    return kw
