type ProveedorBuscable={razon_social:string;nombre_comercial:string|null;rfc:string};
const normalizar=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
/** Distancia con transposiciones: tolera letras vecinas invertidas sin inferir identidades. */
function distancia(a:string,b:string):number{
 const d=Array.from({length:a.length+1},()=>Array<number>(b.length+1).fill(0));
 for(let i=0;i<=a.length;i++)d[i][0]=i;
 for(let j=0;j<=b.length;j++)d[0][j]=j;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
  d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);
 }
 return d[a.length][b.length];
}
export function buscarProveedores<T extends ProveedorBuscable>(filas:readonly T[],consulta:string):T[]{
 const q=normalizar(consulta.slice(0,200));if(!q)return [...filas];
 const terminos=q.split(' '),resultados:{fila:T;puntos:number;orden:number}[]=[];
 filas.forEach((fila,orden)=>{
  const nombres=[normalizar(fila.razon_social),normalizar(fila.nombre_comercial??'')];
  const rfc=normalizar(fila.rfc).replace(/ /g,''),palabras=nombres.join(' ').split(' ').filter(Boolean);
  let puntos=nombres.some(n=>n===q)||rfc===q.replace(/ /g,'')?0:nombres.some(n=>n.startsWith(q))?1:2;
  for(const t of terminos){
   if(nombres.some(n=>n.includes(t))||rfc.includes(t))continue;
   // No aproximar códigos/RFC ni fragmentos muy cortos; dos errores solo desde 8 letras.
   if(t.length<4||t.length>60||/\d/.test(t))return;
   const limite=t.length>=8?2:1;
   const mejor=Math.min(...palabras.filter(p=>p.length<=60&&Math.abs(p.length-t.length)<=limite).map(p=>distancia(t,p)));
   if(mejor>limite)return;puntos+=10+mejor;
  }
  resultados.push({fila,puntos,orden});
 });
 return resultados.sort((a,b)=>a.puntos-b.puntos||a.orden-b.orden).map(r=>r.fila);
}
