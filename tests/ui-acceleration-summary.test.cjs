const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('ui/acceleration.js','utf8');
function node(){
  let html='',text='';const classes=new Set();
  return {title:'',open:false,disabled:false,attributes:{},closest:()=>null,
    get innerHTML(){return html;},set innerHTML(value){html=value;text='';},
    get textContent(){return text;},set textContent(value){text=value;html='';},
    get childElementCount(){return html?1:0;},
    setAttribute(name,value){this.attributes[name]=value;},
    classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),toggle:(c,on)=>on?classes.add(c):classes.delete(c)}
  };
}
function setup(){
  const nodes=new Map(),pending=[],timers=new Map(),cells=[];let next=0;
  const context=vm.createContext({Date,JSON,document:{activeElement:null,querySelectorAll:()=>cells},roman:['0','I','II','III','IV','V'],
    $:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},
    duration:days=>`${days}d`,formatNumber:n=>String(n),
    setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id),
    api:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))});
  vm.runInContext(`let active=true,plan={goals:[{id:1,level:4}]},calculationKey='plan-A',selectedCharacter=null,calculatedAt=new Date(100);
    function activeSchedule(){return active?{rows:[{name:'Science',level:3},{name:'Cybernetics',level:1}]}:null;}
    function currentCharacter(){return {total_sp:6000000};}
    function selectedAdaptation(){return {computed_at:200};}
    function captureWorkspace(){return {};}`+source,context);
  return {nodes,pending,timers,cells,read:code=>vm.runInContext(code,context)};
}
const report={selected:{days:22,saved_days:8,requested:1,accelerator:{name:'Test accelerator'}},finish_now:{count:5},injector:'large'};
test('header receives booster and injector results while the details window is closed',async()=>{
  const t=setup();t.read('renderAccelerationControls();');const run=t.read('calculateAcceleration()');
  t.pending.shift().resolve(report);await run;
  assert.equal(t.nodes.get('booster-time').textContent,'22d');
  assert.match(t.nodes.get('injector-info').textContent,/5 банок/);
  t.read('renderAccelerationControls();');assert.equal(t.timers.size,0);
});
test('changing booster quantity keeps rendered results while the next calculation is pending',()=>{
  const t=setup();
  t.read(`function queueDraft(){}
    $('acceleration-output').innerHTML='<table><tbody><tr><td>Previous result</td></tr></tbody></table>';
    $('acceleration-quantity').valueAsNumber=3;
    $('acceleration-injector').value='large';$('acceleration-use-free').checked=true;
    $('acceleration-biology').value='auto';
    scheduleAccelerationReport({target:{id:'acceleration-quantity',closest:()=>null}});`);
  assert.match(t.nodes.get('acceleration-output').innerHTML,/Previous result/);
  assert.equal(t.nodes.get('acceleration-output').attributes['aria-busy'],'true');
  assert.equal(t.nodes.get('acceleration-status').textContent,'Обновляем расчёт…');
});
test('late report cannot replace summaries after switching characters',async()=>{
  const t=setup();const run=t.read('calculateAcceleration()');
  t.read('selectedCharacter=10;renderAccelerationControls();');
  t.pending.shift().resolve(report);await run;
  assert.equal(t.nodes.get('booster-time').textContent,'—');
  assert.equal(t.read('accelerationReport'),null);
});
test('invalidated queue clears previous values and disables both summary actions',async()=>{
  const t=setup();const run=t.read('calculateAcceleration()');t.pending.shift().resolve(report);await run;
  t.read('active=false;renderAccelerationControls();');
  assert.equal(t.nodes.get('booster-time').textContent,'—');
  assert.equal(t.nodes.get('booster-summary').disabled,true);
  assert.equal(t.nodes.get('injector-info').textContent,'');
});
test('queue column uses the checkpoint after each row, including a zero at completion',()=>{
  const t=setup();t.cells.push({dataset:{queueIndex:'0'}},{dataset:{queueIndex:'1'}});
  const checkpoints=[{injectors:5},{skill:'Science',level:3,injectors:2,remaining_sp:400000,total_sp:6100000,sp_each:400000},{skill:'Cybernetics',level:1,injectors:0,remaining_sp:0,total_sp:6500000,sp_each:400000}];
  t.read(`paintInjectorColumn(${JSON.stringify({checkpoints})});`);
  assert.equal(t.cells[0].textContent,'2');assert.equal(t.cells[1].textContent,'0');
  assert.match(t.cells[0].title,/400000/);
});
test('mismatching row checkpoint is not displayed as an injector count',()=>{
  const t=setup();t.cells.push({dataset:{queueIndex:'0'}});
  t.read(`paintInjectorColumn({checkpoints:[{}, {skill:'Other skill',level:3,injectors:999}]});`);
  assert.equal(t.cells[0].textContent,'…');
});

test('Biology defaults to the pilot and manual overrides stay per character',()=>{
 const t=setup();t.read(`function queueDraft(){}
 function currentCharacter(){return selectedCharacter===10?{biology_level:4,name:'Pilot A'}:{biology_level:2,name:'Pilot B'};}
 selectedCharacter=10;fillBiologyControl();`);
 assert.equal(t.nodes.get('acceleration-biology').value,'4');
 assert.match(t.nodes.get('acceleration-biology-source').textContent,/Pilot A/);
 assert.equal(t.read('currentAccelerationSettings().biology_override'),null);
 t.read(`$('acceleration-quantity').valueAsNumber=2;
 $('acceleration-injector').value='large';$('acceleration-use-free').checked=true;
 $('acceleration-biology').value='1';
 scheduleAccelerationReport({target:{id:'acceleration-biology',closest:()=>null}});`);
 assert.equal(t.read('currentAccelerationSettings().biology_override'),1);
 t.read('chooseAccelerator(123);');
 assert.equal(t.read('currentAccelerationSettings().accelerator_id'),123);
 assert.equal(t.read('currentAccelerationSettings().biology_override'),1);
 t.read('selectedCharacter=20;fillBiologyControl();');
 assert.equal(t.nodes.get('acceleration-biology').value,'2');
 t.read('selectedCharacter=10;fillBiologyControl();');
 assert.equal(t.nodes.get('acceleration-biology').value,'1');
 t.read('accelerationSettings[accelerationKey()].biology_override=null;fillBiologyControl();');
 assert.equal(t.nodes.get('acceleration-biology').value,'4');
 assert.equal(t.nodes.get('acceleration-reset-biology').hidden,true);
 t.read('selectedCharacter=null;fillBiologyControl();');
 assert.equal(t.nodes.get('acceleration-biology').value,'0');
});
