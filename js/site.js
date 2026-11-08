// Site da DTCar — aplica a versão publicada (editada pelo Danilo no próprio site).
// Sem resposta do servidor, o site fica com o conteúdo escrito no index.html.
// Conteúdo publicado: { t: textos, s: tamanhos, img: fotos, a: links, ordem: seções, ocultas: seções/itens escondidos }.
(function () {
  "use strict";
  var CFG = {
    url: "https://vbbklawlbxznsemkgtvg.supabase.co",
    // Chave pública (publishable) do Supabase: pode ficar no site; quem protege os dados são as regras do banco.
    key: "sb_publishable_GGHkXwDjq49nw2TqWzJV9Q_e3_8-j-A"
  };
  var TAM = { p: 0.82, m: 1, g: 1.2, gg: 1.45 };
  var PASTA_FOTOS = CFG.url + "/storage/v1/object/public/site/";

  function linkOk(u) { return typeof u === "string" && u.length <= 2000 && /^(https:\/\/|mailto:|tel:|#)/i.test(u); }
  function imgOk(u) { return typeof u === "string" && (u.indexOf(PASTA_FOTOS) === 0 || /^media\/[\w.-]+$/.test(u)); }
  function todos(attr, chave) { return document.querySelectorAll("[" + attr + '="' + chave.replace(/["\\]/g, "") + '"]'); }

  function ajustarTamanho(el, nivel) {
    el.style.fontSize = "";
    var k = TAM[nivel];
    if (!k || k === 1) { el.removeAttribute("data-tam"); return; }
    el.setAttribute("data-tam", nivel);
    el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * k).toFixed(1) + "px";
  }

  function aplicar(d) {
    d = d && typeof d === "object" ? d : {};
    var t = d.t || {}, s = d.s || {}, img = d.img || {}, a = d.a || {};
    Object.keys(t).forEach(function (k) {
      if (typeof t[k] !== "string") return;
      todos("data-c", k).forEach(function (el) { el.textContent = t[k]; });
    });
    document.querySelectorAll("[data-c]").forEach(function (el) { ajustarTamanho(el, s[el.getAttribute("data-c")]); });
    Object.keys(img).forEach(function (k) {
      if (!imgOk(img[k])) return;
      todos("data-img", k).forEach(function (el) { el.src = img[k]; });
    });
    Object.keys(a).forEach(function (k) {
      if (!linkOk(a[k])) return;
      todos("data-href", k).forEach(function (el) { el.href = a[k]; });
    });
    var main = document.getElementById("secoes");
    if (main && Array.isArray(d.ordem)) {
      d.ordem.forEach(function (id) {
        var sec = main.querySelector(':scope > [data-secao="' + String(id).replace(/["\\]/g, "") + '"]');
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

  // Tamanhos são relativos ao tamanho normal da tela (PC ou celular): refaz ao girar ou redimensionar.
  var espera;
  window.addEventListener("resize", function () {
    clearTimeout(espera);
    espera = setTimeout(function () { aplicar(window.DTSite.atual); }, 200);
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
      .catch(function () { /* sem conexão: fica o conteúdo do HTML */ })
      .then(function () { clearTimeout(limite); });
  }

  function carregarEditor() {
    var sc = document.createElement("script");
    sc.src = "js/editor.js?v=" + (window.DTSite.versao || "1");
    document.body.appendChild(sc);
  }

  window.DTSite = { CFG: CFG, TAM: TAM, aplicar: aplicar, linkOk: linkOk, imgOk: imgOk, atual: {}, versao: "1" };

  var q = new URLSearchParams(location.search);
  var editar = q.has("editar") || q.has("previa");
  if (editar) carregarEditor();
  else carregarPublicado();
})();
