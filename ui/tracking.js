"use strict";

let showLearnedSkills = false;
let trackingRefresh = null;
const trackingErrors = new Map();
const trackingAttempts = new Map();
const trackingItems = {};
const trackingLoaded = new Set();
const trackingLoading = new Set();
const TRACKING_REFRESH_MS = 5 * 60 * 1000;
function trackingSkill(id) {
  return items[id]?.skill || trackingItems[id]?.skill;
}
function trackingName(id) {
  return items[id]?.name || trackingItems[id]?.name || `Навык #${id}`;
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
  const actual = actualQueue(character, now), planned = schedule?.rows || [];
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
  return {actual, matched: matched.length, prefix,
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
function queueRowTracking(row) {
  if (!selectedCharacter) return '';
  const character = currentCharacter(), queue = actualQueue(character);
  const index = queue.findIndex(entry => queueKey(entry) === queueKey(row));
  if (index < 0) return '';
  const entry = queue[index], current = trainingEntry(character);
  if (entry === current) {
    const skill = trackingSkill(row.id);
    const floor = entry.level_start_sp ?? skillPoints(skill?.rank || 1, row.level - 1);
    const end = entry.level_end_sp ?? skillPoints(skill?.rank || 1, row.level);
    const progress = Math.max(0, Math.min(100, 100 * (queueEntryPoints(entry, character) - floor) / Math.max(1, end - floor)));
    return `<span class="training-row-status"><span>● Изучается · ${progress.toFixed(1)}%</span><progress value="${progress}" max="100" aria-label="Прогресс текущего уровня"></progress></span>`;
  }
  return `<span class="queue-row-status">В очереди ESI · №${entry.queue_position + 1}</span>`;
}
function learnedQueueRows() {
  if (!selectedCharacter || !showLearnedSkills) return '';
  const rows = learnedPlanRows(currentCharacter());
  if (!rows.length) return '';
  return `<tr class="learned-heading"><td colspan="9">Изучено по плану · ${rows.length} уровней</td></tr>` + rows.map(row =>
    `<tr class="learned-skill-row" data-skill-id="${row.id}" data-skill-level="${row.level}"><td>✓</td><td>${esc(row.name)} <span class="roman-level">${roman[row.level]}</span></td><td colspan="7">Изучено</td></tr>`
  ).join('');
}
function trackingTime(time) {
  return new Date(time).toLocaleString('ru-RU', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
}
function eventAnchor(event, schedule, relation, computedAt) {
  const index = schedule.rows.findIndex(row => row.start_day + 1e-8 >= event.day);
  const row = schedule.rows[index];
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
  if (!schedule) return '<p class="muted-note">Обновляем действия по плану…</p>';
  const now=Date.now(),computedAt=selectedAdaptation()?.computed_at||now;
  const actions=plannedTrackingActions(schedule,character,relation,computedAt);
  return actions.map(({event,anchor})=>{
    const label=event.kind==='remap'?'Сделать remap':event.kind==='book'?`Книга: ${event.name}`:'Установить импланты';
    const remaining=Math.max(0,(anchor.time-now)/86400000);
    const countdown=remaining>0?`через ${duration(remaining,true)}`:'Сейчас';
    const source=anchor.aligned?'По очереди ESI':'Прогноз по плану';
    const detail=event.kind==='implant'?implantLabels(event).join(', '):event.kind==='remap'?codes.map((code,index)=>`${code} ${event.attributes[index]}`).join(' · '):event.name;
    return `<button type="button" class="tracking-action-link" data-tracking-jump="${event.kind}" data-action-day="${event.day}" ${event.kind==='book'?`data-action-book="${event.id}"`:''} title="${esc(`${label} · ${detail}. ${source}. Перейти к действию в очереди.`)}"><time title="${source}">${anchor.aligned?'':'≈ '}${trackingTime(anchor.time)}</time><span class="tracking-action-label">${esc(label)}</span><span class="tracking-action-countdown">${countdown}</span></button>`;
  }).join('')||'<p class="muted-note">Дополнительных действий нет.</p>';
}
function jumpToTrackingAction(button) {
  if(!activeSchedule())return;
  const kind=button.dataset.trackingJump;
  const target=kind==='book'
    ?Array.from(document.querySelectorAll('#queue [data-book-id]')).find(row=>row.dataset.bookId===button.dataset.actionBook)
    :Array.from(document.querySelectorAll('#queue [data-event-kind]')).find(row=>row.dataset.eventKind===kind&&row.dataset.eventDay===button.dataset.actionDay);
  if(!target){notify('Очередь обновилась. Выберите действие ещё раз.','error');return;}
  document.querySelectorAll('#queue .queue-event-target').forEach(row=>row.classList.remove('queue-event-target'));
  target.classList.add('queue-event-target');
  target.setAttribute('tabindex','-1');
  target.focus({preventScroll:true});
  target.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});
}
function renderActualQueue(character) {
  const now = Date.now(), current = trainingEntry(character, now), queue = actualQueue(character, now);
  $('actual-queue-title').textContent = `Очередь · ${character.name}`;
  $('actual-queue-updated').textContent = `Данные ESI от ${trackingTime(character.fetched_at)}. Время обучения между обновлениями — прогноз по снимку.`;
  const planKeys = new Set((activeSchedule()?.rows || []).map(queueKey));
  $('actual-queue-list').innerHTML = queue.map(entry => {
    const active = entry === current, finish = queueDate(entry.finish_date), start = queueDate(entry.start_date);
    const inPlan = planKeys.has(queueKey(entry));
    const timing = active ? `Осталось ${duration((finish-now)/86400000)}` : start !== null ? `Начало ${trackingTime(start)}` : 'Обучение приостановлено';
    return `<div class="actual-queue-row ${active?'is-training':''}"><span>${entry.queue_position+1}</span><div><strong>${esc(trackingName(entry.skill_id))} ${roman[entry.finished_level]}</strong><small>${active?'Изучается · ':''}${timing}${inPlan?' · в плане':' · вне плана'}</small></div>${active?'<span class="training-dot" aria-hidden="true">●</span>':''}</div>`;
  }).join('') || `<p class="muted-note">${character.queue == null?'Полная очередь ещё не загружена. Обновите данные ESI.':'По последнему снимку активная очередь пуста.'}</p>`;
}
function renderTracking() {
  if(typeof retainDashboardView==='function'&&retainDashboardView())return;
  const character = selectedCharacter ? currentCharacter() : null;
  $('character-tracking').hidden = !character;
  $('tracking-actions-section').hidden = !character;
  $('show-learned-control').hidden = !character;
  if (!character) return;
  const schedule = activeSchedule(), relation = compareActualQueue(schedule, character);
  const current = trainingEntry(character), learned = learnedPlanRows(character);
  $('show-learned').checked = showLearnedSkills;
  $('show-learned-count').textContent = `Изученные · ${learned.length}`;
  $('tracking-name').textContent = character.name;
  let status;
  if (character.queue == null) status = 'Обновите ESI, чтобы загрузить полную очередь';
  else if (!relation.actual.length) status = 'Очередь пуста';
  else if (!current) status = 'Обучение приостановлено или ещё не началось';
  else status = `${trackingName(current.skill_id)} ${roman[current.finished_level]} · осталось ${duration((queueDate(current.finish_date)-Date.now())/86400000)}`;
  $('tracking-current').textContent = status;
  $('tracking-current').classList.toggle('is-training', Boolean(current));
  let match = 'Сравнение появится после расчёта плана';
  if (schedule && character.queue != null) {
    if (!relation.actual.length) match = 'Добавьте навыки в очередь игры, чтобы отслеживать этапы';
    else if (!relation.matched) match = 'Очередь сейчас вне этого плана';
    else if (relation.prefix === relation.actual.length) match = 'Очередь следует плану';
    else match = 'Очередь частично совпадает или идёт в другом порядке';
    if (relation.actual.length) match += ` · ${relation.percent}% ${relation.timed?'времени':'уровней'} по плану`;
  }
  $('tracking-match').textContent = match;
  const total = learned.length + (schedule?.rows.length || 0);
  $('tracking-progress').max = Math.max(1,total);
  $('tracking-progress').value = learned.length;
  $('tracking-progress-note').textContent = schedule ? `${learned.length} из ${total} уровней изучено` : 'Считаем прогресс по плану…';
  const trackingError = trackingErrors.get(character.id);
  $('tracking-freshness').textContent = trackingError || `Обновлено ${trackingTime(character.fetched_at)} · автообновление каждые 5 минут`;
  $('tracking-freshness').classList.toggle('tracking-error',Boolean(trackingError));
  $('tracking-refresh').disabled = Boolean(trackingRefresh);
  $('tracking-refresh').textContent = trackingRefresh ? 'Обновляем…' : 'Обновить ESI';
  $('tracking-actions').innerHTML = character.queue == null ? '<p class="muted-note">Загружаем очередь и условия ближайших действий…</p>' : trackingActionCards(schedule,character,relation);
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
    if (catalog.warnings?.length) trackingErrors.set(character.id,catalog.warnings.join(' '));
    trackingLoaded.add(key);
    if (selectedCharacter === character.id) { renderTracking(); renderQueue(); paintAccelerationSummary(); }
  } catch(error) {
    trackingErrors.set(character.id,error.message);
    trackingLoaded.add(key);
    if (selectedCharacter === character.id) $('tracking-freshness').textContent = error.message;
  } finally { trackingLoading.delete(key); }
}
async function refreshTrackingCharacter(id, manual = false) {
  if (trackingRefresh || !id) return;
  if (!manual && Date.now()-(trackingAttempts.get(id) || 0) < TRACKING_REFRESH_MS) return;
  trackingAttempts.set(id,Date.now());
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
  try { showLearnedSkills = localStorage.getItem('skilly-show-learned') === 'true'; } catch (_) {}
  $('show-learned').addEventListener('change',()=>{
    showLearnedSkills = $('show-learned').checked;
    try { localStorage.setItem('skilly-show-learned',String(showLearnedSkills)); } catch (_) {}
    renderQueue(); paintAccelerationSummary();
  });
  $('tracking-refresh').addEventListener('click',()=>refreshTrackingCharacter(selectedCharacter,true));
  $('tracking-open-queue').addEventListener('click',()=>{
    renderActualQueue(currentCharacter()); $('actual-queue-dialog').showModal();
  });
  $('tracking-actions').addEventListener('click',event=>{
    const button=event.target.closest('[data-tracking-jump]');
    if(button)jumpToTrackingAction(button);
  });
  setInterval(()=>{
    if (!selectedCharacter || document.hidden || busy) return;
    renderTracking();
    document.querySelectorAll('#queue tr[data-row-index]').forEach(row => {
      const slot = row.querySelector('.queue-tracking-slot');
      if (slot) slot.innerHTML = queueRowTracking({id:Number(row.dataset.skillId),level:Number(row.dataset.skillLevel)});
    });
    const character = currentCharacter();
    if (character && Date.now()-character.fetched_at >= TRACKING_REFRESH_MS) refreshTrackingCharacter(selectedCharacter);
  },30000);
}
