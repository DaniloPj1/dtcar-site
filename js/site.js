// Site da DTCar — aplica a versão publicada (editada pelo Danilo no próprio site).
// Sem resposta do servidor, o site fica com o conteúdo escrito no index.html.
// Conteúdo publicado: { t: textos, s: tamanhos, img: fotos, enq: enquadramento das fotos, a: links, ordem: seções, ocultas: seções/itens escondidos }.
// Chave ausente = volta ao que está escrito no index.html (o original é guardado na primeira vez).
(function () {
  "use strict";
  var CFG = {
    url: "https://vbbklawlbxznsemkgtvg.supabase.co",
    // Chave pública (publishable) do Supabase: pode ficar no site; quem protege os dados são as regras do banco.
    key: "sb_publishable_GGHkXwDjq49nw2TqWzJV9Q_e3_8-j-A"
  };
  var TAM = { p: 0.82, m: 1, g: 1.2, gg: 1.45 };
  var PASTA_FOTOS = CFG.url + "/storage/v1/object/public/site/";
  var ORIG = new WeakMap();   // elemento → { texto, fs (font-size escrito no HTML), src, href }
  var ordemOriginal = [];

  function linkOk(u) { return typeof u === "string" && u.length <= 2000 && /^(https:\/\/|mailto:|tel:|#)/i.test(u); }
  function imgOk(u) { return typeof u === "string" && (u.indexOf(PASTA_FOTOS) === 0 || /^media\/[\w.-]+$/.test(u)); }
  function obj(o) { return o && typeof o === "object" && !Array.isArray(o) ? o : {}; }
  function orig(el) { return ORIG.get(el); }
  function num(v) { return typeof v === "number" && v >= 0 && v <= 100 ? Math.round(v) : null; }

  function guardarOriginais() {
    document.querySelectorAll("[data-c],[data-img],[data-href]").forEach(function (el) {
      if (ORIG.has(el)) return;
      ORIG.set(el, { texto: el.textContent, fs: el.style.fontSize, src: el.getAttribute("src"), href: el.getAttribute("href"), pos: el.style.objectPosition, maxh: el.style.maxHeight });
    });
    var main = document.getElementById("secoes");
    if (main && !ordemOriginal.length) ordemOriginal = Array.prototype.map.call(main.querySelectorAll(":scope > [data-secao]"), function (s) { return s.getAttribute("data-secao"); });
  }

  // Tamanho relativo ao tamanho normal da tela (PC ou celular); a base é sempre o tamanho do HTML, nunca o já aumentado.
  function ajustarTamanho(el, nivel) {
    var o = orig(el); if (!o) return;
    el.style.fontSize = o.fs;
    var k = TAM[nivel];
    if (!k || k === 1) { el.removeAttribute("data-tam"); return; }
    el.setAttribute("data-tam", nivel);
    el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * k).toFixed(1) + "px";
  }
  function aplicarTamanhos(d) {
    var s = obj(obj(d).s);
    document.querySelectorAll("[data-c]").forEach(function (el) { ajustarTamanho(el, s[el.getAttribute("data-c")]); });
  }

  function aplicar(d) {
    d = obj(d);
    guardarOriginais();
    var t = obj(d.t), img = obj(d.img), a = obj(d.a);
    var editando = document.activeElement;
    document.querySelectorAll("[data-c]").forEach(function (el) {
      var k = el.getAttribute("data-c"), o = orig(el);
      var v = typeof t[k] === "string" ? t[k] : o.texto;
      if (el !== editando && el.textContent !== v) el.textContent = v;
    });
    aplicarTamanhos(d);
    document.querySelectorAll("[data-img]").forEach(function (el) {
      var k = el.getAttribute("data-img"), v = imgOk(img[k]) ? img[k] : orig(el).src;
      if (v && el.getAttribute("src") !== v) el.setAttribute("src", v);
    });
    // Enquadramento: qual parte da foto aparece quando ela é cortada (horizontal e vertical, 0 a 100%), ou a foto inteira.
    var enq = obj(d.enq);
    document.querySelectorAll("[data-img]").forEach(function (el) {
      var o = orig(el), e = obj(enq[el.getAttribute("data-img")]);
      var x = num(e.x), y = num(e.y);
      el.style.objectPosition = x !== null && y !== null ? x + "% " + y + "%" : o.pos;
      el.style.maxHeight = e.inteira === true ? "none" : o.maxh;
    });
    document.querySelectorAll("[data-href]").forEach(function (el) {
      var k = el.getAttribute("data-href"), v = linkOk(a[k]) ? a[k] : orig(el).href;
      if (v && el.getAttribute("href") !== v) el.setAttribute("href", v);
    });
    var main = document.getElementById("secoes");
    if (main) {
      var ordem = (Array.isArray(d.ordem) ? d.ordem : []).filter(function (id) { return ordemOriginal.indexOf(id) >= 0; });
      ordemOriginal.forEach(function (id) { if (ordem.indexOf(id) < 0) ordem.push(id); });   // seção nova no HTML entra no fim
      ordem.forEach(function (id) {
        var sec = null;
        Array.prototype.some.call(main.children, function (c) { if (c.getAttribute("data-secao") === id) { sec = c; return true; } return false; });
        if (sec) main.appendChild(sec);
      });
    }
    var ocultas = Array.isArray(d.ocultas) ? d.ocultas : [];
    document.querySelectorAll("[data-secao],[data-bloco]").forEach(function (el) {
      var id = el.getAttribute("data-secao") || el.getAttribute("data-bloco");
      if (ocultas.indexOf(id) >= 0) el.setAttribute("data-oculto", ""); else el.removeAttribute("data-oculto");
    });
    window.DTSite.atual = d;
  }

  // Girar a tela ou a barra do navegador do celular aparecer: refaz só os tamanhos (nunca os textos).
  var espera;
  window.addEventListener("resize", function () {
    clearTimeout(espera);
    espera = setTimeout(function () { aplicarTamanhos(window.DTSite.atual); }, 200);
  });

  function carregarPublicado() {
    var ctrl = window.AbortController ? new AbortController() : null;
    var limite = setTimeout(function () { if (ctrl) ctrl.abort(); }, 6000);
    return fetch(CFG.url + "/rest/v1/rpc/site_conteudo_publicado", {
      method: "POST",
      headers: { apikey: CFG.key, "Content-Type": "application/json" },
      body: "{}",
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { if (j && j.dados) aplicar(j.dados); })
      .catch(function () { /* sem conexão ou resposta estranha: fica o conteúdo do HTML */ })
      .then(function () { clearTimeout(limite); });
  }

  function carregarEditor() {
    var sc = document.createElement("script");
    sc.src = "js/editor.js?v=" + window.DTSite.versao;
    document.body.appendChild(sc);
  }

  window.DTSite = { CFG: CFG, TAM: TAM, aplicar: aplicar, aplicarTamanhos: aplicarTamanhos, linkOk: linkOk, imgOk: imgOk, atual: {}, versao: "3" };
  guardarOriginais();

  var q = new URLSearchParams(location.search);
  if (q.has("editar") || q.has("previa")) carregarEditor();
  else carregarPublicado();
})();
