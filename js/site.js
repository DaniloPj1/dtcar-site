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
    montarInstagram();
    montarPontos();
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

  // Celular: pontinhos embaixo de cada carrossel (mostram onde está e levam ao cartão). Itens escondidos não contam.
  function montarPontos() {
    document.querySelectorAll(".carrossel").forEach(function (car) {
      var pts = car.nextElementSibling && car.nextElementSibling.classList.contains("pontos") ? car.nextElementSibling : null;
      if (!pts) {
        pts = document.createElement("div"); pts.className = "pontos"; pts.setAttribute("aria-label", "Posição no carrossel");
        car.parentNode.insertBefore(pts, car.nextSibling);
        car.addEventListener("scroll", function () { marcarPonto(car, pts); }, { passive: true });
      }
      var editando = document.body.classList.contains("editando");
      var itens = Array.prototype.filter.call(car.children, function (c) { return editando || !c.hasAttribute("data-oculto"); });
      pts.textContent = "";
      itens.forEach(function (item, i) {
        var b = document.createElement("button");
        b.type = "button"; b.setAttribute("aria-label", "Ir para o cartão " + (i + 1) + " de " + itens.length);
        b.addEventListener("click", function () { car.scrollTo({ left: item.offsetLeft - car.offsetLeft - parseFloat(getComputedStyle(car).paddingLeft || 0), behavior: "smooth" }); });
        pts.appendChild(b);
      });
      marcarPonto(car, pts);
    });
  }
  function marcarPonto(car, pts) {
    var bs = pts.children; if (!bs.length) return;
    var max = car.scrollWidth - car.clientWidth;
    var i = max <= 4 ? 0 : (car.scrollLeft >= max - 4 ? bs.length - 1 : Math.round(car.scrollLeft / max * (bs.length - 1)));
    Array.prototype.forEach.call(bs, function (b, j) { b.setAttribute("aria-current", j === i ? "true" : "false"); });
  }

  // Posts do Instagram (seção "instagram"): o endereço vem do link "Ver no Instagram" de cada item (editável no editor).
  // O script oficial do Instagram só é carregado quando a seção chega perto da tela.
  var POST_INSTA = /^https:\/\/www\.instagram\.com\/(?:[\w.]+\/)?(?:p|reel)\/[\w-]+\/?$/;
  var instaPronto = false, instaVisto = false;
  function montarInstagram() {
    var itens = document.querySelectorAll(".insta-item");
    if (!itens.length) return;
    itens.forEach(function (item) {
      var a = item.querySelector("a[data-href]"), caixa = item.querySelector(".insta-embed");
      var url = a ? a.getAttribute("href") : "";
      if (!caixa || caixa.getAttribute("data-url") === url) return;
      caixa.setAttribute("data-url", url);
      caixa.textContent = "";
      if (!POST_INSTA.test(url)) { caixa.textContent = "Post indisponível."; return; }
      var bq = document.createElement("blockquote");
      bq.className = "instagram-media";
      bq.setAttribute("data-instgrm-permalink", url.replace(/\/?$/, "/") + "?utm_source=ig_embed");
      bq.setAttribute("data-instgrm-version", "14");
      bq.style.cssText = "margin:0;width:100%;min-width:0;max-width:540px;border:0";
      var l = document.createElement("a"); l.href = url; l.textContent = "Ver este post no Instagram"; bq.appendChild(l);
      caixa.style.display = "block"; caixa.style.minHeight = "0"; caixa.style.padding = "0"; caixa.style.border = "0";
      caixa.appendChild(bq);
    });
    if (instaPronto && window.instgrm) window.instgrm.Embeds.process();
    else if (!instaVisto) {
      instaVisto = true;
      var sec = document.getElementById("instagram");
      var carregar = function () {
        if (instaPronto) return; instaPronto = true;
        var sc = document.createElement("script"); sc.async = true; sc.src = "https://www.instagram.com/embed.js";
        sc.onload = function () { if (window.instgrm) window.instgrm.Embeds.process(); };
        document.body.appendChild(sc);
      };
      if (sec && "IntersectionObserver" in window) {
        var ob = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { ob.disconnect(); carregar(); } }, { rootMargin: "600px" });
        ob.observe(sec);
      } else carregar();
    }
  }

  window.DTSite = { CFG: CFG, TAM: TAM, aplicar: aplicar, aplicarTamanhos: aplicarTamanhos, linkOk: linkOk, imgOk: imgOk, atual: {}, versao: "5" };
  guardarOriginais();
  montarInstagram();
  montarPontos();

  var q = new URLSearchParams(location.search);
  if (q.has("editar") || q.has("previa")) carregarEditor();
  else carregarPublicado();
})();
