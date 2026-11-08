const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 const nodes=new Map();const ctx=vm.createContext({JSON,Map,Date,Boolean,window:{},
 $:id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:true,title:'',dataset:{}});return nodes.get(id);},
 setTimeout:()=>0,clearTimeout:()=>{}});
 vm.runInContext(`let plan={name:'Plan A',goals:[{id:1,level:3}]},result=null,preview=null,adaptations=[],selectedCharacter=null,characterRemaps={},planGroup=null,accelerationSettings={},scheduleMode='optimized',calculatedAt=new Date(),apiError=null;
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
