"use strict";

const $ = id => document.getElementById(id);
const attrs = ['Intelligence', 'Perception', 'Charisma', 'Willpower', 'Memory'];
const codes = ['INT', 'PER', 'CHA', 'WIL', 'MEM'];
const roman = ['0', 'I', 'II', 'III', 'IV', 'V'];
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
let plan, items = {}, result = null, preview = null;
let busy = false, revision = 0, previewTimer, statusTimer;
let hasDashboardView=false,lastQueueMarkup=null,lastQueueContext=null,lastGoalsMarkup=null,lastGoalsContext=null;
function retainDashboardView(){return hasDashboardView&&Boolean(plan?.goals.length)&&!activeSchedule();}
function dashboardContext(){return `${activePlanId||'draft'}:${selectedCharacter||'shared'}`;}
function updateDashboardPending(){
  const pending=Boolean(plan?.goals.length)&&!activeSchedule();
  $('editor-page').classList.toggle('dashboard-pending',pending);
  $('queue-view').setAttribute('aria-busy',String(pending));
  $('tracking-actions').querySelectorAll('button').forEach(button=>button.disabled=pending);
}
let view = 'queue', panel = 'add', scheduleMode = 'optimized', calculatedAt = new Date();

function newPlan() {
  return { name: t("app_040"), goals: [], attributes: [20,20,19,20,20], remap_count: 1, optimize_implants: true, queue_priority: 'fit_ready' };
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
  if (!response.ok) throw new Error(localizeServerText(data.error) || `HTTP ${response.status}`);
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
function formatNumber(value) { return Math.round(value).toLocaleString(uiLocale()); }
function plural(value, forms) { if(uiLanguage==='en')return forms[Math.abs(value)===1?0:2]; const n = Math.abs(value) % 100, last = n % 10; return forms[n > 10 && n < 15 ? 2 : last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2]; }
function compactSP(value) { return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value); }
function duration(days, compact = false) {
  const seconds = Math.max(0, Math.round(days * 86400));
  const d = Math.floor(seconds / 86400), h = Math.floor(seconds % 86400 / 3600);
  const m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  if (d) return compact ? t("app_041", d, h) : t("app_042", d, h, m);
  if (h) return t("app_043", h, m);
  return compact ? t("app_044", m, s) : t("app_045", m);
}
function endDate(days) {
  return new Date((selectedCharacter ? selectedAdaptation()?.computed_at || Date.now() : calculatedAt.getTime()) + days * 86400000).toLocaleDateString(uiLocale());
}
function day(value) { return t("app_046", value.toLocaleString(uiLocale(), { maximumFractionDigits: 2 })); }
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
  if(values.length!==5||values.some(v=>v===''||v===null||!Number.isInteger(Number(v))))return t("app_047");
  if(values.some(v=>Number(v)<17||Number(v)>27))return t("app_048");
  const sum=values.reduce((total,value)=>total+Number(value),0);
  if(sum!==99)return sum<99?t("app_049", 99-sum):t("app_050", sum-99);
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
  $('attribute-note').textContent=selectedCharacter?t("app_051", character?.name||t("app_052")):t("app_053");
  $('attribute-error').textContent='';$('attribute-error').hidden=true;
  document.querySelectorAll('[data-attr]').forEach(input=>{
    const index=Number(input.dataset.attr),value=values[index];
    input.readOnly=Boolean(selectedCharacter);input.disabled=false;
    if(input.value!==String(value??''))input.value=value??'';
    const invalid=!selectedCharacter&&(value===''||value===null||!Number.isInteger(Number(value))||Number(value)<17||Number(value)>27);
    input.setAttribute('aria-invalid',String(invalid));
    input.setCustomValidity(invalid?t("app_054"):'');
  });
}

