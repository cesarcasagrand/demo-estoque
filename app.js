// Front da demo: lê os três CSVs, chama compararEstoques() e mostra o resultado.
// JavaScript puro, sem framework.

// ---------------------------------------------------------------------------
// 1. Ler CSV
// Transforma o texto do CSV em uma lista de objetos.
// Ex.: "sku,produto,quantidade\nMRC-001,Arroz,40"
//   -> [{ sku: "MRC-001", produto: "Arroz", quantidade: "40" }]
// Atenção: todos os valores saem como TEXTO. Use Number() para fazer conta.
// Limitação: não trata vírgula dentro do nome do produto (os exemplos não têm).
// ---------------------------------------------------------------------------
function lerCSV(texto) {
  const linhas = texto.trim().split(/\r?\n/);
  const colunas = linhas[0].split(',').map((c) => c.trim());

  return linhas.slice(1).filter((l) => l.trim() !== '').map((linha) => {
    const valores = linha.split(',');
    const objeto = {};
    colunas.forEach((coluna, i) => {
      objeto[coluna] = (valores[i] || '').trim();
    });
    return objeto;
  });
}

// ---------------------------------------------------------------------------
// 2. Comparar estoques
// ---------------------------------------------------------------------------
// Cruza o estoque do sistema com a contagem do armazém e devolve:
//   divergencias: SKUs com quantidade diferente ou que só existem em um lado.
//                 diferenca = sistema - armazem (positivo: o sistema promete
//                 mais do que existe na prateleira).
//   vaiAcabar:    SKUs que acabam em menos de 7 dias pelo ritmo dos últimos 30.
//
// Decisões:
// - Os dias restantes usam a quantidade do ARMAZÉM, não a do sistema: o que
//   vende é o que está fisicamente lá. Pelo sistema, uma falta pode ficar
//   escondida (nos exemplos, o café duraria 9 dias pelo sistema e 3,6 pelo armazém).
// - SKU vendido que não aparece na contagem do armazém conta como 0 em estoque:
//   se ninguém achou o produto, não dá para vender.
// - SKU sem venda nos 30 dias fica fora de vaiAcabar (não há ritmo para projetar).
// - O corte de 7 dias usa o valor sem arredondar; o arredondamento é só para exibir.
// - Lookup por SKU em objeto ({ "MRC-001": 40 }) em vez de procurar na lista
//   a cada produto: cada busca é direta, não percorre tudo de novo.
function compararEstoques(sistema, armazem, vendas) {
  const LIMITE_DIAS = 7;
  const DIAS_DE_VENDA = 30;

  const qtdSistema = {};
  const qtdArmazem = {};
  const nomeProduto = {};
  const todosSkus = []; // ordem: primeiro os do sistema, depois os que só o armazém tem

  for (let i = 0; i < sistema.length; i++) {
    const item = sistema[i];
    qtdSistema[item.sku] = Number(item.quantidade);
    nomeProduto[item.sku] = item.produto;
    todosSkus.push(item.sku);
  }

  for (let i = 0; i < armazem.length; i++) {
    const item = armazem[i];
    qtdArmazem[item.sku] = Number(item.quantidade);
    if (nomeProduto[item.sku] === undefined) {
      nomeProduto[item.sku] = item.produto;
      todosSkus.push(item.sku);
    }
  }

  const divergencias = [];
  for (let i = 0; i < todosSkus.length; i++) {
    const sku = todosSkus[i];
    const noSistema = qtdSistema[sku];
    const noArmazem = qtdArmazem[sku];

    let tipo = null;
    if (noSistema === undefined) {
      tipo = 'so_no_armazem';
    } else if (noArmazem === undefined) {
      tipo = 'so_no_sistema';
    } else if (noSistema > noArmazem) {
      tipo = 'sistema_maior';
    } else if (noArmazem > noSistema) {
      tipo = 'armazem_maior';
    }

    if (tipo !== null) {
      const temOsDois = noSistema !== undefined && noArmazem !== undefined;
      divergencias.push({
        sku: sku,
        produto: nomeProduto[sku],
        sistema: noSistema === undefined ? null : noSistema,
        armazem: noArmazem === undefined ? null : noArmazem,
        diferenca: temOsDois ? noSistema - noArmazem : null,
        tipo: tipo,
      });
    }
  }

  const vaiAcabar = [];
  for (let i = 0; i < vendas.length; i++) {
    const item = vendas[i];
    const mediaDiaria = Number(item.vendidos_30d) / DIAS_DE_VENDA;
    if (mediaDiaria > 0) {
      const estoque = qtdArmazem[item.sku] === undefined ? 0 : qtdArmazem[item.sku];
      const dias = estoque / mediaDiaria;
      if (dias < LIMITE_DIAS) {
        vaiAcabar.push({
          sku: item.sku,
          produto: item.produto,
          estoqueArmazem: estoque,
          mediaDiaria: Math.round(mediaDiaria * 10) / 10,
          diasRestantes: Math.round(dias * 10) / 10,
        });
      }
    }
  }

  return { divergencias: divergencias, vaiAcabar: vaiAcabar };
}

