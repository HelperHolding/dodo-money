const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
async function cargarMarkdown(){
 const md=await import('react-markdown'),gfm=await import('remark-gfm');
 const codigo=ts.transpileModule(fs.readFileSync('app/asistente/MarkdownChat.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports',codigo)(id=>id==='react-markdown'?{...md,__esModule:true}:id==='remark-gfm'?{...gfm,__esModule:true}:id.endsWith('.css')?{default:{}}:require(id),mod,mod.exports);
 return props=>renderToStaticMarkup(React.createElement(mod.exports.MarkdownChat,props));
}
test('chat: Markdown con títulos, listas, tabla GFM y código',async()=>{
 const render=await cargarMarkdown();
 const html=render({texto:'# Ventas\n\n**Total**: $100\n\n- Uno\n- Dos\n\n| Día | Venta |\n| --- | ---: |\n| Lunes | 100 |\n\n`código`'});
 for(const tag of ['<h1>Ventas</h1>','<strong>Total</strong>','<ul>','<table>','<th>','<code>código</code>'])assert.ok(html.includes(tag),tag);
 assert.ok(html.includes('Tabla de la respuesta'));
});
test('chat: HTML e imágenes no ejecutan y solo enlaza fuentes autorizadas',async()=>{
 const render=await cargarMarkdown();
 const html=render({texto:'<script>alert(1)</script>\n\n![imagen](https://externo.invalid/pixel)\n\n[Fuera](https://externo.invalid) [Malo](javascript:alert(1)) [Ventas](/ventas?desde=2026-10-01)',fuentes:[{titulo:'Ventas',href:'/ventas?desde=2026-10-01'}]});
 assert.ok(!html.includes('<script'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('href="https://externo.invalid'));assert.ok(!html.includes('href="javascript:'));
 assert.ok(html.includes('href="/ventas?desde=2026-10-01"'));
});
