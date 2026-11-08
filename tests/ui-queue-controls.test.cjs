const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){const c=vm.createContext({Set,Map,JSON,roman:['','I','II','III','IV','V']});vm.runInContext(fs.readFileSync('ui/queue-controls.js','utf8'),c);return code=>vm.runInContext(code,c);}
const rows=[{id:1,name:'First',level:1,start_day:0,end_day:1},{id:1,name:'First',level:2,start_day:1,end_day:3},{id:2,name:'Second',level:3,start_day:3,end_day:6},{id:3,name:'Third',level:1,start_day:6,end_day:7}];
test('book events appear once per skill exactly before its first remaining level',()=>{const run=setup();run(`let schedule={rows:${JSON.stringify(rows)}};`);assert.equal(run('JSON.stringify(queueBookEvents(schedule).map(e=>[e.id,e.index,e.day]))'),'[[1,0,0],[2,2,3],[3,3,6]]');});
test('already injected skills, including zero SP skills, require no book event',()=>{const run=setup();run(`let schedule={rows:${JSON.stringify(rows)}};`);assert.equal(run('JSON.stringify(queueBookEvents(schedule,[1,2]).map(e=>e.id))'),'[3]');assert.equal(run('queueBookEvents(null).length'),0);});
test('shift range copies levels in queue order even when selected backwards',()=>{const run=setup();run(`let schedule={rows:${JSON.stringify(rows)}};syncQueueSelection(schedule,1);selectQueueIndex(3,4);selectQueueIndex(1,4,{shift:true});`);assert.equal(run('selectedQueueText(schedule)'),'First II\nSecond III\nThird I\n');});
test('ctrl toggle supports noncontiguous selection and excludes event rows',()=>{const run=setup();run(`let schedule={rows:${JSON.stringify(rows)}};selectQueueIndex(0,4);selectQueueIndex(3,4,{toggle:true});selectQueueIndex(0,4,{toggle:true});`);assert.equal(run('selectedQueueText(schedule)'),'Third I\n');});
test('selection survives price-only repaint and resets for changed order or character',()=>{const run=setup();run(`let schedule={rows:${JSON.stringify(rows)}};syncQueueSelection(schedule,1);selectQueueIndex(1,4);syncQueueSelection(schedule,1);`);assert.equal(run('queueSelection.indices.size'),1);run('syncQueueSelection(schedule,2)');assert.equal(run('queueSelection.indices.size'),0);run('selectQueueIndex(1,4);schedule.rows.reverse();syncQueueSelection(schedule,2)');assert.equal(run('queueSelection.indices.size'),0);});
function shortcuts(nativeDesktop){
 const handlers={},writes=[];let input=false;
 const queue={addEventListener(){},contains(){return !input}};
 const ctx=vm.createContext({Set,Map,JSON,roman:['','I','II','III','IV','V'],nativeDesktop,
 $:id=>id==='queue'?queue:{addEventListener(){}},document:{activeElement:{},addEventListener:(name,fn)=>handlers[name]=fn,querySelector:()=>null},
 activeSchedule:()=>({rows}),notify(){},nativeCommand:async(name,args)=>writes.push({name,...args})});
 vm.runInContext(fs.readFileSync('ui/queue-controls.js','utf8'),ctx);vm.runInContext('initQueueControls();selectQueueIndex(0,4);selectQueueIndex(1,4,{shift:true});',ctx);
 return{handlers,writes,setInput:()=>input=true};
}
test('desktop Ctrl+C accepts the physical C key under a non-English keyboard layout',async()=>{
 const t=shortcuts(true);let prevented=false;
 await t.handlers.keydown({ctrlKey:true,key:'с',code:'KeyC',target:{closest:()=>null},preventDefault(){prevented=true}});
 assert.ok(prevented);assert.equal(t.writes[0].text,'First I\nFirst II\n');
});
test('browser copy writes selected rows but does not intercept copying inside inputs',()=>{
 const t=shortcuts(false);let value='',prevented=false;
 const event={target:{closest:()=>null},clipboardData:{setData(type,text){value=text}},preventDefault(){prevented=true}};
 t.handlers.copy(event);assert.equal(value,'First I\nFirst II\n');assert.ok(prevented);
 t.setInput();value='';prevented=false;t.handlers.copy(event);assert.equal(value,'');assert.equal(prevented,false);
});
