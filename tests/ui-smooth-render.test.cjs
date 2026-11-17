const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 const nodes=new Map();
 const document={getElementById:id=>{
   if(!nodes.has(id)){let html='';nodes.set(id,{writes:0,scrollTop:0,scrollLeft:0,textContent:'',dataset:{},hidden:false,
     get innerHTML(){return html;},set innerHTML(value){html=value;this.writes++;},querySelectorAll:()=>[],setAttribute(){},classList:{toggle(){}}});}
   return nodes.get(id);
 }};
 const context=require('./i18n-helper.cjs').createContext({document,window:{},Date,Set,Map,JSON});
 const source=fs.readFileSync('ui/app.js','utf8');
 vm.runInContext(source.slice(0,source.indexOf("document.addEventListener('input'")),context);
 vm.runInContext(`let activePlanId='a',selectedCharacter=null,showLearnedSkills=false,fresh=true;
 let schedule={days:1,rows:[{id:1,name:'Science',level:3,start_day:0,end_day:1,points:250,primary:0,secondary:4}],remaps:[],installations:[]};
 plan={name:'A',goals:[{id:1,level:3}]};
 activeSchedule=()=>fresh?schedule:null;
 function displayComparison(){return fresh?{optimized:schedule,baseline:schedule,saved_days:0}:null;}
 function syncQueueSelection(){}function currentCharacter(){return null;}function queueBookEvents(){return [];}function learnedQueueRows(){return '';}function queueRowTracking(){return '';}function queueLevelBlocks(){return '';}
 function paintQueueSelection(){}function paintQueueBookPrices(){}renderTimeline=()=>{};
 function selectedAdaptation(){return null;}
 renderRecommendations=()=>{};function renderTracking(){}function updateSaveState(){}function renderCharacterContext(){}renderImplantStatus=()=>{};
 function renderGroupContext(){}function renderAccelerationControls(){}function renderBookCosts(){}function renderJourney(){}
 `,context);
 return {run:code=>vm.runInContext(code,context),nodes};
}
test('pending calculation keeps rows, metrics and scroll until the replacement is ready',()=>{
 const t=setup();t.run('renderQueue();renderSummary();');
 const queue=t.nodes.get('queue'),scroller=t.nodes.get('queue-scroll'),time=t.nodes.get('top-time').textContent;
 scroller.scrollTop=120;t.run('fresh=false;renderQueue();renderSummary();');
 assert.equal(queue.writes,1);assert.equal(scroller.scrollTop,120);assert.equal(t.nodes.get('top-time').textContent,time);
 t.run('fresh=true;schedule.rows[0].end_day=2;renderQueue();');
 assert.equal(queue.writes,2);assert.equal(scroller.scrollTop,120);
 t.run('renderQueue();');assert.equal(queue.writes,2);
});
test('switching context resets scroll on commit and an empty plan clears retained rows',()=>{
 const t=setup();t.run('renderQueue();');t.nodes.get('queue-scroll').scrollTop=120;
 t.run("activePlanId='b';renderQueue();");assert.equal(t.nodes.get('queue-scroll').scrollTop,0);
 t.run('fresh=false;plan.goals=[];renderQueue();');assert.equal(t.nodes.get('queue').innerHTML,'');
 assert.equal(t.run('retainDashboardView()'),false);
});
