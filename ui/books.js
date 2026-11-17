"use strict";
let bookReport=null,bookRequestKey='',bookGeneration=0;
function bookContextKey(){
  const schedule=activeSchedule();if(!schedule)return '';
  const ids=Array.from(new Set(schedule.rows.map(row=>row.id))).sort((a,b)=>a-b);
  return JSON.stringify([ids,selectedCharacter,currentCharacter()?.fetched_at||0]);
}
function resetBookCosts(){bookGeneration++;bookRequestKey='';bookReport=null;$('books-dialog')?.close();}
function isk(value){return `${value.toLocaleString(uiLocale(),{maximumFractionDigits:2})} ISK`;}
function bookTotal(report){return report.required&&report.missing===report.required?t("books_116"):`${report.missing?'≥ ':report.required?'≈ ':''}${isk(report.total)}`;}
function paintBookCosts(){
  if(!bookReport)return;
  paintQueueBookPrices();
  $('book-cost-summary').textContent=bookTotal(bookReport);
  $('book-cost-note').textContent=`${bookReport.required} ${plural(bookReport.required,[t("books_117"),t("books_118"),t("books_119")])}${bookReport.missing?t("books_120", bookReport.missing):' · Jita 4-4'}`;
  $('books-open').title=t("books_121", bookReport.required, bookTotal(bookReport), bookReport.missing?t("books_120", bookReport.missing):'');
  renderJourney();
  if(!$('books-dialog').open)return;
  $('books-total').textContent=bookTotal(bookReport);
  $('books-count').textContent=t("books_122", bookReport.required, bookReport.already_injected);
  const date=bookReport.fetched_at?new Date(bookReport.fetched_at).toLocaleString(uiLocale()):t("books_123");
  $('books-dates').textContent=t("books_124", date);
  $('books-warnings').textContent=[...bookReport.warnings.map(value=>localizeServerText(value)),bookReport.missing?t("books_125", bookReport.missing):''].filter(Boolean).join(' ');
  $('books-rows').innerHTML=bookReport.rows.map(row=>`<tr><td>${esc(items[row.id]?.name||row.name)}</td><td>1</td><td>${row.price===null?t("books_126"):isk(row.price)}</td><td>${row.checked_at?new Date(row.checked_at).toLocaleString(uiLocale()):t("books_127")}</td></tr>`).join('')||t("books_128");
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
    document.querySelectorAll('[data-book-price-id]').forEach(node=>node.textContent=t("books_129"));
    $('book-cost-summary').textContent=t("acceleration_007");$('book-cost-note').textContent=error.message;$('books-open').title=error.message;
    if($('books-dialog').open){$('books-total').textContent='—';$('books-count').textContent='';$('books-rows').textContent='';$('books-warnings').textContent=error.message;}
  }
}
function renderBookCosts(){
  const key=bookContextKey();$('books-open').disabled=!key;
  if(!key){bookGeneration++;bookRequestKey='';bookReport=null;$('books-open').title='';if(typeof retainDashboardView==='function'&&retainDashboardView())return;$('book-cost-summary').textContent='—';$('book-cost-note').textContent=plan.goals.length?t("books_130"):t("books_131");return;}
  if(key===bookRequestKey)return;
  bookReport=null;$('books-open').title='';if(!hasDashboardView){$('book-cost-summary').textContent=t("acceleration_008");$('book-cost-note').textContent='Jita 4-4';}
  fetchBookCosts();
}
function initBooks(){
  $('books-open').addEventListener('click',async()=>{
    if(!activeSchedule()){renderBookCosts();notify(t("books_132"),'error');return;}
    if(!bookReport){$('books-total').textContent=t("acceleration_008");$('books-count').textContent='';$('books-rows').textContent='';}
    $('books-dialog').showModal();$('books-context').textContent=t("acceleration_036", plan.name, selectedCharacter?currentCharacter()?.name||t("acceleration_037"):t("acceleration_038"));
    $('books-warnings').textContent='';paintBookCosts();await fetchBookCosts();
  });
  $('books-close').addEventListener('click',()=>$('books-dialog').close());
  $('books-refresh').addEventListener('click',async()=>{const button=$('books-refresh');button.disabled=true;$('books-warnings').textContent=t("books_133");try{await fetchBookCosts(true);}finally{button.disabled=false;}});
}
