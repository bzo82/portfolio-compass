from playwright.sync_api import sync_playwright
from test_ocr_browser_live import static_site

def test_responsive_empty_state_password_and_keyboard_dialog():
    with static_site() as origin, sync_playwright() as p:
        b=p.chromium.launch(headless=True,args=['--no-sandbox'])
        for width in [320,390,768,1440]:
            page=b.new_page(viewport={'width':width,'height':900})
            page.goto(origin)
            assert page.locator('#vault-pass').get_attribute('minlength')=='14'
            page.locator('#toggle-pass-btn').click()
            assert page.locator('#vault-pass').get_attribute('type')=='text'
            page.locator('#vault-pass').fill('ux-test-long-passphrase')
            page.locator('#unlock-btn').click();page.locator('#app').wait_for(state='visible')
            assert page.locator('#stat-total').inner_text()=='—'
            assert page.locator('#export-csv-btn').is_disabled()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
            page.locator('#manual-btn').click()
            assert page.locator('#app').evaluate('(e)=>e.inert')
            page.keyboard.press('Shift+Tab')
            assert page.locator('#modal-layer').evaluate('(e)=>e.contains(document.activeElement)')
            page.keyboard.press('Escape')
            assert page.locator('#modal-layer').is_hidden()
            assert page.locator('#manual-btn').evaluate('(e)=>e===document.activeElement')
            page.locator('#lock-btn').click()
            assert page.locator('#vault-pass').get_attribute('type')=='password'
            page.close()
        b.close()
