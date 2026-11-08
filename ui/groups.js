"use strict";
let planGroup=null,groupSelection=new Set(),groupEditing=false;
function renderGroupContext(){
  if(!plan)return;
  const grouped=Boolean(planGroup);
  $('group-context').hidden=!grouped;
  if(grouped){
    $('group-members-text').textContent=planGroup.members.map(m=>m.name).join(' · ');
    $('group-members-text').title=planGroup.members.map(m=>`${m.name} · снимок ${new Date(m.saved_at).toLocaleString('ru-RU')}`).join('\n');
    $('group-count').textContent=`Группа · ${planGroup.members.length} ${plural(planGroup.members.length,['план','плана','планов'])}`;
  }
  document.querySelectorAll('#add-skill,#parse-eft').forEach(button=>button.disabled=grouped);
  if(grouped)document.querySelectorAll('#goals button,#goals select').forEach(control=>control.disabled=true);
}
function renderGroupPicker(){
  const records=libraryRecords.filter(record=>!record.group_members).map(record=>({...record,cached:false}));
  if(groupEditing)for(const member of planGroup.members){
    if(!records.some(r=>r.id===member.id))records.push({id:member.id,name:member.name,goals:member.goals.length,cached:true});
  }
  const query=$('group-search').value.trim().toLocaleLowerCase();
  $('group-picker').innerHTML=records.filter(r=>r.name.toLocaleLowerCase().includes(query)).map(record=>`<label class="group-picker-row"><input type="checkbox" data-group-member="${esc(record.id)}" ${groupSelection.has(record.id)?'checked':''}><span><strong>${esc(record.name)}</strong><small>${record.goals} целей${record.cached?' · сохранённый снимок':''}</small></span></label>`).join('')||'<p class="library-empty">Нет подходящих планов. Сначала сохраните планы в библиотеку.</p>';
  $('group-selection-count').textContent=`Выбрано: ${groupSelection.size}`;
  $('group-submit').disabled=groupSelection.size===0;
}
async function openGroupComposer(edit=false){
  await action('Загружаем планы для группы…',async()=>{
    await loadLibrary();groupEditing=edit&&Boolean(planGroup);
    groupSelection=new Set(groupEditing?planGroup.members.map(m=>m.id):activePlanId&&!planGroup?[activePlanId]:[]);
    $('group-title').textContent=groupEditing?'Состав группы':'Создать группу планов';
    $('group-name').value=groupEditing?plan.name:'Новая группа';
    $('group-search').value='';renderGroupPicker();$('group-dialog').showModal();
  });
}
async function refreshGroup(){
  if(!planGroup)return;
  if(!await confirmAction('Обновить цели группы из сохранённых исходных планов? Очередь группы обновится автоматически.'))return;
  await action('Обновляем цели из исходных планов…',async()=>{
    await settleDraft();
    const data=await api('/api/groups/compose',{name:plan.name,ids:planGroup.members.map(m=>m.id),workspace:captureWorkspace(),refresh:true});
    const previousFingerprint=savedFingerprint;
    items=data.items;applyWorkspace(data.workspace,activePlanId);savedFingerprint=previousFingerprint;
    render();queueDraft();notify('Планы в группе обновлены. Очередь обновляется автоматически.');
  });
}
function initGroups(){
  $('library-create-group').addEventListener('click',()=>openGroupComposer(false));
  $('group-edit').addEventListener('click',()=>openGroupComposer(true));
  $('group-refresh').addEventListener('click',refreshGroup);
  $('group-cancel').addEventListener('click',()=>$('group-dialog').close());
  $('group-search').addEventListener('input',renderGroupPicker);
  $('group-picker').addEventListener('change',event=>{
    const id=event.target.dataset.groupMember;if(!id)return;
    if(event.target.checked)groupSelection.add(id);else groupSelection.delete(id);
    $('group-selection-count').textContent=`Выбрано: ${groupSelection.size}`;
    $('group-submit').disabled=groupSelection.size===0;
  });
  $('group-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!groupSelection.size)return;
    const name=$('group-name').value.trim();if(!name)return;
    if(!groupEditing&&!await canLeaveDraft('Создать группу? Сохраните текущий план в библиотеку или отбросьте его изменения.'))return;
    await action('Собираем общую очередь группы…',async()=>{
      await settleDraft();
      const data=await api('/api/groups/compose',{name,ids:Array.from(groupSelection),workspace:groupEditing?captureWorkspace():null,refresh:false});
      const saved=await api('/api/plans/save',{id:groupEditing?activePlanId:null,workspace:data.workspace});
      items=data.items;applyWorkspace(saved.record.workspace,saved.record.id,saved.record.workspace);
      $('group-dialog').close();showEditor('queue');
      $('draft-state').textContent='Черновик сохранён';notify('Группа сохранена. Очередь оптимизируется автоматически.');
    });
  });
}
