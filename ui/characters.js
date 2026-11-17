"use strict";
let replacementChoices={}, characterExtraRemaps={}, characterRemaps={}, adaptations=[], selectedCharacter=null, characterState={characters:[],login:{}}, characterPoll;
let lastContextCharacter=null;
let trackingPlanPending=false;
function trackedPlan(id){return characterState.tracked_plans?.[id]||null;}
function trackedPlanName(id){return trackedPlan(id)?.name||t("characters_134");}
function renderPlanTracking(){
  const tracked=trackedPlan(selectedCharacter),attached=Boolean(activePlanId&&tracked?.id===activePlanId);
  $('character-plan-actions').hidden=!selectedCharacter;
  $('character-track-plan').hidden=!selectedCharacter||attached;
  const name=currentCharacter()?.name||t("app_052");
  $('character-plan-target').textContent=name;
  $('character-plan-target').title=name;
  $('character-track-plan').textContent=t("characters_135");
  $('character-track-plan').disabled=attached||trackingPlanPending||!plan?.goals.length;
  $('character-track-plan').title=!plan?.goals.length?t("characters_136"):t("characters_137", plan.name, name);
  $('character-untrack-plan').textContent=t("characters_138");
  $('character-untrack-plan').hidden=!selectedCharacter||!attached;
  $('character-untrack-plan').disabled=trackingPlanPending;
}
async function togglePlanTracking(detach=false){
  if(busy||trackingPlanPending||!selectedCharacter)return;
  const characterId=selectedCharacter,previous=trackedPlan(characterId);
  if(detach&&previous?.id!==activePlanId)return;
  if(!detach&&previous?.id===activePlanId)return;
  trackingPlanPending=true;renderPlanTracking();
  try{
    if(!detach&&previous&&!await confirmAction(t("characters_139", previous.name, plan.name, currentCharacter()?.name)))return;
    if(!detach&&(!activePlanId||isDirty())&&!await savePlan())return;
    await action(detach?t("characters_140"):t("characters_141"),async()=>{
      try{
        const data=await api('/api/characters/track-plan',{id:characterId,plan_id:detach?null:activePlanId,expected_plan_id:previous?.id||null});
        characterState.tracked_plans=data.tracked_plans;
        renderCharacterList();renderCharacterContext();
        if(typeof renderTracking==='function')renderTracking();
        notify(detach?t("characters_142"):t("characters_143"));
      }catch(error){await loadCharacters();throw error;}
    });
  }finally{trackingPlanPending=false;renderPlanTracking();}
}
function selectedAdaptation(){return adaptations.find(a=>a.character_id===selectedCharacter);}
function currentCharacter(){return characterState.characters.find(c=>c.id===selectedCharacter)||selectedAdaptation()?.character;}
function adaptationStale(adaptation=selectedAdaptation()){
  if(!adaptation)return true;
  const current=characterState.characters.find(c=>c.id===selectedCharacter);
  return Boolean(characterExtraRemaps[selectedCharacter])!==Boolean(adaptation.extra_remap) || (replacementChoices[selectedCharacter]!==undefined && replacementChoices[selectedCharacter]!==adaptation.replace_implants) || adaptation.remap_count!==(characterRemaps[selectedCharacter]??currentCharacter()?.remap_count) || adaptation.source_key!==calculationKey || Boolean(current&&current.fetched_at!==adaptation.snapshot_at);
}
function displayComparison(){return selectedCharacter ? adaptationStale()?null:selectedAdaptation()?.comparison : result;}
function renderRemapTradeoff(){
  const a=selectedAdaptation(),offer=a?.remap_tradeoff,character=currentCharacter();
  const valid=Boolean(selectedCharacter&&offer&&a.source_key===calculationKey&&a.snapshot_at===character?.fetched_at&&a.remap_count===(characterRemaps[selectedCharacter]??character?.remap_count)&&a.replace_implants===(replacementChoices[selectedCharacter]??a.replace_implants));
  $('remap-tradeoff').hidden=!valid;
  $('extra-remap').checked=Boolean(characterExtraRemaps[selectedCharacter]);
  if(!valid)return;
  $('remap-tradeoff-note').textContent=t("characters_144", duration(offer.conservative_days), offer.conservative_remaps, duration(offer.fastest_days), offer.fastest_remaps);
  $('extra-remap-saving').textContent=t("characters_145", duration(offer.saved_days));
}
function renderCharacterContext(){
  const select=$('character-options');if(!select||!plan)return;
  const names=new Map(characterState.characters.map(c=>[c.id,c.name]));
  for(const a of adaptations)if(!names.has(a.character_id))names.set(a.character_id,a.character_name);
  if(selectedCharacter)lastContextCharacter=selectedCharacter;
  if(lastContextCharacter&&!names.has(lastContextCharacter))lastContextCharacter=null;
  const options=Array.from(names,([id,name])=>`<button type="button" data-context-character="${id}" aria-pressed="${id===selectedCharacter}"><span>${esc(name)}<small>${esc(trackedPlanName(id))}</small></span>${id===selectedCharacter?'<span aria-hidden="true">✓</span>':''}</button>`).join('')||t("characters_146");
  if(select.innerHTML!==options)select.innerHTML=options;
  $('character-active').innerHTML=`<span>${esc(names.get(lastContextCharacter)||t("app_052"))}</span>${lastContextCharacter?`<small>${esc(trackedPlanName(lastContextCharacter))}</small>`:''}`;
  $('character-active').setAttribute('aria-pressed',String(Boolean(selectedCharacter)));
  $('character-none').setAttribute('aria-pressed',String(!selectedCharacter));
  const personal=Boolean(selectedCharacter),character=currentCharacter(),adaptation=selectedAdaptation();
  renderPlanTracking();
  $('character-settings').hidden=!personal;
  $('implant-replacement-controls').hidden=!personal;
  $('implant-optimization-control').hidden=personal;
  renderRemapTradeoff();
  $('empty-queue').querySelector('h1').textContent=plan.goals.length?t("acceleration_009"):t("characters_147");
  $('empty-queue').querySelector('p').textContent=plan.goals.length?t("characters_148"):t("characters_149");
  $('remap-count').disabled=false;$('implant-enabled').disabled=personal;
  updateTotal();
  if(personal&&character)$('remap-count').value=characterRemaps[selectedCharacter]??character.remap_count;
  $('remap-reset').hidden=!personal||characterRemaps[selectedCharacter]===undefined;
  if(personal&&character)$('remap-summary').textContent+=` ESI: ${character.remap_count}.${characterRemaps[selectedCharacter]!==undefined?t("characters_150"):''}`;
  $('character-active').title=lastContextCharacter?`${names.get(lastContextCharacter)} · ${trackedPlanName(lastContextCharacter)}`:t("characters_151");
  if(!personal){$('character-context-note').textContent=t("characters_152");return;}
  $('character-context-note').textContent=adaptationStale()?t("characters_153"):t("characters_154");

  if(!character)return;
  const fetched=new Date(character.fetched_at).toLocaleString(uiLocale());
  $('character-info').textContent=t("characters_155", fetched);
  $('character-implants').innerHTML=character.implants.length?t("characters_156")+character.implants.map(i=>`<div class="character-implant"><span class="implant-icon-slot" aria-hidden="true"><img class="implant-icon" src="https://images.evetech.net/types/${Number(i.id)}/icon?size=64" width="32" height="32" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span><span>${esc(i.name)}</span></div>`).join(''):t("characters_157");
  const warnings=[...(character.warnings||[])];
  if(adaptationStale()&&adaptation)warnings.push(t("characters_158"));
  if(character.next_remap)warnings.push(t("characters_159", new Date(character.next_remap).toLocaleDateString(uiLocale())));
  $('character-warning').textContent=warnings.map(value=>localizeServerText(value)).join(' ');
  $('replace-implants').checked=replacementChoices[selectedCharacter]??adaptation?.replace_implants??false;
  if(adaptation&&!adaptationStale()&&!adaptation.comparison.optimized.rows.length){
    $('top-time').textContent=t("characters_160");$('empty-queue').hidden=true;
  }
}
async function selectCharacter(id){
  selectedCharacter=id||null;view='queue';panel='plan';scheduleMode='optimized';showEditor('queue');
  render();queueDraft();
  const character=currentCharacter();
  if(character&&Date.now()-character.fetched_at>=TRACKING_REFRESH_MS)refreshTrackingCharacter(character.id);
}
function renderCharacterList(){
  $('characters-list').innerHTML=characterState.characters.map(c=>t("characters_161", esc(c.name), esc(trackedPlanName(c.id)), c.skill_count, c.remap_count, new Date(c.fetched_at).toLocaleString(uiLocale()), trackedPlan(c.id)?t("characters_162", c.id):'', c.id, c.id)).join('')||t("characters_163");
  $('character-login-status').textContent=localizeServerText(characterState.login?.message)||'';
  $('character-connect').disabled=['waiting','loading'].includes(characterState.login?.phase);
}
async function loadCharacters(){characterState=await api('/api/characters');renderCharacterList();if(plan)renderDashboard();}
function pollCharacters(){
  clearTimeout(characterPoll);
  if(!['waiting','loading'].includes(characterState.login?.phase))return;
  characterPoll=setTimeout(async()=>{
    try{await loadCharacters();if(characterState.login.phase==='connected'){notify(t("characters_164", characterState.characters.find(c=>c.id===characterState.login.character_id)?.name||t("app_052")));}else pollCharacters();}
    catch(error){notify(error.message,'error');}
  },1500);
}
async function initCharacters(){
  $('character-implants').addEventListener('error',event=>{
    if(event.target.classList?.contains('implant-icon'))event.target.hidden=true;
  },true);
  await loadCharacters();

  $('characters-close').addEventListener('click',()=>showEditor(editorTab));
  $('character-none').addEventListener('click',()=>selectCharacter(null));
  const closePicker=()=>{$('character-view').hidden=true;$('character-picker-toggle').setAttribute('aria-expanded','false');};
  $('character-track-plan').addEventListener('click',()=>{closePicker();togglePlanTracking();});
  $('character-untrack-plan').addEventListener('click',()=>{closePicker();togglePlanTracking(true);});
  const openPicker=()=>{$('character-view').hidden=false;$('character-picker-toggle').setAttribute('aria-expanded','true');};
  $('character-active').addEventListener('click',()=>{
    if(lastContextCharacter){closePicker();selectCharacter(lastContextCharacter);}else openPicker();
  });
  $('character-picker-toggle').addEventListener('click',()=>{$('character-view').hidden?openPicker():closePicker();});
  $('character-view').addEventListener('click',event=>{
    const item=event.target.closest('[data-context-character]');if(!item)return;
    closePicker();selectCharacter(Number(item.dataset.contextCharacter));
  });
  $('character-none').addEventListener('click',closePicker);
  document.addEventListener('click',event=>{if(!event.target.closest('.character-context-group'))closePicker();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('character-view').hidden){closePicker();$('character-picker-toggle').focus();}});
  $('character-manage').addEventListener('click',()=>action(t("characters_165"),async()=>{
    await loadCharacters();showPage('characters');pollCharacters();
  }));
  $('character-sync').addEventListener('click',()=>refreshTrackingCharacter(selectedCharacter,true));
  $('extra-remap').addEventListener('change',()=>{characterExtraRemaps[selectedCharacter]=$('extra-remap').checked;renderDashboard();queueDraft();});
  $('remap-reset').addEventListener('click',()=>{delete characterRemaps[selectedCharacter];renderDashboard();queueDraft();});
  $('replace-implants').addEventListener('change',()=>{replacementChoices[selectedCharacter]=$('replace-implants').checked;renderDashboard();queueDraft();});
  $('character-connect').addEventListener('click',()=>action(t("characters_166"),async()=>{
    await api('/api/characters/connect',{});await loadCharacters();pollCharacters();notify(t("characters_167"));
  }));
  $('characters-list').addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button||busy)return;
    if(button.dataset.syncCharacter)await refreshTrackingCharacter(Number(button.dataset.syncCharacter),true);
    if(button.dataset.openTracked){const id=Number(button.dataset.openTracked);await openSavedPlan(trackedPlan(id).id,id);}
    if(button.dataset.useCharacter){showEditor(editorTab);await selectCharacter(Number(button.dataset.useCharacter));}
  });
  pollCharacters();
}
