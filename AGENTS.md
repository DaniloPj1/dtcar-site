# Regras para agentes de código (Claude, GPT/Codex e outros)

Site institucional da DTCar Centro Automotivo, separado do sistema DTCar Gestão (repositório `dtcar-gestao`).
Tudo na tela e nos comentários em **português do Brasil**, linguagem simples.

## O que é
- Página única estática (`index.html`), sem etapa de build. GitHub Pages a partir da `main`: **o que entra na `main` vai para o ar.**
- Cores da DTCar: preto #16191d, azul #174f94, cinzas, fundo #eceef0; fontes Barlow e Barlow Condensed. Nada de visual genérico de IA.
- `js/site.js` (todo visitante): pede a versão publicada (`site_conteudo_publicado()`, supabase/v47.sql do DTCar Gestão) e aplica por cima
  do conteúdo do HTML. Sem resposta em 6 s, fica o conteúdo do HTML (o site nunca depende do Supabase para abrir).
- `js/editor.js` + `css/editor.css` (só com `?editar`): login do DTCar Gestão (Supabase Auth, só administrador: `rpc('e_admin')`),
  rascunho em `site_rascunho`, publicação em `site_publicacoes` (histórico, nada se apaga), fotos na pasta pública `site`.
  `?previa` mostra o rascunho sem o editor (tela "Ver no celular").

## Conteúdo editável (atributos no index.html)
- `data-c="chave"`: texto (sempre texto puro, nunca HTML). Mesma chave em dois lugares = mudam juntos.
- `data-img="chave"`: foto. Só aceita a pasta `site` do Supabase ou `media/` do próprio site (`imgOk`). Enquadrar (`enq`): `object-position` x/y de 0 a 100 e "foto inteira" (tira o `max-height`).
- `data-href="chave"`: link. Só `https://`, `mailto:`, `tel:` ou `#` (`linkOk`). `zap` = todos os botões de WhatsApp.
- `data-secao="id"` (filhos de `<main id="secoes">`): sobe, desce, esconde. `data-bloco="id"`: item que pode ser escondido.
- Tamanho do texto: P/M/G/GG relativo ao tamanho normal da tela (PC ou celular). Não pôr `!important` em `font-size` de texto editável.
- Chave nova: só acrescentar. **Não renomear nem apagar chave existente** (o conteúdo publicado deixa de achar o lugar).

## Como trabalhar
1. Branch (`claude/assunto` ou `codex/assunto`) e Pull Request para a `main`. O Danilo aprova e faz o merge.
2. Teste: `python3 teste/teste_editor.py` (Playwright com Supabase falso; não toca no banco real).
3. Mudou `js/` ou `css/`? Suba o `versao` em `js/site.js` e o `?v=` do `index.html` (evita arquivo velho no navegador).
4. Celular (até 640px) e PC: conferir os dois.
5. Não mexer em `CNAME` nem nas configurações do Pages sem o Danilo pedir (domínio só depois de o DNS responder).
