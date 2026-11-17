"use strict";
const nativeDesktop = Boolean(window.__TAURI__?.core?.invoke);
let activePlanId = null, savedFingerprint = '', calculationKey = null;
let draftTimer, draftChain = Promise.resolve(), draftGeneration = 0;
let libraryRecords = [], nameOperation = null, closingNative = false;
let saveStateError=null;

async function nativeCommand(command, args = {}) {
  try { return await window.__TAURI__.core.invoke(command,args); }
  catch (error) { throw new Error(localizeServerText(typeof error === 'string' ? error : error.message || String(error))); }
}
async function confirmAction(message) {
  return await askDecision(message,[['cancel',t("plans_252")],['continue',t("plans_253")]])==='continue';
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
  const answer=await askDecision(message,[['cancel',t("plans_252")],['discard',t("plans_254")],['save',t("plans_255")]]);
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
    group:workspace.group?{members:workspace.group.members.map(member=>({id:member.id,name:member.name,goals:member.goals,fitting:member.fitting||null})),level_overrides:workspace.group.level_overrides||{}}:null,
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
  $('save-state').textContent=error?t("plans_256"):dirty?t("plans_257"):t("plans_258");
  $('save-state').dataset.state=error?'error':dirty?'dirty':'saved';
  $('save-state').title=error?error.message:dirty?t("plans_259"):t("plans_260");
  $('save').hidden=!dirty&&!error;
  $('save').disabled=typeof attributeInputError==='function'&&Boolean(attributeInputError());
  $('save').textContent=activePlanId?t("plans_261"):t("plans_262");
}
function queueDraft() {
  if(!plan) return;
  updateSaveState();
  clearTimeout(draftTimer);
  $('draft-state').textContent=t("plans_263");
  draftTimer=setTimeout(()=>persistDraft().catch(error=>notify(t("plans_264", error.message),'error')),450);
}
async function persistDraft() {
  clearTimeout(draftTimer);
  if(!plan) return;
  const body={active_id:activePlanId,workspace:captureWorkspace()};
  const generation=++draftGeneration;
  draftChain=draftChain.catch(()=>{}).then(()=>api('/api/draft',body));
  try {
    await draftChain;
    if(generation===draftGeneration){$('draft-state').textContent=t("groups_241");if(saveStateError?.scope==='draft')saveStateError=null;updateSaveState();}
  } catch(error) {
    if(generation===draftGeneration){saveStateError={scope:'draft',message:error.message};updateSaveState();}
    $('draft-state').textContent=t("plans_265");
    throw error;
  }
}
async function settleDraft() { clearTimeout(draftTimer); await draftChain.catch(()=>{}); }
function applyWorkspace(workspace,id=null,savedWorkspace=null,characterId=undefined) {
  saveStateError=null;
  fitReplacement=false;fitInputKey=null;
  resetCalculation(); clearTimeout(draftTimer);
  replacementChoices={...(workspace.character_implant_replacements||{})};
  characterExtraRemaps={...(workspace.character_extra_remaps||{})};
  accelerationSettings=workspace.acceleration_settings||{};
  planGroup=workspace.group||null;characterRemaps=workspace.character_remaps||{};adaptations=workspace.adaptations||[];selectedCharacter=characterId===undefined?workspace.selected_character||null:characterId;
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
  await action(t("plans_266"),async()=>{
    if(name!==null) plan.name=name;
    if(!plan.name.trim()) plan.name=t("app_040");
    await settleDraft();
    let data;try{data=await api('/api/plans/save',{id:asNew?null:activePlanId,workspace:captureWorkspace()});}catch(error){saveStateError={scope:'library',message:error.message};updateSaveState();throw error;}
    for(const tracked of Object.values(characterState.tracked_plans||{}))if(tracked.id===data.record.id){tracked.name=data.record.workspace.plan.name;tracked.saved_at=data.record.saved_at;}
    const previousTab=editorTab;
    if(fingerprint(data.record.workspace)===fingerprint(captureWorkspace())){activePlanId=data.record.id;savedFingerprint=fingerprint(data.record.workspace);updateSaveState();renderJourney();}
    else applyWorkspace(data.record.workspace,data.record.id,data.record.workspace);
    showEditor(previousTab);
    renderCharacterList();
    if(typeof renderTracking==='function')renderTracking();
    $('draft-state').textContent=t("groups_241");
    success=true;notify(t("plans_267", plan.name));
  });
  return success;
}
async function startNewPlan() {
  if(busy) return;
  if(!await canLeaveDraft(t("plans_268")))return;
  await action(t("plans_269"),async()=>{
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
    const savedAt=new Date(record.saved_at).toLocaleString(uiLocale(),{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
    const description=record.levels?`${record.levels} ${plural(record.levels,[t("app_090"),t("app_091"),t("app_092")])} · ${duration(record.days||0,true)}`:t("plans_270", record.goals);
    return t("plans_271", esc(record.id), esc(record.name), esc(record.name), record.group_members?t("plans_272", record.group_members):'', record.id===activePlanId?t("plans_273"):'', description, record.optimized?t("plans_274"):'', savedAt);
  }).join(''):'<div class="library-empty">'+(libraryRecords.length?t("plans_275"):t("plans_276"))+'</div>';
  if(libraryFilter==='all'){
    const fits=fitRecords.filter(f=>!f.archived&&`${f.name} ${f.ship}`.toLocaleLowerCase().includes(query));
    if(fits.length){if(!records.length)$('library-list').innerHTML='';$('library-list').insertAdjacentHTML('beforeend',fitLibraryRows(fits));}
  }
}
async function loadLibrary() {
  const data=await api('/api/plans');libraryRecords=data.plans;await loadFitLibrary();
  $('library-warnings').hidden=!data.warnings.length;
  $('library-warnings').textContent=data.warnings.length?t("plans_277", data.warnings.map(value=>localizeServerText(value)).join('\n')):'';
  renderLibrary();
}
async function openLibrary() {
  closePlanPicker();
  await action(t("plans_278"),async()=>{await loadLibrary();showPage('library');});
}
function closePlanPicker(){
  $('plan-picker').hidden=true;
  $('library-open').setAttribute('aria-expanded','false');
}
function renderPlanPicker(){
  const query=$('plan-picker-search').value.trim().toLocaleLowerCase();
  const assignedId=selectedCharacter?trackedPlan(selectedCharacter)?.id:null;
  const records=libraryRecords.filter(record=>record.name.toLocaleLowerCase().includes(query));
  const renderRecord=record=>{
    const characters=characterState.characters.filter(character=>trackedPlan(character.id)?.id===record.id)
      .sort((a,b)=>Number(b.id===selectedCharacter)-Number(a.id===selectedCharacter));
    const badges=characters.slice(0,3).map(character=>`<span class="plan-character-badge${character.id===selectedCharacter?' is-selected':''}" title="${esc(character.name)}">${esc(character.name)}</span>`).join('');
    const more=characters.length>3?`<span class="plan-character-badge plan-character-more" title="${esc(characters.slice(3).map(character=>character.name).join(', '))}">+${characters.length-3}</span>`:'';
    return `<button type="button" data-picker-plan="${esc(record.id)}" aria-current="${record.id===activePlanId?'page':'false'}"><span class="plan-picker-label" title="${esc(record.name)}">${esc(record.name)}</span><span class="plan-picker-meta">${record.id===activePlanId?'<span class="plan-picker-current" aria-hidden="true">✓</span>':''}${characters.length?`<span class="plan-picker-characters">${badges}${more}</span>`:''}${record.group_members?t("plans_279"):''}</span></button>`;
  };
  const assigned=records.find(record=>record.id===assignedId);
  const others=records.filter(record=>record.id!==assignedId);
  const characterName=characterState.characters.find(character=>character.id===selectedCharacter)?.name||t("app_052");
  const heading=t("plans_280", characterName);
  const pinned=assigned?`<div class="plan-picker-pinned" role="group" aria-label="${esc(heading)}"><div class="plan-picker-section-title" title="${esc(heading)}">${esc(heading)}</div>${renderRecord(assigned)}</div>`:'';
  $('plan-picker-list').innerHTML=records.length?`${pinned}${assigned&&others.length?t("plans_281"):''}${others.map(renderRecord).join('')}`:`<p class="muted-note">${query?t("plans_282"):t("plans_283")}</p>`;
}
async function togglePlanPicker(){
  if(!$('plan-picker').hidden){closePlanPicker();return;}
  if(busy)return;
  $('plan-picker-search').value='';
  $('plan-picker-list').textContent=t("plans_284");
  $('plan-picker').hidden=false;
  $('library-open').setAttribute('aria-expanded','true');
  await action(t("plans_284"),async()=>{
    try{const data=await api('/api/plans');libraryRecords=data.plans;renderPlanPicker();}
    catch(error){$('plan-picker-list').textContent=t("plans_285");throw error;}
  });
  if(!$('plan-picker').hidden)$('plan-picker-search').focus();
}
function showNameDialog(operation) {
  if(busy)return;
  nameOperation=operation;
  $('name-dialog-title').textContent=t("plans_286");
  $('plan-new-name').value=operation.name;
  $('name-dialog').showModal();$('plan-new-name').focus();$('plan-new-name').select();
}
async function openSavedPlan(id,characterId=undefined) {
  if(busy)return;
  if(!await canLeaveDraft(t("plans_287")))return;
  await action(t("plans_288"),async()=>{
    await settleDraft();const data=await api('/api/plans/open',{id});items=data.items;
    applyWorkspace(data.record.workspace,data.record.id,data.record.workspace,characterId);
    showEditor(editorTab);queueDraft();notify(t("plans_289"));
  });
}
async function importWorkspace(raw) {
  if(raw.workspace&&raw.schema_version!==1)throw new Error(t("plans_290"));
  const workspace=raw.workspace||{plan:raw,eft:'',result:null,preview:null,calculation_key:null,schedule_mode:'optimized'};
  const data=await api('/api/workspace/prepare',workspace);
  if(isDirty()&&!await confirmAction(t("plans_291")))return;
  await settleDraft();items=data.items;applyWorkspace(data.workspace);queueDraft();notify(t("plans_292"));
}
async function initPlanLibrary() {
  $('library-open').addEventListener('click',togglePlanPicker);
  $('plan-picker-search').addEventListener('input',renderPlanPicker);
  $('plan-picker-list').addEventListener('click',event=>{
    const row=event.target.closest('[data-picker-plan]');if(!row)return;
    const id=row.dataset.pickerPlan,characterId=selectedCharacter&&trackedPlan(selectedCharacter)?.id===id?selectedCharacter:undefined;
    closePlanPicker();if(id!==activePlanId)openSavedPlan(id,characterId);
  });
  $('plan-picker-new').addEventListener('click',()=>{closePlanPicker();startNewPlan();});
  $('plan-picker-library').addEventListener('click',()=>{closePlanPicker();openLibrary();});
  document.addEventListener('click',event=>{if(!event.target.closest('.plan-switcher'))closePlanPicker();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('plan-picker').hidden){closePlanPicker();$('library-open').focus();}});
  $('library-close').addEventListener('click',()=>showEditor(editorTab));
  $('library-new').addEventListener('click',startNewPlan);
  $('library-search').addEventListener('input',renderLibrary);
  $('library-save-as').addEventListener('click',()=>showNameDialog({kind:'save-as',name:Array.from(activePlanId?t("plans_293", plan.name):plan.name).slice(0,120).join('')}));
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
      catch(error){closingNative=false;notify(t("plans_294", error.message),'error');}
    });
    await nativeCommand('frontend_ready');
  }else{
    window.addEventListener('pagehide',()=>{if(plan){fetch('/api/draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({active_id:activePlanId,workspace:captureWorkspace()}),keepalive:true}).catch(()=>{});}});
  }
}
