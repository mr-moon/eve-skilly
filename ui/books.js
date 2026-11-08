"use strict";
let bookReport=null,bookRequestKey='',bookGeneration=0;
function bookContextKey(){
  const schedule=activeSchedule();if(!schedule)return '';
  const ids=Array.from(new Set(schedule.rows.map(row=>row.id))).sort((a,b)=>a-b);
  return JSON.stringify([ids,selectedCharacter,currentCharacter()?.fetched_at||0]);
}
function resetBookCosts(){bookGeneration++;bookRequestKey='';bookReport=null;$('books-dialog')?.close();}
function isk(value){return `${value.toLocaleString('ru-RU',{maximumFractionDigits:2})} ISK`;}
function bookTotal(report){return report.required&&report.missing===report.required?'Цена неизвестна':`${report.missing?'≥ ':report.required?'≈ ':''}${isk(report.total)}`;}
function paintBookCosts(){
  if(!bookReport)return;
  $('book-cost-summary').textContent=bookTotal(bookReport);
  $('book-cost-note').textContent=`${bookReport.required} ${plural(bookReport.required,['книга','книги','книг'])}${bookReport.missing?` · нет цены для ${bookReport.missing}`:' · Jita 4-4'}`;
  $('books-open').title=`${bookReport.required} книг · ${bookTotal(bookReport)} · Jita 4-4, Fuzzwork sell.percentile${bookReport.missing?` · нет цены для ${bookReport.missing}`:''}`;
  renderJourney();
  if(!$('books-dialog').open)return;
  $('books-total').textContent=bookTotal(bookReport);
  $('books-count').textContent=`Нужно купить: ${bookReport.required}. Уже введённых из оставшейся очереди исключено: ${bookReport.already_injected}.`;
  const date=bookReport.fetched_at?new Date(bookReport.fetched_at).toLocaleString('ru-RU'):'ещё не загружены';
  $('books-dates').textContent=`Самая старая проверка цен в этой оценке: ${date}. Кэш — до 30 минут.`;
  $('books-warnings').textContent=[...bookReport.warnings,bookReport.missing?`Для ${bookReport.missing} книг нет цены Jita. Итог содержит только известные цены.`:''].filter(Boolean).join(' ');
  $('books-rows').innerHTML=bookReport.rows.map(row=>`<tr><td>${esc(items[row.id]?.name||row.name)}</td><td>1</td><td>${row.price===null?'Нет цены Jita':isk(row.price)}</td><td>${row.checked_at?new Date(row.checked_at).toLocaleString('ru-RU'):'Не загружено'}</td></tr>`).join('')||'<tr><td colspan="4">Покупка книг не требуется.</td></tr>';
}
async function fetchBookCosts(refresh=false){
  const key=bookContextKey();if(!key)return;
  const generation=++bookGeneration;bookRequestKey=key;
  const ids=Array.from(new Set(activeSchedule().rows.map(row=>row.id)));
  try{
    const report=await api('/api/books',{ids,character_id:selectedCharacter,character_summary:selectedCharacter?selectedAdaptation()?.character:null,refresh});
    if(generation!==bookGeneration||key!==bookContextKey())return;
    bookReport=report;paintBookCosts();
  }catch(error){
    if(generation!==bookGeneration||key!==bookContextKey())return;
    $('book-cost-summary').textContent='Недоступно';$('book-cost-note').textContent=error.message;$('books-open').title=error.message;
    if($('books-dialog').open){$('books-total').textContent='—';$('books-count').textContent='';$('books-rows').textContent='';$('books-warnings').textContent=error.message;}
  }
}
function renderBookCosts(){
  const key=bookContextKey();$('books-open').disabled=!key;
  if(!key){bookGeneration++;bookRequestKey='';bookReport=null;$('books-open').title='';$('book-cost-summary').textContent='—';$('book-cost-note').textContent=plan.goals.length?'Ожидаем оптимизированную очередь…':'Добавьте навыки в план';return;}
  if(key===bookRequestKey)return;
  bookReport=null;$('books-open').title='';$('book-cost-summary').textContent='Считаем…';$('book-cost-note').textContent='Jita 4-4';
  fetchBookCosts();
}
function initBooks(){
  $('books-open').addEventListener('click',async()=>{
    if(!activeSchedule()){renderBookCosts();notify('Дождитесь автоматического обновления очереди','error');return;}
    if(!bookReport){$('books-total').textContent='Считаем…';$('books-count').textContent='';$('books-rows').textContent='';}
    $('books-dialog').showModal();$('books-context').textContent=`${plan.name} · ${selectedCharacter?currentCharacter()?.name||'персонаж':'общий план'} · оптимизированная очередь`;
    $('books-warnings').textContent='';paintBookCosts();await fetchBookCosts();
  });
  $('books-close').addEventListener('click',()=>$('books-dialog').close());
  $('books-refresh').addEventListener('click',async()=>{const button=$('books-refresh');button.disabled=true;$('books-warnings').textContent='Обновляем цены Jita 4-4…';try{await fetchBookCosts(true);}finally{button.disabled=false;}});
}
