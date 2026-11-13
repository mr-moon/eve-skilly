const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup() {
  const context = vm.createContext({Date, Set, Map, Math, Number,
    items:{1:{name:'Int skill',skill:{rank:1,primary:0,secondary:4}},2:{name:'Per skill',skill:{rank:1,primary:1,secondary:3}}},
    result:{baseline:{rows:[{id:1,name:'Int skill',level:1},{id:1,name:'Int skill',level:2}]}},preview:null});
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
