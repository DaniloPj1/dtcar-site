"""Teste do site e do editor com um Supabase falso (não toca no banco real).
Uso: python3 teste/teste_editor.py   (precisa de playwright e chromium)"""
import json, threading, http.server, functools, os, re, sys, time
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SB = "https://vbbklawlbxznsemkgtvg.supabase.co"
estado = {"rascunho": None, "publicacoes": [], "fotos": [], "admin": True}
falhas = []
def ok(cond, nome):
    print(("OK  " if cond else "FALHOU ") + nome)
    if not cond: falhas.append(nome)

def servidor():
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    h = functools.partial(H, directory=RAIZ)
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s

def falso(route):
    req = route.request; url = req.url; m = req.method
    j = lambda corpo, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(corpo),
                                            headers={"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"})
    if m == "OPTIONS": return j({})
    if "/auth/v1/token" in url:
        corpo = json.loads(req.post_data or "{}")
        if corpo.get("password") != "certa": return j({"error": "invalid_grant", "error_description": "Invalid login credentials", "msg": "Invalid login credentials"}, 400)
        return j({"access_token": "tok", "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "refresh_token": "r",
                  "user": {"id": "u1", "aud": "authenticated", "role": "authenticated", "email": corpo.get("email"), "app_metadata": {}, "user_metadata": {}, "created_at": "2026-01-01T00:00:00Z"}})
    if "/auth/v1/logout" in url: return route.fulfill(status=204, headers={"access-control-allow-origin": "*"})
    if "/rpc/e_admin" in url: return j(estado["admin"])
    if "/rpc/site_conteudo_publicado" in url:
        p = estado["publicacoes"]
        return j({"dados": p[-1]["dados"], "versao": len(p)} if p else {})
    if "/rest/v1/site_rascunho" in url:
        if m == "GET":
            if estado.get("erro_rascunho"): return j({"message": "JWT expired", "code": "PGRST301"}, 401)
            linha = {"dados": estado["rascunho"], "atualizado_em": estado.get("rascunho_versao")} if estado["rascunho"] is not None else None
            return j(linha) if "vnd.pgrst.object" in (req.headers.get("accept") or "") else j([linha] if linha else [])
        c = json.loads(req.post_data)
        if m == "POST":
            if estado["rascunho"] is not None: return j({"code": "23505", "message": "duplicate key"}, 409)
        elif "atualizado_em=eq." + (estado.get("rascunho_versao") or "").replace("+", "%2B").replace(":", "%3A") not in url and "atualizado_em=eq." + (estado.get("rascunho_versao") or "") not in url:
            return j([])
        estado["rascunho"] = c["dados"]; estado["rascunho_versao"] = c["atualizado_em"]; return j([{"atualizado_em": c["atualizado_em"]}])
    if "/rest/v1/site_publicacoes" in url:
        if m == "POST":
            c = json.loads(req.post_data); estado["publicacoes"].append({"id": len(estado["publicacoes"]) + 1, "publicado_em": "2026-11-08T13:00:00Z", **c}); return j([])
        return j(list(reversed(estado["publicacoes"])))
    if "/storage/v1/object/site/" in url:
        estado["fotos"].append(url); return j({"Key": url.split("/object/")[1]})
    if url.startswith(SB): return j({"msg": "não previsto: " + url}, 404)
    return route.abort()

