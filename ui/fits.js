"use strict";
let fitReplacement=false,fitInputKey=null;
let fitRecords=[],fitUsages={},fitEditor=null,pyfaSearchTimer,pyfaSearchGeneration=0;
let fitOperation=null,fitView='preview';
const fitProgressScopes={editor:['fit-editor-dialog','fit-editor-progress'],pyfa:['pyfa-dialog','pyfa-progress'],inline:['fit-input','fit-import-progress']};
async function withFitProgress(scope,message,work){
 if(fitOperation)return;
 const [rootId,panelId]=fitProgressScopes[scope],root=$(rootId),panel=$(panelId),bar=panel.querySelector('progress');
 const controls=Array.from(root.querySelectorAll('[data-fit-controls]')),closers=Array.from(root.querySelectorAll('[data-modal-close]'));
 const previous=closers.map(button=>button.disabled),token={scope};fitOperation=token;
 if(scope==='editor')$('fit-editor-more').open=false;
 const step=text=>{$(panelId+'-text').textContent=text;};
 root.setAttribute('aria-busy','true');panel.dataset.state='loading';panel.hidden=false;bar.hidden=false;step(message);
 controls.forEach(node=>node.inert=true);closers.forEach(button=>button.disabled=true);
 try{const result=await work(step);panel.hidden=true;return result;}
 catch(error){panel.dataset.state='error';bar.hidden=true;step(error.message);throw error;}
 finally{controls.forEach(node=>node.inert=false);closers.forEach((button,i)=>button.disabled=previous[i]);root.setAttribute('aria-busy','false');if(fitOperation===token)fitOperation=null;}
}
function fitPreviewEntries(eft){
 const lines=eft.split(/\r?\n/).map(line=>line.trim()),header=lines.find(line=>/^\[[^\]]+,/.test(line))||'';
 const ship=header.slice(1,header.indexOf(',')).trim(),entries=new Map();
 for(const line of lines){
  if(/^\[\d+\]/.test(line))break;
  if(!line||line.startsWith('['))continue;
  const clean=line.replace(/\s+\[\d+\]$/,'');const match=clean.match(/^(.*?)\s+x(\d+)$/i);
  const name=match?match[1]:clean,count=match?Math.min(Number(match[2]),1e9):1;
  entries.set(name,(entries.get(name)||0)+count);
 }
 return {ship,entries:Array.from(entries,([name,count])=>({name,count}))};
}
function resizeFitEft(){const input=$('fit-editor-eft');if($('fit-editor-code').hidden)return;input.style.height='0px';input.style.height=Math.max(180,input.scrollHeight+2)+'px';}
function renderFitPreview(){
 const preview=fitPreviewEntries($('fit-editor-eft').value);
 $('fit-editor-preview').innerHTML=preview.entries.length?preview.entries.map(item=>`<div class="fit-item-row"><span>${esc(item.name)}</span><span class="fit-item-count">×${item.count}</span></div>`).join(''):'<p class="muted-note">Вставьте EFT во вкладке «Редактировать EFT».</p>';
 $('fit-editor-summary').textContent=[preview.ship,`${preview.entries.length} позиций`,fitEditor?.requirements?`${fitEditor.requirements.length} навыков`:null].filter(Boolean).join(' · ');
 const changed=!fitEditor||$('fit-editor-name').value!==fitEditor.name||$('fit-editor-eft').value!==fitEditor.eft;
 $('fit-editor-save').hidden=Boolean(fitEditor?.archived)||!changed;
 const empty=!$('fit-editor-eft').value.trim();$('fit-editor-bind').disabled=empty||Boolean(fitEditor?.archived)||Boolean(planGroup);$('fit-editor-new-plan').disabled=empty||Boolean(fitEditor?.archived);
}
function setFitView(view){fitView=view;$('fit-editor-preview').hidden=view!=='preview';$('fit-editor-code').hidden=view!=='eft';$('fit-view-preview').setAttribute('aria-pressed',String(view==='preview'));$('fit-view-eft').setAttribute('aria-pressed',String(view==='eft'));if(view==='eft')resizeFitEft();else renderFitPreview();}
function fitNameFromEft(text){const header=text.trim().split('\n')[0];return header.startsWith('[')?header.slice(1,header.lastIndexOf(']')).split(',').slice(1).join(',').trim()||header.slice(1,header.indexOf(',')):'Новый фит';}
function fitMinimums(){return new Map((plan?.fitting?.requirements||[]).map(r=>[r.id,r.level]));}
function renderFitBinding(){
 const fit=plan?.fitting,key=fit?`${fit.id}:${fit.version}`:'';
 if(key!==fitInputKey){fitReplacement=false;fitInputKey=key;}
 $('bound-fit').hidden=!fit;
 $('fit-import-controls').hidden=Boolean(fit)&&!fitReplacement;
 $('fit-mode-badge').textContent=fit?'Привязан':'EFT / PYFA';
 $('bound-fit-replace').hidden=fitReplacement;
 $('bound-fit-cancel').hidden=!fitReplacement;
 $('parse-eft').textContent=fit?'Заменить привязанный фит':'Сохранить фит и привязать';
 if(!fit)return;
 $('bound-fit-name').textContent=`${fit.name} · ${fit.ship}`;
 const latest=fitRecords.find(r=>r.id===fit.id);
 $('bound-fit-update').hidden=!latest||latest.version===fit.version;
 $('bound-fit-info').textContent=`Защищены требования фита · версия ${new Date(fit.version).toLocaleString('ru-RU')}${latest&&latest.version!==fit.version?' · есть новая версия':''}`;
}
async function loadFitLibrary(){const data=await api('/api/fits');fitRecords=data.fits;fitUsages=data.usages;
 $('pyfa-database').value=data.pyfa.database;$('pyfa-eve-database').value=data.pyfa.eve_database;
 if(plan)renderFitBinding();return data;
}
function fitLibraryRows(records){return records.map(f=>`<button type="button" class="saved-plan-row" data-open-fit="${esc(f.id)}"><span class="saved-plan-info"><strong>${esc(f.name)} <span class="active-plan-badge">ФИТ</span></strong><small>${esc(f.ship)} · ${f.source?'Pyfa':'EFT'} · ${(fitUsages[f.id]||[]).length} ${plural((fitUsages[f.id]||[]).length,['план','плана','планов'])} · ${new Date(f.version).toLocaleString('ru-RU')}</small></span></button>`).join('');}
function renderFitLibrary(){
 const q=$('library-search').value.trim().toLocaleLowerCase(),archived=$('fits-show-archived').checked;
 const records=fitRecords.filter(f=>f.archived===archived&&`${f.name} ${f.ship}`.toLocaleLowerCase().includes(q));
 $('library-list').innerHTML=fitLibraryRows(records)||'<p class="library-empty">'+(archived?'Корзина фитов пуста.':'Нет фитов. Вставьте EFT или найдите фит в Pyfa.')+'</p>';
}
function showFitEditor(fit=null){
 fitEditor=fit?JSON.parse(JSON.stringify(fit)):null;
 $('fit-editor-name').value=fit?.name||fitNameFromEft($('eft').value);
 $('fit-editor-eft').value=fit?.eft||$('eft').value;
 $('fit-editor-title').textContent=fit?.ship||'Новый фит';$('fit-editor-origin').textContent=fit?.source?'PYFA':'EFT';
 $('fit-editor-source').textContent=fit?.source?'Импортирован из Pyfa · проверка обновлений в меню действий':'По фиту рассчитываются требования навыков.';
 $('fit-editor-save').hidden=Boolean(fit?.archived);$('fit-editor-bind').disabled=!fit||fit.archived||Boolean(planGroup);
 $('fit-editor-new-plan').disabled=!fit||fit.archived;
 $('fit-editor-delete').hidden=!fit;$('fit-editor-delete').textContent=fit?.archived?'Восстановить':'В корзину';
 $('fit-editor-check').hidden=!fit?.source||fit.archived;$('fit-editor-pyfa-update').hidden=true;
 if(!fitOperation||fitOperation.scope!=='editor')$('fit-editor-progress').hidden=true;
 $('fit-editor-more').open=false;
 if(!$('fit-editor-dialog').open)$('fit-editor-dialog').showModal();
 setFitView(fit?'preview':'eft');renderFitPreview();
}
async function saveFitEditor(){
 const record=await api('/api/fits/save',{id:fitRecords.some(f=>f.id===fitEditor?.id)?fitEditor.id:null,name:$('fit-editor-name').value,eft:$('fit-editor-eft').value});
 items=record.items;showFitEditor(record.fit);await loadFitLibrary();renderLibrary();notify('Фит сохранён. Привязанные планы сохраняют прежнюю версию до обновления.');
}
function attachFit(fit){
 if(planGroup)throw new Error('Привязывайте фиты к исходным планам группы.');
 fitReplacement=false;
 plan.fitting=JSON.parse(JSON.stringify(fit));delete plan.fitting.archived;
 $('eft').value=fit.eft;mergeGoals(JSON.parse(JSON.stringify(fit.requirements)));
 invalidate();renderFitBinding();queueDraft();
}
async function useFit(fresh){
 if(busy||fitOperation)return;
 if(fresh&&!await canLeaveDraft('Создать план из фита? Сохраните текущий план или оставьте его без изменений.'))return;
 if(!fresh&&plan.fitting&&plan.fitting.id!==fitEditor?.id&&!await confirmAction('Заменить привязанный фит? Дополнительные цели останутся в плане.'))return;
 await action('Добавляем фит в план…',()=>withFitProgress('editor','Проверяем фит и требования навыков…',async step=>{
  if(!fitEditor||$('fit-editor-name').value!==fitEditor.name||$('fit-editor-eft').value!==fitEditor.eft){step('Загружаем требования навыков из ESI…');await saveFitEditor();}
  step('Создаём очередь навыков…');
  if(fresh){await settleDraft();applyWorkspace({plan:{...newPlan(),name:fitEditor.name}});}
  if(!fresh&&!plan.goals.length&&['Новый план','Новый пилот'].includes(plan.name)){plan.name=fitEditor.name;$('name').value=plan.name;}
  attachFit(fitEditor);$('fit-editor-dialog').close();showEditor();notify('Фит добавлен. Оптимизируем очередь…');
 }));
}
async function parseBoundEft(){
 if(planGroup)return;
 if(plan.fitting&&!await confirmAction('Сохранить этот EFT как новый фит и заменить привязку плана?'))return;
 await action('Сохраняем фит и загружаем требования…',()=>withFitProgress('inline','Загружаем корабль, модули и требования навыков из ESI…',async step=>{
  const data=await api('/api/fits/save',{name:fitNameFromEft($('eft').value),eft:$('eft').value});items=data.items;
  if(!plan.goals.length&&['Новый план','Новый пилот'].includes(plan.name)){plan.name=data.fit.name;$('name').value=plan.name;}
  step('Добавляем навыки в план…');attachFit(data.fit);await loadFitLibrary();notify('Фит сохранён и привязан к плану');
 }));
}
async function openPyfa(){
 $('pyfa-dialog').showModal();await withFitProgress('pyfa','Открываем библиотеку Pyfa…',async()=>{await loadFitLibrary();await searchPyfa();});$('pyfa-search').focus();
}
async function searchPyfa(){
 const generation=++pyfaSearchGeneration;$('pyfa-status').textContent='Ищем в Pyfa…';
 try{const data=await api('/api/fits/pyfa/search',{query:$('pyfa-search').value});if(generation!==pyfaSearchGeneration)return;
  $('pyfa-results').innerHTML=data.fits.map(f=>`<button type="button" class="saved-plan-row" data-pyfa-import="${f.id}"><span class="saved-plan-info"><strong>${esc(f.name)}</strong><small>${esc(f.ship)} · ${esc(f.updated)}</small></span></button>`).join('')||'<p class="library-empty">Фиты не найдены.</p>';
  $('pyfa-status').textContent=`${data.fits.length}${data.fits.length===100?'+':''} фитов · нажмите для импорта`;
 }catch(e){if(generation!==pyfaSearchGeneration)return;$('pyfa-status').textContent=e.message;$('pyfa-results').replaceChildren();$('pyfa-settings').open=true;}
}
function initFits(){
 $('fit-view-preview').addEventListener('click',()=>setFitView('preview'));$('fit-view-eft').addEventListener('click',()=>setFitView('eft'));
 const fitEdited=()=>{if(!fitOperation)$('fit-editor-progress').hidden=true;renderFitPreview();};
 $('fit-editor-name').addEventListener('input',fitEdited);$('fit-editor-eft').addEventListener('input',()=>{fitEdited();resizeFitEft();});
 window.addEventListener('resize',resizeFitEft);
 for(const id of ['fit-editor-dialog','pyfa-dialog'])$(id).addEventListener('cancel',event=>{if($(id).getAttribute('aria-busy')==='true')event.preventDefault();});
 $('fit-choose-library').addEventListener('click',()=>action('Открываем фиты…',async()=>{libraryFilter='fits';await loadLibrary();showPage('library');}));
 $('fit-choose-pyfa').addEventListener('click',()=>action('Читаем Pyfa…',openPyfa));
 $('fits-import-pyfa').addEventListener('click',()=>action('Читаем Pyfa…',openPyfa));
 $('fits-new').addEventListener('click',()=>showFitEditor());
 $('fits-show-archived').addEventListener('change',renderLibrary);
 $('library-list').addEventListener('click',event=>{const row=event.target.closest('[data-open-fit]');if(row)showFitEditor(fitRecords.find(f=>f.id===row.dataset.openFit));});
 $('fit-editor-save').addEventListener('click',()=>action('Сохраняем фит…',()=>withFitProgress('editor','Загружаем требования навыков из ESI…',saveFitEditor)));
 $('fit-editor-bind').addEventListener('click',()=>{useFit(false).catch(e=>notify(e.message,'error'));});
 $('fit-editor-new-plan').addEventListener('click',()=>{useFit(true).catch(e=>notify(e.message,'error'));});
 $('fit-editor-delete').addEventListener('click',async()=>{
  if(!fitEditor||!await confirmAction(fitEditor.archived?'Восстановить фит?':'Переместить фит в корзину? Его можно будет восстановить.'))return;
  await action('Обновляем библиотеку фитов…',()=>withFitProgress('editor','Обновляем библиотеку фитов…',async()=>{await persistDraft();await api('/api/fits/archive',{id:fitEditor.id,archived:!fitEditor.archived});$('fit-editor-dialog').close();await loadFitLibrary();renderLibrary();}));
 });
 $('fit-editor-check').addEventListener('click',()=>action('Проверяем исходник Pyfa…',()=>withFitProgress('editor','Проверяем исходный фит в Pyfa…',async()=>{const data=await api('/api/fits/pyfa/check',{id:fitEditor.id});$('fit-editor-pyfa-update').hidden=!data.changed;$('fit-editor-source').textContent=data.changed?'В Pyfa есть новая версия. Обновите фит, затем требования нужного плана.':'Фит совпадает с Pyfa.';})));
 $('fit-editor-pyfa-update').addEventListener('click',async()=>{if(!await confirmAction('Обновить фит из Pyfa? Привязанные планы сохранят прежнюю версию.'))return;await action('Обновляем фит…',()=>withFitProgress('editor','Обновляем фит и загружаем требования навыков…',async()=>{const data=await api('/api/fits/pyfa/import',{id:fitEditor.id});items=data.items;showFitEditor(data.fit);await loadFitLibrary();renderLibrary();}));});
 $('bound-fit-replace').addEventListener('click',()=>{fitReplacement=true;$('eft').value='';renderFitBinding();$('eft').focus();});
 $('bound-fit-cancel').addEventListener('click',()=>{fitReplacement=false;$('eft').value=plan.fitting?.eft||'';renderFitBinding();queueDraft();});
 $('bound-fit-view').addEventListener('click',()=>showFitEditor(plan.fitting));
 $('bound-fit-detach').addEventListener('click',async()=>{if(!await confirmAction('Отвязать фит? Навыки останутся в плане, защита требований фита будет снята.'))return;plan.fitting=null;invalidate();renderFitBinding();queueDraft();});
 $('bound-fit-update').addEventListener('click',async()=>{if(!await confirmAction('Обновить требования плана до последней версии фита? Уже добавленные цели останутся.'))return;await action('Обновляем требования фита…',async()=>{await loadFitLibrary();const fit=fitRecords.find(f=>f.id===plan.fitting.id);if(!fit)throw new Error('Фит отсутствует в библиотеке. Снимок плана сохранён.');attachFit(fit);});});
 $('pyfa-search').addEventListener('input',()=>{pyfaSearchGeneration++;clearTimeout(pyfaSearchTimer);pyfaSearchTimer=setTimeout(searchPyfa,250);});
 $('pyfa-results').addEventListener('click',event=>{const row=event.target.closest('[data-pyfa-import]');if(!row)return;pyfaSearchGeneration++;clearTimeout(pyfaSearchTimer);action('Импортируем требования из Pyfa…',()=>withFitProgress('pyfa','Импортируем фит и загружаем требования навыков из ESI…',async step=>{const data=await api('/api/fits/pyfa/import',{fit_id:Number(row.dataset.pyfaImport)});items=data.items;step('Сохраняем фит в библиотеке…');await loadFitLibrary();$('pyfa-dialog').close();libraryFilter='fits';renderLibrary();showFitEditor(data.fit);}));});
 $('pyfa-config-save').addEventListener('click',()=>action('Подключаем базу Pyfa…',()=>withFitProgress('pyfa','Подключаем базы Pyfa…',async()=>{await api('/api/fits/pyfa/config',{database:$('pyfa-database').value,eve_database:$('pyfa-eve-database').value});$('pyfa-settings').open=false;await searchPyfa();})));
 document.querySelectorAll('[data-pyfa-pick]').forEach(button=>{button.hidden=!nativeDesktop;button.addEventListener('click',async()=>{try{const path=await nativeCommand('pick_pyfa_database');if(path)$(button.dataset.pyfaPick).value=path;}catch(e){notify(e.message,'error');}});});
}