function renderControls() {
  attributeDraft=null;
  $('name').value = plan.name;
  $('queue-priority').value=plan.queue_priority||'fit_ready';
  $('remap-count').value = plan.remap_count ?? 1;
  $('implant-enabled').checked = plan.optimize_implants ?? true;
  $('attributes').innerHTML = attrs.map((name, i) => t("app_055", i, codes[i], name, i, i, plan.attributes[i], name)).join('');
  updateTotal();
  renderCatalog();
}
function renderGoals() {
  const focused=document.activeElement?.closest('#goals button');
  const focusId=focused?.closest('.goal-row')?.dataset.goalId;
  const focusControl=focused?.dataset.level?`[data-level="${focused.dataset.level}"]`:'.goal-remove';
  const minimums = requiredLevels();
  for (const goal of plan.goals) goal.level = Math.max(goal.level, minimums.get(goal.id) || 1);
  $('goal-count').textContent = plan.goals.length;
  const markup = plan.goals.length ? plan.goals.map((goal, i) => {
    const skill = items[goal.id]?.skill, minimum = minimums.get(goal.id) || 1;
    const name = esc(skillName(goal.id));
    const segments=[1,2,3,4,5].map(level=>t("app_056", level<=goal.level?'filled':'', i, level, name, roman[level], goal.level===level, roman[level], level<minimum?t("app_057", roman[minimum]):'', level<minimum?'disabled':'')).join('');
    return t("app_058", goal.id, name, name, skill?`${codes[skill.primary]} / ${codes[skill.secondary]}`:t("app_059"), minimums.has(goal.id)?t("app_060", roman[minimum], fitMinimums().has(goal.id)?t("app_061"):''):'', name, segments, i, name, minimums.has(goal.id)?t("app_062"):'');
  }).join('') : t("app_063");
  const context=`${dashboardContext()}:${Boolean(planGroup)}`;
  if(markup===lastGoalsMarkup&&context===lastGoalsContext)return;
  $('goals').innerHTML=markup;lastGoalsMarkup=markup;lastGoalsContext=context;
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
  const when = event.day <= 1e-9 ? t("app_064") : t("app_065", duration(event.day), day(event.day));
  const details = isRemap
    ? `<div class="event-attributes">${codes.map((code,i) => `<span>${code} <b>${event.attributes[i]}</b></span>`).join('')}</div>`
    : t("app_066", implantLabels(event).map(esc).join('<br>'), roman[event.cybernetics]);
  return `<tr class="queue-event queue-event-${event.kind}" data-event-kind="${event.kind}" data-event-day="${event.day}"><td class="event-icon-cell" aria-hidden="true">${isRemap ? '↗' : '◇'}</td><td colspan="8"><div class="event-heading"><strong>${isRemap ? t("app_067") : t("app_068")}</strong><span>${when}</span></div>${details}</td></tr>`;
}
function renderQueue() {
  if(retainDashboardView())return;
  const schedule = activeSchedule(), rows = schedule?.rows || [], events = scheduleEvents(schedule);
  syncQueueSelection(schedule,selectedCharacter);
  const injected=selectedCharacter?(currentCharacter()?.injected_skill_ids||selectedAdaptation()?.character?.injected_skill_ids||[]):[];
  const books=new Map(queueBookEvents(schedule,injected).map(event=>[event.index,event]));
  const targets = new Map();
  for (const row of rows) targets.set(row.id, Math.max(targets.get(row.id) || 0, row.level));
  $('empty-queue').hidden = rows.length > 0 || Boolean(plan.goals.length&&!schedule) || Boolean(selectedCharacter && showLearnedSkills && learnedPlanRows(currentCharacter()).length);
  const output = [learnedQueueRows()];
  let nextEvent = 0;
  for (const [i, row] of rows.entries()) {
    while (nextEvent < events.length && events[nextEvent].day <= row.start_day + 1e-9) {
      output.push(queueEventRow(events[nextEvent++]));
    }
    if(books.has(i))output.push(renderBookEvent(books.get(i)));
    const days = row.end_day - row.start_day;
    const rate = days > 0 ? row.points / (days * 24) : 0;
    const rank = items[row.id]?.skill?.rank ?? '—';
    const levels = queueLevelBlocks(row,targets.get(row.id));
    output.push(t("app_069", i===0?0:-1, i, row.id, row.level, String(i+1).padStart(2,'0'), attributeColor(row.primary, row.secondary), esc(row.name), roman[row.level], esc(row.name), roman[row.level], queueRowTracking(row), days >= 20 ? 'time-long' : days >= 5 ? 'time-warm' : '', duration(days), duration(days,true), rank, row.primary, attrs[row.primary], row.secondary, attrs[row.secondary], formatNumber(rate), targets.get(row.id)||row.level, roman[row.level], levels, i));
  }
  while (nextEvent < events.length) output.push(queueEventRow(events[nextEvent++]));
  const markup=output.join(''),context=dashboardContext();
  if(markup!==lastQueueMarkup||context!==lastQueueContext){
    const scroller=$('queue-scroll'),scrollTop=scroller.scrollTop,scrollLeft=scroller.scrollLeft;
    const sameContext=context===lastQueueContext;
    const previousInjectors=new Map();
    if(sameContext)$('queue').querySelectorAll('tr[data-skill-id]').forEach(row=>{
      const cell=row.querySelector('.injector-column');
      if(cell?.dataset.injectorResolved==='true')previousInjectors.set(`${row.dataset.skillId}:${row.dataset.skillLevel}`,{text:cell.textContent,title:cell.title});
    });
    $('queue').innerHTML = markup;
    $('queue').querySelectorAll('tr[data-skill-id]').forEach(row=>{
      const previous=previousInjectors.get(`${row.dataset.skillId}:${row.dataset.skillLevel}`),cell=row.querySelector('.injector-column');
      if(previous&&cell){cell.textContent=previous.text;cell.title=t("app_070");cell.dataset.injectorResolved='true';cell.setAttribute('aria-busy','true');}
    });
    scroller.scrollTop=sameContext?scrollTop:0;scroller.scrollLeft=sameContext?scrollLeft:0;
    lastQueueMarkup=markup;lastQueueContext=context;
  }
  if(schedule)hasDashboardView=true;
  else if(!plan.goals.length)hasDashboardView=false;
  paintQueueSelection();paintQueueBookPrices();
  renderTimeline(rows);
}
function renderImplantStatus(){
  const personal=Boolean(selectedCharacter),character=personal?currentCharacter():null;
  const replace=personal&&(replacementChoices[selectedCharacter]??selectedAdaptation()?.replace_implants??false);
  $('implant-policy-note').textContent=personal
    ?t("app_071", replace?t("app_072"):t("app_073"))
    :t("app_074");
  $('implant-current').hidden=!personal||!character;
  const schedule=activeSchedule(),installations=schedule?.installations||[];
  let message;
  if(!personal&&!plan.optimize_implants)message=t("app_075");
  else if(!schedule)message=plan.goals.length?t("app_076"):t("app_077");
  else if(!schedule.rows.length)message=t("app_078");
  else if(installations.length){
    const count=installations.reduce((sum,event)=>sum+event.purchases.filter(b=>b>0).length,0);
    message=t("app_079", count, plural(count,[t("app_080"),t("app_081"),t("app_082")]), installations.length, plural(installations.length,[t("app_083"),t("app_084"),t("app_085")]));
  }else message=personal?(replace?t("app_086"):t("app_087")):t("app_088");
  $('implant-purchases').textContent=message;
}
function renderRecommendations() {
  const result=displayComparison();
  $('method-section').hidden = !result;
  if (!result) return;
  $('method').textContent = t("app_089", result.searched_maps.toLocaleString(uiLocale()), localizeServerText(result.method));
}
function renderSummary() {
  const retained=retainDashboardView();
  const result=displayComparison();
  const schedule = activeSchedule(), rows = schedule?.rows || [];
  const total = rows.reduce((sum, row) => sum + row.points, 0), unique = new Set(rows.map(row => row.id)).size;
  const time = schedule && rows.length ? duration(schedule.days) : '—';
  const finish = schedule && rows.length ? endDate(schedule.days) : '';
  if(!retained){
  $('top-time').textContent = time;
  $('top-time').title = time;
  $('top-count').textContent = `${rows.length} ${plural(rows.length,[t("app_090"),t("app_091"),t("app_092")])} · ${unique} ${plural(unique,[t("app_093"),t("app_094"),t("app_095")])}`;
  $('top-finish').textContent = finish ? t("app_096", finish) : '';
  $('top-finish').title = t("app_097");
  $('top-sp').textContent = total ? `${compactSP(total)} SP` : '';
  $('top-saving').textContent = result ? duration(result.saved_days) : '—';
  $('top-saving-note').textContent = result ? t("app_098", (result.baseline.days ? 100*result.saved_days/result.baseline.days : 0).toFixed(1)) : t("app_099");
  }
  $('remap-summary').textContent = result ? t("app_100", result.optimized.remaps.length, selectedCharacter ? selectedAdaptation()?.remap_count ?? 0 : plan.remap_count) : t("app_101");
  $('export-queue').disabled = !rows.length;
  $('copy-queue').disabled = !rows.length;
  if(!retained)renderRecommendations();
  renderTracking();
  updateSaveState(); renderCharacterContext(); renderImplantStatus(); renderGroupContext(); renderAccelerationControls(); renderBookCosts(); renderJourney();
}
function renderDashboard() { renderQueue(); renderSummary(); updateDashboardPending(); scheduleOptimization(); }
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
  await action(t("app_102"), async () => {
    const data = await api('/api/resolve', { name });
    items = data.items;
    mergeGoals([{ id: data.id, level: Number($('skill-level').value) }]);
    $('skill-name').value = '';
    resetCalculation(); renderCatalog(); renderGoals();
    renderDashboard();
    notify(t("app_103"));
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
    if(!Number.isInteger(count)||count<0||count>10){target.setCustomValidity(t("app_104"));return;}
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
    if (requiredLevels().has(plan.goals[index].id)) { notify(t("app_105"),'error'); return; }
    plan.goals.splice(index,1); invalidate();
  }
  if(button.dataset.setGoalLevel!==undefined&&!button.disabled){
    const goal=plan.goals[Number(button.dataset.setGoalLevel)];
    const level=Math.max(Number(button.dataset.level),requiredLevels().get(goal.id)||1);
    if(goal.level!==level){
      if(planGroup){planGroup.level_overrides||={};planGroup.level_overrides[goal.id]=level;}
      goal.level=level;invalidate();
      document.querySelector(`[data-set-goal-level="${button.dataset.setGoalLevel}"][data-level="${level}"]`)?.focus({preventScroll:true});
    }
  }
});
$('queue-priority').addEventListener('change',()=>{plan.queue_priority=$('queue-priority').value;invalidate();});
$('implant-enabled').addEventListener('change', () => { plan.optimize_implants = $('implant-enabled').checked; invalidate(); });
$('add-skill').addEventListener('click', addSkill);
$('skill-name').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addSkill(); } });
$('parse-eft').addEventListener('click',parseBoundEft);
$('save').addEventListener('click', () => savePlan());
$('export').addEventListener('click', () => download('skilly-plan.json', JSON.stringify({format:'skilly-plan',schema_version:1,workspace:captureWorkspace()},null,2), 'application/json'));
$('export-queue').addEventListener('click', () => download('skilly-queue.txt', queueText(), 'text/plain;charset=utf-8'));
$('copy-queue').addEventListener('click', async () => {
  if(!activeSchedule())return;
  try { if (nativeDesktop) await nativeCommand('copy_text',{text:queueText()}); else await navigator.clipboard.writeText(queueText()); $('export-menu').open = false; notify(t("app_106")); }
  catch (_) { notify(t("app_107"),'error'); }
});
$('import').addEventListener('click', () => {
  if (nativeDesktop) action(t("app_108"), async () => { const text=await nativeCommand('import_file'); if(text!==null) await importWorkspace(JSON.parse(text)); });
  else $('file').click();
});
$('file').addEventListener('change', async () => {
  const file=$('file').files[0]; if(!file)return;
  await action(t("app_109"),async()=>{if(file.size>2*1024*1024)throw new Error(t("app_110"));await importWorkspace(JSON.parse(await file.text()));});
  $('file').value='';
});
$('clear').addEventListener('click', startNewPlan);
initLanguage();
action(t("app_111"), async () => {
  initJourney();initQueueControls();initTracking();
  await initPlanLibrary();
  await initCharacters();
  initGroups();
  initAcceleration();
  initBooks();initFits();await loadFitLibrary();
  const data = await api('/api/state'); items = data.items;
  applyWorkspace(data.workspace || {plan:data.plan}, data.active_id || null, data.saved_workspace || null);
  scheduleOptimization(0);
  queueDraft();
  initUpdates();
});
