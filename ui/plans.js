"use strict";
const nativeDesktop = Boolean(window.__TAURI__?.core?.invoke);
let activePlanId = null, savedFingerprint = '', calculationKey = null;
let draftTimer, draftChain = Promise.resolve(), draftGeneration = 0;
let libraryRecords = [], nameOperation = null, closingNative = false;
let saveStateError=null;

async function nativeCommand(command, args = {}) {
  try { return await window.__TAURI__.core.invoke(command,args); }
  catch (error) { throw new Error(typeof error === 'string' ? error : error.message || String(error)); }
}
async function confirmAction(message) {
  return await askDecision(message,[['cancel','Отмена'],['continue','Продолжить']])==='continue';
}
function askDecision(message,choices) {
  return new Promise(resolve=>{
    const dialog=$('decision-dialog');
    $('decision-message').textContent=message;
    $('decision-actions').replaceChildren();
    for(const [value,label] of choices){
      const button=document.createElement('button');button.textContent=label;
      if(value==='save'||value==='continue')button.className='primary';
      button.addEventListener('click',()=>{dialog.returnValue=value;dialog.close();});
      $('decision-actions').append(button);
    }
    dialog.returnValue='cancel';
    dialog.addEventListener('close',()=>resolve(dialog.returnValue),{once:true});
    dialog.showModal();
  });
}
async function canLeaveDraft(message) {
  if(!isDirty())return true;
  const answer=await askDecision(message,[['cancel','Отмена'],['discard','Отбросить изменения'],['save','Сохранить в библиотеку']]);
  if(answer==='save')return savePlan();
  return answer==='discard';
}
function cleanResult(value) {
  return value ? {baseline:value.baseline,optimized:value.optimized,saved_days:value.saved_days,searched_maps:value.searched_maps,method:value.method} : null;
}
function captureWorkspace() {
  return JSON.parse(JSON.stringify({plan,result:cleanResult(result),preview,eft:$('eft').value,
    calculated_at:calculationKey ? calculatedAt.getTime() : null,calculation_key:calculationKey,schedule_mode:scheduleMode,adaptations,selected_character:selectedCharacter,character_remaps:characterRemaps,character_implant_replacements:replacementChoices,character_extra_remaps:characterExtraRemaps,group:planGroup,acceleration_settings:accelerationSettings}));
}
function canonical(value) {
  if(Array.isArray(value)) return value.map(canonical);
  if(value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
function workspaceSettings(workspace){
  const p=workspace.plan||{};
  // Only user-editable inputs determine unsaved changes; results, snapshots,
  // timings, market prices and the selected view are background state.
  const replacements={};
  for(const adaptation of workspace.adaptations||[])if(adaptation.replace_implants)replacements[adaptation.character_id]=true;
  for(const [id,replace] of Object.entries(workspace.character_implant_replacements||{})){
    if(replace)replacements[id]=true;else delete replacements[id];
  }
  const defaults={accelerator_id:77919,quantity:1,injector:'large',use_unallocated:true,biology_override:null,total_sp_override:null,custom:null};
  const acceleration={};
  for(const [id,value] of Object.entries(workspace.acceleration_settings||{})){
    const settings={...defaults,...value};
    if(JSON.stringify(canonical(settings))!==JSON.stringify(canonical(defaults)))acceleration[id]=settings;
  }
  return {plan:{name:p.name||'',goals:p.goals||[],attributes:p.attributes||[20,20,19,20,20],remap_count:p.remap_count??1,optimize_implants:p.optimize_implants??true,queue_priority:p.queue_priority||'fit_ready',fitting:p.fitting||null},
    character_extra_remaps:Object.fromEntries(Object.entries(workspace.character_extra_remaps||{}).filter(([,value])=>value)),
    eft:workspace.eft||'',character_remaps:workspace.character_remaps||{},character_implant_replacements:replacements,
    group:workspace.group?{members:workspace.group.members.map(member=>({id:member.id,name:member.name,goals:member.goals,fitting:member.fitting||null}))}:null,
    acceleration_settings:acceleration};
}
function fingerprint(workspace) {return JSON.stringify(canonical(workspaceSettings(workspace)));}
function isDirty() {
  if(!plan) return false;
  if(!activePlanId && !plan.goals.length && !$('eft').value.trim()) return false;
  return fingerprint(captureWorkspace()) !== savedFingerprint;
}
function updateSaveState() {
  if(!plan)return;
  const dirty=isDirty(),error=saveStateError;
  $('save-state').hidden=!error;
  $('save-state').textContent=error?'Ошибка сохранения':dirty?'Есть изменения':'Сохранено';
  $('save-state').dataset.state=error?'error':dirty?'dirty':'saved';
  $('save-state').title=error?error.message:dirty?'Изменения ещё не сохранены в библиотеку':'План сохранён в библиотеку';
  $('save').hidden=!dirty&&!error;
  $('save').disabled=typeof attributeInputError==='function'&&Boolean(attributeInputError());
  $('save').textContent=activePlanId?'Сохранить':'Сохранить план';
}
function queueDraft() {
  if(!plan) return;
  updateSaveState();
  clearTimeout(draftTimer);
  $('draft-state').textContent='Сохраняем черновик…';
  draftTimer=setTimeout(()=>persistDraft().catch(error=>notify(`Черновик не сохранён: ${error.message}`,'error')),450);
}
async function persistDraft() {
  clearTimeout(draftTimer);
  if(!plan) return;
  const body={active_id:activePlanId,workspace:captureWorkspace()};
  const generation=++draftGeneration;
  draftChain=draftChain.catch(()=>{}).then(()=>api('/api/draft',body));
  try {
    await draftChain;
    if(generation===draftGeneration){$('draft-state').textContent='Черновик сохранён';if(saveStateError?.scope==='draft')saveStateError=null;updateSaveState();}
  } catch(error) {
    if(generation===draftGeneration){saveStateError={scope:'draft',message:error.message};updateSaveState();}
    $('draft-state').textContent='Ошибка сохранения черновика';
    throw error;
  }
}
async function settleDraft() { clearTimeout(draftTimer); await draftChain.catch(()=>{}); }
function applyWorkspace(workspace,id=null,savedWorkspace=null) {
  saveStateError=null;
  fitReplacement=false;fitInputKey=null;
  resetCalculation(); clearTimeout(draftTimer);
  replacementChoices={...(workspace.character_implant_replacements||{})};
  characterExtraRemaps={...(workspace.character_extra_remaps||{})};
  accelerationSettings=workspace.acceleration_settings||{};
  planGroup=workspace.group||null;characterRemaps=workspace.character_remaps||{};adaptations=workspace.adaptations||[];selectedCharacter=workspace.selected_character||null;
  plan=workspace.plan||newPlan();result=workspace.result||null;preview=workspace.preview||null;
  calculationKey=workspace.calculation_key||null;
  calculatedAt=new Date(workspace.calculated_at||Date.now());
  scheduleMode='optimized';
  $('eft').value=workspace.eft||'';
  activePlanId=id;savedFingerprint=savedWorkspace?fingerprint(savedWorkspace):'';
  view='queue';panel=planGroup||plan.goals.length?'plan':'add';
  editorTab=plan.goals.length?'queue':'goals';appRoute='editor';
  render();
}
async function savePlan(asNew=false,name=null) {
  let success=false;
  await action('Сохраняем план в библиотеку…',async()=>{
    if(name!==null) plan.name=name;
    if(!plan.name.trim()) plan.name='Новый план';
    await settleDraft();
    let data;try{data=await api('/api/plans/save',{id:asNew?null:activePlanId,workspace:captureWorkspace()});}catch(error){saveStateError={scope:'library',message:error.message};updateSaveState();throw error;}
    const previousTab=editorTab;applyWorkspace(data.record.workspace,data.record.id,data.record.workspace);showEditor(previousTab);
    $('draft-state').textContent='Черновик сохранён';
    success=true;notify(`План «${plan.name}» сохранён`);
  });
  return success;
}
async function startNewPlan() {
  if(busy) return;
  if(!await canLeaveDraft('Создать новый план? Сохраните текущие изменения в библиотеку или отбросьте их.'))return;
  await action('Создаём новый план…',async()=>{
    await settleDraft();applyWorkspace({plan:newPlan()});
    showEditor(editorTab);await persistDraft();$('skill-name').focus();
  });
}
function renderLibrary() {
  const fits=libraryFilter==='fits';
  $('fit-library-tools').hidden=!fits;$('library-create-group').hidden=fits;
  document.querySelectorAll('[data-library-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.libraryFilter===libraryFilter)));
  if(fits){renderFitLibrary();return;}

  const query=$('library-search').value.trim().toLocaleLowerCase();
  const records=libraryRecords.filter(record=>record.name.toLocaleLowerCase().includes(query) && (libraryFilter==='all'||(libraryFilter==='groups'?Boolean(record.group_members):!record.group_members)));
  $('library-list').innerHTML=records.length?records.map(record=>{
    const savedAt=new Date(record.saved_at).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
    const description=record.levels?`${record.levels} ${plural(record.levels,['уровень','уровня','уровней'])} · ${duration(record.days||0,true)}`:`${record.goals} целей`;
    return `<button type="button" class="saved-plan-row" data-open-plan="${esc(record.id)}" aria-label="Открыть план ${esc(record.name)}"><span class="saved-plan-info"><strong>${esc(record.name)}${record.group_members?`<span class="active-plan-badge">ГРУППА · ${record.group_members}</span>`:''}${record.id===activePlanId?'<span class="active-plan-badge">ОТКРЫТ</span>':''}</strong><small>${description}${record.optimized?' · оптимизирован':''} · ${savedAt}</small></span></button>`;
  }).join(''):'<div class="library-empty">'+(libraryRecords.length?'Ничего не найдено.':'Пока нет сохранённых планов.<br>Создайте план, добавьте цели и сохраните его в библиотеку.')+'</div>';
  if(libraryFilter==='all'){
    const fits=fitRecords.filter(f=>!f.archived&&`${f.name} ${f.ship}`.toLocaleLowerCase().includes(query));
    if(fits.length){if(!records.length)$('library-list').innerHTML='';$('library-list').insertAdjacentHTML('beforeend',fitLibraryRows(fits));}
  }
}
async function loadLibrary() {
  const data=await api('/api/plans');libraryRecords=data.plans;await loadFitLibrary();
  $('library-warnings').hidden=!data.warnings.length;
  $('library-warnings').textContent=data.warnings.length?`Некоторые файлы не удалось прочитать:\n${data.warnings.join('\n')}`:'';
  renderLibrary();
}
async function openLibrary() {
  await action('Открываем библиотеку…',async()=>{await loadLibrary();showPage('library');});
}
function showNameDialog(operation) {
  if(busy)return;
  nameOperation=operation;
  $('name-dialog-title').textContent='Сохранить как';
  $('plan-new-name').value=operation.name;
  $('name-dialog').showModal();$('plan-new-name').focus();$('plan-new-name').select();
}
async function openSavedPlan(id) {
  if(busy)return;
  if(!await canLeaveDraft('Открыть другой план? В текущем черновике есть изменения, не сохранённые в библиотеку.'))return;
  await action('Открываем сохранённую очередь…',async()=>{
    await settleDraft();const data=await api('/api/plans/open',{id});items=data.items;
    applyWorkspace(data.record.workspace,data.record.id,data.record.workspace);
    showEditor(editorTab);queueDraft();notify('План открыт');
  });
}
async function importWorkspace(raw) {
  if(raw.workspace&&raw.schema_version!==1)throw new Error('Неподдерживаемая версия файла плана');
  const workspace=raw.workspace||{plan:raw,eft:'',result:null,preview:null,calculation_key:null,schedule_mode:'optimized'};
  const data=await api('/api/workspace/prepare',workspace);
  if(isDirty()&&!await confirmAction('Открыть файл и отменить несохранённые изменения текущего плана?'))return;
  await settleDraft();items=data.items;applyWorkspace(data.workspace);queueDraft();notify('План открыт. Сохраните его в библиотеку.');
}
async function initPlanLibrary() {
  $('library-open').addEventListener('click',openLibrary);
  $('library-close').addEventListener('click',()=>showEditor(editorTab));
  $('library-new').addEventListener('click',startNewPlan);
  $('library-search').addEventListener('input',renderLibrary);
  $('library-save-as').addEventListener('click',()=>showNameDialog({kind:'save-as',name:Array.from(activePlanId?`${plan.name} — копия`:plan.name).slice(0,120).join('')}));
  $('name-cancel').addEventListener('click',()=>$('name-dialog').close());
  $('library-list').addEventListener('click',event=>{
    const row=event.target.closest('[data-open-plan]');
    if(row)openSavedPlan(row.dataset.openPlan);
  });
  $('name-form').addEventListener('submit',async event=>{
    event.preventDefault();const name=$('plan-new-name').value.trim();if(!name||!nameOperation)return;
    if(await savePlan(true,name)){$('name-dialog').close();showEditor(editorTab);}
  });
  document.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){
      event.preventDefault();if(!busy)savePlan();
    }
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='o'){
      event.preventDefault();if(!busy&&appRoute!=='library')openLibrary();
    }
  });
  if(nativeDesktop){
    await window.__TAURI__.event.listen('skilly-close-requested',async()=>{
      if(closingNative)return;closingNative=true;
      try{await persistDraft();await nativeCommand('finish_close');}
      catch(error){closingNative=false;notify(`Не удалось сохранить черновик: ${error.message}`,'error');}
    });
    await nativeCommand('frontend_ready');
  }else{
    window.addEventListener('pagehide',()=>{if(plan){fetch('/api/draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({active_id:activePlanId,workspace:captureWorkspace()}),keepalive:true}).catch(()=>{});}});
  }
}
