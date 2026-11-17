"use strict";
let appRoute='editor',editorTab='queue',libraryFilter='all';

// One working surface: auxiliary windows never replace the plan.
function showPage(route,focus=true){
  if(route==='editor'){showEditor();return;}
  appRoute=route;
  const dialog=$(route==='library'?'library-dialog':'characters-dialog');
  if(!dialog.open)dialog.showModal();
  if(focus)$(route==='library'?'library-title':'characters-title').focus();
}
function showEditor(){
  appRoute='editor';editorTab='queue';
  for(const id of ['library-dialog','characters-dialog'])if($(id).open)$(id).close();
  renderJourney();
}
function renderJourney(){
  if(!plan)return;
  renderFitBinding();
  $('editor-page').hidden=false;
  $('plan-kind').textContent=planGroup?t("journey_243"):t("journey_244");
  $('plan-group-badge').hidden=!planGroup;
  $('library-close').hidden=false;
  const fresh=Boolean(displayComparison()),hasGoals=plan.goals.length>0;
  const who=selectedCharacter?currentCharacter()?.name||t("acceleration_019"):t("journey_245");
  $('route-state').hidden=fresh||!hasGoals;
  const failed=optimizationFailure?.key===optimizationKey()||Boolean(typeof attributeInputError==='function'&&attributeInputError());
  $('route-state').textContent=failed?optimizationMessage():'';
  $('route-state').dataset.state=failed?'error':'loading';
  $('route-state').setAttribute('role','status');
  $('route-state').setAttribute('aria-label',failed?t("journey_246"):t("journey_247"));
  $('copy-queue').classList.toggle('primary',fresh);
  $('copy-queue').textContent=t("journey_248");
  $('copy-queue').title=t("journey_249", who);
  $('add-panel').hidden=Boolean(planGroup);
  $('manual-input').hidden=Boolean(planGroup);
  $('shared-goals-note').textContent=planGroup?t("journey_250"):t("journey_251");

}
function initJourney(){
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-modal-close]');if(!button)return;
    const dialog=button.closest('dialog');dialog.returnValue='cancel';dialog.close();
  });
  for(const id of ['library-dialog','characters-dialog'])$(id).addEventListener('close',()=>{appRoute='editor';});
  document.querySelectorAll('[data-library-filter]').forEach(button=>button.addEventListener('click',()=>{
    libraryFilter=button.dataset.libraryFilter;
    document.querySelectorAll('[data-library-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    renderLibrary();
  }));
}