// ---------------------------------------------------------------------------
// 3. Tela (DOM e eventos)
// ---------------------------------------------------------------------------
const campoSistema = document.getElementById('csv-sistema');
const campoArmazem = document.getElementById('csv-armazem');
const campoVendas = document.getElementById('csv-vendas');
const botaoComparar = document.getElementById('btn-comparar');
const botaoExemplos = document.getElementById('btn-exemplos');
const botaoApi = document.getElementById('btn-api');
const areaResultado = document.getElementById('resultado');
const areaStatus = document.getElementById('status');

let ultimoResultado = null;

function mostrarStatus(texto, erro = false) {
  areaStatus.textContent = texto;
  areaStatus.className = erro ? 'status erro' : 'status';
}

function criarTabela(titulo, linhas, colunas) {
  const secao = document.createElement('section');
  const h2 = document.createElement('h2');
  h2.textContent = `${titulo} (${linhas.length})`;
  secao.appendChild(h2);

  const tabela = document.createElement('table');
  const cabecalho = document.createElement('tr');
  colunas.forEach((c) => {
    const th = document.createElement('th');
    th.textContent = c;
    cabecalho.appendChild(th);
  });
  tabela.appendChild(cabecalho);

  linhas.forEach((linha) => {
    const tr = document.createElement('tr');
    colunas.forEach((c) => {
      const td = document.createElement('td');
      td.textContent = linha[c] ?? '—';
      tr.appendChild(td);
    });
    tabela.appendChild(tr);
  });

  secao.appendChild(tabela);
  return secao;
}

function mostrarResultado(resultado) {
  areaResultado.innerHTML = '';
  areaResultado.appendChild(
    criarTabela('Divergências', resultado.divergencias || [],
      ['sku', 'produto', 'sistema', 'armazem', 'diferenca', 'tipo'])
  );
  areaResultado.appendChild(
    criarTabela('Vai acabar em menos de 7 dias', resultado.vaiAcabar || [],
      ['sku', 'produto', 'estoqueArmazem', 'mediaDiaria', 'diasRestantes'])
  );
}

function comparar(textoSistema, textoArmazem, textoVendas) {
  const resultado = compararEstoques(
    lerCSV(textoSistema), lerCSV(textoArmazem), lerCSV(textoVendas)
  );

  ultimoResultado = resultado;
  mostrarResultado(resultado);
  mostrarStatus('Comparação feita.');
}

botaoComparar.addEventListener('click', async () => {
  const arquivos = [campoSistema.files[0], campoArmazem.files[0], campoVendas.files[0]];
  if (arquivos.some((a) => !a)) {
    mostrarStatus('Escolha os três arquivos CSV.', true);
    return;
  }
  const [s, a, v] = await Promise.all(arquivos.map((f) => f.text()));
  comparar(s, a, v);
});

botaoExemplos.addEventListener('click', async () => {
  try {
    const nomes = ['estoque-sistema.csv', 'estoque-armazem.csv', 'vendas-30dias.csv'];
    const textos = await Promise.all(
      nomes.map(async (n) => {
        const r = await fetch(`exemplos/${n}`);
        if (!r.ok) throw new Error(`não achei exemplos/${n}`);
        return r.text();
      })
    );
    comparar(...textos);
  } catch (e) {
    mostrarStatus(`Erro ao carregar exemplos: ${e.message}`, true);
  }
});

botaoApi.addEventListener('click', async () => {
  try {
    const r = await fetch('/api/analisar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ultimoResultado || {}),
    });
    const dados = await r.json();
    mostrarStatus(`Resposta da API: ${JSON.stringify(dados)}`, !r.ok);
  } catch (e) {
    mostrarStatus(`Não consegui falar com a API: ${e.message}`, true);
  }
});
