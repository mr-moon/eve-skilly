"use strict";

const $ = id => document.getElementById(id);
const attrs = ['Intelligence', 'Perception', 'Charisma', 'Willpower', 'Memory'];
const codes = ['INT', 'PER', 'CHA', 'WIL', 'MEM'];
const roman = ['0', 'I', 'II', 'III', 'IV', 'V'];
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
let plan, items = {}, result = null, preview = null;
let busy = false, revision = 0, previewTimer, statusTimer;
let view = 'queue', panel = 'add', scheduleMode = 'optimized', calculatedAt = new Date();

function newPlan() {
  return { name: 'Новый план', goals: [], attributes: [20,20,19,20,20], remap_count: 1, optimize_implants: true };
}
function notify(text, type = 'ok', persistent = false) {
  clearTimeout(statusTimer);
  $('status').textContent = text;
  $('status').className = type;
  $('status').hidden = false;
  if (!persistent) statusTimer = setTimeout(() => $('status').hidden = true, type === 'error' ? 12000 : 3500);
}
async function api(path, body) {
  if (nativeDesktop) return nativeCommand('request', { path, body: body ?? null });
  const response = await fetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
async function action(message, fn) {
  if (busy) return;
  busy = true;
  $('workspace').disabled = true;
  notify(message, 'busy', true);
  try {
    await fn();
    if ($('status').className === 'busy') $('status').hidden = true;
  } catch (error) {
    if (plan) renderDashboard();
    notify(error.message, 'error');
  } finally {
    busy = false;
    $('workspace').disabled = false;
  }
}
function activeSchedule() { return displayComparison()?.optimized || null; }
function skillName(id) { return items[id]?.name || `Type #${id}`; }
function formatNumber(value) { return Math.round(value).toLocaleString('ru-RU'); }
function plural(value, forms) { const n = Math.abs(value) % 100, last = n % 10; return forms[n > 10 && n < 15 ? 2 : last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2]; }
function compactSP(value) { return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value); }
function duration(days, compact = false) {
  const seconds = Math.max(0, Math.round(days * 86400));
  const d = Math.floor(seconds / 86400), h = Math.floor(seconds % 86400 / 3600);
  const m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  if (d) return compact ? `${d}д ${h}ч` : `${d}д ${h}ч ${m}м`;
  if (h) return `${h}ч ${m}м`;
  return compact ? `${m}м ${s}с` : `${m}м`;
}
function endDate(days) {
  return new Date((selectedCharacter ? selectedAdaptation()?.computed_at || Date.now() : calculatedAt.getTime()) + days * 86400000).toLocaleDateString('ru-RU');
}
function day(value) { return `день ${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}`; }
function levelOptions(selected, minimum = 1) {
  return roman.slice(1).map((label, i) => `<option value="${i+1}" ${selected === i+1 ? 'selected' : ''} ${i+1 < minimum ? 'disabled' : ''}>${label}</option>`).join('');
}
function setView(next) {
  view = next;
  showEditor(next);
}

