// Função serverless da Vercel: responde em /api/analisar.
// Etapa 1: ainda NÃO chama o Gemini. Só devolve um JSON de teste para
// confirmar que o front consegue falar com o back.
// Etapa 2 (depois): ler process.env.GEMINI_API_KEY e mandar o resultado
// da comparação para a IA explicar em português simples.

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ erro: 'Use POST.' });
  }

  const corpo = req.body || {};

  return res.status(200).json({
    teste: true,
    mensagem: 'API respondendo. A análise com IA ainda não foi ligada.',
    recebido: {
      divergencias: Array.isArray(corpo.divergencias) ? corpo.divergencias.length : 0,
      vaiAcabar: Array.isArray(corpo.vaiAcabar) ? corpo.vaiAcabar.length : 0,
    },
  });
}
