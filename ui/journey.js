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
  $('plan-kind').textContent=planGroup?'ГРУППА ПЛАНОВ':'SKILLY · ПЛАН';
  $('library-close').hidden=false;
  const fresh=Boolean(displayComparison()),hasGoals=plan.goals.length>0;
  const who=selectedCharacter?currentCharacter()?.name||'персонажа':'общего плана';
  $('route-state').hidden=fresh||!hasGoals;
  $('route-state').textContent=optimizationMessage();
  $('route-state').dataset.state=optimizationFailure?.key===optimizationKey()&&optimizationFailure.attempts>=3?'error':'loading';
  $('copy-queue').classList.toggle('primary',fresh);
  $('copy-queue').textContent='Копировать очередь';
  $('copy-queue').title=`Оптимизированная очередь · ${who}`;
  $('add-panel').hidden=Boolean(planGroup);
  $('manual-input').hidden=Boolean(planGroup);
  $('shared-goals-note').textContent=planGroup?'Цели из снимков планов группы.':'Общие цели · очередь обновляется автоматически.';

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
