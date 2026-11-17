"use strict";
async function initUpdates() {
  if (!nativeDesktop) return;
  const notice = $('update-notice');
  $('update-dismiss').addEventListener('click', () => { notice.hidden = true; });
  $('update-download').addEventListener('click', async () => {
    try { await nativeCommand('open_update_page'); }
    catch (_) { notify(t("updates_349"), 'error'); }
  });
  try {
    const update = await nativeCommand('check_update');
    if (!update?.version) return;
    $('update-message').textContent = t("updates_350", update.version);
    notice.hidden = false;
  } catch (_) {
    // Offline startup and GitHub rate limits must not interrupt the planner.
  }
}
