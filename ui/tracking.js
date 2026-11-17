"use strict";

let showLearnedSkills = false;
let trackingRefresh = null;
const trackingErrors = new Map();
const trackingAttempts = new Map();
const trackingItems = {};
const trackingLoaded = new Set();
const trackingLoading = new Set();
const TRACKING_REFRESH_MS = 5 * 60 * 1000;
const boundQueueChecks = new Map();
const boundQueueRequests = new Map();
function boundQueueKey(character) {
  if (!character) return null;
  const tracked = trackedPlan(character.id);
  return tracked ? JSON.stringify([character.id, character.fetched_at, tracked.id, tracked.saved_at]) : null;
}
function boundQueueCheck(character) {
  return boundQueueChecks.get(boundQueueKey(character));
}
async function checkBoundQueue(character) {
  const key = boundQueueKey(character);
  if (!key || character.queue == null || boundQueueRequests.has(key) || boundQueueChecks.has(key)) return;
  boundQueueRequests.set(key, true);
  try {
    const data = await api('/api/characters/plan-queue', {id:character.id});
    const tracked = trackedPlan(character.id);
    if (key !== boundQueueKey(character) || data.plan_id !== tracked?.id || data.saved_at !== tracked.saved_at || data.snapshot_at !== character.fetched_at) return;
    Object.assign(trackingItems, data.items);
    boundQueueChecks.set(key, data);
  } catch (error) {
    boundQueueChecks.set(key, {error:error.message});
  } finally {
    boundQueueRequests.delete(key);
    if (selectedCharacter === character.id && key === boundQueueKey(currentCharacter())) renderTracking();
  }
}
function boundQueueStatus(schedule, character, now = Date.now()) {
  if (character.queue == null) return {state:'pending', text:t("tracking_301")};
  if (!schedule) return {state:'pending', text:t("tracking_302")};
  const relation = compareActualQueue(schedule, character, now);
  if (!relation.actual.length) return relation.planned.length
    ? {state:'warning', text:t("tracking_303"), relation}
    : {state:'matched', text:t("tracking_304"), relation};
  if (relation.prefix === relation.actual.length) return {state:'matched', text:t("tracking_305"), relation};
  const index = relation.prefix, expected = relation.planned[index], actual = relation.actual[index];
  const label = row => `${trackingName(row.skill_id ?? row.id)} ${roman[row.finished_level ?? row.level]}`;
  return {state:'warning', text:t("tracking_306", index + 1),
    detail:expected ? t("tracking_307", label(actual), label(expected)) : t("tracking_308", label(actual)), relation};
}
function renderBoundQueueStatus(character) {
  const tracked = trackedPlan(character.id), node = $('bound-queue-status');
  node.hidden = !tracked;
  $('actual-queue-comparison').hidden = !tracked;
  if (!tracked) return;
  const check = boundQueueCheck(character);
  const status = check?.error ? {state:'error', text:t("tracking_309"), detail:check.error}
    : boundQueueStatus(check?.schedule, character);
  node.dataset.state = status.state;
  $('bound-queue-message').textContent = status.state==='matched' ? (status.relation?.actual.length ? t("tracking_310") : t("tracking_311")) : status.state==='warning' ? (status.relation?.actual.length ? t("tracking_312", status.relation.prefix+1) : t("tracking_313")) : status.state==='error' ? t("tracking_314") : t("tracking_315");
  $('bound-queue-message').title = [status.text,tracked.name,status.detail,t("tracking_316")].filter(Boolean).join('. ');
  $('bound-queue-plan').textContent = tracked.name;
  $('bound-queue-plan').title = t("tracking_317", tracked.name);
  $('bound-queue-detail').textContent = status.detail || '';
  $('bound-queue-detail').title = status.detail || '';
  $('bound-queue-detail').hidden = !status.detail;
  checkBoundQueue(character);
}
function trackingSkill(id) {
  return items[id]?.skill || trackingItems[id]?.skill;
}
function trackingName(id) {
  return items[id]?.name || trackingItems[id]?.name || t("tracking_318", id);
}
function skillPoints(rank, level) {
  return level ? Math.ceil(250 * rank * Math.pow(2, 2.5 * (level - 1))) : 0;
}
function queueKey(row) {
  return `${row.skill_id ?? row.id}-${row.finished_level ?? row.level}`;
}
function queueDate(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
function actualQueue(character, now = Date.now()) {
  return (character?.queue || []).filter(entry => {
    const finish = queueDate(entry.finish_date);
    return finish === null || finish > now;
  }).slice().sort((a, b) => a.queue_position - b.queue_position);
}
function trainingEntry(character, now = Date.now()) {
  return actualQueue(character, now).find(entry => {
    const start = queueDate(entry.start_date), finish = queueDate(entry.finish_date);
    return start !== null && start <= now && finish !== null && finish > now;
  });
}
function queueEntryPoints(entry, character, now = Date.now()) {
  let points = character?.trained?.[entry.skill_id] || 0;
  const start = queueDate(entry.start_date), finish = queueDate(entry.finish_date);
  if (start !== null && finish !== null && finish > start && Number.isFinite(entry.training_start_sp) && Number.isFinite(entry.level_end_sp)) {
    const fraction = Math.max(0, Math.min(1, (now - start) / (finish - start)));
    points = Math.max(points, entry.training_start_sp + (entry.level_end_sp - entry.training_start_sp) * fraction);
  }
  return points;
}
function queueEntryRemaining(entry, character, now = Date.now()) {
  const end = entry.level_end_sp ?? skillPoints(trackingSkill(entry.skill_id)?.rank || 1, entry.finished_level);
  const floor = entry.level_start_sp ?? skillPoints(trackingSkill(entry.skill_id)?.rank || 1, entry.finished_level - 1);
  return Math.max(0, end - Math.max(floor, queueEntryPoints(entry, character, now)));
}
function compareActualQueue(schedule, character, now = Date.now()) {
  const completed = new Set((character?.queue || []).filter(entry => {
    const finish = queueDate(entry.finish_date);
    return finish !== null && finish <= now;
  }).map(queueKey));
  const actual = actualQueue(character, now), planned = (schedule?.rows || []).filter(row => !completed.has(queueKey(row)));
  const keys = new Set(planned.map(queueKey));
  const matched = actual.filter(entry => keys.has(queueKey(entry)));
  let prefix = 0;
  while (prefix < actual.length && prefix < planned.length && queueKey(actual[prefix]) === queueKey(planned[prefix])) prefix++;
  let matchedTime = 0, totalTime = 0;
  let timed = true;
  for (const entry of actual) {
    const start = queueDate(entry.start_date), finish = queueDate(entry.finish_date);
    if (start === null || finish === null) { timed = false; break; }
    const remaining = Math.max(0, finish - Math.max(start, now));
    totalTime += remaining;
    if (keys.has(queueKey(entry))) matchedTime += remaining;
  }
  return {actual, planned, matched: matched.length, prefix,
    percent: actual.length ? Math.round(100 * (timed && totalTime > 0 ? matchedTime / totalTime : matched.length / actual.length)) : 0,
    timed};
}
function learnedPlanRows(character) {
  if (!character?.trained) return [];
  const seen = new Set();
  return (result?.baseline?.rows || preview?.rows || []).filter(row => {
    const key = queueKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    const skill = trackingSkill(row.id);
    return skill && (character.trained[row.id] || 0) >= skillPoints(skill.rank, row.level);
  });
}
function queueLevelState(row, character, now = Date.now()) {
  if (!character) return null;
  const entry = actualQueue(character, now).find(entry => queueKey(entry) === queueKey(row));
  const rank = trackingSkill(row.id)?.rank;
  if (!rank && !entry) return null;
  const floor = entry?.level_start_sp ?? skillPoints(rank || 1, row.level - 1);
  const end = entry?.level_end_sp ?? skillPoints(rank || 1, row.level);
  const points = entry ? queueEntryPoints(entry, character, now) : character.trained?.[row.id] || 0;
  const progress = Math.max(0, Math.min(100, 100 * (points - floor) / Math.max(1, end - floor)));
  if (entry && entry === trainingEntry(character, now)) return {state:'training',progress};
  return progress > 0 && progress < 100 ? {state:'partial',progress} : null;
}
function queueLevelBlocks(row, target, now = Date.now()) {
  const character=selectedCharacter ? currentCharacter() : null;
  const state = queueLevelState(row, character, now);
  const queued=new Set(actualQueue(character,now).map(queueKey));
  const rank=trackingSkill(row.id)?.rank;
  let trained=character?.trained?.[row.id]||0;
  const training=trainingEntry(character,now);
  for(const entry of character?.queue||[]){
    if(entry.skill_id!==row.id)continue;
    const finish=queueDate(entry.finish_date);
    if(finish!==null && finish<=now)trained=Math.max(trained,entry.level_end_sp??skillPoints(rank||1,entry.finished_level));
    else if(entry===training)trained=Math.max(trained,queueEntryPoints(entry,character,now));
  }
  return [1,2,3,4,5].map(level => {
    const current = level === row.level ? state : null;
    const title = current ? `${roman[level]} · ${current.state==='training'?t("tracking_319"):t("tracking_320")} · ${current.progress.toFixed(1)}%` : `${roman[level]}`;
    const base=character ? (rank && trained>=skillPoints(rank,level) ? 'filled' : queued.has(`${row.id}-${level}`) ? 'is-queued' : '') : level<=row.level?'filled':level<=target?'future':'';
    return `<i class="level-block ${current ? `is-${current.state}` : base}" title="${esc(title)}" aria-label="${esc(title)}"></i>`;
  }).join('');
}
function queueRowTracking(row) {
  if (!selectedCharacter) return '';
  const character = currentCharacter(), queue = actualQueue(character);
  const index = queue.findIndex(entry => queueKey(entry) === queueKey(row));
  if (index < 0) return '';
  const entry = queue[index], current = trainingEntry(character);
  if (entry === current) return '';
  return t("tracking_321", entry.queue_position + 1);
}
function learnedQueueRows() {
  if (!selectedCharacter || !showLearnedSkills) return '';
  const rows = learnedPlanRows(currentCharacter());
  if (!rows.length) return '';
  return t("tracking_322", rows.length) + rows.map(row =>
    t("tracking_323", row.id, row.level, esc(row.name), roman[row.level])
  ).join('');
}
function trackingTime(time) {
  return new Date(time).toLocaleString(uiLocale(), {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false});
}
function eventAnchor(event, schedule, relation, computedAt) {
  const row = schedule.rows.find(row => row.start_day + 1e-8 >= event.day);
  const index = (relation.planned || schedule.rows).findIndex(entry => row && queueKey(entry) === queueKey(row));
  const actualIndex = relation.actual.findIndex(entry => row && queueKey(entry) === queueKey(row));
  // A date is actionable only when the entire prefix through this boundary agrees.
  const aligned = actualIndex === index && index >= 0 && relation.prefix > index;
  if (aligned) {
    const time = queueDate(relation.actual[actualIndex].start_date);
    if (time !== null) return {time, aligned, row};
  }
  return {time: computedAt + event.day * 86400000, aligned:false, row};
}
function actualRemapSaving(attributes, character, queue, now = Date.now()) {
  if (!queue.length) return null;
  let before = 0, after = 0;
  for (const entry of queue) {
    const skill = trackingSkill(entry.skill_id);
    if (!skill) return null;
    const points = queueEntryRemaining(entry, character, now);
    const rate = values => values[skill.primary] + (character.bonuses?.[skill.primary] || 0)
      + (values[skill.secondary] + (character.bonuses?.[skill.secondary] || 0)) / 2;
    before += points / rate(character.attributes);
    after += points / rate(attributes);
  }
  return (before - after) / 1440;
}
function plannedTrackingActions(schedule, character, relation, computedAt) {
  if (!schedule) return [];
  const events=scheduleEvents(schedule).filter(event=>event.kind==='remap'||event.purchases.some((bonus,index)=>bonus>(character.bonuses?.[index]||0)));
  const books=queueBookEvents(schedule,character.injected_skill_ids||[]).map(event=>({...event,kind:'book'}));
  return [...events,...books].map(event=>({event,anchor:eventAnchor(event,schedule,relation,computedAt)}))
    .sort((a,b)=>a.anchor.time-b.anchor.time);
}
function trackingActionCards(schedule, character, relation) {
  if (!schedule) return t("tracking_324");
  const now=Date.now(),computedAt=selectedAdaptation()?.computed_at||now;
  const actions=plannedTrackingActions(schedule,character,relation,computedAt);
  return actions.map(({event,anchor})=>{
    const label=event.kind==='remap'?t("app_067"):event.kind==='book'?t("tracking_325", event.name):t("tracking_326");
    const remaining=Math.max(0,(anchor.time-now)/86400000);
    const countdown=remaining>0?t("tracking_327", duration(remaining,true)):t("tracking_328");
    const source=anchor.aligned?t("tracking_329"):t("tracking_330");
    const detail=event.kind==='implant'?implantLabels(event).join(', '):event.kind==='remap'?codes.map((code,index)=>`${code} ${event.attributes[index]}`).join(' · '):event.name;
    return `<button type="button" class="tracking-action-link" data-tracking-jump="${event.kind}" data-action-day="${event.day}" ${event.kind==='book'?`data-action-book="${event.id}"`:''} title="${esc(t("tracking_331", label, detail, source))}"><time title="${source}">${anchor.aligned?'':'≈ '}${trackingTime(anchor.time)}</time><span class="tracking-action-label">${esc(label)}</span><span class="tracking-action-countdown">${countdown}</span></button>`;
  }).join('')||t("tracking_332");
}
function jumpToTrackingAction(button) {
  if(!activeSchedule())return;
  const kind=button.dataset.trackingJump;
  const target=kind==='book'
    ?Array.from(document.querySelectorAll('#queue [data-book-id]')).find(row=>row.dataset.bookId===button.dataset.actionBook)
    :Array.from(document.querySelectorAll('#queue [data-event-kind]')).find(row=>row.dataset.eventKind===kind&&row.dataset.eventDay===button.dataset.actionDay);
  if(!target){notify(t("tracking_333"),'error');return;}
  document.querySelectorAll('#queue .queue-event-target').forEach(row=>row.classList.remove('queue-event-target'));
  target.classList.add('queue-event-target');
  target.setAttribute('tabindex','-1');
  target.focus({preventScroll:true});
  target.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});
}
function renderActualQueue(character) {
  const now = Date.now(), current = trainingEntry(character, now), queue = actualQueue(character, now);
  $('actual-queue-title').textContent = t("tracking_334", character.name);
  $('actual-queue-updated').textContent = t("tracking_335", trackingTime(character.fetched_at));
  const planKeys = new Set((activeSchedule()?.rows || []).map(queueKey));
  $('actual-queue-list').innerHTML = queue.map(entry => {
    const active = entry === current, finish = queueDate(entry.finish_date), start = queueDate(entry.start_date);
    const inPlan = planKeys.has(queueKey(entry));
    const timing = active ? t("tracking_336", duration((finish-now)/86400000)) : start !== null ? t("tracking_337", trackingTime(start)) : t("tracking_338");
    return `<div class="actual-queue-row ${active?'is-training':''}"><span>${entry.queue_position+1}</span><div><strong>${esc(trackingName(entry.skill_id))} ${roman[entry.finished_level]}</strong><small>${active?t("tracking_339"):''}${timing}${inPlan?t("tracking_340"):t("tracking_341")}</small></div>${active?'<span class="training-dot" aria-hidden="true">●</span>':''}</div>`;
  }).join('') || `<p class="muted-note">${character.queue == null?t("tracking_342"):t("tracking_343")}</p>`;
}
function renderTracking() {
  if(typeof retainDashboardView==='function'&&retainDashboardView())return;
  const character = selectedCharacter ? currentCharacter() : null;
  $('character-tracking').hidden = !character;
  $('tracking-actions-section').hidden = !character;
  $('show-learned-control').hidden = !character;
  if (!character) return;
  renderBoundQueueStatus(character);
  const schedule = activeSchedule(), relation = compareActualQueue(schedule, character);
  const learned = learnedPlanRows(character);
  $('show-learned').checked = showLearnedSkills;
  $('show-learned-count').textContent = t("tracking_344");
  const total = learned.length + (schedule?.rows.length || 0);
  $('tracking-progress-note').textContent = schedule ? t("tracking_345", learned.length, total) : '';
  const trackingError = trackingErrors.get(character.id);
  $('tracking-refresh').disabled = Boolean(trackingRefresh);
  $('tracking-refresh').classList.toggle('tracking-refreshing', Boolean(trackingRefresh));
  $('tracking-refresh').classList.toggle('tracking-error', Boolean(trackingError));
  $('tracking-refresh').title = trackingError ? t("tracking_346", trackingError) : t("tracking_347", trackingTime(character.fetched_at));
  $('tracking-actions').innerHTML = character.queue == null ? t("tracking_348") : trackingActionCards(schedule,character,relation);
  if ($('actual-queue-dialog').open) renderActualQueue(character);
  if (schedule || !plan.goals.length) loadTrackingDetails(character);
}
async function loadTrackingDetails(character) {
  const key = `${character.id}-${character.fetched_at}`;
  if (trackingLoaded.has(key) || trackingLoading.has(key)) return;
  trackingLoading.add(key);
  try {
    const catalog = await api('/api/characters/queue-items',{id:character.id});
    Object.assign(trackingItems,catalog.items);
    if (catalog.warnings?.length) trackingErrors.set(character.id,catalog.warnings.map(value=>localizeServerText(value)).join(' '));
    trackingLoaded.add(key);
    if (selectedCharacter === character.id) { renderTracking(); renderQueue(); paintAccelerationSummary(); }
  } catch(error) {
    trackingErrors.set(character.id,error.message);
    trackingLoaded.add(key);
    if (selectedCharacter === character.id) renderTracking();
  } finally { trackingLoading.delete(key); }
}
async function refreshTrackingCharacter(id, manual = false) {
  if (trackingRefresh || !id) return;
  if (!manual && Date.now()-(trackingAttempts.get(id) || 0) < TRACKING_REFRESH_MS) return;
  trackingAttempts.set(id,Date.now());
  for (const key of boundQueueChecks.keys()) if (JSON.parse(key)[0] === id) boundQueueChecks.delete(key);
  trackingRefresh = id;
  trackingErrors.delete(id);
  renderTracking();
  try {
    characterState = await api('/api/characters/sync',{id});
    for (const key of trackingLoaded) if (key.startsWith(`${id}-`)) trackingLoaded.delete(key);
    renderCharacterList(); renderDashboard();
  } catch(error) {
    trackingErrors.set(id,error.message);
    if (manual) notify(error.message,'error');
  } finally {
    trackingRefresh = null;
    renderTracking();
  }
}
function initTracking() {
  $('bound-queue-plan').addEventListener('click',()=>{
    const tracked=trackedPlan(selectedCharacter);
    if(!tracked)return;
    $('actual-queue-dialog').close();
    if(tracked.id!==activePlanId)openSavedPlan(tracked.id,selectedCharacter);
  });
  try { showLearnedSkills = localStorage.getItem('skilly-show-learned') === 'true'; } catch (_) {}
  $('show-learned').addEventListener('change',()=>{
    showLearnedSkills = $('show-learned').checked;
    try { localStorage.setItem('skilly-show-learned',String(showLearnedSkills)); } catch (_) {}
    renderQueue(); paintAccelerationSummary();
  });
  $('tracking-refresh').addEventListener('click',()=>refreshTrackingCharacter(selectedCharacter,true));
  const openQueue=()=>{renderActualQueue(currentCharacter()); $('actual-queue-dialog').showModal();};
  $('tracking-open-queue').addEventListener('click',openQueue);
  $('bound-queue-message').addEventListener('click',openQueue);
  $('tracking-actions').addEventListener('click',event=>{
    const button=event.target.closest('[data-tracking-jump]');
    if(button)jumpToTrackingAction(button);
  });
  setInterval(()=>{
    if (!selectedCharacter || document.hidden || busy) return;
    renderTracking();
    document.querySelectorAll('#queue tr[data-row-index]').forEach(row => {
      const skill={id:Number(row.dataset.skillId),level:Number(row.dataset.skillLevel)};
      const blocks=row.querySelector('.level-blocks');
      if(blocks)blocks.innerHTML=queueLevelBlocks(skill,Number(blocks.dataset.target));
      const slot = row.querySelector('.queue-tracking-slot');
      if (slot) slot.innerHTML = queueRowTracking({id:Number(row.dataset.skillId),level:Number(row.dataset.skillLevel)});
    });
    const character = currentCharacter();
    if (character && Date.now()-character.fetched_at >= TRACKING_REFRESH_MS) refreshTrackingCharacter(selectedCharacter);
  },30000);
}
