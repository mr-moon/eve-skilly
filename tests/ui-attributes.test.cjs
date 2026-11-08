const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('ui/app.js','utf8');
function setup(){
 const nodes=new Map(['attribute-total','attribute-note','attribute-error'].map(id=>[id,{dataset:{},textContent:'',hidden:true}]));
 const inputs=Array.from({length:5},(_,i)=>({dataset:{attr:String(i)},value:'',setAttribute(name,value){this[name]=value},setCustomValidity(message){this.validityMessage=message}}));
 const context=vm.createContext({selectedCharacter:null,plan:{attributes:[17,27,17,21,17]},currentCharacter:()=>({name:'Pilot',attributes:[21,17,17,27,17]}),$:id=>nodes.get(id),document:{querySelectorAll:()=>inputs}});
 vm.runInContext(source.slice(source.indexOf('let attributeDraft=null;'),source.indexOf('function renderControls()')),context);
 return{run:code=>vm.runInContext(code,context),nodes,inputs};
}
test('attribute allocation rejects blanks, fractions, bounds and incorrect totals',()=>{
 const t=setup();
 for(const values of [[16,28,17,21,17],[17,27.5,17,20.5,17],['',27,17,21,17],[null,27,17,21,17],[17,27,17,20,17],[17,27,17,22,17]])assert.ok(t.run(`attributeAllocationError(${JSON.stringify(values)})`));
 assert.equal(t.run('attributeAllocationError([17,27,17,21,17])'),'');
});
test('attribute edits clamp bounds and redistribute points while preserving a sum of 99',()=>{
 const t=setup();
 for(let index=0;index<5;index++)for(const value of [-100,16,17,20,27,28,100,20.4]){
  const next=t.run(`rebalanceAttributes([17,27,17,21,17],${index},${value})`);
  assert.equal(next.reduce((a,b)=>a+b,0),99);assert.ok(next.every(v=>Number.isInteger(v)&&v>=17&&v<=27));
  assert.equal(next[index],Math.min(27,Math.max(17,Math.round(value))));
 }
 assert.deepEqual(Array.from(t.run("rebalanceAttributes([17,27,17,21,17],0,'')")),[17,27,17,21,17]);
});
test('personal attributes show ESI values as read only and return to shared values',()=>{
 const t=setup();t.run('selectedCharacter=1;updateTotal();');
 assert.equal(t.inputs[0].value,21);assert.equal(t.inputs[3].value,27);assert.ok(t.inputs.every(i=>i.readOnly));
 assert.match(t.nodes.get('attribute-note').textContent,/Pilot/);assert.equal(t.nodes.get('attribute-error').hidden,true);
 t.run('selectedCharacter=null;updateTotal();');assert.equal(t.inputs[0].value,17);assert.ok(t.inputs.every(i=>!i.readOnly));
});
