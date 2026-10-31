from playwright.sync_api import sync_playwright
from test_ocr_browser_live import static_site

def test_security_csv_lock_csp_and_framing():
    with static_site() as origin, sync_playwright() as p:
        b=p.chromium.launch(headless=True,args=['--no-sandbox'])
        page=b.new_page(accept_downloads=True)
        page.on('dialog',lambda d:d.accept())
        page.goto(origin)
        page.locator('#vault-pass').fill('security-test-long-passphrase')
        page.locator('#unlock-btn').click()
        page.locator('#app').wait_for(state='visible')
        page.locator('#manual-btn').click()
        fields=page.locator('#dialog-body input')
        fields.nth(0).fill('=1+1');fields.nth(2).fill('123');fields.nth(3).fill('-5')
        page.get_by_role('button',name='שמור',exact=True).click()
        page.locator('#modal-layer').wait_for(state='hidden')
        with page.expect_download() as dl:page.locator('#export-csv-btn').click()
        from pathlib import Path
        csv=Path(dl.value.path()).read_text(encoding='utf-8-sig')
        assert '"\'=1+1"' in csv
        assert '"-5"' in csv
        page.evaluate('''() => {const orig=crypto.subtle.encrypt.bind(crypto.subtle);crypto.subtle.encrypt=async(...args)=>{window.waiting=true;await new Promise(r=>window.release=r);return orig(...args);};}''')
        before=page.evaluate('localStorage.getItem("portfolio-compass-v5-vault")')
        page.locator('#holdings-body button').first.click()
        page.locator('#dialog-body input').nth(0).fill('SECRET-AFTER-LOCK')
        page.get_by_role('button',name='שמור',exact=True).click()
        page.wait_for_function('() => window.waiting')
        page.evaluate('window.portfolioCompassLock();window.release()')
        page.wait_for_timeout(600)
        assert page.locator('#holdings-body').inner_text()==''
        assert page.locator('#unlock-screen').is_visible()
        assert before==page.evaluate('localStorage.getItem("portfolio-compass-v5-vault")')
        # Normal inline execution is rejected by the actual document CSP.
        try:page.add_script_tag(content='window.inlinePayloadRan=true')
        except Exception:pass
        assert page.evaluate('window.inlinePayloadRan') is None
        parent=b.new_page()
        parent.set_content('<iframe src="'+origin+'"></iframe>')
        frame=parent.frames[1]
        frame.wait_for_load_state()
        assert frame.locator('body').evaluate('(e)=>getComputedStyle(e).display')=='none'
        b.close()
