const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(update,desktop=true){
  const nodes=new Map(),calls=[];
  const context=require('./i18n-helper.cjs').createContext({nativeDesktop:desktop,
    $:id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,handlers:{},addEventListener(event,fn){this.handlers[event]=fn;}});return nodes.get(id);},
    nativeCommand:async command=>{calls.push(command);if(update instanceof Error)throw update;return update;},
    notify:()=>{throw new Error('Startup errors should be silent');}
  });
  vm.runInContext(fs.readFileSync('ui/updates.js','utf8'),context);
  return {init:()=>vm.runInContext('initUpdates()',context),nodes,calls};
}
test('new version notice can be dismissed and opens the download page only on click',async()=>{
  const t=setup({version:'0.14.0'});await t.init();
  assert.equal(t.nodes.get('update-notice').hidden,false);
  assert.equal(t.nodes.get('update-message').textContent,'Доступна Skilly 0.14.0');
  assert.deepEqual(t.calls,['check_update']);
  await t.nodes.get('update-download').handlers.click();
  assert.deepEqual(t.calls,['check_update','open_update_page']);
  t.nodes.get('update-dismiss').handlers.click();
  assert.equal(t.nodes.get('update-notice').hidden,true);
});
test('no update, network failures and browser previews do not show a notice',async()=>{
  for(const value of [null,new Error('Offline')]){
    const t=setup(value);await t.init();assert.equal(t.nodes.get('update-notice').hidden,true);
  }
  const t=setup({version:'0.14.0'},false);await t.init();assert.equal(t.calls.length,0);
});
