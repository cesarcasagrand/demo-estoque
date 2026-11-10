# Conferência de Estoque (demo)

Compara o estoque do sistema de vendas com a contagem do armazém, aponta o que vai acabar pelo ritmo de vendas e calcula quanto pedir para cobrir 14 dias. Depois, a IA (Gemini) explica o resultado em português simples para o dono do mercadinho.

**Todos os dados são inventados** (mercadinho fictício, pasta `exemplos/`).

## Como funciona
1. O navegador lê os três CSVs e faz **todas as contas** (`compararEstoques()` em `app.js`).
2. Só o resultado da comparação vai para o servidor (`api/analisar.js`), não os CSVs.
3. O servidor chama o Gemini (`gemini-3.1-flash-lite`) com a chave que fica só nele. A IA explica; não calcula.

## Como rodar no computador
Testado com Node.js 24 (o `npm run local` usa a opção `--env-file-if-exists`, que não existe em versões antigas do Node).

1. Copie `.env.example` para `.env` e cole a chave do Google AI Studio depois de `GEMINI_API_KEY=`.
2. Rode:
   ```bash
   npm run local
   ```
3. Abra http://localhost:3000, clique em **Usar arquivos de exemplo** e depois em **Explicar com IA**.

O `servidor-local.js` imita a Vercel e serve só a página, o `app.js` e os CSVs de exemplo (nunca o `.env`).

Abrir o `index.html` com duplo clique não funciona: o navegador bloqueia a leitura de `exemplos/` e não existe `/api` sem servidor.

## Na Vercel
A chave entra em *Settings → Environment Variables* com o nome `GEMINI_API_KEY`. O `.env` está no `.gitignore` e nunca vai para o Git.

## Limitações
- No nível gratuito do Gemini, o Google pode usar os dados enviados para melhorar os produtos dele. Por isso a demo usa só dados inventados.
- O endpoint `/api/analisar` é público: qualquer pessoa com o link consome a cota da chave.
- O leitor de CSV não trata vírgula dentro do nome do produto.
