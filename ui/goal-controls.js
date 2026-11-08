"use strict";
let goalDrag=null;

function reorderGoals(goals,sourceId,targetId,after=false){
  const from=goals.findIndex(g=>g.id===sourceId),target=goals.findIndex(g=>g.id===targetId);
  if(from<0||target<0||from===target)return false;
  let to=target+(after?1:0);if(from<to)to--;
  if(to===from)return false;
  const [goal]=goals.splice(from,1);goals.splice(to,0,goal);return true;
}
function clearGoalDrop(){document.querySelectorAll('#goals .drop-before,#goals .drop-after').forEach(row=>row.classList.remove('drop-before','drop-after'));}
function finishGoalDrag(commit=false){
  const drag=goalDrag;if(!drag)return;goalDrag=null;
  if(drag.handle.hasPointerCapture(drag.pointerId))drag.handle.releasePointerCapture(drag.pointerId);
  clearGoalDrop();document.querySelectorAll('#goals .dragging').forEach(row=>row.classList.remove('dragging'));
  const changed=commit&&drag.active&&drag.revision===revision&&!planGroup&&reorderGoals(plan.goals,drag.id,drag.targetId,drag.after);
  if(changed)invalidate();else{renderGoals();renderGroupContext();}
  document.querySelector(`[data-drag-goal="${drag.id}"]`)?.focus({preventScroll:true});
}
function initGoalControls(){
  const goals=$('goals');
  goals.addEventListener('pointerdown',event=>{
    const handle=event.target.closest('[data-drag-goal]');
    if(!handle||handle.disabled||planGroup||busy||event.button!==0||event.isPrimary===false)return;
    event.preventDefault();handle.focus({preventScroll:true});
    goalDrag={id:Number(handle.dataset.dragGoal),revision,handle,pointerId:event.pointerId,startY:event.clientY,active:false,targetId:null,after:false};
    handle.setPointerCapture(event.pointerId);
  });
  goals.addEventListener('pointermove',event=>{
    const drag=goalDrag;if(!drag||drag.pointerId!==event.pointerId)return;
    if(!drag.active&&Math.abs(event.clientY-drag.startY)<5)return;
    drag.active=true;drag.handle.closest('.goal-row').classList.add('dragging');
    const scroller=document.querySelector('.plan-sidebar'),bounds=scroller.getBoundingClientRect();
    if(event.clientY<bounds.top+40)scroller.scrollTop-=16;
    else if(event.clientY>bounds.bottom-40)scroller.scrollTop+=16;
    const row=document.elementFromPoint(event.clientX,event.clientY)?.closest('#goals .goal-row');
    clearGoalDrop();drag.targetId=null;
    if(!row||Number(row.dataset.goalId)===drag.id)return;
    drag.targetId=Number(row.dataset.goalId);const rect=row.getBoundingClientRect();
    drag.after=event.clientY>rect.top+rect.height/2;
    row.classList.add(drag.after?'drop-after':'drop-before');
  });
  goals.addEventListener('pointerup',()=>finishGoalDrag(true));
  goals.addEventListener('pointercancel',()=>finishGoalDrag());
  goals.addEventListener('lostpointercapture',()=>finishGoalDrag());
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&goalDrag){event.preventDefault();finishGoalDrag();return;}
    const handle=event.target.closest('[data-drag-goal]');
    if(!handle||handle.disabled||planGroup||!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();const id=Number(handle.dataset.dragGoal),from=plan.goals.findIndex(g=>g.id===id);
    const target=plan.goals[from+(event.key==='ArrowUp'?-1:1)];
    if(target&&reorderGoals(plan.goals,id,target.id,event.key==='ArrowDown')){
      invalidate();document.querySelector(`[data-drag-goal="${id}"]`)?.focus({preventScroll:true});
    }
  });
}