function requiredLevels() {
  const minimums = new Map(), visited = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    visited.add(id);
    for (const r of items[id]?.skill?.requirements || []) {
      minimums.set(r.id, Math.max(minimums.get(r.id) || 0, r.level));
      visit(r.id);
    }
  }
  for (const goal of plan.goals) visit(goal.id);
  for(const [id,level] of fitMinimums())minimums.set(id,Math.max(minimums.get(id)||0,level));
  return minimums;
}
function renderCatalog() {
  $('skill-options').innerHTML = Object.values(items).filter(item => item.skill)
    .sort((a,b) => a.name.localeCompare(b.name)).map(item => `<option value="${esc(item.name)}"></option>`).join('');
}
let attributeDraft=null;
function attributeAllocationError(values){
  if(values.length!==5||values.some(v=>v===''||v===null||!Number.isInteger(Number(v))))return 'Укажите целые значения для всех пяти атрибутов.';
  if(values.some(v=>Number(v)<17||Number(v)>27))return 'Каждый базовый атрибут должен быть от 17 до 27.';
  const sum=values.reduce((total,value)=>total+Number(value),0);
  if(sum!==99)return sum<99?`Осталось распределить: ${99-sum}. Сумма должна быть 99.`:`Уберите лишние очки: ${sum-99}. Сумма должна быть 99.`;
  return '';
}
function rebalanceAttributes(values,index,requested){
  const next=values.map(Number),value=Number(requested);
  if(requested===''||!Number.isFinite(value))return next;
  next[index]=Math.max(17,Math.min(27,Math.round(value)));
  let difference=99-next.reduce((a,b)=>a+b,0);
  const others=next.map((_,i)=>i).filter(i=>i!==index).sort((a,b)=>difference<0?next[b]-next[a]||a-b:next[a]-next[b]||a-b);
  for(const i of others){
    const change=difference<0?Math.max(difference,17-next[i]):Math.min(difference,27-next[i]);
    next[i]+=change;difference-=change;
    if(!difference)break;
  }
  return next;
}
function attributeInputError(){return selectedCharacter?'':attributeAllocationError(attributeDraft||plan.attributes);}
function updateTotal(){
  const character=selectedCharacter?currentCharacter():null;
  const values=selectedCharacter?(character?.attributes||[]):(attributeDraft||plan.attributes);
  const sum=values.length===5&&values.every(v=>v!==''&&Number.isFinite(Number(v)))?values.reduce((a,b)=>a+Number(b),0):null;
  const error=selectedCharacter?'':attributeAllocationError(values);
  $('attribute-total').textContent=sum===null?'— / 99':`${sum} / 99`;
  $('attribute-total').dataset.invalid=String(Boolean(error));
  $('attribute-note').textContent=selectedCharacter?`${character?.name||'Персонаж'} · базовые атрибуты из ESI, без имплантов и бустеров. Изменяются в игре.`:'17–27 · сумма всегда 99 · остальные атрибуты балансируются автоматически';
  $('attribute-error').textContent='';$('attribute-error').hidden=true;
  document.querySelectorAll('[data-attr]').forEach(input=>{
    const index=Number(input.dataset.attr),value=values[index];
    input.readOnly=Boolean(selectedCharacter);input.disabled=false;
    if(input.value!==String(value??''))input.value=value??'';
    const invalid=!selectedCharacter&&(value===''||value===null||!Number.isInteger(Number(value))||Number(value)<17||Number(value)>27);
    input.setAttribute('aria-invalid',String(invalid));
    input.setCustomValidity(invalid?'Укажите целое число от 17 до 27':'');
  });
}

