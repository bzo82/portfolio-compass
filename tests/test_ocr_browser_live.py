"""Real Chromium + actual Tesseract WASM release gate. Requires npm run build.
No external image upload, no server-side OCR, no mock of the recognition engine.
"""
from contextlib import contextmanager
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
import pytest
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
DIST=ROOT/'dist'
@contextmanager
def static_site():
    class Handler(SimpleHTTPRequestHandler):
        def log_message(self,fmt,*args): pass
        def do_POST(self): self.send_error(405)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(DIST)))
    thread=Thread(target=server.serve_forever,daemon=True);thread.start()
    try: yield f'http://127.0.0.1:{server.server_address[1]}'
    finally: server.shutdown();server.server_close();thread.join(timeout=5)

@pytest.mark.skipif(not (DIST/'vendor/core/tesseract-core-simd-lstm.wasm').exists(),reason='Real browser OCR requires npm install and npm run build')
def test_local_browser_real_ocr_and_zero_image_upload():
    with static_site() as origin, sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
        ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
        page=ctx.new_page()
        requests=[];errors=[]
        page.on('request',lambda r:requests.append((r.method,r.url,r.post_data)))
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(origin,wait_until='load')
        page.locator('#vault-pass').fill('secure-test-password-long-2026')
        page.locator('#unlock-btn').click()
        page.locator('#app').wait_for(state='visible',timeout=20000)
        page.wait_for_function("document.querySelector('#ocr-status-text').textContent.includes('קובצי OCR מקומיים זמינים')",timeout=20000)
        page.locator('#screenshots').set_input_files(str(ROOT/'fixtures/synthetic_broker_sample.png'))
        page.get_by_role('button',name='סרוק במכשיר').click()
        page.locator('#dialog-body textarea').wait_for(state='visible',timeout=150000)
        raw=page.locator('#dialog-body textarea').input_value()
        assert 'META' in raw and 'ASML' in raw and 'CIBR' in raw,repr(raw)
        page.get_by_role('button',name='המשך לבדיקת אחזקות').click()
        assert page.locator('.review-row').count()==3
        page.get_by_role('button',name='אשר עדכון תיק').click()
        page.wait_for_function("document.querySelectorAll('#holdings-body tr').length===3",timeout=30000)
        assert '47,390' in page.locator('#stat-total').inner_text()
        for method,url,body in requests:
            assert method in ('GET','HEAD'),(method,url)
            assert url.startswith(origin+'/'),url
            assert body is None or len(body)==0,url
        assert not errors,errors
        vault=page.evaluate("localStorage.getItem('portfolio-compass-v5-vault')")
        assert vault and 'META' not in vault and 'image/png' not in vault
        ctx.close();browser.close()
