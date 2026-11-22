const fs=require('fs');const D='/home/user/schicht-navigator-v2/design/';
let s=fs.readFileSync(__dirname+'/showcase.src.html','utf8');
s=s.replace('/*@@TOKENS@@*/',()=>fs.readFileSync(D+'tokens.css','utf8').trim()).replace('/*@@COMPONENTS@@*/',()=>fs.readFileSync(D+'components.css','utf8').trim());
fs.writeFileSync(D+'showcase.html',s);console.log('ok',s.length);
