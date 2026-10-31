from pathlib import Path
import tempfile,shutil,subprocess,json
ROOT=Path(__file__).resolve().parents[1]

def test_build_packs_same_origin_files_with_mocked_npm_assets():
    with tempfile.TemporaryDirectory() as td:
        dst=Path(td)
        for n in ['build.mjs','index.html','style.css','app.mjs','parser.mjs','vault.mjs','pwa-client.mjs','sw.js','manifest.webmanifest','_headers']:
            shutil.copy(ROOT/n,dst/n)
        icons=dst/'icons';icons.mkdir(parents=True)
        for n in ('icon-192.png','icon-512.png'): shutil.copy(ROOT/'icons'/n,icons/n)
        lang=dst/'vendor/lang';lang.mkdir(parents=True)
        for l in ('eng.traineddata.gz','heb.traineddata.gz'):(lang/l).write_bytes(b'dummy model')
        js=dst/'node_modules/tesseract.js/dist';js.mkdir(parents=True)
        (js/'tesseract.min.js').write_text('a'*1500)
        (js/'worker.min.js').write_text('a'*1500)
        core=dst/'node_modules/tesseract.js-core';core.mkdir(parents=True)
        for variant in ('tesseract-core','tesseract-core-simd','tesseract-core-lstm','tesseract-core-simd-lstm'):
            for suffix in ('.wasm.js','.wasm'):(core/(variant+suffix)).write_bytes(b'a'*1500)
        subprocess.run(['node',str(dst/'build.mjs')],cwd=dst,check=True,capture_output=True)
        assert (dst/'dist/index.html').exists()
        assert (dst/'dist/vendor/tesseract/worker.min.js').exists()
        assert (dst/'dist/vendor/core/tesseract-core-simd-lstm.wasm').exists()
        assert (dst/'dist/vendor/lang/heb.traineddata.gz').exists()
        report=json.loads((dst/'dist/integrity-manifest.json').read_text())
        assert 'vendor/lang/heb.traineddata.gz' in report['sha256']


def test_build_fails_without_wasm_binary():
    with tempfile.TemporaryDirectory() as td:
        dst=Path(td)
        for n in ['build.mjs','index.html','style.css','app.mjs','parser.mjs','vault.mjs','pwa-client.mjs','sw.js','manifest.webmanifest','_headers']:
            shutil.copy(ROOT/n,dst/n)
        icons=dst/'icons';icons.mkdir(parents=True)
        for n in ('icon-192.png','icon-512.png'): shutil.copy(ROOT/'icons'/n,icons/n)
        lang=dst/'vendor/lang';lang.mkdir(parents=True)
        for l in ('eng.traineddata.gz','heb.traineddata.gz'):(lang/l).write_bytes(b'dummy model')
        js=dst/'node_modules/tesseract.js/dist';js.mkdir(parents=True)
        for n in ('tesseract.min.js','worker.min.js'):(js/n).write_text('a'*1500)
        core=dst/'node_modules/tesseract.js-core';core.mkdir(parents=True)
        for variant in ('tesseract-core','tesseract-core-simd','tesseract-core-lstm','tesseract-core-simd-lstm'):
            (core/(variant+'.wasm.js')).write_bytes(b'a'*1500)
        result=subprocess.run(['node',str(dst/'build.mjs')],cwd=dst,capture_output=True,text=True)
        assert result.returncode!=0
        assert 'Missing required OCR runtime' in result.stderr
