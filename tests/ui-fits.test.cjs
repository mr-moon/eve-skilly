const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('ui/fits.js','utf8');
function setup(){
 const nodes=new Map(),pending=[];
 const context=vm.createContext({JSON,Map,Date,String,Number,
 $:id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',checked:false,replaceChildren(){this.innerHTML='';}});return nodes.get(id);},
 api:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),
 document:{querySelectorAll:()=>[]},setTimeout:()=>0,clearTimeout:()=>{}});
 vm.runInContext(`let plan={goals:[{id:1,level:5}]},planGroup=null,items={};
 function invalidate(){} function renderFitBinding(){} function queueDraft(){}
 function mergeGoals(goals){for(const goal of goals){const current=plan.goals.find(g=>g.id===goal.id);if(current)current.level=Math.max(current.level,goal.level);else plan.goals.push(goal);}}
 function esc(s){return String(s);}
 `+source,context);
 return{read:code=>vm.runInContext(code,context),nodes,pending};
}
test('binding keeps extra targets and freezes required levels independently from editable goals',()=>{
 const t=setup();t.read(`const fit={id:'fit-a',name:'A',ship:'Kestrel',eft:'[Kestrel, A]',version:1,requirements:[{id:1,level:3},{id:2,level:2}]};attachFit(fit);plan.goals[1].level=5;`);
 assert.equal(t.read('plan.goals[0].level'),5);
 assert.equal(t.read('plan.fitting.requirements[1].level'),2);
 assert.equal(t.read('fit.requirements[1].level'),2);
 assert.equal(t.read('fitMinimums().get(2)'),2);
 t.read('plan.fitting=null;');assert.equal(t.read('fitMinimums().size'),0);
});
test('fit requirements combine with recursive prerequisite floors',()=>{
 const t=setup();const app=fs.readFileSync('ui/app.js','utf8');
 const required=app.slice(app.indexOf('function requiredLevels()'),app.indexOf('function renderCatalog()'));
 t.read(`plan={goals:[{id:1,level:5}],fitting:{requirements:[{id:2,level:4},{id:3,level:1}]}};items={1:{skill:{requirements:[{id:2,level:3}]}},2:{skill:{requirements:[]}}};`+required);
 assert.equal(t.read('requiredLevels().get(2)'),4);assert.equal(t.read('requiredLevels().get(3)'),1);
});
test('outdated Pyfa search results cannot overwrite a later query',async()=>{
 const t=setup();t.read("$('pyfa-search').value='Old';");const old=t.read('searchPyfa()');
 t.read("$('pyfa-search').value='New';");const latest=t.read('searchPyfa()');
 t.pending[1].resolve({fits:[{id:2,name:'New fit',ship:'Ship',updated:'today'}]});await latest;
 t.pending[0].resolve({fits:[{id:1,name:'Old fit',ship:'Ship',updated:'today'}]});await old;
 assert.match(t.nodes.get('pyfa-results').innerHTML,/New fit/);assert.doesNotMatch(t.nodes.get('pyfa-results').innerHTML,/Old fit/);
});
