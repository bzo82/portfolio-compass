"""Fetch Tesseract.js browser/worker/WASM locally from npm (one-time setup).
Run from folder with Node.js + npm installed. Never needs an API key.
Requires internet ON INSTALL MACHINE ONLY; production app only loads same-origin assets.
"""
from pathlib import Path
import shutil, subprocess, sys

ROOT=Path(__file__).resolve().parent
TEMP=ROOT/'.ocr-build'
DEST=ROOT/'vendor'
NPM='npm.cmd' if sys.platform=='win32' else 'npm'

def main():
    if not shutil.which(NPM): raise SystemExit('npm missing. Install Node.js LTS.')
    TEMP.mkdir(exist_ok=True)
    subprocess.run([NPM,'install','--ignore-scripts','--no-audit','--no-fund','--prefix',str(TEMP),'tesseract.js@7.0.0'],check=True)
    def copy(src,dst):
        if not src.exists():raise RuntimeError('Expected file unavailable: '+str(src))
        dst.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(src,dst)
        print(f'Installed {dst.relative_to(ROOT)} {dst.stat().st_size:,} bytes')
    modules=TEMP/'node_modules'
    js=modules/'tesseract.js'/'dist'
    core=modules/'tesseract.js-core'
    # v7 core package has wasm.js launcher files and companion WASM binaries.
    copy(js/'tesseract.min.js',DEST/'tesseract'/'tesseract.min.js')
    copy(js/'worker.min.js',DEST/'tesseract'/'worker.min.js')
    for item in core.iterdir():
        if item.name.startswith('tesseract-core') and (item.name.endswith('.js') or item.name.endswith('.wasm')):
            copy(item,DEST/'core'/item.name)
    required=[variant+suffix for variant in ('tesseract-core','tesseract-core-simd','tesseract-core-lstm','tesseract-core-simd-lstm') for suffix in ('.wasm.js','.wasm')]
    for x in required:
        if not (DEST/'core'/x).exists():raise RuntimeError('Core missing '+x)
    for folder in ('tesseract.js','tesseract.js-core'):
        for lic in ('LICENSE.md','LICENSE','LICENSE.txt'):
            source=modules/folder/lic
            if source.exists():
                copy(source,DEST/'licenses'/(folder+'-'+lic))
                break
    for code in ('eng','heb'):
        if not (DEST/'lang'/(code+'.traineddata.gz')).exists():raise RuntimeError('Language model missing: '+code)
    print('DONE. OCR assets are now hosted locally. No third-party scripts requested at runtime.')

if __name__=='__main__':main()
