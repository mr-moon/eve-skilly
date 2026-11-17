"use strict";
function systemLanguage() {
  const language=typeof navigator==='undefined' ? 'en' : navigator.languages?.[0]||navigator.language||'en';
  return language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}
let uiLanguage = systemLanguage();
try {
  const saved=localStorage.getItem('skilly-language');
  if(['ru','en'].includes(saved))uiLanguage=saved;
} catch (_) {}
function uiLocale() { return uiLanguage === 'en' ? 'en-US' : 'ru-RU'; }
function t(key, ...values) {
  const message = I18N_MESSAGES[key];
  const text = message ? message[uiLanguage] || message.ru : key;
  return text.replace(/\{(\d+)\}/g, (token, index) => Number(index) < values.length ? String(values[index]) : token);
}
const serverMessages = Object.entries(I18N_MESSAGES).filter(([key]) => key.startsWith('server_'));
const serverPatterns = serverMessages.filter(([,value]) => /\{[^{}]*\}/.test(value.ru)).map(([key,value]) => {
  const names = [], escape = text => text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  let offset=0,pattern='';
  for (const match of value.ru.matchAll(/\{([^{}]*)\}/g)) {
    pattern += escape(value.ru.slice(offset,match.index)) + '([\\s\\S]*?)';
    names.push(match[1]);offset=match.index+match[0].length;
  }
  pattern += escape(value.ru.slice(offset));
  return {key,names,regex:new RegExp('^'+pattern+'$')};
});
const serverLiterals = serverMessages.filter(([,value]) => !/\{[^{}]*\}/.test(value.ru))
  .sort((a,b) => b[1].ru.length-a[1].ru.length);
function localizeServerText(value, depth = 0) {
  if (uiLanguage !== 'en' || typeof value !== 'string' || depth > 5) return value;
  for (const [key,message] of serverLiterals) if (value === message.ru) return t(key);
  for (const pattern of serverPatterns) {
    const match = pattern.regex.exec(value);
    if (!match) continue;
    let next=0;
    return I18N_MESSAGES[pattern.key].en.replace(/\{([^{}]*)\}/g, (_,name) => {
      const index = name === '' ? next++ : pattern.names.indexOf(name);
      return localizeServerText(match[index+1] ?? '',depth+1);
    });
  }
  for (const [,message] of serverLiterals) if (message.ru.length > 8) value=value.split(message.ru).join(message.en);
  return value;
}
function localizeStatic() {
  document.documentElement.lang=uiLanguage;
  document.querySelectorAll('[data-i18n-text]').forEach(element=>{
    const keys=JSON.parse(element.getAttribute('data-i18n-text'));
    Array.from(element.childNodes).filter(node=>node.nodeType===3).forEach((node,index)=>{
      if(keys[index])node.textContent=t(keys[index]);
    });
  });
  document.querySelectorAll('[data-i18n-attrs]').forEach(element=>{
    for(const [attr,key] of Object.entries(JSON.parse(element.getAttribute('data-i18n-attrs'))))element.setAttribute(attr,t(key));
  });
}
async function changeLanguage(language) {
  if(!['ru','en'].includes(language)||language===uiLanguage)return;
  const buttons=Array.from(document.querySelectorAll('[data-language]'));
  buttons.forEach(button=>button.disabled=true);
  try {
    // The same draft recovery path as a normal app restart preserves unsaved edits.
    await persistDraft();
    localStorage.setItem('skilly-language',language);
    window.location.reload();
  } catch(error) {
    buttons.forEach(button=>button.disabled=false);
    notify(localizeServerText(error.message)||t('language_error'),'error');
  }
}
function initLanguage() {
  localizeStatic();
  const menu=$('export-menu');
  const buttons=Array.from(document.querySelectorAll('[data-language]'));
  buttons.forEach(button=>{
    button.setAttribute('aria-pressed',String(button.dataset.language===uiLanguage));
    button.addEventListener('click',()=>{
      if(button.dataset.language===uiLanguage)menu.open=false;
      else changeLanguage(button.dataset.language);
    });
  });
  document.addEventListener('click',event=>{if(!event.target.closest('#export-menu'))menu.open=false;});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&menu.open){
      event.preventDefault();menu.open=false;menu.querySelector('summary').focus();
    }
  });
  document.addEventListener('contextmenu',event=>event.preventDefault());
}
