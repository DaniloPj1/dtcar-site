// Editor do site da DTCar — só para administrador do DTCar Gestão (mesmo login).
// Abre com "?editar" no endereço (link "Editar site" no rodapé). "?previa" mostra o rascunho sem o editor (tela "Ver no celular").
// Grava o rascunho em site_rascunho e publica em site_publicacoes (supabase/v47.sql do DTCar Gestão).
(function () {
  "use strict";
  var S = window.DTSite, CFG = S.CFG;
  var q = new URLSearchParams(location.search);
  var MODO_PREVIA = q.has("previa") && !q.has("editar");
  var sb, dados = {}, desfazer = [], salvarEspera, painel, alvo, barra, situacao, base = null, ultimoPasso = 0;
  var versaoRascunho = null;   // atualizado_em lido do banco: grava só se ninguém mudou no meio (outro aparelho)
  var travado = false;          // rascunho mudado em outro aparelho: para de salvar até recarregar

  function el(tag, attrs, filhos) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "texto") e.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (filhos || []).forEach(function (f) { if (f) e.appendChild(f); });
    return e;
  }
  function copia(o) { return JSON.parse(JSON.stringify(o || {})); }
  function hora() { return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  function carregarScript(src) {
    return new Promise(function (ok, erro) {
      var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = function () { erro(new Error("Não carregou " + src)); };
      document.head.appendChild(s);
    });
  }
  function carregarCss(href) { document.head.appendChild(el("link", { rel: "stylesheet", href: href })); }

  // ---------- caixas (login, confirmação, histórico, celular) ----------
  function caixa(titulo, conteudo, botoes) {
    var fundo = el("div", { class: "ed-fundo", role: "dialog", "aria-modal": "true", "aria-label": titulo });
    var box = el("div", { class: "ed-caixa" }, [el("h2", { texto: titulo }), conteudo]);
    var rodape = el("div", { class: "ed-botoes" });
    (botoes || []).forEach(function (b) { rodape.appendChild(b); });
    box.appendChild(rodape); fundo.appendChild(box); document.body.appendChild(fundo);
    var foco = box.querySelector("input,textarea,button"); if (foco) foco.focus();
    return { fechar: function () { fundo.remove(); }, box: box };
  }
  function botao(texto, fn, classe) { return el("button", { type: "button", class: "ed-btn " + (classe || ""), texto: texto, onclick: fn }); }
  function campo(rotulo, attrs) {
    var id = "ed-" + Math.random().toString(36).slice(2);
    var inp = el(attrs.tag || "input", Object.assign({ id: id }, attrs)); inp.removeAttribute("tag");
    return { wrap: el("div", { class: "ed-campo" }, [el("label", { for: id, texto: rotulo }), inp]), input: inp };
  }
  function aviso(texto, erro) {
    var a = el("div", { class: "ed-aviso" + (erro ? " ed-erro" : ""), role: "status", texto: texto });
    document.body.appendChild(a); setTimeout(function () { a.remove(); }, erro ? 7000 : 3500);
  }

  function telaLogin() {
    return new Promise(function (resolve) {
      var email = campo("E-mail", { type: "email", autocomplete: "username" });
      var senha = campo("Senha", { type: "password", autocomplete: "current-password" });
      var msg = el("p", { class: "ed-msg", role: "alert" });
      var form = el("form", { class: "ed-form" }, [el("p", { texto: "Entre com o mesmo login do DTCar Gestão. Só administrador edita o site." }), email.wrap, senha.wrap, msg]);
      var c;
      function entrar(ev) {
        if (ev) ev.preventDefault();
        msg.textContent = "Entrando…";
        sb.auth.signInWithPassword({ email: email.input.value.trim(), password: senha.input.value }).then(function (r) {
          if (r.error) { msg.textContent = /invalid/i.test(r.error.message) ? "E-mail ou senha errados." : "Não deu para entrar: " + r.error.message; return; }
          c.fechar(); resolve(r.data.session);
        });
      }
      form.addEventListener("submit", entrar);
      c = caixa("Editar o site", form, [botao("Cancelar", function () { c.fechar(); sair(false); }), botao("Entrar", entrar, "ed-azul")]);
    });
  }

  // ---------- conteúdo ----------
  function registrarMudanca() {
    // "base" é como estava antes desta mudança; digitação seguida (menos de 1 s) vira um passo só no Desfazer.
    var agora = Date.now();
    if (base && agora - ultimoPasso > 1000) { desfazer.push(base); if (desfazer.length > 60) desfazer.shift(); }
    ultimoPasso = agora; base = copia(dados);
    marcar("Alterações não salvas…");
    clearTimeout(salvarEspera);
    salvarEspera = setTimeout(salvarRascunho, 1500);
  }
  function salvarRascunho() {
    clearTimeout(salvarEspera);
    if (travado) { avisoOutroAparelho(); return Promise.resolve(false); }
    var agora = new Date().toISOString();
    var pedido = versaoRascunho
      ? sb.from("site_rascunho").update({ dados: dados, atualizado_em: agora }).eq("id", 1).eq("atualizado_em", versaoRascunho).select("atualizado_em")
      : sb.from("site_rascunho").insert({ id: 1, dados: dados, atualizado_em: agora }).select("atualizado_em");
    return pedido.then(function (r) {
      if (r.error && r.error.code !== "23505") { marcar("Rascunho NÃO salvo"); aviso("Não salvou o rascunho: " + r.error.message, true); return false; }
      if (r.error || !r.data || !r.data.length) { travado = true; avisoOutroAparelho(); return false; }
      versaoRascunho = r.data[0].atualizado_em;
      marcar("Rascunho salvo às " + hora()); return true;
    });
  }
  function avisoOutroAparelho() {
    marcar("Rascunho NÃO salvo");
    aviso("O rascunho foi mudado em outro aparelho. Recarregue a página para pegar a versão nova (o que foi feito aqui depois disso não foi salvo).", true);
  }
  function marcar(t) { if (situacao) situacao.textContent = t; }

  function lerDaPagina() {
    // Ordem atual das seções (para o "subir/descer" funcionar mesmo sem nada salvo).
    // Ordem das seções sempre completa: tira o que não existe mais e põe no fim seção nova do HTML.
    var main = document.getElementById("secoes");
    var existentes = main ? Array.prototype.map.call(main.querySelectorAll(":scope > [data-secao]"), function (s) { return s.getAttribute("data-secao"); }) : [];
    var ordem = (Array.isArray(dados.ordem) ? dados.ordem : existentes).filter(function (id, i, l) { return existentes.indexOf(id) >= 0 && l.indexOf(id) === i; });
    existentes.forEach(function (id) { if (ordem.indexOf(id) < 0) ordem.push(id); });
    dados.ordem = ordem;
    ["t", "s", "img", "enq", "a"].forEach(function (k) { if (!dados[k] || typeof dados[k] !== "object") dados[k] = {}; });
    if (!Array.isArray(dados.ocultas)) dados.ocultas = [];
  }
  function reaplicar() { S.aplicar(dados); prepararSecoes(); }

  // ---------- edição dos textos ----------
  // Texto como foi digitado (innerText devolveria em MAIÚSCULAS os títulos com text-transform).
  function textoDe(e) {
    var out = "";
    (function andar(n) {
      n.childNodes.forEach(function (c) {
        if (c.nodeType === 3) out += c.data;
        else if (c.nodeName === "BR") out += "\n";
        else { if (/^(DIV|P)$/.test(c.nodeName) && out && out.slice(-1) !== "\n") out += "\n"; andar(c); }
      });
    })(e);
    return out;
  }
  function prepararTextos() {
    document.querySelectorAll("[data-c]").forEach(function (e) {
      try { e.contentEditable = "plaintext-only"; } catch (x) { e.contentEditable = "true"; }
      if (e.contentEditable !== "plaintext-only") e.contentEditable = "true";
      e.spellcheck = true;
      e.addEventListener("input", function () {
        var k = e.getAttribute("data-c");
        dados.t[k] = textoDe(e).replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim();
        document.querySelectorAll('[data-c="' + k + '"]').forEach(function (o) { if (o !== e) o.textContent = dados.t[k]; });
        registrarMudanca();
      });
      e.addEventListener("paste", function (ev) {
        ev.preventDefault();
        var txt = (ev.clipboardData || window.clipboardData).getData("text/plain");
        document.execCommand("insertText", false, txt);
      });
      e.addEventListener("keydown", function (ev) {
        // Enter em botão ou título quebraria o visual: só textos longos aceitam linha nova.
        if (ev.key === "Enter" && !/^(P|DD|SPAN|FIGCAPTION)$/.test(e.tagName)) ev.preventDefault();
      });
    });
  }

  // ---------- painel do item clicado ----------
  function fecharPainel() { if (painel) painel.remove(); painel = null; if (alvo) alvo.classList.remove("ed-alvo"); alvo = null; }
  function abrirPainel(e) {
    fecharPainel();
    alvo = e; e.classList.add("ed-alvo");
    var kc = e.getAttribute("data-c");
    var img = e.matches("[data-img]") ? e : null;
    var link = e.closest("[data-href]");
    var bloco = e.closest("[data-bloco]");
    painel = el("div", { class: "ed-painel", role: "toolbar", "aria-label": "Ajustes do item" });
    if (kc) {
      painel.appendChild(el("span", { class: "ed-rot", texto: "Tamanho" }));
      ["p", "m", "g", "gg"].forEach(function (n) {
        var atual = dados.s[kc] || "m";
        painel.appendChild(botao(n.toUpperCase(), function () {
          if (n === "m") delete dados.s[kc]; else dados.s[kc] = n;
          registrarMudanca(); S.aplicar(dados); abrirPainel(e);
        }, atual === n ? "ed-on" : ""));
      });
    }
    if (img) {
      painel.appendChild(botao("Trocar foto", function () { trocarFoto(img); }, "ed-azul"));
      painel.appendChild(botao("Enquadrar", function () { enquadrar(img); }));
    }
    if (link) painel.appendChild(botao(link.getAttribute("data-href") === "zap" ? "WhatsApp do botão" : "Link", function () { editarLink(link); }));
    if (bloco) {
      var id = bloco.getAttribute("data-bloco"), oculto = dados.ocultas.indexOf(id) >= 0;
      painel.appendChild(botao(oculto ? "Mostrar este item" : "Esconder este item", function () { alternarOculto(id); abrirPainel(e); }));
    }
    if (!painel.childNodes.length) { fecharPainel(); return; }
    document.body.appendChild(painel);
    var r = e.getBoundingClientRect();
    var topo = window.scrollY + r.top - painel.offsetHeight - 8;
    if (r.top - painel.offsetHeight - 8 < 60) topo = window.scrollY + r.bottom + 8;
    painel.style.top = topo + "px";
    painel.style.left = Math.max(8, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - painel.offsetWidth - 8)) + "px";
  }
  function alternarOculto(id) {
    var i = dados.ocultas.indexOf(id);
    if (i >= 0) dados.ocultas.splice(i, 1); else dados.ocultas.push(id);
    registrarMudanca(); reaplicar();
  }

  function editarLink(a) {
    var k = a.getAttribute("data-href");
    var atual = dados.a[k] || a.getAttribute("href") || "";
    if (k === "zap") {
      var u; try { u = new URL(atual); } catch (x) { u = new URL("https://wa.me/"); }
      var num = campo("Número do WhatsApp (com DDD)", { type: "tel", value: u.pathname.replace(/\D/g, "").replace(/^55/, "") });
      var txt = campo("Mensagem que já vem escrita", { tag: "textarea", rows: "6" }); txt.input.value = u.searchParams.get("text") || "";
      var c = caixa("WhatsApp dos botões", el("div", {}, [el("p", { texto: "Vale para todos os botões de WhatsApp do site." }), num.wrap, txt.wrap]), [
        botao("Cancelar", function () { c.fechar(); }),
        botao("Aplicar", function () {
          var n = num.input.value.replace(/\D/g, "");
          if (n.length < 10 || n.length > 11) { aviso("Número com DDD: 10 ou 11 dígitos.", true); return; }
          dados.a.zap = "https://wa.me/55" + n + (txt.input.value.trim() ? "?text=" + encodeURIComponent(txt.input.value.trim()) : "");
          c.fechar(); registrarMudanca(); reaplicar();
        }, "ed-azul")]);
      return;
    }
    var f = campo("Endereço do link (https://, mailto: ou tel:)", { type: "url", value: atual });
    var c2 = caixa("Link", el("div", {}, [el("p", { texto: "Vale para todos os lugares do site com este mesmo link." }), f.wrap]), [
      botao("Cancelar", function () { c2.fechar(); }),
      botao("Aplicar", function () {
        var v = f.input.value.trim();
        if (!S.linkOk(v)) { aviso("O link precisa começar com https://, mailto: ou tel:", true); return; }
        dados.a[k] = v; c2.fechar(); registrarMudanca(); reaplicar();
      }, "ed-azul")]);
  }

  // Enquadrar: escolhe a parte da foto que aparece quando ela é cortada, ou mostra a foto inteira. A tela muda na hora.
  function enquadrar(img) {
    var k = img.getAttribute("data-img");
    var antes = dados.enq[k] ? copia(dados.enq[k]) : null;
    var pos = (getComputedStyle(img).objectPosition || "50% 50%").split(" ");
    var atual = antes || { x: Math.round(parseFloat(pos[0])) || 50, y: Math.round(parseFloat(pos[1])) || 50, inteira: false };
    function deslizar(rotulo, valor) {
      return campo(rotulo, { type: "range", min: "0", max: "100", step: "1", value: String(valor) });
    }
    var hx = deslizar("Horizontal (esquerda ← → direita)", atual.x);
    var vy = deslizar("Vertical (em cima ↑ ↓ embaixo)", atual.y);
    var inteiraId = "ed-int-" + Math.random().toString(36).slice(2);
    var inteira = el("input", { type: "checkbox", id: inteiraId });
    inteira.checked = atual.inteira === true;
    var linhaInteira = el("div", { class: "ed-check" }, [inteira, el("label", { for: inteiraId, texto: "Mostrar a foto inteira, sem cortar" })]);
    function ver() {
      dados.enq[k] = { x: Number(hx.input.value), y: Number(vy.input.value), inteira: inteira.checked };
      S.aplicar(dados);
    }
    [hx.input, vy.input].forEach(function (i) { i.addEventListener("input", ver); });
    inteira.addEventListener("change", ver);
    var c = caixa("Enquadrar a foto", el("div", {}, [
      el("p", { texto: "Arraste para escolher a parte da foto que aparece. A foto atrás muda na hora. No celular a foto pode cortar diferente: confira em \"Ver no celular\"." }),
      hx.wrap, vy.wrap, linhaInteira]), [
      botao("Voltar ao original", function () { delete dados.enq[k]; c.fechar(); registrarMudanca(); reaplicar(); }),
      botao("Cancelar", function () { if (antes) dados.enq[k] = antes; else delete dados.enq[k]; c.fechar(); S.aplicar(dados); }),
      botao("Aplicar", function () { ver(); c.fechar(); registrarMudanca(); }, "ed-azul")]);
    c.box.parentNode.classList.add("ed-fundo-claro");
    img.scrollIntoView({ block: "center" });
  }

  function reduzir(arquivo) {
    return new Promise(function (ok, erro) {
      var i = new Image(), url = URL.createObjectURL(arquivo);
      i.onload = function () {
        var max = 1800, k = Math.min(1, max / Math.max(i.naturalWidth, i.naturalHeight));
        var cv = document.createElement("canvas"); cv.width = Math.round(i.naturalWidth * k); cv.height = Math.round(i.naturalHeight * k);
        var png = arquivo.type === "image/png" && arquivo.size < 1500000;
        var cx = cv.getContext("2d"); if (!png) { cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); }
        cx.drawImage(i, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
        cv.toBlob(function (b) { b ? ok({ blob: b, ext: png ? "png" : "jpg", tipo: png ? "image/png" : "image/jpeg" }) : erro(new Error("Não deu para preparar a foto.")); }, png ? "image/png" : "image/jpeg", 0.85);
      };
      i.onerror = function () { erro(new Error("Arquivo não é uma foto que o navegador abra.")); };
      i.src = url;
    });
  }
  function trocarFoto(img) {
    var inp = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp" });
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      marcar("Enviando foto…");
      reduzir(f).then(function (r) {
        var caminho = "fotos/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + r.ext;
        return sb.storage.from("site").upload(caminho, r.blob, { contentType: r.tipo, upsert: false }).then(function (up) {
          if (up.error) throw new Error(up.error.message);
          var url = sb.storage.from("site").getPublicUrl(caminho).data.publicUrl;
          dados.img[img.getAttribute("data-img")] = url; registrarMudanca(); reaplicar(); aviso("Foto trocada.");
        });
      }).catch(function (x) { marcar("Foto não enviada"); aviso("Foto não enviada: " + x.message, true); });
    });
    inp.click();
  }

  // ---------- seções: subir, descer, esconder ----------
  function prepararSecoes() {
    document.querySelectorAll(".ed-secao-barra").forEach(function (b) { b.remove(); });
    var main = document.getElementById("secoes"); if (!main) return;
    var lista = Array.prototype.slice.call(main.querySelectorAll(":scope > [data-secao]"));
    lista.forEach(function (sec, i) {
      var id = sec.getAttribute("data-secao"), oculta = dados.ocultas.indexOf(id) >= 0;
      var b = el("div", { class: "ed-secao-barra", role: "toolbar", "aria-label": "Seção " + id }, [
        el("span", { class: "ed-rot", texto: "Seção" + (oculta ? " (escondida)" : "") }),
        i > 0 ? botao("↑ Subir", function () { mover(id, -1); }) : null,
        i < lista.length - 1 ? botao("↓ Descer", function () { mover(id, 1); }) : null,
        botao(oculta ? "Mostrar" : "Esconder", function () { alternarOculto(id); })
      ]);
      sec.style.position = sec.style.position || "relative";
      sec.insertBefore(b, sec.firstChild);
    });
  }
  function mover(id, dir) {
    var i = dados.ordem.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= dados.ordem.length) return;
    dados.ordem.splice(j, 0, dados.ordem.splice(i, 1)[0]);
    registrarMudanca(); reaplicar();
    var sec = document.querySelector('[data-secao="' + id + '"]'); if (sec) sec.scrollIntoView({ block: "start" });
  }

  // ---------- barra de baixo ----------
  function publicar() {
    var obs = campo("O que mudou (opcional)", { type: "text", maxlength: "200" });
    var c = caixa("Publicar o site", el("div", {}, [el("p", { texto: "O que está na tela vai para o ar para todos os visitantes. A versão anterior fica guardada no histórico." }), obs.wrap]), [
      botao("Cancelar", function () { c.fechar(); }),
      botao("Publicar", function (ev) {
        var b = ev.currentTarget; if (b.disabled) return; b.disabled = true;
        salvarRascunho().then(function (ok) {
          if (!ok) { b.disabled = false; return; }
          return sb.from("site_publicacoes").insert({ dados: dados, observacao: obs.input.value.trim().slice(0, 200) }).then(function (r) {
            if (r.error) { b.disabled = false; aviso("Não publicou: " + r.error.message, true); return; }
            c.fechar(); marcar("Publicado às " + hora()); aviso("Site publicado.");
          });
        });
      }, "ed-azul")]);
  }
  function historico() {
    var lista = el("div", { class: "ed-lista", texto: "Carregando…" });
    var c = caixa("Versões publicadas", lista, [botao("Fechar", function () { c.fechar(); })]);
    sb.from("site_publicacoes").select("id,publicado_em,observacao,dados").order("publicado_em", { ascending: false }).limit(30).then(function (r) {
      lista.textContent = "";
      if (r.error) { lista.textContent = "Não carregou: " + r.error.message; return; }
      if (!r.data.length) { lista.textContent = "Nada publicado ainda."; return; }
      r.data.forEach(function (v, i) {
        var quando = new Date(v.publicado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
        lista.appendChild(el("div", { class: "ed-item" }, [
          el("div", {}, [el("b", { texto: quando + (i === 0 ? " · no ar" : "") }), el("span", { texto: v.observacao || "Sem descrição" })]),
          botao("Trazer para o editor", function () {
            desfazer.push(copia(dados)); dados = copia(v.dados); lerDaPagina(); base = copia(dados); reaplicar(); salvarRascunho(); c.fechar();
            aviso("Versão carregada no editor. Confira e clique em Publicar para colocar no ar.");
          })
        ]));
      });
    });
  }
  function verCelular() {
    salvarRascunho().then(function () {
      var fr = el("iframe", { src: location.pathname + "?previa=1", title: "Site no celular", class: "ed-celular" });
      var c = caixa("Como fica no celular (rascunho)", fr, [botao("Fechar", function () { c.fechar(); })]);
      c.box.classList.add("ed-caixa-larga");
    });
  }
  function voltar() {
    var d = desfazer.pop(); if (!d) { aviso("Nada para desfazer."); return; }
    dados = d; lerDaPagina(); base = copia(dados); ultimoPasso = 0; fecharPainel(); reaplicar();
    clearTimeout(salvarEspera); salvarEspera = setTimeout(salvarRascunho, 800); marcar("Desfeito");
  }
  function descartar() {
    var c = caixa("Descartar o rascunho", el("p", { texto: "Volta tudo para a versão que está no ar. As mudanças não publicadas serão perdidas." }), [
      botao("Cancelar", function () { c.fechar(); }),
      botao("Descartar", function () {
        sb.rpc("site_conteudo_publicado").then(function (r) {
          dados = copia((r.data && r.data.dados) || {});
          return salvarRascunho().then(function () { location.reload(); });
        });
      }, "ed-vermelho")]);
  }
  function sair(recarregar) {
    var fim = function () { location.href = location.pathname; };
    if (!sb) { fim(); return; }
    Promise.resolve(recarregar === false ? null : salvarRascunho()).then(function () { return sb.auth.signOut({ scope: "local" }); }).then(fim, fim);
  }
  function montarBarra() {
    situacao = el("span", { class: "ed-situacao", role: "status", texto: "Editando" });
    barra = el("div", { class: "ed-barra", role: "toolbar", "aria-label": "Editor do site" }, [
      el("b", { texto: "Editando o site" }), situacao,
      botao("Desfazer", voltar), botao("Ver no celular", verCelular), botao("Histórico", historico),
      botao("Descartar rascunho", descartar), botao("Publicar", publicar, "ed-azul"), botao("Sair", function () { sair(true); })
    ]);
    document.body.appendChild(barra);
  }

  // ---------- início ----------
  function iniciar() {
    return carregarScript("vendor/supabase.js").then(function () {
      // Login guardado só nesta aba (sessionStorage): fechou a aba, saiu. O login de administrador vale para o DTCar Gestão inteiro.
      sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "dtcar-site-login", storage: window.sessionStorage } });
      return sb.auth.getSession();
    }).then(function (r) {
      var sessao = r.data && r.data.session;
      if (MODO_PREVIA) {
        if (!sessao) return carregarPublicadoSemEditor();
        return sb.from("site_rascunho").select("dados").maybeSingle().then(function (x) {
          if (x.data && x.data.dados) S.aplicar(x.data.dados); else return carregarPublicadoSemEditor();
        });
      }
      carregarCss("css/editor.css?v=" + S.versao);
      return (sessao ? Promise.resolve(sessao) : telaLogin()).then(function () { return sb.rpc("e_admin"); }).then(function (adm) {
        if (adm.error || adm.data !== true) { aviso("Este login não é de administrador do DTCar Gestão.", true); return sb.auth.signOut({ scope: "local" }).then(function () { setTimeout(function () { location.href = location.pathname; }, 2500); }); }
        return sb.from("site_rascunho").select("dados,atualizado_em").maybeSingle().then(function (x) {
          // Erro na leitura NUNCA cai para a versão publicada: o salvamento automático apagaria o rascunho de verdade.
          if (x.error) throw new Error("não deu para ler o rascunho (" + x.error.message + "). Recarregue a página.");
          if (x.data) versaoRascunho = x.data.atualizado_em;
          if (x.data && x.data.dados && Object.keys(x.data.dados).length) return x.data.dados;
          return sb.rpc("site_conteudo_publicado").then(function (p) {
            if (p.error) throw new Error("não deu para ler a versão publicada (" + p.error.message + "). Recarregue a página.");
            return (p.data && p.data.dados) || {};
          });
        }).then(function (d) {
          dados = copia(d); lerDaPagina(); base = copia(dados);
          document.body.classList.add("editando");
          reaplicar(); prepararTextos(); montarBarra();
          marcar("Rascunho carregado");
          document.addEventListener("click", function (ev) {
            if (ev.target.closest(".ed-painel,.ed-barra,.ed-fundo,.ed-secao-barra")) return;
            var a = ev.target.closest("a"); if (a) ev.preventDefault();
            var e = ev.target.closest("[data-c],[data-img]") || (a && a.closest("[data-href]"));
            if (e) abrirPainel(e); else fecharPainel();
          }, true);
          window.addEventListener("beforeunload", function (ev) { if (/não salv/i.test(situacao.textContent)) { ev.preventDefault(); ev.returnValue = ""; } });
        });
      });
    }).catch(function (x) { aviso("O editor não abriu: " + (x && x.message ? x.message : x), true); });
  }
  function carregarPublicadoSemEditor() {
    return sb.rpc("site_conteudo_publicado").then(function (p) { if (p.data && p.data.dados) S.aplicar(p.data.dados); });
  }
  // Editor nunca abre dentro de página de outro site; a prévia do celular (mesmo site) pode.
  if (!MODO_PREVIA && window.top !== window.self) return;
  if (MODO_PREVIA && window.top !== window.self) { try { if (window.top.location.origin !== location.origin) return; } catch (x) { return; } }
  iniciar();
})();
