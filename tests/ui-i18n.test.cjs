const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(language='ru',extras={}) {
  const store=new Map([['skilly-language',language]]);
  const ctx=require('./i18n-helper.cjs').createContext({localStorage:{getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value)},...extras});
  return {run:code=>vm.runInContext(code,ctx),store};
}
test('all catalog messages have English translations and preserve interpolation slots',()=>{
  const t=setup();
  for(const [key,message] of t.run('Object.entries(I18N_MESSAGES)')) {
    assert.equal(typeof message.ru,'string',key);
    assert.equal(typeof message.en,'string',key);
    assert.ok(!/[А-Яа-яЁё]/.test(message.en),key);
    assert.deepEqual(message.ru.match(/\{[^{}]*\}/g)?.sort()||[],message.en.match(/\{[^{}]*\}/g)?.sort()||[],key);
  }
  for(const file of fs.readdirSync('ui').filter(f=>f.endsWith('.js')&&!f.startsWith('i18n'))) {
    for(const match of fs.readFileSync('ui/'+file,'utf8').matchAll(/\bt\(["']([^"']+)["']/g))
      assert.equal(t.run(`Boolean(I18N_MESSAGES[${JSON.stringify(match[1])}])`),true,`${file}: ${match[1]}`);
  }
});
test('English formats dynamic durations and plurals without translating user names',()=>{
  const t=setup('en');
  const source=fs.readFileSync('ui/app.js','utf8');
  t.run(`let nativeDesktop=false;${source.slice(0,source.indexOf("document.addEventListener('input'"))}`);
  assert.equal(t.run('duration(1+2/24+3/1440)'),'1d 2h 3m');
  assert.equal(t.run(`plural(21,['skill','skills','skills'])`),'skills');
  assert.equal(t.run(`plural(1,['skill','skills','skills'])`),'skill');
  assert.equal(t.run(`t('plans_267','Мой план $& {1}')`),'Plan “Мой план $& {1}” saved');
  assert.equal(t.run(`newPlan().name`),'New plan');
});
test('service errors, nested warnings and optimizer notes are translated at display time',()=>{
  const t=setup('en');
  assert.equal(t.run(`localizeServerText('Не найден тип: Мир. Нужны английские названия EVE.')`),'Type not found: Мир. English EVE names are required.');
  assert.equal(t.run(`localizeServerText('Ошибка. Подключите персонажа заново.')`),'Ошибка. Connect the character again.');
  assert.equal(t.run(`localizeServerText('Нет ID плана')`),'Plan ID missing');
  const method=t.run(`localizeServerText(I18N_MESSAGES.server_667.ru.replace('{priority_note}',I18N_MESSAGES.server_664.ru).replace('{price_note}',''))`);
  assert.ok(!/[А-Яа-яЁё]/.test(method));
  assert.match(method,/dynamic programming/);
  const ru=setup('ru');assert.equal(ru.run(`localizeServerText('Нет ID плана')`),'Нет ID плана');
});
test('changing language saves the draft before persisting preference and reloading',async()=>{
  const order=[],select={};
  const t=setup('ru',{$:()=>select,document:{querySelectorAll:()=>[select]},persistDraft:async()=>order.push('draft'),window:{location:{reload:()=>order.push('reload')}},notify:()=>assert.fail('Unexpected error')});
  await t.run(`changeLanguage('en')`);
  assert.deepEqual(order,['draft','reload']);assert.equal(t.store.get('skilly-language'),'en');
  assert.equal(select.disabled,true);
});
test('a failed draft save prevents changing language or reloading',async()=>{
  const select={},errors=[];
  const t=setup('ru',{$:()=>select,document:{querySelectorAll:()=>[select]},persistDraft:async()=>{throw new Error('Disk full');},window:{location:{reload:()=>assert.fail('Must not reload')}},notify:message=>errors.push(message)});
  await t.run(`changeLanguage('en')`);
  assert.equal(t.store.get('skilly-language'),'ru');assert.equal(select.disabled,false);assert.deepEqual(errors,['Disk full']);
});
test('language initialization suppresses the browser context menu',()=>{
  const handlers={};
  const t=setup('ru',{$:()=>({addEventListener(){},querySelectorAll:()=>[]}),document:{documentElement:{},querySelectorAll:()=>[],addEventListener:(event,fn)=>handlers[event]=fn}});
  t.run('initLanguage()');let prevented=false;handlers.contextmenu({preventDefault(){prevented=true;}});assert.equal(prevented,true);
});
test('system language is the default, with English fallback and saved choice taking priority',()=>{
  assert.equal(setup(null,{navigator:{language:'ru-UA'}}).run('uiLanguage'),'ru');
  assert.equal(setup(null,{navigator:{language:'en-GB'}}).run('uiLanguage'),'en');
  assert.equal(setup(null,{navigator:{language:'uk-UA'}}).run('uiLanguage'),'en');
  assert.equal(setup(null,{navigator:{language:'de-DE'}}).run('uiLanguage'),'en');
  assert.equal(setup(null,{navigator:{language:''}}).run('uiLanguage'),'en');
  assert.equal(setup('ru',{navigator:{language:'en-US'}}).run('uiLanguage'),'ru');
  assert.equal(setup('en',{navigator:{language:'ru-RU'}}).run('uiLanguage'),'en');
});