function renderControls() {
  attributeDraft=null;
  $('name').value = plan.name;
  $('remap-count').value = plan.remap_count ?? 1;
  $('implant-enabled').checked = plan.optimize_implants ?? true;
  $('attributes').innerHTML = attrs.map((name, i) => `<div class="attr-row"><label for="attr-${i}"><span class="attr-code">${codes[i]}</span>${name}</label><input id="attr-${i}" data-attr="${i}" type="number" min="17" max="27" step="1" aria-describedby="attribute-note attribute-error" value="${plan.attributes[i]}" aria-label="${name} база"></div>`).join('');
  updateTotal();
  renderCatalog();
}
function renderGoals() {
  if(goalDrag)return;
  const focused=document.activeElement?.closest('#goals button');
  const focusId=focused?.closest('.goal-row')?.dataset.goalId;
  const focusControl=focused?.dataset.dragGoal!==undefined?'.goal-drag-handle':focused?.dataset.level?`[data-level="${focused.dataset.level}"]`:'.goal-remove';
  const minimums = requiredLevels();
  for (const goal of plan.goals) goal.level = Math.max(goal.level, minimums.get(goal.id) || 1);
  $('goal-count').textContent = plan.goals.length;
  $('goals').innerHTML = plan.goals.length ? plan.goals.map((goal, i) => {
    const skill = items[goal.id]?.skill, minimum = minimums.get(goal.id) || 1;
    const name = esc(skillName(goal.id));
    const segments=[1,2,3,4,5].map(level=>`<button class="goal-level ${level<=goal.level?'filled':''}" data-set-goal-level="${i}" data-level="${level}" aria-label="${name}: уровень ${roman[level]}" aria-pressed="${goal.level===level}" title="${roman[level]}${level<minimum?` · требуется не ниже ${roman[minimum]}`:''}" ${level<minimum||planGroup?'disabled':''}></button>`).join('');
    return `<div class="goal-row" data-goal-id="${goal.id}"><button class="goal-drag-handle" data-drag-goal="${goal.id}" aria-label="Переместить ${name}" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" title="Перетащите для сортировки · Alt + ↑ / ↓" ${planGroup?'disabled':''}><span aria-hidden="true">⠿</span><small aria-hidden="true">${String(i+1).padStart(2,'0')}</small></button><div class="goal-info"><strong>${name}</strong><small>${skill?`${codes[skill.primary]} / ${codes[skill.secondary]} · rank ${skill.rank}`:'Загрузка данных'}${minimums.has(goal.id)?` · минимум ${roman[minimum]}${fitMinimums().has(goal.id)?' · требуется фитом':''}`:''}</small></div><div class="goal-levels" role="group" aria-label="Целевой уровень ${name}">${segments}</div><button class="icon-button goal-remove" data-remove-goal="${i}" aria-label="Удалить ${name}" ${minimums.has(goal.id)?'disabled title="Нужен для других навыков плана"':''}>×</button></div>`;
  }).join('') : '<div class="empty-goals">Вставьте фит или добавьте первый навык справа.</div>';
  if(focusId)document.querySelector(`[data-goal-id="${focusId}"] ${focusControl}`)?.focus({preventScroll:true});
}
function attributeColor(primary, secondary) { return `combo-${primary}-${secondary}`; }
function renderTimeline(rows) {
  const segments = [], pairs = new Map();
  for (const row of rows) {
    const days = row.end_day - row.start_day;
    const key = `${row.primary}-${row.secondary}`;
    const name = `${attrs[row.primary]} / ${attrs[row.secondary]}`;
    const last = segments.at(-1);
    if (last?.key === key) last.days += days;
    else segments.push({ key, primary: row.primary, secondary: row.secondary, name, days });
    const total = pairs.get(key) || { primary: row.primary, secondary: row.secondary, name, days: 0 };
    total.days += days; pairs.set(key, total);
  }
  $('timeline').innerHTML = segments.map(group => `<span class="timeline-segment ${attributeColor(group.primary, group.secondary)}" title="${esc(group.name)} · ${duration(group.days)}"></span>`).join('');
  Array.from($('timeline').children).forEach((element, i) => { element.style.flexGrow = String(segments[i].days); });
  $('legend').innerHTML = Array.from(pairs.values()).sort((a,b) => b.days-a.days)
    .map(group => `<span class="legend-item" title="${duration(group.days)}"><i class="legend-dot ${attributeColor(group.primary, group.secondary)}"></i>${esc(group.name)}</span>`).join('');
}
function scheduleEvents(schedule) {
  if (!schedule) return [];
  return [...schedule.remaps.map(event => ({ ...event, kind: 'remap' })),
    ...schedule.installations.map(event => ({ ...event, kind: 'implant' }))]
    .sort((a,b) => a.day-b.day || (a.kind === b.kind ? 0 : a.kind === 'remap' ? -1 : 1));
}
function implantLabels(event) {
  const names = ['Cybernetic Subprocessor','Ocular Filter','Social Adaptation Chip','Neural Boost','Memory Augmentation'];
  const grades = { 3: 'Basic', 4: 'Standard', 5: 'Improved' };
  return event.purchases.map((bonus,i) => bonus ? `${names[i]} - ${grades[bonus]} (${codes[i]} +${bonus})` : '').filter(Boolean);
}
function queueEventRow(event) {
  const isRemap = event.kind === 'remap';
  const when = event.day <= 1e-9 ? 'Перед началом обучения' : `Через ${duration(event.day)} · ${day(event.day)}`;
  const details = isRemap
    ? `<div class="event-attributes">${codes.map((code,i) => `<span>${code} <b>${event.attributes[i]}</b></span>`).join('')}</div>`
    : `<div class="event-items">${implantLabels(event).map(esc).join('<br>')}</div><div class="event-prerequisite">После Cybernetics ${roman[event.cybernetics]}, перед следующим навыком.</div>`;
  return `<tr class="queue-event queue-event-${event.kind}" data-event-kind="${event.kind}"><td class="event-icon-cell" aria-hidden="true">${isRemap ? '↗' : '◇'}</td><td colspan="8"><div class="event-heading"><strong>${isRemap ? 'Сделать remap' : 'Купить и установить импланты'}</strong><span>${when}</span></div>${details}</td></tr>`;
}
function renderQueue() {
  const schedule = activeSchedule(), rows = schedule?.rows || [], events = scheduleEvents(schedule);
  const targets = new Map();
  for (const row of rows) targets.set(row.id, Math.max(targets.get(row.id) || 0, row.level));
  $('empty-queue').hidden = rows.length > 0;
  const output = [];
  let nextEvent = 0;
  for (const [i, row] of rows.entries()) {
    while (nextEvent < events.length && events[nextEvent].day <= row.start_day + 1e-9) {
      output.push(queueEventRow(events[nextEvent++]));
    }
    const days = row.end_day - row.start_day;
    const rate = days > 0 ? row.points / (days * 24) : 0;
    const rank = items[row.id]?.skill?.rank ?? '—';
    const levels = [1,2,3,4,5].map(level => `<i class="level-block ${level <= row.level ? 'filled' : level <= targets.get(row.id) ? 'future' : ''}"></i>`).join('');
    output.push(`<tr class="skill-row" data-skill-id="${row.id}" data-skill-level="${row.level}"><td class="row-number">${String(i+1).padStart(2,'0')}</td><td class="skill-name-cell"><i class="skill-marker ${attributeColor(row.primary, row.secondary)}"></i>${esc(row.name)} <span class="roman-level">${roman[row.level]}</span></td><td class="time-column ${days >= 20 ? 'time-long' : days >= 5 ? 'time-warm' : ''}" title="${duration(days)}">${duration(days,true)}</td><td class="rank-column">${rank}</td><td class="attribute-column"><span class="attribute-chip attr-${row.primary}">${attrs[row.primary]}</span></td><td class="attribute-column"><span class="attribute-chip attr-${row.secondary}">${attrs[row.secondary]}</span></td><td class="rate-column">${formatNumber(rate)}</td><td class="level-column"><span class="level-blocks" role="img" aria-label="Этап обучения: уровень ${roman[row.level]}">${levels}</span></td><td class="injector-column" data-queue-index="${i}">…</td></tr>`);
  }
  while (nextEvent < events.length) output.push(queueEventRow(events[nextEvent++]));
  $('queue').innerHTML = output.join('');
  renderTimeline(rows);
}
function renderImplantStatus(){
  const personal=Boolean(selectedCharacter),character=personal?currentCharacter():null;
  const replace=personal&&(replacementChoices[selectedCharacter]??selectedAdaptation()?.replace_implants??false);
  $('implant-policy-note').textContent=personal
    ?`Учитываются текущие импланты и Cybernetics. ${replace?'Замена установленных имплантов разрешена.':'Занятые слоты защищены от замены.'}`
    :'+3 / +4 / +5 с учётом Cybernetics. Без ограничения по ISK, для учебного клона.';
  $('implant-current').hidden=!personal||!character;
  const schedule=activeSchedule(),installations=schedule?.installations||[];
  let message;
  if(!personal&&!plan.optimize_implants)message='Покупка учебных имплантов выключена.';
  else if(!schedule)message=plan.goals.length?'Покупки проверяются при оптимизации очереди.':'Добавьте цели, чтобы подобрать импланты.';
  else if(!schedule.rows.length)message='Цели уже выполнены — покупки не нужны.';
  else if(installations.length){
    const count=installations.reduce((sum,event)=>sum+event.purchases.filter(b=>b>0).length,0);
    message=`В очереди: ${count} ${plural(count,['имплант','импланта','имплантов'])}, ${installations.length} ${plural(installations.length,['этап покупки','этапа покупки','этапов покупки'])}.`;
  }else message=personal?(replace?'Новые импланты не сократили срок очереди с учётом обучения Cybernetics. Используются установленные.':'Используются установленные импланты. Чтобы сравнить их с улучшенными, разрешите замену.'):'Покупка имплантов с учётом обучения Cybernetics не сокращает эту очередь.';
  $('implant-purchases').textContent=message;
}
function renderRecommendations() {
  const result=displayComparison();
  $('method-section').hidden = !result;
  if (!result) return;
  $('method').textContent = `${result.searched_maps.toLocaleString('ru-RU')} распределений атрибутов. ${result.method} Fitting CPU/PG и Alpha-ограничения не проверяются. Импланты из EFT добавляют требования навыков; рекомендации относятся к отдельному учебному клону.`;
}
function renderSummary() {
  const result=displayComparison();
  const schedule = activeSchedule(), rows = schedule?.rows || [];
  const total = rows.reduce((sum, row) => sum + row.points, 0), unique = new Set(rows.map(row => row.id)).size;
  const time = schedule && rows.length ? duration(schedule.days) : '—';
  const finish = schedule && rows.length ? endDate(schedule.days) : '';
  $('top-time').textContent = time;
  $('top-time').title = time;
  $('top-count').textContent = `${rows.length} ${plural(rows.length,['уровень','уровня','уровней'])} · ${unique} ${plural(unique,['навык','навыка','навыков'])}`;
  $('top-finish').textContent = finish ? `Завершение ${finish}` : '';
  $('top-finish').title = 'Если начать обучение сейчас';
  $('top-sp').textContent = total ? `${compactSP(total)} SP` : '';
  $('top-saving').textContent = result ? duration(result.saved_days) : '—';
  $('top-saving-note').textContent = result ? `${(result.baseline.days ? 100*result.saved_days/result.baseline.days : 0).toFixed(1)}% меньше времени` : 'Подбор remap и имплантов';
  $('remap-summary').textContent = result ? `В оптимизированном плане: ${result.optimized.remaps.length} из ${selectedCharacter ? selectedAdaptation()?.remap_count ?? 0 : plan.remap_count} remap.` : 'Моменты выбираются автоматически.';
  $('export-queue').disabled = !rows.length;
  $('copy-queue').disabled = !rows.length;
  renderRecommendations();
  updateSaveState(); renderCharacterContext(); renderImplantStatus(); renderGroupContext(); renderAccelerationControls(); renderBookCosts(); renderJourney();
}
function renderDashboard() { renderQueue(); renderSummary(); scheduleOptimization(); }
function render() { renderControls(); renderGoals(); renderDashboard(); renderJourney(); }
function resetCalculation() {
  resetAcceleration(); resetBookCosts();
  revision++;
  clearTimeout(previewTimer);clearTimeout(optimizationTimer);optimizationFailure=null;
  result = null; preview = null; calculationKey = null;
}
function invalidate() {
  resetCalculation();
  renderGoals(); renderDashboard(); queueDraft();
  scheduleOptimization();
}
function mergeGoals(goals) {
  for (const goal of goals) {
    const existing = plan.goals.find(g => g.id === goal.id);
    if (existing) existing.level = Math.max(existing.level, goal.level);
    else plan.goals.push(goal);
  }
}
async function addSkill() {
  const name = $('skill-name').value.trim();
  if (!name) return;
  await action('Загружаем навык и зависимости…', async () => {
    const data = await api('/api/resolve', { name });
    items = data.items;
    mergeGoals([{ id: data.id, level: Number($('skill-level').value) }]);
    $('skill-name').value = '';
    resetCalculation(); renderCatalog(); renderGoals();
    renderDashboard();
    notify('Навык добавлен в очередь');
  });
}
async function download(name, text, type) {
  if (nativeDesktop) {
    try { await nativeCommand('export_file', { name, text }); $('export-menu').open = false; } catch (error) { notify(error.message,'error'); }
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('export-menu').open = false;
}
function queueText() { return (activeSchedule()?.rows || []).map(row => `${row.name} ${roman[row.level]}`).join('\n') + '\n'; }

document.addEventListener('input', event => {
  const target = event.target;
  if (!plan) return;
  if (target.id === 'name') { plan.name = target.value; queueDraft(); updateSaveState(); renderJourney(); return; }
  if (target.id === 'eft') { queueDraft(); updateSaveState(); return; }
  if (target.dataset.attr !== undefined) {
    if(selectedCharacter){updateTotal();return;}
    plan.attributes=rebalanceAttributes(plan.attributes,Number(target.dataset.attr),target.value);
    attributeDraft=null;updateTotal();
  }
  else if (target.id === 'remap-count') {
    const count=target.valueAsNumber;
    if(!Number.isInteger(count)||count<0||count>10){target.setCustomValidity('Укажите целое число от 0 до 10');return;}
    target.setCustomValidity('');
    if(selectedCharacter){characterRemaps[selectedCharacter]=count;renderDashboard();queueDraft();return;}
    plan.remap_count=count;
  }
  else return;
  invalidate();
});
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || !plan) return;
  if (button.dataset.view) setView(button.dataset.view);
  if (button.dataset.removeGoal !== undefined) {
    const index = Number(button.dataset.removeGoal);
    if (requiredLevels().has(plan.goals[index].id)) { notify('Этот навык нужен для других целей плана','error'); return; }
    plan.goals.splice(index,1); invalidate();
  }
  if(button.dataset.setGoalLevel!==undefined&&!planGroup&&!button.disabled){
    const goal=plan.goals[Number(button.dataset.setGoalLevel)];
    const level=Math.max(Number(button.dataset.level),requiredLevels().get(goal.id)||1);
    if(goal.level!==level){goal.level=level;invalidate();
      document.querySelector(`[data-set-goal-level="${button.dataset.setGoalLevel}"][data-level="${level}"]`)?.focus({preventScroll:true});
    }
  }
});
$('implant-enabled').addEventListener('change', () => { plan.optimize_implants = $('implant-enabled').checked; invalidate(); });
$('add-skill').addEventListener('click', addSkill);
$('skill-name').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addSkill(); } });
$('parse-eft').addEventListener('click',parseBoundEft);
$('save').addEventListener('click', () => savePlan());
$('export').addEventListener('click', () => download('skilly-plan.json', JSON.stringify({format:'skilly-plan',schema_version:1,workspace:captureWorkspace()},null,2), 'application/json'));
$('export-queue').addEventListener('click', () => download('skilly-queue.txt', queueText(), 'text/plain;charset=utf-8'));
$('copy-queue').addEventListener('click', async () => {
  if(!activeSchedule())return;
  try { if (nativeDesktop) await nativeCommand('copy_text',{text:queueText()}); else await navigator.clipboard.writeText(queueText()); $('export-menu').open = false; notify('Очередь скопирована'); }
  catch (_) { notify('Буфер обмена недоступен — скачайте .txt','error'); }
});
$('import').addEventListener('click', () => {
  if (nativeDesktop) action('Открываем файл плана…', async () => { const text=await nativeCommand('import_file'); if(text!==null) await importWorkspace(JSON.parse(text)); });
  else $('file').click();
});
$('file').addEventListener('change', async () => {
  const file=$('file').files[0]; if(!file)return;
  await action('Открываем план…',async()=>{if(file.size>2*1024*1024)throw new Error('План больше 2 МБ');await importWorkspace(JSON.parse(await file.text()));});
  $('file').value='';
});
$('clear').addEventListener('click', startNewPlan);
action('Открываем локальный план…', async () => {
  initJourney();initGoalControls();
  await initPlanLibrary();
  await initCharacters();
  initGroups();
  initAcceleration();
  initBooks();initFits();await loadFitLibrary();
  const data = await api('/api/state'); items = data.items;
  applyWorkspace(data.workspace || {plan:data.plan}, data.active_id || null, data.saved_workspace || null);
  scheduleOptimization(0);
  queueDraft();
});
