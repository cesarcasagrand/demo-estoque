# Conferência de Estoque (demo)

Compara o estoque do sistema de vendas com a contagem do armazém e aponta o que vai acabar pelo ritmo de vendas. Depois, a IA (Gemini) vai explicar cada divergência em português simples.

**Todos os dados são inventados** (mercadinho fictício, pasta `exemplos/`).

## Estado
- Etapa 1 (atual): front, leitura dos CSVs e API de teste. A IA ainda não é chamada.
- `compararEstoques()` em `app.js` está vazia (TODO com a saída esperada).

## Como rodar
Precisa de Node.js 18+ e da CLI da Vercel (pede login na primeira vez).

```bash
npm i -g vercel        # uma vez
vercel dev             # abre em http://localhost:3000
```

Na página, clique em **Usar arquivos de exemplo** ou escolha os três CSVs e clique em **Comparar**. **Testar API** chama `/api/analisar`.

Abrir o `index.html` direto (duplo clique) não serve: o navegador bloqueia a leitura de `exemplos/` e não existe `/api` sem servidor.

## Chave da IA (etapa 2)
Copie `.env.example` para `.env` e preencha `GEMINI_API_KEY`. O `.env` está no `.gitignore` e nunca vai para o Git. Na Vercel, a chave entra em *Settings → Environment Variables*.
