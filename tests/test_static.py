import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class StaticSecurityTests(unittest.TestCase):
 def test_app_has_no_external_service_calls(self):
  js=(ROOT/'app.mjs').read_text();self.assertNotIn('generativelanguage.googleapis.com',js);self.assertNotIn('Gemini.create',js);self.assertNotIn("method:'POST'",js);self.assertNotIn('sendBeacon(',js);self.assertNotIn('XMLHttpRequest',js)
 def test_csp_blocks_external_connection(self):
  csp=(ROOT/'_headers').read_text();self.assertIn("connect-src 'self'",csp);self.assertNotIn('connect-src *',csp)
 def test_images_not_saved(self):
  app=(ROOT/'app.mjs').read_text();vault=(ROOT/'vault.mjs').read_text()
  self.assertIn('function createCropCanvas(',app)
  self.assertNotIn('localStorage.setItem(',app.replace("localStorage.setItem(VAULT_KEY,JSON.stringify(obj))",''))
  self.assertNotIn('FileReader',vault)
 def test_pwa_update_recovers_existing_installations(self):
  client=(ROOT/'pwa-client.mjs').read_text();worker=(ROOT/'sw.js').read_text()
  self.assertIn("updateViaCache: 'none'",client)
  self.assertIn('registration.update()',client)
  self.assertIn("addEventListener('controllerchange'",client)
  self.assertIn('const hadController = Boolean(navigator.serviceWorker.controller)',client)
  self.assertIn('if (!hadController || refreshing) return',client)
  self.assertIn("request.mode === 'navigate'",worker)
  self.assertIn('fetch(request)',worker)
if __name__=='__main__':unittest.main()
