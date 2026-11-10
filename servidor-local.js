// Servidor só para testar no computador, sem a Vercel.
// Rode: npm run local   ->   http://localhost:3000
//
// Imita o que a Vercel faz: serve a página e encaminha POST /api/analisar para
// api/analisar.js. Serve APENAS os arquivos da lista abaixo: um servidor que
// entrega qualquer arquivo da pasta entregaria também o .env com a chave.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import handler from './api/analisar.js';

const PORTA = 3000;

const ARQUIVOS_PUBLICOS = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/exemplos/estoque-sistema.csv': ['exemplos/estoque-sistema.csv', 'text/csv; charset=utf-8'],
  '/exemplos/estoque-armazem.csv': ['exemplos/estoque-armazem.csv', 'text/csv; charset=utf-8'],
  '/exemplos/vendas-30dias.csv': ['exemplos/vendas-30dias.csv', 'text/csv; charset=utf-8'],
};

// A Vercel entrega req.body já convertido de JSON e res.status()/res.json() prontos.
// Aqui eles são montados à mão para o api/analisar.js funcionar igual.
function adaptarResposta(res) {
  res.status = (codigo) => {
    res.statusCode = codigo;
    return res;
  };
  res.json = (objeto) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(objeto));
    return res;
  };
  return res;
}

async function lerCorpo(req) {
  let texto = '';
  for await (const pedaco of req) {
    texto += pedaco;
  }
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

const servidor = http.createServer(async (req, res) => {
  const caminho = new URL(req.url, `http://localhost:${PORTA}`).pathname;

  if (caminho === '/api/analisar') {
    req.body = await lerCorpo(req);
    try {
      await handler(req, adaptarResposta(res));
    } catch (e) {
      console.error(e);
      adaptarResposta(res).status(500).json({ erro: 'erro inesperado no servidor local.' });
    }
    return;
  }

  const arquivo = ARQUIVOS_PUBLICOS[caminho];
  if (!arquivo) {
    res.statusCode = 404;
    res.end('Não encontrado');
    return;
  }
  res.setHeader('Content-Type', arquivo[1]);
  res.end(await readFile(new URL(arquivo[0], import.meta.url)));
});

servidor.listen(PORTA, () => {
  console.log(`Demo rodando em http://localhost:${PORTA}`);
  if (!process.env.GEMINI_API_KEY) {
    console.log('Aviso: GEMINI_API_KEY vazia. A página abre, mas "Explicar com IA" vai mostrar erro.');
  }
});
