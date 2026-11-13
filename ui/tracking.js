"use strict";

let showLearnedSkills = false;
let trackingRefresh = null;
const trackingErrors = new Map();
const trackingAttempts = new Map();
const trackingItems = {};
const trackingLoaded = new Set();
const trackingPurchases = new Map();
const trackingLoading = new Set();
const trackingPurchasePending = new Set();
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
function trackingPurchase(key, label, characterId) {
  const checked = trackingPurchases.get(characterId)?.has(key) || false;
  const disabled = !trackingPurchases.has(characterId) || trackingPurchasePending.has(`${characterId}-${key}`);
  return `<label class="tracking-purchase"><input type="checkbox" data-tracking-purchase="${esc(key)}" ${checked?'checked':''} ${disabled?'disabled':''}><span>${esc(label)}</span><small>${checked?'Куплено':'Отметить покупку'}</small></label>`;
}
function trackingActionCards(schedule, character, relation) {
  if (!schedule) return '<p class="muted-note">Обновляем рекомендации по плану…</p>';
  const computedAt = selectedAdaptation()?.computed_at || Date.now();
  const events = scheduleEvents(schedule);
  const cards = [];
  for (const event of events) {
    const anchor = eventAnchor(event, schedule, relation, computedAt);
    const nextName = anchor.row ? `${anchor.row.name} ${roman[anchor.row.level]}` : 'следующим этапом';
    const when = anchor.aligned ? `${trackingTime(anchor.time)} · по очереди ESI` : `${trackingTime(anchor.time)} · прогноз по плану`;
    if (event.kind === 'remap') {
      const from = anchor.aligned ? relation.actual.findIndex(entry => queueKey(entry) === queueKey(anchor.row)) : 0;
      const saving = actualRemapSaving(event.attributes, character, relation.actual.slice(Math.max(0, from)));
      const spentBefore = schedule.remaps.filter(remap => remap.day < event.day - 1e-8).length;
      const annualDate = queueDate(character.next_remap);
      const annualRestored = annualDate !== null && annualDate > character.fetched_at && annualDate <= anchor.time;
      const available = character.remap_count + Number(annualRestored) > spentBefore;
      let assessment = 'Нужны данные всех навыков очереди для оценки выгоды.';
      if (saving !== null) assessment = saving > 0 ? `Экономия ${duration(saving)} на оставшейся очереди ESI с этими атрибутами.` : `На оставшейся очереди ESI выигрыш отсутствует${saving < 0 ? ` · потеря ${duration(-saving)}` : ''}.`;
      const status = anchor.aligned && available && saving > 0 ? 'По очереди' : 'Нужна сверка';
      cards.push(`<article class="tracking-action"><div class="tracking-action-heading"><strong>Сделать remap</strong><span>${status}</span></div><p>${when} · перед ${esc(nextName)}</p><div class="event-attributes">${codes.map((code,i)=>`<span>${code} <b>${event.attributes[i]}</b></span>`).join('')}</div><p>${assessment}</p><small>Оценка без бустеров и следующих ремапов. ${available?'Доступность проверена по данным ESI.':'По данным ESI remap пока недоступен.'} ${anchor.aligned?'':'Порядок очереди отличается или этап ещё не поставлен в игру.'}</small></article>`);
      continue;
    }
    const purchases = event.purchases.map((bonus,index)=>({bonus,index})).filter(item => item.bonus > (character.bonuses?.[item.index] || 0));
    if (!purchases.length) continue;
    const cyberSkill = trackingSkill(3411);
    const cyberPoints = character.trained?.[3411] || 0;
    const unlocked = cyberPoints >= skillPoints(cyberSkill?.rank || 3, event.cybernetics);
    const unlock = relation.actual.find(entry => entry.skill_id === 3411 && entry.finished_level >= event.cybernetics);
    const unlockDate = queueDate(unlock?.finish_date);
    const requirement = unlocked ? 'Cybernetics изучен · установка доступна' : `Установка после Cybernetics ${roman[event.cybernetics]}${unlockDate !== null?` · ${trackingTime(unlockDate)} по ESI`:''}`;
    const rows = purchases.map(item => {
      const single = {...event,purchases:event.purchases.map((bonus,index)=>index===item.index?bonus:0)};
      return trackingPurchase(`implant-${item.index}-${item.bonus}`, implantLabels(single)[0], character.id);
    }).join('');
    cards.push(`<article class="tracking-action"><div class="tracking-action-heading"><strong>Купить и установить импланты</strong><span>${unlocked?'Доступно':'После обучения'}</span></div><p>${when} · перед ${esc(nextName)}</p><p>${requirement}</p>${rows}<small>Можно купить заранее. Установка проверяется при обновлении ESI.</small></article>`);
  }
  const injected = new Set(character.injected_skill_ids || []);
  const books = queueBookEvents(schedule, Array.from(injected));
  if (books.length) {
    cards.push(`<article class="tracking-action"><strong>Подготовить книги навыков</strong><p>До первого уровня соответствующего навыка</p>${books.map(event => trackingPurchase(`book-${event.id}`, event.name, character.id)).join('')}</article>`);
  }
  return cards.join('') || '<p class="muted-note">По текущему расчёту дополнительных действий нет.</p>';
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
    const [catalog, saved] = await Promise.all([
      api('/api/characters/queue-items',{id:character.id}),
      api('/api/characters/tracking',{id:character.id})
    ]);
    Object.assign(trackingItems,catalog.items);
    if (catalog.warnings?.length) trackingErrors.set(character.id,catalog.warnings.join(' '));
    if (!trackingPurchases.has(character.id)) trackingPurchases.set(character.id,new Set(saved.purchases));
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
  $('tracking-actions').addEventListener('change',async event=>{
    const input = event.target.closest('[data-tracking-purchase]');
    if (!input) return;
    const id = selectedCharacter, key = input.dataset.trackingPurchase, pending = `${id}-${key}`;
    trackingPurchasePending.add(pending); input.disabled = true;
    try {
      const saved = await api('/api/characters/tracking',{id,key,purchased:input.checked});
      trackingPurchases.set(id,new Set(saved.purchases));
    } catch(error) { notify(error.message,'error'); }
    finally { trackingPurchasePending.delete(pending); renderTracking(); }
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
