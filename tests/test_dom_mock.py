"""UI logic smoke tests in restricted browser environment.
HTML is injected into about:blank because platform policy blocks all navigation.
WebCrypto is mocked ONLY for DOM tests; actual AES-GCM is unit tested in Node.
"""
from pathlib import Path
import re,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'index.html').read_text()
HTML=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>','',HTML)
HTML=re.sub(r'<script src="security-bootstrap.js"></script>','',HTML)
HTML=re.sub(r'<script type="module" src="app\.mjs"></script>','',HTML)
HTML=re.sub(r'<link rel="stylesheet" href="style\.css">','',HTML)
HTML=HTML.replace('</head>','<style>'+ (ROOT/'style.css').read_text()+'</style></head>')
code=''
for file in ('parser.mjs','vault.mjs','app.mjs'):
    s=(ROOT/file).read_text()
    s=re.sub(r'^import\s+.*?\s+from\s+.*?;\s*','',s,flags=re.M)
    s=re.sub(r'\bexport\s+','',s)
    s=s.replace('import.meta.url',"'http://localhost/app.mjs'")
    code+='\n'+s
code='(()=>{\n'+code+'\n})();'
STUB="""
let __store = new Map();let __seed=0;
Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>__store.get(k)??null,setItem:(k,v)=>__store.set(k,v),removeItem:k=>__store.delete(k)}});
Object.defineProperty(window,'crypto',{configurable:true,value:{
 randomUUID:()=>`mock-uuid-${++__seed}`,
 getRandomValues:a=>{for(let i=0;i<a.length;i++)a[i]=(i+__seed*5)%256;return a;},
 subtle:{importKey:async()=>({}),deriveKey:async()=>({}),encrypt:async(_,key,src)=>new Uint8Array(src).map(x=>x^0x77).buffer,decrypt:async(_,key,src)=>new Uint8Array(src).map(x=>x^0x77).buffer}
}});
window.fetch=async()=>({ok:false});
"""

def init_page(page):
    page.set_content(HTML,wait_until='load')
    page.evaluate("document.documentElement.dataset.topLevel='true'")
    page.add_script_tag(content=STUB)
    page.add_script_tag(content=code)
    page.locator('#vault-pass').fill('test-password-strong')
    page.locator('#unlock-btn').click()
    page.locator('#app').wait_for(state='visible')

def test_ui_create_edit_review_and_privacy():
    with sync_playwright() as p:
        b=p.chromium.launch(headless=True,args=['--no-sandbox'])
        pg=b.new_page(viewport={'width':1240,'height':820})
        err=[];pg.on('pageerror',lambda ex:err.append(str(ex)))
        init_page(pg)
        assert 'התיק שלך מתחיל כאן' in pg.locator('#holdings-body').inner_text()
        pg.locator('#manual-btn').click()
        pg.locator('#dialog-body input').nth(0).fill('META Platforms')
        pg.locator('#dialog-body input').nth(1).fill('META')
        pg.locator('#dialog-body input').nth(2).fill('21300')
        pg.locator('#dialog-body input').nth(3).fill('5420')
        pg.locator('#dialog-body button').filter(has_text='שמור').click()
        assert 'META Platforms' in pg.locator('#holdings-body').inner_text()
        assert '21,300' in pg.locator('#stat-total').inner_text()
        pg.locator('#paste-btn').click()
        pg.locator('#dialog-body textarea').fill('META 22,300 +6,420\nASML 10,850 -620')
        pg.locator('#dialog-body button').filter(has_text='המשך לבדיקת אחזקות').click()
        assert pg.locator('.review-row').count()==2
        pg.locator('#dialog-body button').filter(has_text='אשר עדכון תיק').click()
        assert 'ASML' in pg.locator('#holdings-body').inner_text()
        assert '22,300' in pg.locator('#holdings-body').inner_text()
        assert pg.locator('#snapshots').locator('div').count()>0
        pg.locator('#privacy-btn').click(); assert 'privacy' in pg.locator('body').get_attribute('class')
        assert not err,err
        pg.screenshot(path=str(ROOT/'tests'/'desktop.png'),full_page=True)
        b.close()

def test_mobile_render_no_overflow():
    with sync_playwright() as p:
        b=p.chromium.launch(headless=True,args=['--no-sandbox'])
        pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
        init_page(pg)
        assert pg.evaluate('document.documentElement.scrollWidth <= innerWidth+2'),pg.evaluate('[document.documentElement.scrollWidth,innerWidth]')
        assert pg.evaluate('Math.abs(document.querySelector(".side-column .panel").getBoundingClientRect().width-document.querySelector(".side-column").getBoundingClientRect().width)<3')
        pg.screenshot(path=str(ROOT/'tests'/'mobile.png'),full_page=True)
        b.close()


