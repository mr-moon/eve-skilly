const fs=require('node:fs'),vm=require('node:vm');
exports.createContext=(...args)=>{
  args[0]={navigator:{language:'ru-RU'},...args[0]};
  const context=vm.createContext(...args);
  vm.runInContext(fs.readFileSync('ui/i18n-catalog.js','utf8')+'\n'+fs.readFileSync('ui/i18n.js','utf8'),context);
  return context;
};
