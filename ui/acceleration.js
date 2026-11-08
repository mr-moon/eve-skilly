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
    if(!point||!row||point.skill!==row.name||point.level!==row.level){cell.textContent=accelerationError?'—':'…';cell.title=accelerationError||'Расчёт инжекторов…';return;}
    cell.textContent=formatNumber(point.injectors);
    cell.title=`После ${point.skill} ${roman[point.level]}: осталось ${formatNumber(point.remaining_sp)} SP; общие SP — ${formatNumber(point.total_sp)}; первая банка даст ${formatNumber(point.sp_each)} SP. Количество на весь остаток плана; строки не суммируются.`;
  });
  $('injector-column-kind').textContent=`${currentAccelerationSettings().injector==='small'?'Small':'Large'} · после уровня`;
}
function fillInjectorControls(){
  const settings=currentAccelerationSettings();
  $('acceleration-injector').value=settings.injector;
  $('acceleration-use-free').checked=settings.use_unallocated;
  if(document.activeElement!==$('acceleration-start-sp'))$('acceleration-start-sp').value=settings.total_sp_override??(selectedCharacter?currentCharacter()?.total_sp??0:0);
  $('acceleration-sp-source').textContent=settings.total_sp_override!==null?'SP заданы вручную':selectedCharacter?'Общие SP персонажа из ESI':'Общий план: старт с 0 SP';
}
function paintAccelerationSummary(){
  const report=accelerationReport;
  $('booster-time').textContent=report?duration(report.selected.days):accelerationError?'Недоступно':'—';
  const waiting=activeSchedule()?'Считаем…':plan?.goals.length?'Очередь обновляется…':'Добавьте навыки';
  $('booster-note').textContent=report?`${report.selected.requested} шт. · ${report.selected.accelerator.name}`:accelerationError?'Нажмите для повторной попытки':waiting;
  $('booster-note').title=report?`${report.selected.accelerator.name} · экономия ${duration(report.selected.saved_days)}${report.selected.unavailable?' · нет нужного навыка':''}${report.selected.expired?' · ограничен срок применения':''}`:accelerationError;
  $('injector-info').textContent=report?`Сейчас: ${formatNumber(report.finish_now.count)} банок на ${formatNumber(report.finish_now.needed_sp)} SP. Учтено свободных SP: ${formatNumber(report.finish_now.unallocated_used)}. Банки дадут ${formatNumber(report.finish_now.received_sp)} SP; остаток — ${formatNumber(report.finish_now.excess_sp)} SP.`:'';
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
  $('acceleration-biology-source').textContent=manual?'Задано вручную':selectedCharacter?`Из навыков ${currentCharacter()?.name||'персонажа'}`:'Общий план: 0';
  $('acceleration-reset-biology').hidden=!manual;
  $('acceleration-reset-biology').textContent=selectedCharacter?`Вернуть Biology персонажа · ${roman[characterBiology()]}`:'Вернуть Biology 0';
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
  $('acceleration-custom-name').value=settings.custom?.name||'Ивентовый accelerator';
  $('acceleration-custom-bonus').value=settings.custom?.bonus??10;
  $('acceleration-custom-hours').value=settings.custom?.base_hours??24;
  $('acceleration-custom-expiry').value=settings.custom?.use_before?new Date(settings.custom.use_before).toISOString().slice(0,16):'';
  $('acceleration-custom').hidden=settings.accelerator_id!==0;
  $('acceleration-sp-source').textContent=settings.total_sp_override!==null?'SP заданы вручную':selectedCharacter?'Общие SP персонажа из ESI':'Общий план: старт с 0 SP';
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
  if(event?.target.id==='acceleration-start-sp'){settings.total_sp_override=$('acceleration-start-sp').valueAsNumber;$('acceleration-sp-source').textContent='SP заданы вручную';}
  $('acceleration-custom').hidden=settings.accelerator_id!==0;
  if(!Number.isInteger(settings.quantity)||settings.quantity<0||settings.quantity>10000||settings.total_sp_override!==null&&(!Number.isSafeInteger(settings.total_sp_override)||settings.total_sp_override<0||settings.total_sp_override>1e12)){showAccelerationError(new Error('Проверьте количество бустеров и общие SP.'));$('injector-error').hidden=false;$('injector-error').textContent='Укажите корректные общие SP: целое число от 0 до 1 трлн.';return;}
  if(settings.custom&&(!settings.custom.name||!Number.isFinite(settings.custom.bonus)||settings.custom.bonus<=0||settings.custom.bonus>30||!Number.isFinite(settings.custom.base_hours)||settings.custom.base_hours<=0||settings.custom.base_hours>1000||settings.custom.use_before!==null&&!Number.isFinite(settings.custom.use_before))){showAccelerationError(new Error('Проверьте параметры своего бустера.'));return;}
  accelerationSettings[accelerationKey()]=settings;fillBiologyControl();queueDraft();
  $('injector-error').hidden=true;
  accelerationGeneration++;clearTimeout(accelerationTimer);
  setAccelerationStatus('Обновляем расчёт…',true);
  accelerationReport=null;accelerationReportKey='';accelerationError='';accelerationRequestKey=accelerationContextKey();paintAccelerationSummary();
  accelerationTimer=setTimeout(()=>calculateAcceleration().catch(showAccelerationError),200);
}
function showAccelerationError(error){
  setAccelerationStatus(`${error.message}${$('acceleration-output').childElementCount?' Показан предыдущий расчёт.':''}`);
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
  const rows=report.comparisons.map(type=>`<tr data-accelerator-row="${type.accelerator.id}" class="${type.accelerator.id===selected.accelerator.id?'selected-accelerator':''}"><td><button type="button" data-accelerator-id="${type.accelerator.id}" aria-pressed="${type.accelerator.id===selected.accelerator.id}">${esc(type.accelerator.name)}</button><small>+${type.accelerator.bonus} · базово ${type.accelerator.base_hours/24}д</small></td><td>${duration(type.days)}</td><td>−${duration(type.saved_days)}</td><td>${type.used} / ${type.requested}${type.unavailable?' · нет нужного навыка':''}</td></tr>`).join('');
  $('acceleration-output').innerHTML=`<h3>Сравнение бустеров · по ${selected.requested} шт.</h3><div class="acceleration-table-scroll"><table class="acceleration-table"><thead><tr><th>Тип</th><th>Срок очереди</th><th>Экономия</th><th>Использовано</th></tr></thead><tbody>${rows}</tbody></table></div><section class="acceleration-details"><h3>Подробности выбранного сценария: SP, дозы и эффективность</h3><div class="booster-scenario"><dl>
    <div><dt>Срок с бустером</dt><dd>${duration(selected.days)}</dd></div>
    <div><dt>Экономия</dt><dd>${duration(selected.saved_days)} · ${report.original_days?(100*selected.saved_days/report.original_days).toFixed(1):'0'}%</dd></div>
    <div><dt>SP от ускорения обучения</dt><dd>${formatNumber(selected.extra_sp)} SP</dd></div>
    <div><dt>Использовано доз</dt><dd>${selected.used} из ${selected.requested} · осталось ${selected.unused}</dd></div>
    </dl><p class="muted-note">Без бустера: ${duration(report.original_days)} · Biology при старте: ${roman[report.biology]}${report.duration_bonus?` · бонус импланта +${report.duration_bonus}%`:''}</p>
    ${selected.unavailable?'<p class="character-warning">Для этого бустера нужен Science I. Он не изучен и не завершается в очереди.</p>':''}
    ${selected.expired?'<p class="character-warning">Не все дозы можно применить до указанного срока.</p>':''}</div></section>
    
    <section class="settings-section"><h3>Применение выбранного бустера</h3><div class="acceleration-table-scroll"><table class="acceleration-table"><thead><tr><th>Доза</th><th>Начало</th><th>Конец действия</th><th>Biology при применении</th></tr></thead><tbody>${selected.activations.map((dose,i)=>`<tr><td>${i+1}</td><td>${duration(dose.start_day,true)}</td><td>${duration(dose.end_day,true)}</td><td>${roman[dose.biology]}</td></tr>`).join('')||'<tr><td colspan="4">Дозы не применяются.</td></tr>'}</tbody></table></div></section>`;
}
async function openAcceleration(){
  await action('Открываем сравнение бустеров…',async()=>{
    if(!acceleratorTypes.length)acceleratorTypes=(await api('/api/acceleration/catalog',{})).accelerators;
    fillAccelerationControls();$('acceleration-context').textContent=`${plan.name} · ${selectedCharacter?currentCharacter()?.name||'персонаж':'общий план'} · оптимизированная очередь`;
    $('acceleration-dialog').showModal();
    if(accelerationReportKey===accelerationContextKey()&&accelerationReport)renderAccelerationReport(accelerationReport);
    else{$('acceleration-output').replaceChildren();setAccelerationStatus('Рассчитываем…',true);await calculateAcceleration();}
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
    $('acceleration-sp-source').textContent=selectedCharacter?'Общие SP персонажа из ESI':'Общий план: старт с 0 SP';
    scheduleAccelerationReport({target:$('acceleration-reset-sp')});
  });
}
