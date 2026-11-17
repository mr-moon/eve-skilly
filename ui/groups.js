"use strict";
let planGroup=null,groupSelection=new Set(),groupEditing=false;
function renderGroupContext(){
  if(!plan)return;
  const grouped=Boolean(planGroup);
  $('group-edit').hidden=!grouped;
  document.querySelectorAll('#add-skill,#parse-eft').forEach(button=>button.disabled=grouped);
  if(grouped)document.querySelectorAll('#goals .goal-remove').forEach(control=>control.disabled=true);
}
function renderGroupPicker(){
  const changed=groupEditing&&planGroup.members.some(member=>libraryRecords.some(record=>record.id===member.id&&record.saved_at!==member.saved_at));
  $('group-source-update').hidden=!changed;
  const records=libraryRecords.filter(record=>!record.group_members).map(record=>({...record,cached:false}));
  if(groupEditing)for(const member of planGroup.members){
    if(!records.some(r=>r.id===member.id))records.push({id:member.id,name:member.name,goals:member.goals.length,cached:true});
  }
  const query=$('group-search').value.trim().toLocaleLowerCase();
  $('group-picker').innerHTML=records.filter(r=>r.name.toLocaleLowerCase().includes(query)).map(record=>t("groups_228", esc(record.id), groupSelection.has(record.id)?'checked':'', esc(record.name), record.goals, record.cached?t("groups_229"):'')).join('')||t("groups_230");
  $('group-selection-count').textContent=t("groups_231", groupSelection.size);
  $('group-submit').disabled=groupSelection.size===0;
}
async function openGroupComposer(edit=false){
  await action(t("groups_232"),async()=>{
    await loadLibrary();groupEditing=edit&&Boolean(planGroup);
    groupSelection=new Set(groupEditing?planGroup.members.map(m=>m.id):activePlanId&&!planGroup?[activePlanId]:[]);
    $('group-title').textContent=groupEditing?t("groups_233"):t("groups_234");
    $('group-name').value=groupEditing?plan.name:t("groups_235");
    $('group-search').value='';renderGroupPicker();$('group-dialog').showModal();
  });
}
async function refreshGroup(){
  if(!planGroup)return;
  if(!await confirmAction(t("groups_236")))return;
  await action(t("groups_237"),async()=>{
    await settleDraft();
    const data=await api('/api/groups/compose',{name:plan.name,ids:planGroup.members.map(m=>m.id),workspace:captureWorkspace(),refresh:true});
    const previousFingerprint=savedFingerprint;
    items=data.items;applyWorkspace(data.workspace,activePlanId);savedFingerprint=previousFingerprint;
    render();queueDraft();notify(t("groups_238"));
    if($('group-dialog').open)renderGroupPicker();
  });
}
function initGroups(){
  $('library-create-group').addEventListener('click',()=>openGroupComposer(false));
  $('group-edit').addEventListener('click',()=>{closePlanPicker();openGroupComposer(true);});
  $('group-refresh').addEventListener('click',refreshGroup);
  $('group-cancel').addEventListener('click',()=>$('group-dialog').close());
  $('group-search').addEventListener('input',renderGroupPicker);
  $('group-picker').addEventListener('change',event=>{
    const id=event.target.dataset.groupMember;if(!id)return;
    if(event.target.checked)groupSelection.add(id);else groupSelection.delete(id);
    $('group-selection-count').textContent=t("groups_231", groupSelection.size);
    $('group-submit').disabled=groupSelection.size===0;
  });
  $('group-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!groupSelection.size)return;
    const name=$('group-name').value.trim();if(!name)return;
    if(!groupEditing&&!await canLeaveDraft(t("groups_239")))return;
    await action(t("groups_240"),async()=>{
      await settleDraft();
      const data=await api('/api/groups/compose',{name,ids:Array.from(groupSelection),workspace:groupEditing?captureWorkspace():null,refresh:false});
      const saved=await api('/api/plans/save',{id:groupEditing?activePlanId:null,workspace:data.workspace});
      items=data.items;applyWorkspace(saved.record.workspace,saved.record.id,saved.record.workspace);
      $('group-dialog').close();showEditor('queue');
      $('draft-state').textContent=t("groups_241");notify(t("groups_242"));
    });
  });
}
