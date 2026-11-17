"use strict";
async function initUpdates() {
  if (!nativeDesktop) return;
  const notice = $('update-notice');
  $('update-dismiss').addEventListener('click', () => { notice.hidden = true; });
  $('update-download').addEventListener('click', async () => {
    try { await nativeCommand('open_update_page'); }
    catch (_) { notify('Не удалось открыть страницу скачивания', 'error'); }
  });
  try {
    const update = await nativeCommand('check_update');
    if (!update?.version) return;
    $('update-message').textContent = `Доступна Skilly ${update.version}`;
    notice.hidden = false;
  } catch (_) {
    // Offline startup and GitHub rate limits must not interrupt the planner.
  }
}
