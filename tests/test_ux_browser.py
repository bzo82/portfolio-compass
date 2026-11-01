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

def test_clear_portfolio_cancel_confirm_and_reopen():
    with static_site() as origin, sync_playwright() as p:
        b=p.chromium.launch(headless=True,args=['--no-sandbox'])
        page=b.new_page(viewport={'width':390,'height':844})
        page.goto(origin)
        page.locator('#vault-pass').fill('clear-test-long-passphrase')
        page.locator('#unlock-btn').click()
        page.locator('#app').wait_for(state='visible')
        page.locator('#manual-btn').click()
        fields=page.locator('#dialog-body input')
        fields.nth(0).fill('TEST ASSET');fields.nth(2).fill('1234')
        page.get_by_role('button',name='שמור',exact=True).click()
        page.locator('#modal-layer').wait_for(state='hidden')
        page.locator('#fx-usd').fill('3.5');page.locator('#fx-save').click()
        page.wait_for_function("() => document.querySelector('#toast').textContent.includes('שערי')")
        page.locator('#clear-data-btn').click()
        assert not page.get_by_role('button',name='מחק את נתוני התיק',exact=True).is_enabled()
        page.get_by_role('button',name='ביטול',exact=True).click()
        assert 'TEST ASSET' in page.locator('#holdings-body').inner_text()
        page.locator('#clear-data-btn').click()
        with page.expect_download():
            page.get_by_role('button',name='הורדת גיבוי מוצפן לפני הניקוי').click()
        page.locator('#dialog-body input[type=checkbox]').check()
        page.get_by_role('button',name='מחק את נתוני התיק',exact=True).click()
        page.locator('#modal-layer').wait_for(state='hidden')
        page.reload()
        page.locator('#vault-pass').fill('clear-test-long-passphrase')
        page.locator('#unlock-btn').click();page.locator('#app').wait_for(state='visible')
        assert 'TEST ASSET' not in page.locator('#holdings-body').inner_text()
        assert page.locator('#stat-total').inner_text()=='—'
        assert page.locator('#fx-usd').input_value()==''
        assert 'לא נשמרה עדיין' in page.locator('#snapshots').inner_text()
        b.close()
