const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup() {
  const context = require('./i18n-helper.cjs').createContext({Date, Set, Map, Math, Number,esc:value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;'),
    items:{1:{name:'Int skill',skill:{rank:1,primary:0,secondary:4}},2:{name:'Per skill',skill:{rank:1,primary:1,secondary:3}}},
    roman:['','I','II','III','IV','V'],result:{baseline:{rows:[{id:1,name:'Int skill',level:1},{id:1,name:'Int skill',level:2}]}},preview:null});
  vm.runInContext(fs.readFileSync('ui/tracking.js','utf8'),context);
  return code => vm.runInContext(code,context);
}
const now = Date.parse('2026-11-09T12:00:00Z');
const queue = [
  {skill_id:1,finished_level:1,queue_position:0,start_date:'2026-11-09T11:00:00Z',finish_date:'2026-11-09T13:00:00Z',training_start_sp:0,level_start_sp:0,level_end_sp:250},
  {skill_id:2,finished_level:1,queue_position:1,start_date:'2026-11-09T13:00:00Z',finish_date:'2026-11-09T22:00:00Z',training_start_sp:0,level_start_sp:0,level_end_sp:250}
];
test('queue matching weighs remaining time and distinguishes order from membership',()=>{
  const run=setup();run(`let character={queue:${JSON.stringify(queue)}};let schedule={rows:[{id:1,level:1}]};`);
  assert.equal(run(`compareActualQueue(schedule,character,${now}).percent`),10);
  assert.equal(run(`compareActualQueue(schedule,character,${now}).prefix`),1);
  run('schedule.rows=[{id:2,level:1},{id:1,level:1}]');
  assert.equal(run(`compareActualQueue(schedule,character,${now}).percent`),100);
  assert.equal(run(`compareActualQueue(schedule,character,${now}).prefix`),0);
});
test('paused entries remain visible and cannot be identified as currently training',()=>{
  const run=setup();run('let character={queue:[{skill_id:1,finished_level:2,queue_position:0}]};');
  assert.equal(run(`actualQueue(character,${now}).length`),1);
  assert.equal(run(`trainingEntry(character,${now})`),undefined);
  assert.equal(run(`compareActualQueue({rows:[{id:1,level:2}]},character,${now}).timed`),false);
  assert.equal(run('actualQueue({}).length'),0);
});
test('live SP interpolation uses the level floor and retains confirmed snapshot progress',()=>{
  const run=setup();run(`let entry=${JSON.stringify(queue[0])};`);
  assert.equal(run(`queueEntryPoints(entry,{trained:{}},${now})`),125);
  assert.equal(run(`queueEntryRemaining(entry,{trained:{1:200}},${now})`),50);
  assert.equal(run(`queueEntryRemaining(entry,{trained:{}},${now+7200000})`),0);
});
test('a matching event later in a reordered queue remains a plan forecast',()=>{
  const run=setup();run(`let schedule={rows:[{id:2,level:1,start_day:0},{id:1,level:1,start_day:1}]};let relation=compareActualQueue(schedule,{queue:${JSON.stringify(queue)}},${now});`);
  assert.equal(run(`eventAnchor({day:1},schedule,relation,${now}).aligned`),false);
  assert.equal(run(`eventAnchor({day:1},schedule,relation,${now}).time`),now+86400000);
  run(`schedule.rows.reverse();schedule.rows[0].start_day=0;schedule.rows[1].start_day=1;relation=compareActualQueue(schedule,{queue:${JSON.stringify(queue)}},${now})`);
  assert.equal(run(`eventAnchor({day:1},schedule,relation,${now}).aligned`),true);
});
test('remap can lose time on a different actual queue and missing metadata gives no estimate',()=>{
  const run=setup();run(`let character={trained:{},attributes:[17,27,17,21,17],bonuses:[0,0,0,0,0]};let entry=${JSON.stringify(queue[1])};`);
  assert.ok(run(`actualRemapSaving([27,17,17,17,21],character,[entry],${now})`)<0);
  assert.equal(run('actualRemapSaving([27,17,17,17,21],character,[{skill_id:999}])'),null);
  assert.equal(run('actualRemapSaving([27,17,17,17,21],character,[])'),null);
});
test('learned levels use actual SP thresholds and do not count a partially trained level',()=>{
  const run=setup();
  assert.equal(run('learnedPlanRows({trained:{1:1000}}).length'),1);
  assert.equal(run('learnedPlanRows({trained:{1:1415}}).length'),2);
  assert.equal(run('learnedPlanRows({}).length'),0);
});
test('action navigation distinguishes repeated implant events and individual books',()=>{
  const run=setup();
  run(`let targets=[{eventKind:'implant',eventDay:'1'},{eventKind:'implant',eventDay:'5'},{bookId:'42'}].map(dataset=>({dataset,classList:{add(){},remove(){}},setAttribute(){},focus(){this.focused=true;},scrollIntoView(){this.scrolled=true;}}));
    function activeSchedule(){return {};}
    let document={querySelectorAll:selector=>selector.includes('data-book-id')?[targets[2]]:selector.includes('data-event-kind')?targets.slice(0,2):[]};
    function notify(){throw new Error('Missing target');}
    jumpToTrackingAction({dataset:{trackingJump:'implant',actionDay:'5'}});`);
  assert.equal(run('targets[1].scrolled'),true);assert.equal(run('targets[0].scrolled'),undefined);
  run("jumpToTrackingAction({dataset:{trackingJump:'book',actionBook:'42'}})");
  assert.equal(run('targets[2].scrolled'),true);assert.equal(run('targets[2].focused'),true);
});


