const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
  const nodes=new Map(),requests=[],messages=[];
  const ctx=vm.createContext({Map,Date,Boolean,
    $:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);},
    notify:message=>messages.push(message),renderCharacterList:()=>{},renderCharacterContext:()=>{},
    currentCharacter:()=>({name:'Alice'}),
    api:async(path,body)=>{requests.push({path,body});return {tracked_plans:body.plan_id?{1:{id:body.plan_id,name:'Current'}}:{}};}
  });
  vm.runInContext(`let busy=false,activePlanId='a',plan={name:'Current',goals:[{id:1,level:1}]},dirty=false,confirmed=true,saveSucceeds=true,saves=0;
    function isDirty(){return dirty;}
    async function confirmAction(){return confirmed;}
    async function savePlan(){saves++;if(saveSucceeds){activePlanId='saved';dirty=false;}return saveSucceeds;}
    async function action(message,fn){await fn();}
    ${fs.readFileSync('ui/characters.js','utf8')}
    renderCharacterList=()=>{};renderCharacterContext=()=>{};currentCharacter=()=>({name:'Alice'});
    selectedCharacter=1;`,ctx);
  return {run:code=>vm.runInContext(code,ctx),nodes,requests,messages};
}
test('switching character does not assign a plan; tracking explicitly assigns the selected plan',async()=>{
  const t=setup();
  t.run('renderPlanTracking()');assert.equal(t.requests.length,0);
  await t.run('togglePlanTracking()');
  assert.deepEqual(t.requests.map(r=>JSON.parse(JSON.stringify(r.body))),[{id:1,plan_id:'a',expected_plan_id:null}]);
  assert.equal(t.nodes.get('character-track-plan').hidden,true);
  assert.equal(t.nodes.get('character-untrack-plan').hidden,false);
});
test('replacement can be cancelled and sends the previous plan when confirmed',async()=>{
  const t=setup();t.run("characterState.tracked_plans={1:{id:'old',name:'Old'}};confirmed=false;");
  await t.run('togglePlanTracking()');assert.equal(t.requests.length,0);
  t.run('confirmed=true;');await t.run('togglePlanTracking()');
  assert.equal(t.requests[0].body.expected_plan_id,'old');
});
test('new and modified plans must save successfully before tracking',async()=>{
  for(const input of ["activePlanId=null;","dirty=true;"]){
    const t=setup();t.run(input+'saveSucceeds=false;');
    await t.run('togglePlanTracking()');assert.equal(t.requests.length,0);
    t.run('saveSucceeds=true;');await t.run('togglePlanTracking()');
    assert.equal(t.requests[0].body.plan_id,'saved');
  }
});
test('detaching affects only the selected character and duplicate tracking is ignored',async()=>{
  const t=setup();t.run("characterState.tracked_plans={1:{id:'a',name:'Current'},2:{id:'a',name:'Current'}};");
  await t.run('togglePlanTracking()');assert.equal(t.requests.length,0);
  await t.run('togglePlanTracking(true)');
  assert.equal(t.requests[0].body.id,1);assert.equal(t.requests[0].body.plan_id,null);
  assert.equal(t.requests[0].body.expected_plan_id,'a');
});
