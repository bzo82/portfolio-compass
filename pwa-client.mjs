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
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {updateViaCache: 'none'});
      await registration.update();
    } catch {}
  });
}
