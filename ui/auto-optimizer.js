"use strict";
let optimizationTimer, optimizationTask=null, optimizationFailure=null;

function optimizationKey(){
  if(!plan)return '';
  const {name,...inputs}=plan;
  return JSON.stringify([revision,inputs,selectedCharacter,
    selectedCharacter?currentCharacter()?.fetched_at:null,
    selectedCharacter?characterRemaps[selectedCharacter]??null:null,
    selectedCharacter?replacementChoices[selectedCharacter]??selectedAdaptation()?.replace_implants??false:false,
    selectedCharacter?Boolean(characterExtraRemaps[selectedCharacter]):false]);
}
function optimizationMessage(){
  if(typeof attributeInputError==='function'&&attributeInputError())return attributeInputError();
  const failed=optimizationFailure?.key===optimizationKey()?optimizationFailure:null;
  if(failed)return `Не удалось оптимизировать: ${failed.message}.${failed.attempts<3?' Повторяем автоматически…':' Следующая попытка — после изменения данных или повторного открытия плана.'}`;
  return 'Оптимизируем очередь…';
}
function scheduleOptimization(delay=350){
  if(!plan?.goals.length||displayComparison()||optimizationTask||(typeof attributeInputError==='function'&&attributeInputError()))return;
  const failed=optimizationFailure?.key===optimizationKey()?optimizationFailure:null;
  if(failed?.attempts>=3)return;
  clearTimeout(optimizationTimer);
  optimizationTimer=setTimeout(()=>runOptimization(),failed?1500*failed.attempts:delay);
}
async function runOptimization(){
  clearTimeout(optimizationTimer);
  if(optimizationTask||!plan?.goals.length||displayComparison()||(typeof attributeInputError==='function'&&attributeInputError()))return;
  if(busy){scheduleOptimization(100);return;}
  const task={key:optimizationKey(),characterId:selectedCharacter};
  optimizationTask=task;
  const isCurrent=()=>task.key===optimizationKey();
  try{
    renderJourney();
    // The shared optimized result and personal result remain independent.
    if(!result||!calculationKey){
      const data=await api('/api/calculate',JSON.parse(JSON.stringify(plan)));
      if(!isCurrent())return;
      const name=plan.name;
      plan=data.plan;plan.name=name;items=data.items;result=data;
      calculationKey=data.calculation_key;calculatedAt=new Date();preview=null;
      task.key=optimizationKey();
    }
    if(task.characterId){
      const replace=replacementChoices[task.characterId]??selectedAdaptation()?.replace_implants??false;
      const data=await api('/api/characters/adapt',{
        plan:JSON.parse(JSON.stringify(plan)),character_id:task.characterId,
        replace_implants:replace,remap_count:characterRemaps[task.characterId]??null,extra_remap:Boolean(characterExtraRemaps[task.characterId])
      });
      if(!isCurrent())return;
      items=data.items;
      adaptations=adaptations.filter(a=>a.character_id!==task.characterId);
      adaptations.push(data.adaptation);
    }
    optimizationFailure=null;scheduleMode='optimized';
    renderCatalog();renderGoals();renderDashboard();queueDraft();
  }catch(error){
    if(isCurrent()){
      const previous=optimizationFailure?.key===task.key?optimizationFailure.attempts:0;
      optimizationFailure={key:task.key,message:error.message,attempts:previous+1};
    }
  }finally{
    optimizationTask=null;
    renderDashboard();
    scheduleOptimization();
  }
}
