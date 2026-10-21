import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const script=resolve('scripts/verificar-historial.mjs');
function fixture(){
 const cwd=mkdtempSync(join(tmpdir(),'dodo-git-policy-'));
 const git=(args,opts={})=>execFileSync('git',args,{cwd,encoding:'utf8',...opts}).trim();
 git(['init','-b','main']);git(['config','user.name','Prueba local']);git(['config','user.email','prueba@example.invalid']);
 writeFileSync(join(cwd,'dato'),'base');git(['add','dato']);git(['commit','-m','Base']);
 const base=git(['rev-parse','HEAD']);git(['switch','-c','prueba']);
 return {cwd,git,base};
}
test('permite cambios reales en un PR',()=>{
 const {cwd,git,base}=fixture();writeFileSync(join(cwd,'dato'),'nuevo');git(['add','dato']);git(['commit','-m','Cambio']);
 const r=spawnSync(process.execPath,[script,base,'HEAD'],{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
});
test('rechaza commit sin cambios aunque después haya un cambio real',()=>{
 const {cwd,git,base}=fixture();
 const empty=git(['commit-tree',`${base}^{tree}`,'-p',base,'-m','Fixture vacía']);
 git(['reset','--soft',empty]);writeFileSync(join(cwd,'dato'),'nuevo');git(['add','dato']);git(['commit','-m','Cambio']);
 const r=spawnSync(process.execPath,[script,base,'HEAD'],{cwd,encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/Commit vacío rechazado/);
});
test('hooks bloquean commits vacíos y commits/pushes a main',()=>{
 const {cwd,git,base}=fixture();git(['config','core.hooksPath',resolve('.githooks')]);
 const empty=spawnSync('git',['commit','--allow-empty','-m','No debe pasar'],{cwd,encoding:'utf8'});assert.notEqual(empty.status,0);assert.match(empty.stderr,/commits vacíos/);
 git(['switch','main']);writeFileSync(join(cwd,'dato'),'nuevo');git(['add','dato']);
 const main=spawnSync('git',['commit','-m','No debe pasar'],{cwd,encoding:'utf8'});assert.notEqual(main.status,0);assert.match(main.stderr,/commits en main/);
 const remote=join(cwd,'remote.git');git(['init','--bare',remote]);
 const hook=spawnSync('git',['push',remote,'main'],{cwd,encoding:'utf8'});assert.notEqual(hook.status,0);assert.match(hook.stderr,/push directo a main/);
});
