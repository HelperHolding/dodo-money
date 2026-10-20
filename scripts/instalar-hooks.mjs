import {execFileSync} from 'node:child_process';
execFileSync('git',['config','--local','core.hooksPath','.githooks'],{stdio:'inherit'});
console.log('Hooks instalados: sin commits vacíos ni commits/pushes directos a main.');
