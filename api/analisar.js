// Função serverless da Vercel: responde em POST /api/analisar.
//
// Recebe o RESULTADO de compararEstoques() (não os CSVs) e pede ao Gemini uma
// explicação em português simples para o dono do mercadinho.
//
// Decisões:
// - A chave vem de process.env.GEMINI_API_KEY e só existe no servidor.
// - Todas as contas já vêm feitas do front; a IA só explica. O prompt proíbe
//   números que não estejam nos dados.
// - Só os campos esperados são repassados para a IA, e o tamanho das listas tem
//   limite: o endpoint é público e cada chamada gasta a cota da chave.
// - Modelo: gemini-3.1-flash-lite (estável, com nível gratuito e o Flash mais
//   barato confirmado na página de preços em 10/11/2026). Rever a página de
//   modelos se a API começar a responder 404.
// - 503 ("alta demanda") é sobrecarga passageira do Google: tenta o mesmo modelo
//   de novo após 2 s e, se falhar, uma vez o modelo reserva (também estável e
//   gratuito). No máximo 3 chamadas por clique, para não gastar a cota.
//   Outros erros (chave, limite, rede) não são repetidos: repetir não resolve.

const MODELO = 'gemini-3.1-flash-lite';
const MODELO_RESERVA = 'gemini-3.5-flash-lite';
const ESPERA_503_MS = 2000;
const MAX_ITENS = 200;

// Tempo: o plano gratuito da Vercel permite até 300 s com Fluid compute (padrão
// em projetos novos, docs conferidas em 10/11/2026). O pior caso aqui é
// 3 chamadas x 18 s + 2 s de espera = 56 s, dentro do maxDuration de 60 s
// declarado abaixo; isso cabe mesmo se o projeto ficar sem Fluid compute.
// Se a função passar do limite, a Vercel a encerra com 504.
const TEMPO_LIMITE_MS = 18000;
export const config = { maxDuration: 60 };

const INSTRUCOES = `Você explica relatórios de estoque para o dono de um mercadinho, em português simples, sem termos técnicos.

Os dados vêm de um programa que já fez todas as contas:
- divergencias: produtos em que o estoque do sistema de vendas e a contagem do armazém não batem.
  diferenca = sistema - armazem. Positivo: o sistema mostra mais do que existe na prateleira. Negativo: tem mais na prateleira do que no sistema.
  tipo "so_no_sistema" ou "so_no_armazem": o produto só aparece em um dos lados.
- vaiAcabar: produtos que acabam em menos de 7 dias no ritmo de venda dos últimos 30 dias, contando o estoque do armazém.
  pedirPara14Dias: quantas unidades pedir para o armazém cobrir 14 dias de venda.

Regras obrigatórias:
1. Use somente os números que estão nos dados. Não calcule, não estime e não invente nenhum número novo.
2. A causa de cada divergência você não sabe. Para cada produto, escolha só as 1 ou 2 causas mais prováveis para aquele caso, da lista da direção certa abaixo; não repita a lista inteira e não use causa de outra direção. Fale sempre como possibilidade ("pode ser", "pode ter acontecido"), inclusive nos produtos que só aparecem em um lado. Nunca afirme a causa e nunca use "provavelmente", "certamente" ou "com certeza".
   - diferenca positiva (sistema mostra MAIS que o armazém): venda feita sem registro no sistema, perda ou quebra, furto, entrada lançada no sistema sem a mercadoria ter chegado, ou erro na contagem do armazém.
   - diferenca negativa (armazém tem MAIS que o sistema): mercadoria que chegou sem a entrada ser lançada no sistema, venda lançada em dobro ou cancelada sem estorno, devolução de cliente não registrada, ou erro na contagem do armazém.
   - so_no_armazem: produto que chegou mas nunca foi cadastrado no sistema.
   - so_no_sistema: produto cadastrado que não foi encontrado na contagem (esgotado, guardado em outro lugar ou não contado).
3. Se uma lista estiver vazia, diga isso em uma frase.
4. Escreva texto corrido simples, sem markdown (sem asteriscos, sem #), em três partes com estes títulos:
   Divergências
   O que vai acabar
   Quanto pedir
5. Seja breve: no máximo duas frases por produto.`;

