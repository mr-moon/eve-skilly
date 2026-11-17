"use strict";
let accelerationSettings={},acceleratorTypes=[],accelerationTimer,accelerationGeneration=0;
let accelerationReport=null,accelerationReportKey='',accelerationRequestKey='',accelerationError='';
function accelerationKey(){return selectedCharacter?String(selectedCharacter):'global';}
function currentAccelerationSettings(){return accelerationSettings[accelerationKey()]||{accelerator_id:77919,quantity:1,injector:'large',use_unallocated:true,biology_override:null,total_sp_override:null,custom:null};}
function resetAcceleration(){
  clearTimeout(accelerationTimer);accelerationGeneration++;
  accelerationReport=null;accelerationReportKey='';accelerationRequestKey='';accelerationError='';
  $('acceleration-dialog')?.close();
}
function accelerationContextKey(){
  if(!activeSchedule())return '';
  return JSON.stringify([calculationKey,selectedCharacter,selectedCharacter?selectedAdaptation()?.computed_at:calculatedAt.getTime(),currentAccelerationSettings()]);
}
function paintInjectorColumn(report){
  const rows=activeSchedule()?.rows||[];
  document.querySelectorAll('#queue td[data-queue-index]').forEach(cell=>{
    const index=Number(cell.dataset.queueIndex),point=report?.checkpoints?.[index+1],row=rows[index];
    if(!report&&!accelerationError&&cell.dataset.injectorResolved==='true'){cell.setAttribute('aria-busy','true');return;}
    if(!point||!row||point.skill!==row.name||point.level!==row.level){cell.textContent=accelerationError?'—':'…';cell.title=accelerationError||t("acceleration_001");return;}
    cell.textContent=formatNumber(point.injectors);
    cell.dataset.injectorResolved='true';cell.setAttribute('aria-busy','false');
    cell.title=t("acceleration_002", point.skill, roman[point.level], formatNumber(point.remaining_sp), formatNumber(point.total_sp), formatNumber(point.sp_each));
  });
  $('injector-column-kind').textContent=t("acceleration_003", currentAccelerationSettings().injector==='small'?'Small':'Large');
}
function fillInjectorControls(){
  const settings=currentAccelerationSettings();
  $('acceleration-injector').value=settings.injector;
  $('acceleration-use-free').checked=settings.use_unallocated;
  if(document.activeElement!==$('acceleration-start-sp'))$('acceleration-start-sp').value=settings.total_sp_override??(selectedCharacter?currentCharacter()?.total_sp??0:0);
  $('acceleration-sp-source').textContent=settings.total_sp_override!==null?t("acceleration_004"):selectedCharacter?t("acceleration_005"):t("acceleration_006");
}
function paintAccelerationSummary(){
  const report=accelerationReport;
  const preserve=typeof hasDashboardView!=='undefined'&&hasDashboardView&&!report&&!accelerationError&&Boolean(plan?.goals.length)&&$('booster-time').textContent&&$('booster-time').textContent!=='—';
  $('booster-summary').setAttribute('aria-busy',String(!report&&!accelerationError&&Boolean(plan?.goals.length)));
  $('booster-summary').disabled=!activeSchedule()||(!report&&!accelerationError);
  if(preserve)return;
  $('booster-time').textContent=report?duration(report.selected.days):accelerationError?t("acceleration_007"):'—';
  const waiting=activeSchedule()?t("acceleration_008"):plan?.goals.length?t("acceleration_009"):t("acceleration_010");
  $('booster-note').textContent=report?t("acceleration_011", report.selected.requested, report.selected.accelerator.name):accelerationError?t("acceleration_012"):waiting;
  $('booster-note').title=report?t("acceleration_013", report.selected.accelerator.name, duration(report.selected.saved_days), report.selected.unavailable?t("acceleration_014"):'', report.selected.expired?t("acceleration_015"):''):accelerationError;
  $('injector-info').textContent=report?t("acceleration_016", formatNumber(report.finish_now.count), formatNumber(report.finish_now.needed_sp), formatNumber(report.finish_now.unallocated_used), formatNumber(report.finish_now.received_sp), formatNumber(report.finish_now.excess_sp)):'';
  paintInjectorColumn(report);
}
function renderAccelerationControls(){
  fillInjectorControls();
  const key=accelerationContextKey();
  $('booster-summary').disabled=!key;
  if(!key){
    if(accelerationReportKey||accelerationRequestKey){clearTimeout(accelerationTimer);accelerationGeneration++;}
    accelerationReport=null;accelerationReportKey='';accelerationRequestKey='';accelerationError='';
    paintAccelerationSummary();return;
  }
  if(key===accelerationReportKey||key===accelerationRequestKey){paintAccelerationSummary();return;}
  clearTimeout(accelerationTimer);accelerationGeneration++;
  accelerationReport=null;accelerationReportKey='';accelerationError='';accelerationRequestKey=key;
  paintAccelerationSummary();accelerationTimer=setTimeout(calculateAcceleration,150);
}
function characterBiology(){return selectedCharacter?currentCharacter()?.biology_level??0:0;}
function fillBiologyControl(){
  const settings=currentAccelerationSettings(),manual=settings.biology_override!=null;
  $('acceleration-biology').value=String(manual?settings.biology_override:characterBiology());
  $('acceleration-biology-source').textContent=manual?t("acceleration_017"):selectedCharacter?t("acceleration_018", currentCharacter()?.name||t("acceleration_019")):t("acceleration_020");
  $('acceleration-reset-biology').hidden=!manual;
  $('acceleration-reset-biology').textContent=selectedCharacter?t("acceleration_021", roman[characterBiology()]):t("acceleration_022");
}
function chooseAccelerator(id){
  accelerationSettings[accelerationKey()]={...currentAccelerationSettings(),accelerator_id:id};
  scheduleAccelerationReport({target:$('acceleration-add-custom')});
  document.querySelectorAll('[data-accelerator-id]').forEach(button=>{
    const selected=Number(button.dataset.acceleratorId)===id;
    button.setAttribute('aria-pressed',String(selected));button.closest('tr').classList.toggle('selected-accelerator',selected);
  });
}
function fillAccelerationControls(){
  const settings=currentAccelerationSettings();
  $('acceleration-quantity').value=settings.quantity;
  fillBiologyControl();
  fillInjectorControls();
  $('acceleration-custom-name').value=settings.custom?.name||t("acceleration_023");
  $('acceleration-custom-bonus').value=settings.custom?.bonus??10;
  $('acceleration-custom-hours').value=settings.custom?.base_hours??24;
  $('acceleration-custom-expiry').value=settings.custom?.use_before?new Date(settings.custom.use_before).toISOString().slice(0,16):'';
  $('acceleration-custom').hidden=settings.accelerator_id!==0;
  $('acceleration-sp-source').textContent=settings.total_sp_override!==null?t("acceleration_004"):selectedCharacter?t("acceleration_005"):t("acceleration_006");
}
function readAccelerationSettings(){
  const settings={accelerator_id:currentAccelerationSettings().accelerator_id,quantity:$('acceleration-quantity').valueAsNumber,
    injector:$('acceleration-injector').value,use_unallocated:$('acceleration-use-free').checked,
    biology_override:currentAccelerationSettings().biology_override??null,
    total_sp_override:currentAccelerationSettings().total_sp_override,custom:null};
  if(settings.accelerator_id===0){
    const expiry=$('acceleration-custom-expiry').value;
    settings.custom={id:0,name:$('acceleration-custom-name').value.trim(),bonus:$('acceleration-custom-bonus').valueAsNumber,
      base_hours:$('acceleration-custom-hours').valueAsNumber,use_before:expiry?Date.parse(`${expiry}${expiry.length===16?':00':''}Z`):null};
  }
  return settings;
}
function setAccelerationStatus(message,pending=false){
  $('acceleration-status').textContent=message;
  $('acceleration-status').classList.toggle('acceleration-error',false);
  $('acceleration-output').setAttribute('aria-busy',String(pending));
  $('acceleration-output').classList.toggle('is-pending',pending);
}
function scheduleAccelerationReport(event){
  accelerationGeneration++;clearTimeout(accelerationTimer);
  accelerationRequestKey='';
  const settings=event?.target.closest('#injector-settings')?{...currentAccelerationSettings(),injector:$('acceleration-injector').value,use_unallocated:$('acceleration-use-free').checked}:readAccelerationSettings();
  if(event?.target.id==='acceleration-biology')settings.biology_override=Number($('acceleration-biology').value);
  if(event?.target.id==='acceleration-start-sp'){settings.total_sp_override=$('acceleration-start-sp').valueAsNumber;$('acceleration-sp-source').textContent=t("acceleration_004");}
  $('acceleration-custom').hidden=settings.accelerator_id!==0;
  if(!Number.isInteger(settings.quantity)||settings.quantity<0||settings.quantity>10000||settings.total_sp_override!==null&&(!Number.isSafeInteger(settings.total_sp_override)||settings.total_sp_override<0||settings.total_sp_override>1e12)){showAccelerationError(new Error(t("acceleration_024")));$('injector-error').hidden=false;$('injector-error').textContent=t("acceleration_025");return;}
  if(settings.custom&&(!settings.custom.name||!Number.isFinite(settings.custom.bonus)||settings.custom.bonus<=0||settings.custom.bonus>30||!Number.isFinite(settings.custom.base_hours)||settings.custom.base_hours<=0||settings.custom.base_hours>1000||settings.custom.use_before!==null&&!Number.isFinite(settings.custom.use_before))){showAccelerationError(new Error(t("acceleration_026")));return;}
  accelerationSettings[accelerationKey()]=settings;fillBiologyControl();queueDraft();
  $('injector-error').hidden=true;
  accelerationGeneration++;clearTimeout(accelerationTimer);
  setAccelerationStatus(t("acceleration_027"),true);
  accelerationReport=null;accelerationReportKey='';accelerationError='';accelerationRequestKey=accelerationContextKey();paintAccelerationSummary();
  accelerationTimer=setTimeout(()=>calculateAcceleration().catch(showAccelerationError),200);
}
function showAccelerationError(error){
  setAccelerationStatus(`${error.message}${$('acceleration-output').childElementCount?t("acceleration_028"):''}`);
  $('acceleration-status').classList.add('acceleration-error');
  $('acceleration-output').classList.add('is-stale');
}
async function calculateAcceleration(){
  const key=accelerationContextKey();if(!key)return;
  clearTimeout(accelerationTimer);
  const generation=++accelerationGeneration;
  accelerationRequestKey=key;
  try{
    const report=await api('/api/acceleration/report',{workspace:captureWorkspace(),character_id:selectedCharacter,schedule_mode:'optimized',settings:currentAccelerationSettings()});
    if(generation!==accelerationGeneration||key!==accelerationContextKey())return;
    accelerationReport=report;accelerationReportKey=key;accelerationRequestKey='';accelerationError='';
    $('injector-error').hidden=true;
    paintAccelerationSummary();if($('acceleration-dialog').open)renderAccelerationReport(report);
  }catch(error){
    if(generation!==accelerationGeneration||key!==accelerationContextKey())return;
    accelerationReport=null;accelerationReportKey=key;accelerationRequestKey='';accelerationError=error.message;
    $('injector-error').hidden=false;$('injector-error').textContent=error.message;
    paintAccelerationSummary();if($('acceleration-dialog').open)showAccelerationError(error);
  }
}
function renderAccelerationReport(report){
  const selected=report.selected;
  setAccelerationStatus('');$('acceleration-output').classList.remove('is-stale');
  const rows=report.comparisons.map(type=>t("acceleration_029", type.accelerator.id, type.accelerator.id===selected.accelerator.id?'selected-accelerator':'', type.accelerator.id, type.accelerator.id===selected.accelerator.id, esc(type.accelerator.name), type.accelerator.bonus, type.accelerator.base_hours/24, duration(type.days), duration(type.saved_days), type.used, type.requested, type.unavailable?t("acceleration_014"):'')).join('');
  $('acceleration-output').innerHTML=t("acceleration_030", selected.requested, rows, duration(selected.days), duration(selected.saved_days), report.original_days?(100*selected.saved_days/report.original_days).toFixed(1):'0', formatNumber(selected.extra_sp), selected.used, selected.requested, selected.unused, duration(report.original_days), roman[report.biology], report.duration_bonus?t("acceleration_031", report.duration_bonus):'', selected.unavailable?t("acceleration_032"):'', selected.expired?t("acceleration_033"):'', selected.activations.map((dose,i)=>`<tr><td>${i+1}</td><td>${duration(dose.start_day,true)}</td><td>${duration(dose.end_day,true)}</td><td>${roman[dose.biology]}</td></tr>`).join('')||t("acceleration_034"));
}
async function openAcceleration(){
  await action(t("acceleration_035"),async()=>{
    if(!acceleratorTypes.length)acceleratorTypes=(await api('/api/acceleration/catalog',{})).accelerators;
    fillAccelerationControls();$('acceleration-context').textContent=t("acceleration_036", plan.name, selectedCharacter?currentCharacter()?.name||t("acceleration_037"):t("acceleration_038"));
    $('acceleration-dialog').showModal();
    if(accelerationReportKey===accelerationContextKey()&&accelerationReport)renderAccelerationReport(accelerationReport);
    else{$('acceleration-output').replaceChildren();setAccelerationStatus(t("acceleration_039"),true);await calculateAcceleration();}
    $('acceleration-quantity').focus();
  });
}
function initAcceleration(){
  $('booster-summary').addEventListener('click',openAcceleration);
  $('acceleration-close').addEventListener('click',()=>$('acceleration-dialog').close());
  $('acceleration-dialog').addEventListener('close',renderAccelerationControls);
  $('acceleration-add-custom').addEventListener('click',()=>chooseAccelerator(0));
  $('acceleration-output').addEventListener('click',event=>{
    const row=event.target.closest('[data-accelerator-row]');if(row)chooseAccelerator(Number(row.dataset.acceleratorRow));
  });
  $('acceleration-reset-biology').addEventListener('click',()=>{
    accelerationSettings[accelerationKey()]={...currentAccelerationSettings(),biology_override:null};
    fillBiologyControl();scheduleAccelerationReport({target:$('acceleration-reset-biology')});
  });
  $('acceleration-form').addEventListener('submit',event=>event.preventDefault());
  $('acceleration-form').addEventListener('input',scheduleAccelerationReport);
  $('injector-settings').addEventListener('input',scheduleAccelerationReport);
  $('acceleration-reset-sp').addEventListener('click',()=>{
    const settings={...currentAccelerationSettings(),total_sp_override:null};accelerationSettings[accelerationKey()]=settings;
    $('acceleration-start-sp').value=selectedCharacter?currentCharacter()?.total_sp??0:0;
    $('acceleration-sp-source').textContent=selectedCharacter?t("acceleration_005"):t("acceleration_006");
    scheduleAccelerationReport({target:$('acceleration-reset-sp')});
  });
}