test('bound plan status accepts a short ordered prefix and reports the first reordered level',()=>{
  const run=setup();run(`let character={queue:${JSON.stringify(queue)}};let schedule={rows:[{id:1,level:1},{id:2,level:1},{id:1,level:2}]};`);
  assert.equal(run(`boundQueueStatus(schedule,character,${now}).state`),'matched');
  run('schedule.rows=[{id:2,level:1},{id:1,level:1}]');
  assert.equal(run(`boundQueueStatus(schedule,character,${now}).state`),'warning');
  assert.match(run(`boundQueueStatus(schedule,character,${now}).detail`),/В игре: Int skill I. По плану: Per skill I/);
  run('schedule.rows=[{id:1,level:1}]');
  assert.match(run(`boundQueueStatus(schedule,character,${now}).text`),/№2/);
});

test('queue status distinguishes missing ESI, empty training and a completed plan',()=>{
  const run=setup();
  assert.equal(run('boundQueueStatus({rows:[]},{}).state'),'pending');
  assert.equal(run('boundQueueStatus(null,{queue:[]}).state'),'pending');
  assert.equal(run('boundQueueStatus({rows:[{id:1,level:1}]},{queue:[]}).state'),'warning');
  assert.equal(run('boundQueueStatus({rows:[]},{queue:[]}).state'),'matched');
});

test('levels finished since the ESI snapshot do not cause a false queue mismatch',()=>{
  const run=setup();run(`let character={queue:${JSON.stringify(queue)}};let schedule={rows:[{id:1,level:1},{id:2,level:1}]};`);
  assert.equal(run(`boundQueueStatus(schedule,character,${now+7200000}).state`),'matched');
});

test('late bound-plan checks cannot overwrite a changed assignment or another pilot',async()=>{
  const run=setup();run(`let selectedCharacter=1,linked={id:'old',saved_at:10},renders=0,resolveRequest;
    function trackedPlan(){return linked;}
    function currentCharacter(){return character;}
    function api(){return new Promise(resolve=>resolveRequest=resolve);}
    renderTracking=()=>{renders++;};
    let character={id:1,fetched_at:20,queue:[]};let pending=checkBoundQueue(character);
    linked={id:'new',saved_at:11};resolveRequest({plan_id:'old',saved_at:10,snapshot_at:20,schedule:{rows:[]},items:{}});`);
  await run('pending');assert.equal(run('boundQueueChecks.size'),0);assert.equal(run('renders'),0);
  run(`pending=checkBoundQueue(character);selectedCharacter=2;resolveRequest({plan_id:'new',saved_at:11,snapshot_at:20,schedule:{rows:[]},items:{}});`);
  await run('pending');assert.equal(run('boundQueueChecks.size'),1);assert.equal(run('renders'),0);
});


test('level squares distinguish active training from partial SP on an inactive level',()=>{
  const run=setup();run(`let character={queue:${JSON.stringify(queue)},trained:{}};`);
  assert.equal(run(`queueLevelState({id:1,level:1},character,${now}).state`),'training');
  assert.equal(run(`queueLevelState({id:1,level:1},character,${now}).progress`),50);
  run('character={queue:[],trained:{1:125}}');
  assert.equal(run(`queueLevelState({id:1,level:1},character,${now}).state`),'partial');
  assert.equal(run('queueLevelState({id:1,level:2},character)'),null);
  run('character.trained[1]=250');
  assert.equal(run('queueLevelState({id:1,level:1},character)'),null);
  assert.equal(run('queueLevelState({id:1,level:1},null)'),null);
});


test('personal squares show confirmed training and ESI queue membership instead of projected plan levels',()=>{
  const run=setup();run(`let selectedCharacter=1;
    function currentCharacter(){return {trained:{1:250},queue:[{skill_id:1,finished_level:2,queue_position:0}]};}`);
  const markup=run('queueLevelBlocks({id:1,level:5},5)');
  assert.equal((markup.match(/level-block filled/g)||[]).length,1);
  assert.equal((markup.match(/level-block is-queued/g)||[]).length,1);
  assert.equal((markup.match(/class="level-block "/g)||[]).length,3);
});