// Copia só os campos esperados, para não repassar à IA nada além dos dados da comparação.
function limparDados(corpo) {
  const divergencias = [];
  const vaiAcabar = [];

  for (let i = 0; i < corpo.divergencias.length; i++) {
    const d = corpo.divergencias[i];
    divergencias.push({
      sku: d.sku, produto: d.produto, sistema: d.sistema,
      armazem: d.armazem, diferenca: d.diferenca, tipo: d.tipo,
    });
  }
  for (let i = 0; i < corpo.vaiAcabar.length; i++) {
    const v = corpo.vaiAcabar[i];
    vaiAcabar.push({
      sku: v.sku, produto: v.produto, estoqueArmazem: v.estoqueArmazem,
      mediaDiaria: v.mediaDiaria, diasRestantes: v.diasRestantes,
      pedirPara14Dias: v.pedirPara14Dias,
    });
  }
  return { divergencias, vaiAcabar };
}

// Traduz a falha da API para uma frase que faça sentido na tela.
// Um 400 pode ser chave inválida ou pedido mal formado; o corpo do erro diz qual.
function mensagemDeErro(status, corpoErro, modelo) {
  if (status === 401 || status === 403 || corpoErro.includes('API_KEY_INVALID')) {
    return 'a chave da IA foi recusada. Confira o GEMINI_API_KEY.';
  }
  if (status === 400) {
    return 'a IA recusou o pedido (formato inválido).';
  }
  if (status === 404) {
    return `o modelo ${modelo} não foi encontrado na API.`;
  }
  if (status === 429) {
    return 'o limite de uso gratuito da IA foi atingido. Tente de novo mais tarde.';
  }
  if (status === 503) {
    return 'os servidores da IA estão sobrecarregados agora (3 tentativas). Tente de novo em alguns minutos.';
  }
  return `a IA respondeu com erro ${status}. Tente de novo em instantes.`;
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Uma chamada ao Gemini. Devolve a resposta HTTP, ou null se a rede falhar.
async function chamarGemini(modelo, chave, dados) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
  try {
    return await fetch(`${url}?key=${encodeURIComponent(chave)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCOES }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(dados) }] }],
        generationConfig: { maxOutputTokens: 1500 },
      }),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
  } catch (e) {
    // Falha de rede ou tempo esgotado. O log não inclui a URL, que contém a chave.
    console.error(`Falha ao chamar ${modelo}:`, e.name);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ erro: 'use POST.' });
  }

  const chave = process.env.GEMINI_API_KEY;
  if (!chave) {
    return res.status(500).json({ erro: 'a chave da IA não está configurada no servidor (GEMINI_API_KEY).' });
  }

  const corpo = req.body;
  if (!corpo || !Array.isArray(corpo.divergencias) || !Array.isArray(corpo.vaiAcabar)) {
    return res.status(400).json({ erro: 'envie o resultado da comparação (divergencias e vaiAcabar).' });
  }
  if (corpo.divergencias.length > MAX_ITENS || corpo.vaiAcabar.length > MAX_ITENS) {
    return res.status(400).json({ erro: `limite de ${MAX_ITENS} produtos por lista.` });
  }

  const dados = limparDados(corpo);

  // Ordem das tentativas: só passa para a próxima se a anterior der 503.
  const tentativas = [MODELO, MODELO, MODELO_RESERVA];
  let resposta = null;
  let modeloUsado = MODELO;

  for (let i = 0; i < tentativas.length; i++) {
    modeloUsado = tentativas[i];
    if (i === 1) {
      await esperar(ESPERA_503_MS);
    }
    resposta = await chamarGemini(modeloUsado, chave, dados);
    console.log(`Tentativa ${i + 1}: ${modeloUsado} -> ${resposta ? resposta.status : 'falha de rede'}`);
    if (!resposta || resposta.status !== 503) {
      break;
    }
  }

  if (!resposta) {
    return res.status(502).json({ erro: 'não consegui falar com a IA (rede ou tempo esgotado).' });
  }

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => '');
    console.error('Gemini respondeu', resposta.status, corpoErro.slice(0, 500));
    return res.status(502).json({ erro: mensagemDeErro(resposta.status, corpoErro, modeloUsado) });
  }

  let json;
  try {
    json = await resposta.json();
  } catch {
    return res.status(502).json({ erro: 'a IA devolveu uma resposta ilegível.' });
  }

  // Caminho do texto na resposta do generateContent: candidates[0].content.parts[].text
  const partes = json?.candidates?.[0]?.content?.parts;
  let texto = '';
  if (Array.isArray(partes)) {
    for (let i = 0; i < partes.length; i++) {
      if (typeof partes[i].text === 'string') {
        texto += partes[i].text;
      }
    }
  }

  if (!texto.trim()) {
    return res.status(502).json({ erro: 'a IA não devolveu texto (resposta vazia ou bloqueada).' });
  }

  return res.status(200).json({ texto: texto.trim(), modelo: modeloUsado });
}
