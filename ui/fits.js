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
 $('fit-editor-preview').innerHTML=preview.entries.length?preview.entries.map(item=>`<div class="fit-item-row"><span>${esc(item.name)}</span><span class="fit-item-count">×${item.count}</span></div>`).join(''):t("fits_168");
 $('fit-editor-summary').textContent=[preview.ship,t("fits_169", preview.entries.length),fitEditor?.requirements?t("fits_170", fitEditor.requirements.length):null].filter(Boolean).join(' · ');
 const changed=!fitEditor||$('fit-editor-name').value!==fitEditor.name||$('fit-editor-eft').value!==fitEditor.eft;
 $('fit-editor-save').hidden=Boolean(fitEditor?.archived)||!changed;
 const empty=!$('fit-editor-eft').value.trim();$('fit-editor-bind').disabled=empty||Boolean(fitEditor?.archived)||Boolean(planGroup);$('fit-editor-new-plan').disabled=empty||Boolean(fitEditor?.archived);
}
function setFitView(view){fitView=view;$('fit-editor-preview').hidden=view!=='preview';$('fit-editor-code').hidden=view!=='eft';$('fit-view-preview').setAttribute('aria-pressed',String(view==='preview'));$('fit-view-eft').setAttribute('aria-pressed',String(view==='eft'));if(view==='eft')resizeFitEft();else renderFitPreview();}
function fitNameFromEft(text){const header=text.trim().split('\n')[0];return header.startsWith('[')?header.slice(1,header.lastIndexOf(']')).split(',').slice(1).join(',').trim()||header.slice(1,header.indexOf(',')):t("fits_171");}
function fitMinimums(){
  const minimums=new Map();
  const fits=[plan?.fitting,...(planGroup?.members||[]).map(member=>member.fitting)].filter(Boolean);
  for(const fit of fits)for(const r of fit.requirements||[])minimums.set(r.id,Math.max(minimums.get(r.id)||0,r.level));
  return minimums;
}
function renderFitBinding(){
 const fit=plan?.fitting,key=fit?`${fit.id}:${fit.version}`:'';
 if(key!==fitInputKey){fitReplacement=false;fitInputKey=key;}
 $('bound-fit').hidden=!fit;
 $('fit-import-controls').hidden=Boolean(fit)&&!fitReplacement;
 $('fit-mode-badge').textContent=fit?t("fits_172"):'EFT / PYFA';
 $('bound-fit-replace').hidden=fitReplacement;
 $('bound-fit-cancel').hidden=!fitReplacement;
 $('parse-eft').textContent=fit?t("fits_173"):t("fits_174");
 if(!fit)return;
 $('bound-fit-name').textContent=`${fit.name} · ${fit.ship}`;
 const latest=fitRecords.find(r=>r.id===fit.id);
 $('bound-fit-update').hidden=!latest||latest.version===fit.version;
 $('bound-fit-info').textContent=t("fits_175", new Date(fit.version).toLocaleString(uiLocale()), latest&&latest.version!==fit.version?t("fits_176"):'');
}
async function loadFitLibrary(){const data=await api('/api/fits');fitRecords=data.fits;fitUsages=data.usages;
 $('pyfa-database').value=data.pyfa.database;$('pyfa-eve-database').value=data.pyfa.eve_database;
 if(plan)renderFitBinding();return data;
}
function fitLibraryRows(records){return records.map(f=>t("fits_177", esc(f.id), esc(f.name), esc(f.ship), f.source?'Pyfa':'EFT', (fitUsages[f.id]||[]).length, plural((fitUsages[f.id]||[]).length,[t("fits_178"),t("fits_179"),t("fits_180")]), new Date(f.version).toLocaleString(uiLocale()))).join('');}
function renderFitLibrary(){
 const q=$('library-search').value.trim().toLocaleLowerCase(),archived=$('fits-show-archived').checked;
 const records=fitRecords.filter(f=>f.archived===archived&&`${f.name} ${f.ship}`.toLocaleLowerCase().includes(q));
 $('library-list').innerHTML=fitLibraryRows(records)||'<p class="library-empty">'+(archived?t("fits_181"):t("fits_182"))+'</p>';
}
function showFitEditor(fit=null){
 fitEditor=fit?JSON.parse(JSON.stringify(fit)):null;
 $('fit-editor-name').value=fit?.name||fitNameFromEft($('eft').value);
 $('fit-editor-eft').value=fit?.eft||$('eft').value;
 $('fit-editor-title').textContent=fit?.ship||t("fits_171");$('fit-editor-origin').textContent=fit?.source?'PYFA':'EFT';
 $('fit-editor-source').textContent=fit?.source?t("fits_183"):t("fits_184");
 $('fit-editor-save').hidden=Boolean(fit?.archived);$('fit-editor-bind').disabled=!fit||fit.archived||Boolean(planGroup);
 $('fit-editor-new-plan').disabled=!fit||fit.archived;
 $('fit-editor-delete').hidden=!fit;$('fit-editor-delete').textContent=fit?.archived?t("fits_185"):t("fits_186");
 $('fit-editor-check').hidden=!fit?.source||fit.archived;$('fit-editor-pyfa-update').hidden=true;
 if(!fitOperation||fitOperation.scope!=='editor')$('fit-editor-progress').hidden=true;
 $('fit-editor-more').open=false;
 if(!$('fit-editor-dialog').open)$('fit-editor-dialog').showModal();
 setFitView(fit?'preview':'eft');renderFitPreview();
}
async function saveFitEditor(){
 const record=await api('/api/fits/save',{id:fitRecords.some(f=>f.id===fitEditor?.id)?fitEditor.id:null,name:$('fit-editor-name').value,eft:$('fit-editor-eft').value});
 items=record.items;showFitEditor(record.fit);await loadFitLibrary();renderLibrary();notify(t("fits_187"));
}
function attachFit(fit){
 if(planGroup)throw new Error(t("fits_188"));
 fitReplacement=false;
 plan.fitting=JSON.parse(JSON.stringify(fit));delete plan.fitting.archived;
 $('eft').value=fit.eft;mergeGoals(JSON.parse(JSON.stringify(fit.requirements)));
 invalidate();renderFitBinding();queueDraft();
}
async function useFit(fresh){
 if(busy||fitOperation)return;
 if(fresh&&!await canLeaveDraft(t("fits_189")))return;
 if(!fresh&&plan.fitting&&plan.fitting.id!==fitEditor?.id&&!await confirmAction(t("fits_190")))return;
 await action(t("fits_191"),()=>withFitProgress('editor',t("fits_192"),async step=>{
  if(!fitEditor||$('fit-editor-name').value!==fitEditor.name||$('fit-editor-eft').value!==fitEditor.eft){step(t("fits_193"));await saveFitEditor();}
  step(t("fits_194"));
  if(fresh){await settleDraft();applyWorkspace({plan:{...newPlan(),name:fitEditor.name}});}
  if(!fresh&&!plan.goals.length&&[t("app_040"),t("fits_195")].includes(plan.name)){plan.name=fitEditor.name;$('name').value=plan.name;}
  attachFit(fitEditor);$('fit-editor-dialog').close();showEditor();notify(t("fits_196"));
 }));
}
async function parseBoundEft(){
 if(planGroup)return;
 if(plan.fitting&&!await confirmAction(t("fits_197")))return;
 await action(t("fits_198"),()=>withFitProgress('inline',t("fits_199"),async step=>{
  const data=await api('/api/fits/save',{name:fitNameFromEft($('eft').value),eft:$('eft').value});items=data.items;
  if(!plan.goals.length&&[t("app_040"),t("fits_195")].includes(plan.name)){plan.name=data.fit.name;$('name').value=plan.name;}
  step(t("fits_200"));attachFit(data.fit);await loadFitLibrary();notify(t("fits_201"));
 }));
}
async function openPyfa(){
 $('pyfa-dialog').showModal();await withFitProgress('pyfa',t("fits_202"),async()=>{await loadFitLibrary();await searchPyfa();});$('pyfa-search').focus();
}
async function searchPyfa(){
 const generation=++pyfaSearchGeneration;$('pyfa-status').textContent=t("fits_203");
 try{const data=await api('/api/fits/pyfa/search',{query:$('pyfa-search').value});if(generation!==pyfaSearchGeneration)return;
  $('pyfa-results').innerHTML=data.fits.map(f=>`<button type="button" class="saved-plan-row" data-pyfa-import="${f.id}"><span class="saved-plan-info"><strong>${esc(f.name)}</strong><small>${esc(f.ship)} · ${esc(f.updated)}</small></span></button>`).join('')||t("fits_204");
  $('pyfa-status').textContent=t("fits_205", data.fits.length, data.fits.length===100?'+':'');
 }catch(e){if(generation!==pyfaSearchGeneration)return;$('pyfa-status').textContent=e.message;$('pyfa-results').replaceChildren();$('pyfa-settings').open=true;}
}
function initFits(){
 $('fit-view-preview').addEventListener('click',()=>setFitView('preview'));$('fit-view-eft').addEventListener('click',()=>setFitView('eft'));
 const fitEdited=()=>{if(!fitOperation)$('fit-editor-progress').hidden=true;renderFitPreview();};
 $('fit-editor-name').addEventListener('input',fitEdited);$('fit-editor-eft').addEventListener('input',()=>{fitEdited();resizeFitEft();});
 window.addEventListener('resize',resizeFitEft);
 for(const id of ['fit-editor-dialog','pyfa-dialog'])$(id).addEventListener('cancel',event=>{if($(id).getAttribute('aria-busy')==='true')event.preventDefault();});
 $('fit-choose-library').addEventListener('click',()=>action(t("fits_206"),async()=>{libraryFilter='fits';await loadLibrary();showPage('library');}));
 $('fit-choose-pyfa').addEventListener('click',()=>action(t("fits_207"),openPyfa));
 $('fits-import-pyfa').addEventListener('click',()=>action(t("fits_207"),openPyfa));
 $('fits-new').addEventListener('click',()=>showFitEditor());
 $('fits-show-archived').addEventListener('change',renderLibrary);
 $('library-list').addEventListener('click',event=>{const row=event.target.closest('[data-open-fit]');if(row)showFitEditor(fitRecords.find(f=>f.id===row.dataset.openFit));});
 $('fit-editor-save').addEventListener('click',()=>action(t("fits_208"),()=>withFitProgress('editor',t("fits_193"),saveFitEditor)));
 $('fit-editor-bind').addEventListener('click',()=>{useFit(false).catch(e=>notify(e.message,'error'));});
 $('fit-editor-new-plan').addEventListener('click',()=>{useFit(true).catch(e=>notify(e.message,'error'));});
 $('fit-editor-delete').addEventListener('click',async()=>{
  if(!fitEditor||!await confirmAction(fitEditor.archived?t("fits_209"):t("fits_210")))return;
  await action(t("fits_211"),()=>withFitProgress('editor',t("fits_211"),async()=>{await persistDraft();await api('/api/fits/archive',{id:fitEditor.id,archived:!fitEditor.archived});$('fit-editor-dialog').close();await loadFitLibrary();renderLibrary();}));
 });
 $('fit-editor-check').addEventListener('click',()=>action(t("fits_212"),()=>withFitProgress('editor',t("fits_213"),async()=>{const data=await api('/api/fits/pyfa/check',{id:fitEditor.id});$('fit-editor-pyfa-update').hidden=!data.changed;$('fit-editor-source').textContent=data.changed?t("fits_214"):t("fits_215");})));
 $('fit-editor-pyfa-update').addEventListener('click',async()=>{if(!await confirmAction(t("fits_216")))return;await action(t("fits_217"),()=>withFitProgress('editor',t("fits_218"),async()=>{const data=await api('/api/fits/pyfa/import',{id:fitEditor.id});items=data.items;showFitEditor(data.fit);await loadFitLibrary();renderLibrary();}));});
 $('bound-fit-replace').addEventListener('click',()=>{fitReplacement=true;$('eft').value='';renderFitBinding();$('eft').focus();});
 $('bound-fit-cancel').addEventListener('click',()=>{fitReplacement=false;$('eft').value=plan.fitting?.eft||'';renderFitBinding();queueDraft();});
 $('bound-fit-view').addEventListener('click',()=>showFitEditor(plan.fitting));
 $('bound-fit-detach').addEventListener('click',async()=>{if(!await confirmAction(t("fits_219")))return;plan.fitting=null;invalidate();renderFitBinding();queueDraft();});
 $('bound-fit-update').addEventListener('click',async()=>{if(!await confirmAction(t("fits_220")))return;await action(t("fits_221"),async()=>{await loadFitLibrary();const fit=fitRecords.find(f=>f.id===plan.fitting.id);if(!fit)throw new Error(t("fits_222"));attachFit(fit);});});
 $('pyfa-search').addEventListener('input',()=>{pyfaSearchGeneration++;clearTimeout(pyfaSearchTimer);pyfaSearchTimer=setTimeout(searchPyfa,250);});
 $('pyfa-results').addEventListener('click',event=>{const row=event.target.closest('[data-pyfa-import]');if(!row)return;pyfaSearchGeneration++;clearTimeout(pyfaSearchTimer);action(t("fits_223"),()=>withFitProgress('pyfa',t("fits_224"),async step=>{const data=await api('/api/fits/pyfa/import',{fit_id:Number(row.dataset.pyfaImport)});items=data.items;step(t("fits_225"));await loadFitLibrary();$('pyfa-dialog').close();libraryFilter='fits';renderLibrary();showFitEditor(data.fit);}));});
 $('pyfa-config-save').addEventListener('click',()=>action(t("fits_226"),()=>withFitProgress('pyfa',t("fits_227"),async()=>{await api('/api/fits/pyfa/config',{database:$('pyfa-database').value,eve_database:$('pyfa-eve-database').value});$('pyfa-settings').open=false;await searchPyfa();})));
 document.querySelectorAll('[data-pyfa-pick]').forEach(button=>{button.hidden=!nativeDesktop;button.addEventListener('click',async()=>{try{const path=await nativeCommand('pick_pyfa_database');if(path)$(button.dataset.pyfaPick).value=path;}catch(e){notify(e.message,'error');}});});
}