def test_image_file_to_ocr_review_mock_no_upload():
    from io import BytesIO
    from PIL import Image, ImageDraw
    image=Image.new('RGB',(900,300),'white')
    d=ImageDraw.Draw(image)
    d.text((80,80),'META 21,300 5,420',fill='black')
    d.text((80,125),'ASML 10,850 -620',fill='black')
    image_bytes=BytesIO();image.save(image_bytes,format='PNG')
    with sync_playwright() as p:
        b=p.chromium.launch(headless=True,args=['--no-sandbox'])
        pg=b.new_page(viewport={'width':390,'height':844})
        init_page(pg)
        pg.evaluate("""() => {
            window.Tesseract={createWorker:async()=>({setParameters:async()=>{},recognize:async()=>({data:{text:'META 21,300 5,420\\nASML 10,850 -620'}}),terminate:async()=>{}})};
        }""")
        # Setup engine 'ready' via same JS variable in bundled IIFE: click select after
        # forcing the mocked local asset availability before a second unlock.
        pg.evaluate("window.fetch=async()=>({ok:true})")
        pg.locator('#lock-btn').click()
        pg.locator('#vault-pass').fill('test-password-strong')
        pg.locator('#unlock-btn').click()
        pg.locator('#app').wait_for(state='visible')
        pg.locator('#screenshots').set_input_files({'name':'sample.png','mimeType':'image/png','buffer':image_bytes.getvalue()})
        assert 'אזור סריקה' in pg.locator('#dialog-title').inner_text()
        pg.locator('#dialog-body button').filter(has_text='סרוק במכשיר').click()
        pg.locator('#dialog-body textarea').wait_for(timeout=10000)
        assert 'META' in pg.locator('#dialog-body textarea').input_value()
        pg.locator('#dialog-body button').filter(has_text='המשך לבדיקת אחזקות').click()
        assert pg.locator('.review-row').count()==2
        pg.locator('#dialog-body button').filter(has_text='אשר עדכון תיק').click()
        assert 'META' in pg.locator('#holdings-body').inner_text()
        saved=pg.evaluate('localStorage.getItem("portfolio-compass-v5-vault")')
        assert 'META' not in saved
        assert 'image/png' not in saved
        b.close()


def test_disguised_image_rejected_and_cancellation_clears_selection():
    with sync_playwright() as p:
        b=p.chromium.launch(headless=True,args=['--no-sandbox'])
        pg=b.new_page(viewport={'width':390,'height':844})
        init_page(pg)
        pg.locator('#screenshots').set_input_files({'name':'fake.jpg','mimeType':'image/jpeg','buffer':b'not-a-jpeg'})
        assert 'תקינות' in pg.locator('#toast').inner_text()
        assert pg.locator('#modal-layer').is_hidden()
        assert pg.locator('#screenshots').evaluate('(el)=>el.files.length')==0
        from io import BytesIO
        from PIL import Image
        buffer=BytesIO();Image.new('RGB',(80,60),'white').save(buffer,format='PNG')
        pg.locator('#screenshots').set_input_files({'name':'real.png','mimeType':'image/png','buffer':buffer.getvalue()})
        assert 'אזור סריקה' in pg.locator('#dialog-title').inner_text()
        pg.locator('#dialog-body button').filter(has_text='ביטול').click()
        assert pg.locator('#screenshots').evaluate('(el)=>el.files.length')==0
        b.close()


def test_two_screenshots_conflicting_values_need_explicit_resolution():
    from io import BytesIO
    from PIL import Image
    buffer=BytesIO();Image.new('RGB',(120,80),'white').save(buffer,format='PNG')
    with sync_playwright() as p:
        b=p.chromium.launch(headless=True,args=['--no-sandbox'])
        pg=b.new_page(viewport={'width':390,'height':844})
        init_page(pg)
        pg.evaluate("""() => {
            window.__scanCount=0;
            window.Tesseract={createWorker:async()=>({setParameters:async()=>{},recognize:async()=>({data:{text:(++window.__scanCount===1?'META 21,300 +5,420':'META 22,300 +6,420')}}),terminate:async()=>{}})};
            window.fetch=async()=>({ok:true});
        }""")
        pg.locator('#lock-btn').click()
        pg.locator('#vault-pass').fill('test-password-strong')
        pg.locator('#unlock-btn').click()
        pg.locator('#app').wait_for(state='visible')
        pg.locator('#screenshots').set_input_files([
            {'name':'first.png','mimeType':'image/png','buffer':buffer.getvalue()},
            {'name':'second.png','mimeType':'image/png','buffer':buffer.getvalue()}
        ])
        pg.locator('#dialog-body button').filter(has_text='סרוק במכשיר').click()
        pg.locator('#dialog-body textarea').first.wait_for()
        assert pg.locator('#dialog-body textarea').count()==2
        pg.locator('#dialog-body button').filter(has_text='המשך לבדיקת אחזקות').click()
        assert pg.locator('.review-row').count()==1
        assert 'נתונים שונים בתמונות' in pg.locator('.review-row').inner_text()
        pg.locator('.review-row input[type=checkbox]').first.check()
        pg.locator('#dialog-body button').filter(has_text='אשר עדכון תיק').click()
        assert 'יש לאשר פתרון ידני' in pg.locator('#toast').inner_text()
        pg.locator('.review-row input[type=checkbox]').last.check()
        pg.locator('#dialog-body button').filter(has_text='אשר עדכון תיק').click()
        assert pg.locator('#holdings-body tr').count()==1
        b.close()
