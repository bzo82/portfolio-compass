// Local-first: no account, no authentication network endpoint.
let deferredInstall = null;
const installButton = document.querySelector('#install-app-btn');
installButton.hidden = true;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredInstall = e; installButton.hidden = false;
});
installButton.addEventListener('click', async () => {
  if (!deferredInstall) return;
  const prompt = deferredInstall; deferredInstall = null;
  await prompt.prompt(); installButton.hidden = true;
});
window.addEventListener('appinstalled', () => { installButton.hidden = true; });
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
