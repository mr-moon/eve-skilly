const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 const nodes=new Map();const ctx=vm.createContext({JSON,Map,Date,Boolean,window:{},
 $:id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:true,title:'',dataset:{}});return nodes.get(id);},
 setTimeout:()=>0,clearTimeout:()=>{}});
 vm.runInContext(`let plan={name:'Plan A',goals:[{id:1,level:3}]},result=null,preview=null,adaptations=[],selectedCharacter=null,characterRemaps={},replacementChoices={},characterExtraRemaps={},planGroup=null,accelerationSettings={},scheduleMode='optimized',calculatedAt=new Date(),apiError=null;
 async function api(){if(apiError)throw new Error(apiError);return {};}
 `+fs.readFileSync('ui/plans.js','utf8'),ctx);
 return{read:code=>vm.runInContext(code,ctx),nodes};
}
test('background draft success does not imply that modified library plan was saved',async()=>{
 const t=setup();t.read("activePlanId='a';savedFingerprint=fingerprint(captureWorkspace());updateSaveState();");
 assert.equal(t.nodes.get('save-state').hidden,true);assert.equal(t.nodes.get('save').hidden,true);
 t.read("plan.name='Changed';queueDraft();");await t.read('persistDraft();');
 assert.equal(t.nodes.get('save-state').hidden,true);assert.equal(t.nodes.get('save').hidden,false);
});
test('draft errors are visible and clear after a successful retry',async()=>{
 const t=setup();t.read("apiError='Disk full';");await assert.rejects(t.read('persistDraft();'),/Disk full/);
 assert.equal(t.nodes.get('save-state').textContent,'Ошибка сохранения');assert.equal(t.nodes.get('save-state').hidden,false);assert.equal(t.nodes.get('save').hidden,false);
 t.read('apiError=null;');await t.read('persistDraft();');
 assert.equal(t.nodes.get('save-state').textContent,'Есть изменения');
});
test('successful draft backup does not clear a library save failure',async()=>{
 const t=setup();t.read("saveStateError={scope:'library',message:'Cannot save plan'};");await t.read('persistDraft();');
 assert.equal(t.nodes.get('save-state').textContent,'Ошибка сохранения');assert.equal(t.nodes.get('save-state').title,'Cannot save plan');
});
test('automatic optimization, refreshed ESI and view changes do not require saving',async()=>{
 const t=setup();t.read("activePlanId='a';savedFingerprint=fingerprint(captureWorkspace());askDecision=()=>{throw new Error('Unexpected confirmation')};");
 t.read("result={baseline:{days:12},optimized:{days:10},saved_days:2,method:'new calculation'};preview={days:12};calculationKey='new';calculatedAt=new Date();selectedCharacter=42;adaptations=[{character_id:42,replace_implants:false,computed_at:999,remap_count:3,character:{fetched_at:999,total_sp:1000}}];");
 assert.equal(t.read('isDirty()'),false);assert.equal(await t.read("canLeaveDraft('Switch?')"),true);
});
test('default fields from a newer app version do not make an unchanged saved plan dirty',()=>{
 const t=setup();t.read("activePlanId='a';savedFingerprint=fingerprint(captureWorkspace());plan.queue_priority='fit_ready';plan.fitting=null;plan.priority_goals=[];plan.optimize_implants=true;plan.remap_count=1;plan.attributes=[20,20,19,20,20];accelerationSettings.global={accelerator_id:77919,quantity:1,injector:'large',use_unallocated:true,biology_override:null,total_sp_override:null,custom:null};");
 assert.equal(t.read('isDirty()'),false);
});
test('actual goal, optimization, remap and booster edits still require saving',()=>{
 for(const edit of ["plan.goals[0].level=4","plan.queue_priority='delay_expensive_books'","characterRemaps[42]=1","replacementChoices[42]=true","accelerationSettings.global={quantity:3}"]){
  const t=setup();t.read("activePlanId='a';savedFingerprint=fingerprint(captureWorkspace());"+edit);assert.equal(t.read('isDirty()'),true,edit);
 }
});
test('explicit replacement permission survives recalculation and legacy adaptation preferences',()=>{
 const t=setup();t.read("activePlanId='a';adaptations=[{character_id:42,replace_implants:true}];savedFingerprint=fingerprint(captureWorkspace());replacementChoices[42]=false;");
 assert.equal(t.read('isDirty()'),true);
 t.read("savedFingerprint=fingerprint(captureWorkspace());adaptations=[{character_id:42,replace_implants:false,computed_at:12345}];");
 assert.equal(t.read('isDirty()'),false);
 assert.equal(t.read('captureWorkspace().character_implant_replacements[42]'),false);
});
test('extra remap preference is saved separately from automatic result updates',()=>{
 const t=setup();t.read("activePlanId='a';savedFingerprint=fingerprint(captureWorkspace());characterExtraRemaps[42]=true;");assert.equal(t.read('isDirty()'),true);
 t.read("savedFingerprint=fingerprint(captureWorkspace());adaptations=[{character_id:42,extra_remap:true,computed_at:999}];");assert.equal(t.read('isDirty()'),false);
 assert.equal(t.read('captureWorkspace().character_extra_remaps[42]'),true);
});
