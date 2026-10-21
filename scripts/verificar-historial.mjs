import {execFileSync} from 'node:child_process';
const git=(args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const [base,head]=process.argv.slice(2);
if(!base||!head)throw Error('Indica las revisiones base y head.');
for(const ref of [base,head])git(['rev-parse','--verify',`${ref}^{commit}`]);
const commits=git(['rev-list',`${base}..${head}`]).split('\n').filter(Boolean);
if(!commits.length)throw Error('No hay commits nuevos.');
for(const sha of commits){
 const parents=git(['rev-list','--parents','-n','1',sha]).split(' ').slice(1);
 const tree=git(['rev-parse',`${sha}^{tree}`]);
 if(parents.length&&tree===git(['rev-parse',`${parents[0]}^{tree}`]))throw Error(`Commit vacío rechazado: ${sha}`);
}
if(git(['rev-parse',`${base}^{tree}`])===git(['rev-parse',`${head}^{tree}`]))throw Error('El cambio completo no modifica archivos.');
console.log(`Historial válido: ${commits.length} commits con cambios.`);
