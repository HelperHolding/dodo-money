import { test } from "node:test";
import assert from "node:assert/strict";
import { limpiarHtml } from "./html.ts";

test("html: quita scripts, on*= y javascript:, cuenta lo quitado y conserva comentarios condicionales de Outlook", () => {
  const r = limpiarHtml(`<!--[if mso]><v:roundrect href="https://dodopizza.mx"/><![endif]--><img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a><a href="https://dodopizza.mx" onclick='y()'>ok</a>`);
  assert.equal(r.quitados, 4);
  assert.doesNotMatch(r.html, /script|onerror|onclick|javascript:/i);
  assert.match(r.html, /<!--\[if mso\]><v:roundrect href="https:\/\/dodopizza\.mx"\/><!\[endif\]-->/);
  assert.equal(limpiarHtml("<p>ok</p>").quitados, 0);
});

test("html: formas ejecutables alternativas (comillas internas, separadores, sin comillas, entidades, sin cierre, anidado)", () => {
  const casos: [string, number][] = [
    [`<a href="javascript:alert('x')">x</a>`, 1],
    [`<img/onerror=alert(1) src=x>`, 1],
    [`<img src="x"onerror="alert(1)">`, 1],
    [`<a href=javascript:alert(1)>x</a>`, 1],
    [`<a href="java&#115;cript:alert(1)">x</a>`, 1],
    [`<a href="jav&#x61;script:alert(1)">x</a>`, 1],
    [`<a href="java\tscript:alert(1)">x</a>`, 1],
    [`<a href="javascript&colon;alert(1)">x</a>`, 1],
    [`<p>hola</p><script>alert(1)`, 1],
    [`<scr<script>x</script>ipt>alert(1)</script>`, 2],
    [`<form action="javascript:x()"><button formaction="vbscript:y">z</button></form>`, 2],
  ];
  for (const [entrada, n] of casos) {
    const r = limpiarHtml(entrada);
    assert.equal(r.quitados, n, entrada);
    assert.doesNotMatch(r.html, /<script|onerror|javascript|vbscript|&#|&colon|script:/i, entrada);
  }
});

test("html: no toca texto visible ni enlaces seguros", () => {
  const r = limpiarHtml(`<p>Hola onda=bien y onclick=x</p><a href="https://dodopizza.mx/?a=1&amp;b=2" title="x onfoo=bar">ok</a>`);
  assert.equal(r.quitados, 0);
  assert.equal(r.html, `<p>Hola onda=bien y onclick=x</p><a href="https://dodopizza.mx/?a=1&amp;b=2" title="x onfoo=bar">ok</a>`);
});

test("html: diferencias del analizador (comilla suelta, = o < como nombre, href repetido) fallan cerrado", () => {
  const casos = [
    `<img src=x' onerror=alert(1)>`,
    `<img src=x" onerror=alert(1)>`,
    `<img src=y =x onerror=alert(1)>`,
    `<img src=y ="x" onerror=alert(1)>`,
    `<img src=y <x onerror=alert(1)>`,
    `<a href=x' href=javascript:a()>x</a>`,
    `<img title="a>b" onerror=alert(1)>`,
    `<a href="x" title=y' href=jav&#x61;script:a()>x</a>`,
  ];
  for (const entrada of casos) {
    const r = limpiarHtml(entrada);
    assert.ok(r.quitados >= 1, entrada);
    assert.doesNotMatch(r.html, /onerror|javascript|script:/i, entrada);
  }
});

test("html: HTML normal de Canva pasa idéntico y con quitados 0", () => {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>td{color:#333}</style></head><body style="margin:0"><!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://dodopizza.mx/zp1/go-big?a=1&amp;b=2" style="height:40px"><w:anchorlock/></v:roundrect><![endif]--><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="font-family:Arial,sans-serif;padding:8px"><a href="https://dodopizza.mx/zp1/go-big?a=1&amp;b=2" target="_blank" style="color:#e00">Pide</a> <a href='mailto:hola@dodopizza.mx'>Correo</a> <a href="tel:+523312345678">Llama</a><br /><img src="data:image/png;base64,iVBORw0KGgo=" width="10" height="10" alt="logo" /><img src="https://static.canva.com/a.png?x=1&amp;y=2" alt="Hola onda=bien"></td></tr></table></body></html>`;
  const r = limpiarHtml(html);
  assert.equal(r.quitados, 0);
  assert.equal(r.html, html);
});

test("html: comentarios y texto crudo no esconden etiquetas vivas", () => {
  const casos = [
    `<!--<img src="--><img src=x onerror=alert(1)>">`,
    `<title><a title="</title><img src=x onerror=alert(1)>"></title>`,
    `<style><a title="</style><img src=x onerror=alert(1)>"></style>`,
    `<textarea><a title="</textarea><img src=x onerror=alert(1)>"></textarea>`,
    `<noscript><a title="</noscript><img src=x onerror=alert(1)>"></noscript>`,
    `<xmp><a title="</xmp><img src=x onerror=alert(1)>"></xmp>`,
    `<a title="<b>x</b>" onclick=y()>z</a>`,
    `<!-- uno --><scr<!-- x -->ipt>alert(1)</script>`,
    `<scr<img onerror=x>ipt>alert(1)</script>`,
    `<!--[if mso]> --!> <img src=x onerror=alert(1)> <![endif]-->`,
    `<!--[if mso]><a href="javascript:alert(1)">x</a><![endif]-->`,
    `<p>x</p><plaintext><img onerror=alert(1)>`,
    `<a data="javascript:alert(1)" srcset="a.png 1x,javascript:alert(2)">x</a>`,
  ];
  for (const entrada of casos) {
    const r = limpiarHtml(entrada);
    assert.ok(r.quitados >= 1, entrada);
    assert.doesNotMatch(r.html, /onerror|onclick|javascript|<script|<plaintext/i, entrada);
  }
  assert.equal(limpiarHtml("<!-- nota --><p>ok</p>").html, "<p>ok</p>");
  assert.equal(limpiarHtml("<!-- nota --><p>ok</p>").quitados, 1);
});

test("html: texto visible con 'javascript:' en alt o title no quita la etiqueta", () => {
  const html = `<img src="https://a.test/x.png" alt="Aprende javascript: gratis" title="onda=1"><p>javascript: y vbscript: son lenguajes</p>`;
  const r = limpiarHtml(html);
  assert.equal(r.quitados, 0);
  assert.equal(r.html, html);
});

test("html: Canva con <style>, comentarios condicionales y de revelado queda idéntico", () => {
  const html = `<html><head><title>Go Big</title><style type="text/css">body{margin:0}@media (max-width:600px){.c{width:100%!important}}</style><!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/></o:OfficeDocumentSettings></xml><![endif]--></head><body><!--[if !mso]><!--><div class="c"><a href="https://dodopizza.mx/?a=1&amp;b=2" title="x onfoo=bar">Pide</a></div><!--<![endif]--><!--[if mso]><v:roundrect href="https://dodopizza.mx" style="height:40px"><center>Pide</center></v:roundrect><![endif]--></body></html>`;
  const r = limpiarHtml(html);
  assert.equal(r.quitados, 0);
  assert.equal(r.html, html);
});

test("html: comilla dentro de un valor sin comillas no esconde atributos vivos", () => {
  const casos: [string, string][] = [
    [`<a b=x"  c=">" onclick=alert(1)>z</a>`, `<a b="x&quot;" c="&gt;">z</a>`],
    [`<a b=x' c='>' onclick=alert(1)>z</a>`, `<a b="x'" c="&gt;">z</a>`],
    [`<img alt=a" src=">" onerror=alert(1)>`, `<img alt="a&quot;" src="&gt;">`],
    [`<a href=x" title=">" href=javascript:alert(1)>`, `<a href="x&quot;" title="&gt;" href="#">`],
  ];
  for (const [entrada, salida] of casos) {
    const r = limpiarHtml(entrada);
    assert.equal(r.quitados, 1, entrada);
    assert.equal(r.html, salida, entrada);
  }
});

test("html: estados del tokenizador (comentarios raros, cierre con atributos, texto crudo, object, condicionales)", () => {
  const casos: [string, string, number][] = [
    [`<!DOCTYPE html><![CDATA[x]]><?php x ?><!--><!---><p>ok</p>`, `<!DOCTYPE html><p>ok</p>`, 4],
    [`<p>ok</p><!-- sin cierre <img src=x onerror=alert(1)>`, `<p>ok</p>`, 1],
    [`<!-- a --!><img src=x onerror=alert(1)>`, `<img src="x">`, 2],
    [`<style onload=alert(1)>a{}</STYLE >`, `<style>a{}</STYLE >`, 1],
    [`<title>x</title foo=">"><img src=x onerror=alert(1)>`, `<title>x</title><img src="x">`, 2],
    [`<p>a</p></p onclick=x>`, `<p>a</p></p>`, 1],
    [`<<script>x</script>img src=x onerror=alert(1)>`, `&lt;img src=x onerror=alert(1)>`, 1],
    [`<object data=x><img src=y onerror=z><object></object><p>dentro</p></object><p>fuera</p>`, `<p>fuera</p>`, 1],
    [`<!--[if mso]><a title="--><img src=x onerror=alert(1)>"><![endif]--><p>ok</p>`, `<p>ok</p>`, 1],
    [`<p>ok</p><!--[if mso]><p>sin cierre`, `<p>ok</p>`, 1],
    [`<!--[if mso]><img src=x onerror=alert(1)><![endif]-->`, `<!--[if mso]><img src="x"><![endif]-->`, 1],
    [`<meta http-equiv="Refresh" content="0;url=javascript:alert(1)"><meta charset="utf-8">`, `<meta charset="utf-8">`, 1],
    [`<svg><animate attributeName=href values=javascript:alert(1) /></svg>`, `<svg></svg>`, 1],
    [`<a href=" &#14;java&#x09;script:x" lowsrc="vbscript:y">z</a>`, `<a href="#" lowsrc="#">z</a>`, 2],
    [`<p>a < b</p>`, `<p>a &lt; b</p>`, 0],
  ];
  for (const [entrada, salida, n] of casos) {
    const r = limpiarHtml(entrada);
    assert.equal(r.html, salida, entrada);
    assert.equal(r.quitados, n, entrada);
  }
});

test("html: entradas adversarias de 100 000 caracteres terminan en tiempo lineal", () => {
  const entradas = [
    "<a" + "\"'".repeat(50000), "<!--".repeat(25000), "<a ".repeat(33334), "<a<".repeat(33334), "<style></".repeat(11112),
    "<!--[if a]>".repeat(9091), "</a x='".repeat(14286), "<p title='>'>".repeat(7693), "<!-- --".repeat(14286), "<a b=\"".repeat(16667),
  ];
  for (const entrada of entradas) {
    const t = performance.now();
    limpiarHtml(entrada);
    const ms = performance.now() - t;
    assert.ok(ms < 200, `${entrada.slice(0, 12)}… tardó ${ms.toFixed(0)} ms`);
  }
});

test("html: atributo sin valor seguido de un nombre que empieza con = no se vuelve su valor al reescribir", () => {
  const casos: [string, string, number][] = [
    [`<a href/=javascript:alert(1) onclick=x>z</a>`, `<a href="">z</a>`, 2],
    [`<a href / =javascript:alert(1) onclick=x>z</a>`, `<a href="">z</a>`, 2],
    [`<a href/="javascript:alert(1)" onclick=x>z</a>`, `<a href="">z</a>`, 2],
    [`<a onclick=x href/=javascript:a()>z</a>`, `<a href="">z</a>`, 2],
    [`<form action/=javascript:alert(1) onsubmit=x>`, `<form action="">`, 2],
    [`<img src=y =x onerror=alert(1) alt>`, `<img src="y" alt="">`, 2],
  ];
  for (const [entrada, salida, n] of casos) {
    const r = limpiarHtml(entrada);
    assert.equal(r.html, salida, entrada);
    assert.equal(r.quitados, n, entrada);
  }
});

test("html: el condicional revelado con <!-- --> o <!----> queda idéntico", () => {
  for (const html of [`<!--[if !mso]><!-- --><p>x</p><!--<![endif]-->`, `<!--[if !mso]><!----><p>x</p><!--<![endif]-->`, `<!--[if !mso]><!--><p>x</p><!--<![endif]-->`]) {
    const r = limpiarHtml(html);
    assert.equal(r.html, html);
    assert.equal(r.quitados, 0);
  }
});

test("html: limpiar dos veces no cambia nada (todos los vectores conocidos)", () => {
  const vectores = [
    `<!--[if mso]><v:roundrect href="https://dodopizza.mx"/><![endif]--><img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a><a href="https://dodopizza.mx" onclick='y()'>ok</a>`,
    `<a href="javascript:alert('x')">x</a>`, `<img/onerror=alert(1) src=x>`, `<img src="x"onerror="alert(1)">`, `<a href=javascript:alert(1)>x</a>`,
    `<a href="java&#115;cript:alert(1)">x</a>`, `<a href="jav&#x61;script:alert(1)">x</a>`, `<a href="java\tscript:alert(1)">x</a>`, `<a href="javascript&colon;alert(1)">x</a>`,
    `<p>hola</p><script>alert(1)`, `<scr<script>x</script>ipt>alert(1)</script>`, `<form action="javascript:x()"><button formaction="vbscript:y">z</button></form>`,
    `<img src=x' onerror=alert(1)>`, `<img src=x" onerror=alert(1)>`, `<img src=y =x onerror=alert(1)>`, `<img src=y ="x" onerror=alert(1)>`, `<img src=y <x onerror=alert(1)>`,
    `<a href=x' href=javascript:a()>x</a>`, `<img title="a>b" onerror=alert(1)>`, `<a href="x" title=y' href=jav&#x61;script:a()>x</a>`,
    `<!--<img src="--><img src=x onerror=alert(1)>">`, `<title><a title="</title><img src=x onerror=alert(1)>"></title>`, `<style><a title="</style><img src=x onerror=alert(1)>"></style>`,
    `<textarea><a title="</textarea><img src=x onerror=alert(1)>"></textarea>`, `<noscript><a title="</noscript><img src=x onerror=alert(1)>"></noscript>`, `<xmp><a title="</xmp><img src=x onerror=alert(1)>"></xmp>`,
    `<a title="<b>x</b>" onclick=y()>z</a>`, `<!-- uno --><scr<!-- x -->ipt>alert(1)</script>`, `<scr<img onerror=x>ipt>alert(1)</script>`,
    `<!--[if mso]> --!> <img src=x onerror=alert(1)> <![endif]-->`, `<!--[if mso]><a href="javascript:alert(1)">x</a><![endif]-->`, `<p>x</p><plaintext><img onerror=alert(1)>`,
    `<a data="javascript:alert(1)" srcset="a.png 1x,javascript:alert(2)">x</a>`,
    `<a b=x"  c=">" onclick=alert(1)>z</a>`, `<a b=x' c='>' onclick=alert(1)>z</a>`, `<img alt=a" src=">" onerror=alert(1)>`, `<a href=x" title=">" href=javascript:alert(1)>`,
    `<!DOCTYPE html><![CDATA[x]]><?php x ?><!--><!---><p>ok</p>`, `<p>ok</p><!-- sin cierre <img src=x onerror=alert(1)>`, `<!-- a --!><img src=x onerror=alert(1)>`,
    `<style onload=alert(1)>a{}</STYLE >`, `<title>x</title foo=">"><img src=x onerror=alert(1)>`, `<p>a</p></p onclick=x>`, `<<script>x</script>img src=x onerror=alert(1)>`,
    `<object data=x><img src=y onerror=z><object></object><p>dentro</p></object><p>fuera</p>`, `<!--[if mso]><a title="--><img src=x onerror=alert(1)>"><![endif]--><p>ok</p>`,
    `<p>ok</p><!--[if mso]><p>sin cierre`, `<!--[if mso]><img src=x onerror=alert(1)><![endif]-->`, `<meta http-equiv="Refresh" content="0;url=javascript:alert(1)"><meta charset="utf-8">`,
    `<svg><animate attributeName=href values=javascript:alert(1) /></svg>`, `<a href=" &#14;java&#x09;script:x" lowsrc="vbscript:y">z</a>`, `<p>a < b</p>`,
    `<a href/=javascript:alert(1) onclick=x>z</a>`, `<a href / =javascript:alert(1) onclick=x>z</a>`, `<a href/="javascript:alert(1)" onclick=x>z</a>`,
    `<a onclick=x href/=javascript:a()>z</a>`, `<form action/=javascript:alert(1) onsubmit=x>`, `<!--[if !mso]><!-- --><p>x</p><!--<![endif]-->`,
  ];
  for (const x of vectores) {
    const una = limpiarHtml(x).html, dos = limpiarHtml(una);
    assert.equal(dos.quitados, 0, x);
    assert.equal(dos.html, una, x);
    assert.doesNotMatch(una, /<[^>]*\son[a-z]+\s*=|href\s*=\s*["']?\s*javascript/i, x);
  }
});
