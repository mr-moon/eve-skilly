const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const engine=fs.readFileSync('ui/auto-optimizer.js','utf8');
function setup(){
  const requests=[],pending=[],timers=new Map();let nextTimer=0;
  const context=vm.createContext({Date,JSON,setTimeout:(fn,ms)=>{timers.set(++nextTimer,{fn,ms});return nextTimer;},clearTimeout:id=>timers.delete(id),
    api:(path,body)=>new Promise((resolve,reject)=>{requests.push({path,body});pending.push({resolve,reject});})});
  vm.runInContext(`let revision=1,busy=false,plan={name:'Plan',goals:[{id:1,level:3}],remap_count:1},result=null,calculationKey=null,preview=null,items={},calculatedAt=null,scheduleMode='optimized',selectedCharacter=null,characterRemaps={},replacementChoices={},adaptations=[];
    function currentCharacter(){return {fetched_at:42};}
    function selectedAdaptation(){return adaptations.find(a=>a.character_id===selectedCharacter);}
    function displayComparison(){if(!selectedCharacter)return result;const a=selectedAdaptation();return a&&a.source_key===calculationKey&&a.remap_count===(characterRemaps[selectedCharacter]??1)?a.comparison:null;}
    function renderJourney(){}function renderDashboard(){}function renderCatalog(){}function renderGoals(){}function queueDraft(){}`+engine,context);
  return {context,requests,pending,timers,run:()=>vm.runInContext('runOptimization()',context),read:code=>vm.runInContext(code,context)};
}
function response(level=3){return {plan:{name:'Server',goals:[{id:1,level}],remap_count:1},items:{},calculation_key:`key-${level}`,optimized:{days:level,rows:[]},baseline:{days:10,rows:[]}};}
test('rapid edits discard obsolete result and calculate latest inputs',async()=>{
  const t=setup();const old=t.run();
  t.read('plan.goals[0].level=5;revision++;');
  t.pending.shift().resolve(response(3));await old;
  assert.equal(t.read('result'),null);assert.equal(t.timers.size,1);
  const current=t.run();assert.equal(t.requests.at(-1).body.goals[0].level,5);
  t.pending.shift().resolve(response(5));await current;
  assert.equal(t.read('result.optimized.days'),5);assert.equal(t.read('plan.name'),'Plan');
});
test('character change rejects in-flight adaptation and preserves shared result',async()=>{
  const t=setup();const global=t.run();t.pending.shift().resolve(response());await global;
  t.read('selectedCharacter=10;characterRemaps[10]=0;');
  const personal=t.run();assert.equal(t.requests.at(-1).path,'/api/characters/adapt');
  assert.equal(t.requests.at(-1).body.remap_count,0);
  t.read('selectedCharacter=20;');
  t.pending.shift().resolve({items:{},adaptation:{character_id:10,source_key:'key-3',remap_count:0,comparison:{optimized:{days:1}}}});await personal;
  assert.equal(t.read('adaptations.length'),0);assert.equal(t.read('result.optimized.days'),3);
  const next=t.run();assert.equal(t.requests.at(-1).body.character_id,20);
  t.pending.shift().resolve({items:{},adaptation:{character_id:20,source_key:'key-3',remap_count:1,comparison:{optimized:{days:2}}}});await next;
  assert.equal(t.read('displayComparison().optimized.days'),2);
  t.read('selectedCharacter=null;');assert.equal(t.read('displayComparison().optimized.days'),3);
});
test('fresh cached results do not trigger another request; pending edits are debounced',async()=>{
  const t=setup();t.read('scheduleOptimization();scheduleOptimization();scheduleOptimization();');
  assert.equal(t.timers.size,1);
  const run=t.run();t.pending.shift().resolve(response());await run;
  await t.run();assert.equal(t.requests.length,1);
});
test('first personal calculation builds shared optimization before adapting normalized goals',async()=>{
  const t=setup();t.read('selectedCharacter=10;characterRemaps[10]=0;');
  const run=t.run();assert.equal(t.requests[0].path,'/api/calculate');
  t.pending.shift().resolve(response());await new Promise(setImmediate);
  assert.equal(t.requests[1].path,'/api/characters/adapt');
  t.pending.shift().resolve({items:{},adaptation:{character_id:10,source_key:'key-3',remap_count:0,comparison:{optimized:{days:1}}}});await run;
  assert.equal(t.read('result.optimized.days'),3);
  assert.equal(t.read('displayComparison().optimized.days'),1);
});
test('network failures retry a bounded number of times without exposing a result',async()=>{
  const t=setup();
  for(let i=0;i<3;i++){const run=t.run();t.pending.shift().reject(new Error('Offline'));await run;}
  assert.equal(t.read('result'),null);assert.equal(t.read('optimizationFailure.attempts'),3);
  assert.equal(t.timers.size,0);t.read('plan.remap_count=2;scheduleOptimization();');assert.equal(t.timers.size,1);
});
test('clearing the plan or opening another workspace invalidates an in-flight result',async()=>{
  const t=setup();const run=t.run();t.read('revision++;plan.goals=[];');
  t.pending.shift().resolve(response());await run;
  assert.equal(t.read('result'),null);assert.equal(t.timers.size,0);
});