srv = servidor(); base = f"http://127.0.0.1:{srv.server_address[1]}/"
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    ctx.route(re.compile(r"^https://"), falso)
    erros = []
    pg = ctx.new_page(); pg.on("pageerror", lambda e: erros.append(str(e)))

    # visitante sem nada publicado: conteúdo do HTML
    pg.goto(base); pg.wait_for_timeout(600)
    ok("Cuidado completo" in pg.text_content("h1"), "visitante vê o título padrão")
    ok(pg.evaluate("[...document.querySelectorAll('.carrossel')].every(c => getComputedStyle(c).display === 'grid')") and not pg.is_visible(".zap-flutuante"), "PC: sem carrossel e sem botão flutuante")
    medir = "({h3: getComputedStyle(document.querySelector('[data-c=servico_01_titulo]')).fontSize, num: getComputedStyle(document.querySelector('[data-c=numero_1]')).fontSize, txt: getComputedStyle(document.querySelector('[data-c=abertura_texto]')).fontSize})"
    tam0 = pg.evaluate(medir)
    pg.set_viewport_size({"width": 1200, "height": 900}); pg.wait_for_timeout(400); pg.set_viewport_size({"width": 1280, "height": 900}); pg.wait_for_timeout(400)
    ok(pg.evaluate(medir) == tam0, f"redimensionar não muda os tamanhos {tam0}")

    # login errado e certo
    pg.goto(base + "?editar"); pg.wait_for_selector(".ed-caixa")
    pg.fill("input[type=email]", "danilo@x.com"); pg.fill("input[type=password]", "errada"); pg.click("text=Entrar")
    pg.wait_for_timeout(500); ok("errados" in pg.inner_text(".ed-msg"), "senha errada avisa")
    pg.fill("input[type=password]", "certa"); pg.click("text=Entrar")
    pg.wait_for_selector(".ed-barra"); ok(pg.evaluate("document.body.classList.contains('editando')"), "editor abre para administrador")

    # editar título
    h1 = pg.locator("h1"); h1.click(); pg.keyboard.press("Control+A"); pg.keyboard.type("Oficina de confiança")
    pg.wait_for_timeout(2000); ok(estado["rascunho"] and estado["rascunho"]["t"].get("abertura_titulo") == "Oficina de confiança", "texto vai para o rascunho")
    h1.click(); pg.keyboard.press("End"); pg.keyboard.type(" fim ")
    pg.set_viewport_size({"width": 1240, "height": 900}); pg.wait_for_timeout(400); pg.keyboard.type("X"); pg.wait_for_timeout(1800)
    ok(estado["rascunho"]["t"]["abertura_titulo"] == "Oficina de confiança fim X", "redimensionar não atrapalha a digitação: " + estado["rascunho"]["t"]["abertura_titulo"])
    pg.set_viewport_size({"width": 1280, "height": 900})
    h1.click(); pg.keyboard.press("Control+A"); pg.keyboard.type("Oficina de confiança"); pg.wait_for_timeout(1800)
    # tamanho
    h1.click(); pg.click(".ed-painel >> text=GG"); pg.wait_for_timeout(1800)
    ok(estado["rascunho"]["s"].get("abertura_titulo") == "gg", "tamanho GG gravado")
    fs = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('h1')).fontSize)"); ok(fs > 75, f"título maior ({fs}px)")
    # seção: descer serviços e esconder números
    pg.click('[data-secao="servicos"] .ed-secao-barra >> text=Descer'); pg.wait_for_timeout(300)
    ordem = pg.evaluate("[...document.querySelectorAll('#secoes > [data-secao]')].map(s=>s.dataset.secao)")
    ok(ordem.index("destaques") < ordem.index("servicos"), "seção desceu")
    pg.click('[data-secao="numeros"] .ed-secao-barra >> text=Esconder'); pg.wait_for_timeout(1800)
    ok("numeros" in estado["rascunho"]["ocultas"], "seção escondida no rascunho")
    # link do WhatsApp
    pg.locator('[data-c="btn_topo"]').click(); pg.click(".ed-painel >> text=WhatsApp do botão")
    pg.fill(".ed-caixa input[type=tel]", "27999998888"); pg.click(".ed-caixa >> text=Aplicar"); pg.wait_for_timeout(1800)
    zap = estado["rascunho"]["a"].get("zap", ""); ok(zap.startswith("https://wa.me/5527999998888?text="), "WhatsApp trocado em todos os botões")
    ok(all(h.startswith("https://wa.me/5527999998888") for h in pg.eval_on_selector_all('[data-href="zap"]', "a=>a.map(x=>x.href)")), "todos os botões com o número novo")
    # link perigoso recusado
    pg.locator('[data-c="contato_instagram"]').click(); pg.click(".ed-painel >> text=Link")
    pg.fill(".ed-caixa input[type=url]", "javascript:alert(1)"); pg.click(".ed-caixa >> text=Aplicar"); pg.wait_for_timeout(300)
    ok(pg.locator(".ed-aviso.ed-erro").count() > 0 and "instagram" not in estado["rascunho"]["a"], "link javascript: recusado")
    pg.click(".ed-caixa >> text=Cancelar")
    # enquadrar a foto da abertura
    pg.locator('[data-img="abertura"]').click(); pg.click(".ed-painel >> text=Enquadrar")
    pg.evaluate("""() => { const r = document.querySelectorAll('.ed-caixa input[type=range]'); r[0].value = 30; r[0].dispatchEvent(new Event('input')); r[1].value = 80; r[1].dispatchEvent(new Event('input')); }""")
    if os.environ.get("FOTOS"): pg.screenshot(path="/tmp/enq.png")
    ok(pg.evaluate("document.querySelector('[data-img=abertura]').style.objectPosition") == "30% 80%", "enquadrar muda a foto na hora")
    pg.click(".ed-caixa button.ed-azul"); pg.wait_for_timeout(1800)
    ok(estado["rascunho"]["enq"].get("abertura") == {"x": 30, "y": 80, "inteira": False}, "enquadramento no rascunho")
    pg.locator('[data-img="abertura"]').click(); pg.click(".ed-painel >> text=Enquadrar")
    pg.check(".ed-caixa input[type=checkbox]"); pg.click(".ed-caixa >> text=Cancelar"); pg.wait_for_timeout(300)
    ok(pg.evaluate("document.querySelector('[data-img=abertura]').style.maxHeight") == "640px", "cancelar volta como estava")
    pg.locator('[data-img="abertura"]').click(); pg.click(".ed-painel >> text=Enquadrar")
    pg.check(".ed-caixa input[type=checkbox]"); pg.click(".ed-caixa button.ed-azul"); pg.wait_for_timeout(1800)
    ok(estado["rascunho"]["enq"]["abertura"]["inteira"] is True, "foto inteira no rascunho")
    # foto
    pg.locator('[data-img="fachada"]').click()
    with pg.expect_file_chooser() as fc: pg.click(".ed-painel >> text=Trocar foto")
    fc.value.set_files(os.path.join(RAIZ, "media", "oleo.jpg"))
    for _ in range(40):
        if estado["rascunho"]["img"].get("fachada"): break
        pg.wait_for_timeout(250)
    ok(len(estado["fotos"]) == 1 and estado["rascunho"]["img"].get("fachada", "").startswith(SB + "/storage/v1/object/public/site/fotos/"), "foto enviada e trocada")
    # desfazer
    pg.click(".ed-barra >> text=Desfazer"); pg.wait_for_timeout(1500)
    ok("fachada" not in estado["rascunho"]["img"], "desfazer volta a foto")
    ok(pg.get_attribute('[data-img="fachada"]', "src") == "media/fachada.jpg", "desfazer volta a foto também na tela")
    if os.environ.get("FOTOS"): pg.locator('[data-c="servico_03_titulo"]').click(); pg.wait_for_timeout(200); pg.screenshot(path="/tmp/ed1.png")
    # publicar
    pg.click(".ed-barra button.ed-azul"); pg.fill(".ed-caixa input", "teste"); pg.click(".ed-caixa button.ed-azul"); pg.wait_for_timeout(800)
    ok(len(estado["publicacoes"]) == 1 and estado["publicacoes"][0]["observacao"] == "teste", "publicado com descrição")

    # visitante vê o publicado
    v = b.new_context(viewport={"width": 390, "height": 800}); v.route(re.compile(r"^https://"), falso)
    vp = v.new_page(); vp.goto(base); vp.wait_for_timeout(800)
    ok(vp.text_content("h1").strip() == "Oficina de confiança", "visitante vê o título publicado")
    ok(vp.evaluate("getComputedStyle(document.querySelector('[data-c=numero_1]')).fontSize") == "40px" and vp.evaluate("getComputedStyle(document.querySelector('[data-c=servico_01_titulo]')).fontSize") == "26px", "publicar não encolhe os outros textos")
    ok(not vp.is_visible('[data-secao="numeros"]'), "seção escondida some para o visitante")
    ok(vp.evaluate("[...document.querySelectorAll('.carrossel')].every(c => getComputedStyle(c).display === 'flex' && getComputedStyle(c).overflowX === 'auto')"), "celular: grupos em carrossel")
    ok(vp.evaluate("document.documentElement.scrollWidth") <= 390, "celular: página não rola para o lado")
    ok(vp.is_visible(".zap-flutuante"), "celular: botão do WhatsApp flutuante")
    ok(vp.evaluate("[document.querySelector('[data-img=abertura]').style.objectPosition, document.querySelector('[data-img=abertura]').style.maxHeight]") == ["30% 80%", "none"], "visitante vê o enquadramento")
    ok(vp.evaluate("parseFloat(getComputedStyle(document.querySelector('h1')).fontSize)") > 50, "GG vale no celular (relativo ao tamanho do celular)")
    ok(vp.evaluate("document.querySelector('[contenteditable]')") is None and vp.locator(".ed-barra").count() == 0, "visitante não vê o editor")
    # conteúdo malicioso publicado por engano não vira HTML nem link perigoso
    estado["publicacoes"].append({"dados": {"t": {"abertura_titulo": "<img src=x onerror=alert(1)>"}, "a": {"zap": "javascript:alert(1)"}, "img": {"logo": "https://mal.com/x.png"}, "enq": {"abertura": {"x": "1px;background:red", "y": 500}}}})
    vp.goto(base); vp.wait_for_timeout(800)
    ok(vp.locator("h1 img").count() == 0 and "<img" in vp.text_content("h1"), "texto entra como texto puro")
    ok(vp.get_attribute('[data-c="btn_topo"]', "href").startswith("https://wa.me/"), "link javascript: ignorado")
    ok("mal.com" not in (vp.get_attribute('[data-img="logo"]', "src") or ""), "foto de fora ignorada")
    ok(vp.evaluate("document.querySelector('[data-img=abertura]').style.objectPosition") in ("", "50% 45%", "center 45%"), "enquadramento inválido ignorado")
    # erro ao ler o rascunho: editor não abre e não apaga
    estado["rascunho"] = {"t": {"abertura_titulo": "RASCUNHO IMPORTANTE"}}; estado["erro_rascunho"] = True
    e2 = b.new_context(); e2.route(re.compile(r"^https://"), falso); ep = e2.new_page(); ep.goto(base + "?editar"); ep.wait_for_selector(".ed-caixa")
    ep.fill("input[type=email]", "danilo@x.com"); ep.fill("input[type=password]", "certa"); ep.click("text=Entrar"); ep.wait_for_timeout(1000)
    ok(ep.locator(".ed-barra").count() == 0 and estado["rascunho"]["t"]["abertura_titulo"] == "RASCUNHO IMPORTANTE", "erro na leitura não apaga o rascunho")
    estado["erro_rascunho"] = False
    # outro aparelho mudou o rascunho: este para de salvar
    ep.goto(base + "?editar"); ep.wait_for_selector(".ed-barra")
    estado["rascunho_versao"] = "2099-01-01T00:00:00+00:00"
    ep.locator("h1").click(); ep.keyboard.type("!"); ep.wait_for_timeout(2000)
    ok(estado["rascunho"]["t"]["abertura_titulo"] == "RASCUNHO IMPORTANTE" and "outro aparelho" in ep.inner_text("body"), "não grava por cima de outro aparelho")
    # não administrador
    estado["admin"] = False
    n = b.new_context(); n.route(re.compile(r"^https://"), falso); npg = n.new_page(); npg.goto(base + "?editar"); npg.wait_for_selector(".ed-caixa")
    npg.fill("input[type=email]", "mecanico@x.com"); npg.fill("input[type=password]", "certa"); npg.click("text=Entrar"); npg.wait_for_timeout(800)
    ok(npg.locator(".ed-barra").count() == 0 and "administrador" in npg.inner_text("body"), "não administrador não edita")
    # servidor fora do ar: site abre com o conteúdo padrão
    f = b.new_context(); f.route(re.compile(r"^https://"), lambda r: r.abort()); fp = f.new_page(); fp.goto(base); fp.wait_for_timeout(800)
    ok("Cuidado completo" in fp.text_content("h1"), "sem servidor fica o conteúdo padrão")
    ok(not erros, "sem erros de JavaScript " + str(erros[:3]))
    b.close()
srv.shutdown()
print("FALHAS:", len(falhas)); sys.exit(1 if falhas else 0)
