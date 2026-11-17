const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
  const nodes=new Map();
  const context=vm.createContext({window:{},$:id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:''});return nodes.get(id);},
    esc:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))});
  vm.runInContext(`let selectedCharacter=1,characterState={characters:[{id:1,name:'Alice & Co'},{id:2,name:'Bob'}],tracked_plans:{1:{id:'b'},2:{id:'b'}}};
    function trackedPlan(id){return characterState.tracked_plans[id];}
    ${fs.readFileSync('ui/plans.js','utf8')}
    activePlanId='c';libraryRecords=[{id:'a',name:'Alpha'},{id:'b',name:'Beta',group_members:2},{id:'c',name:'Current'}];`,context);
  return {run:code=>vm.runInContext(code,context),nodes,html:()=>nodes.get('plan-picker-list').innerHTML};
}
test('selected pilot plan precedes the open plan and preserves library order',()=>{
  const t=setup();t.run('renderPlanPicker()');
  assert.deepEqual([...t.html().matchAll(/data-picker-plan="(.*?)"/g)].map(m=>m[1]),['b','a','c']);
  assert.equal(t.run('libraryRecords.map(record=>record.id).join()'),'a,b,c');
  assert.match(t.html(),/data-picker-plan="c" aria-current="page"/);
  assert.match(t.html(),/role="group" aria-label="Активный план · Alice &amp; Co"/);
  assert.match(t.html(),/Остальные планы/);
});
test('group and all assigned pilots have separate escaped badges, highlighting selected pilot',()=>{
  const t=setup();t.run('renderPlanPicker()');
  assert.match(t.html(),/plan-group-badge">группа/);
  assert.match(t.html(),/plan-character-badge is-selected" title="Alice &amp; Co">Alice &amp; Co/);
  assert.match(t.html(),/plan-character-badge" title="Bob">Bob/);
  assert.ok(t.html().indexOf('title="Bob"')<t.html().indexOf('plan-group-badge'));
});
test('many pilots collapse to a count and keep selected pilot visible first',()=>{
  const t=setup();t.run(`for(let id=3;id<=8;id++){characterState.characters.push({id,name:'Pilot '+id});characterState.tracked_plans[id]={id:'b'};}selectedCharacter=8;renderPlanPicker();`);
  assert.match(t.html(),/plan-character-badge is-selected" title="Pilot 8">Pilot 8/);
  assert.match(t.html(),/plan-character-more" title="[^"]+">\+5/);
  assert.equal([...t.html().matchAll(/class="plan-character-badge/g)].length,4);
});
test('unassigned or shared view keeps normal ordering and search still filters results',()=>{
  const t=setup();t.run('selectedCharacter=null;renderPlanPicker()');
  assert.deepEqual([...t.html().matchAll(/data-picker-plan="(.*?)"/g)].map(m=>m[1]),['a','b','c']);
  assert.doesNotMatch(t.html(),/is-selected/);
  assert.doesNotMatch(t.html(),/plan-picker-pinned/);
  t.nodes.get('plan-picker-search').value='ALPHA';t.run('selectedCharacter=1;renderPlanPicker()');
  assert.match(t.html(),/data-picker-plan="a"/);assert.doesNotMatch(t.html(),/data-picker-plan="b"/);
});
