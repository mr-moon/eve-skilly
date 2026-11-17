"use strict";
let queueSelection={key:'',indices:new Set(),anchor:null};
function queueBookEvents(schedule,injectedIds=[]){
  const opened=new Set(injectedIds.map(Number));
  return (schedule?.rows||[]).flatMap((row,index)=>{
    if(opened.has(row.id))return [];
    opened.add(row.id);return [{...row,index,day:row.start_day}];
  });
}
function syncQueueSelection(schedule,characterId){
  const key=JSON.stringify([characterId,(schedule?.rows||[]).map(r=>[r.id,r.level,r.start_day,r.end_day])]);
  if(key!==queueSelection.key)queueSelection={key,indices:new Set(),anchor:null};
}
function selectQueueIndex(index,count,{shift=false,toggle=false}={}){
  if(index<0||index>=count)return;
  if(shift&&queueSelection.anchor!==null){
    const first=Math.min(queueSelection.anchor,index),last=Math.max(queueSelection.anchor,index);
    queueSelection.indices=new Set(Array.from({length:last-first+1},(_,i)=>first+i));
  }else{
    if(!toggle)queueSelection.indices.clear();
    if(toggle&&queueSelection.indices.has(index))queueSelection.indices.delete(index);else queueSelection.indices.add(index);
    queueSelection.anchor=index;
  }
}
function selectedQueueText(schedule){
  return (schedule?.rows||[]).filter((_,index)=>queueSelection.indices.has(index)).map(row=>`${row.name} ${roman[row.level]}`).join('\n')+'\n';
}
function paintQueueSelection(){
  document.querySelectorAll('#queue tr[data-row-index]').forEach(row=>{
    const selected=queueSelection.indices.has(Number(row.dataset.rowIndex));
    row.classList.toggle('queue-selected',selected);row.setAttribute('aria-selected',String(selected));
  });
  const count=queueSelection.indices.size;
  $('queue-selection-status').textContent=count?t("queue_controls_295", count):t("queue_controls_296");
  $('queue-selection-clear').hidden=!count;
}
function renderBookEvent(event){
  const when=event.day<=1e-9?t("app_064"):t("app_065", duration(event.day), day(event.day));
  return t("queue_controls_297", event.id, esc(event.name), when, event.id);
}
function paintQueueBookPrices(){
  const current=typeof bookReport!=='undefined'&&bookReport&&bookRequestKey===bookContextKey();
  const prices=new Map(current?bookReport.rows.map(r=>[r.id,r.price]):[]);
  document.querySelectorAll('[data-book-price-id]').forEach(node=>{
    const price=prices.get(Number(node.dataset.bookPriceId));
    node.textContent=current?(Number.isFinite(price)?`${isk(price)} · Jita 4-4`:t("books_126")):t("queue_controls_298");
  });
}
function initQueueControls(){
  const queue=$('queue');
  $('distribution-toggle').addEventListener('click',()=>{
    const expanded=$('distribution-toggle').getAttribute('aria-expanded')==='true';
    $('distribution-toggle').setAttribute('aria-expanded',String(!expanded));
    $('attribute-distribution').hidden=expanded;
  });
  queue.addEventListener('mousedown',event=>{if(event.shiftKey&&event.target.closest('[data-row-index]'))event.preventDefault();});
  queue.addEventListener('click',event=>{
    const row=event.target.closest('tr[data-row-index]');if(!row||!activeSchedule())return;
    selectQueueIndex(Number(row.dataset.rowIndex),activeSchedule().rows.length,{shift:event.shiftKey,toggle:event.ctrlKey||event.metaKey});
    row.focus({preventScroll:true});paintQueueSelection();
  });
  queue.addEventListener('keydown',event=>{
    const row=event.target.closest('tr[data-row-index]');if(!row)return;
    const index=Number(row.dataset.rowIndex),count=activeSchedule()?.rows.length||0;
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();const next=Math.max(0,Math.min(count-1,index+(event.key==='ArrowDown'?1:-1)));
      if(queueSelection.anchor===null)queueSelection.anchor=index;
      selectQueueIndex(next,count,{shift:event.shiftKey});paintQueueSelection();
      queue.querySelector(`[data-row-index="${next}"]`)?.focus();
    }else if(event.key==='Escape'){queueSelection.indices.clear();queueSelection.anchor=null;paintQueueSelection();}
  });
  $('queue-selection-clear').addEventListener('click',()=>{queueSelection.indices.clear();queueSelection.anchor=null;paintQueueSelection();});
  const canCopy=event=>queueSelection.indices.size&&activeSchedule()&&queue.contains(document.activeElement)&&!document.querySelector('dialog[open]')&&!event.target.closest?.('input,textarea,select,[contenteditable="true"]');
  document.addEventListener('copy',event=>{
    if(!canCopy(event)||!event.clipboardData)return;
    event.clipboardData.setData('text/plain',selectedQueueText(activeSchedule()));event.preventDefault();
    notify(t("queue_controls_299", queueSelection.indices.size));
  });
  document.addEventListener('keydown',async event=>{
    if(!(event.ctrlKey||event.metaKey)||!(event.code==='KeyC'||event.key.toLowerCase()==='c')||!canCopy(event))return;
    if(!nativeDesktop)return; // Browser copy event writes synchronously without clipboard permissions.
    event.preventDefault();const text=selectedQueueText(activeSchedule());
    try{await nativeCommand('copy_text',{text});notify(t("queue_controls_299", queueSelection.indices.size));}
    catch(error){notify(t("queue_controls_300"),'error');}
  });
}
