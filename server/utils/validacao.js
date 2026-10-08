// Validações de dados pessoais compartilhadas (colaboradores, candidatos e inscrição pública).

const soDigitos = (v) => String(v == null ? "" : v).replace(/\D/g, "");

/** Confere os dígitos verificadores do CPF. */
function cpfValido(cpf) {
  const n = soDigitos(cpf);
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  for (const tam of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tam; i++) soma += Number(n[i]) * (tam + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(n[tam])) return false;
  }
  return true;
}

const formatarCpf = (cpf) => soDigitos(cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

/** Aceita "dd/mm/aaaa" ou "aaaa-mm-dd"; devolve "aaaa-mm-dd" ou null se a data não existe. */
function dataIso(valor) {
  const t = String(valor || "").trim();
  let a, m, d;
  let r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (r) [, a, m, d] = r;
  else if ((r = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t))) [, d, m, a] = r;
  else return null;
  const dt = new Date(Date.UTC(Number(a), Number(m) - 1, Number(d)));
  if (dt.getUTCFullYear() !== Number(a) || dt.getUTCMonth() !== Number(m) - 1 || dt.getUTCDate() !== Number(d)) return null;
  return `${a}-${m}-${d}`;
}

/** Idade completa em anos numa data AAAA-MM-DD. */
function idade(iso, hoje = new Date()) {
  const [a, m, d] = iso.split("-").map(Number);
  let anos = hoje.getFullYear() - a;
  if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d)) anos--;
  return anos;
}

/** Data de nascimento válida, não futura e depois de 1900. */
function dataNascimentoValida(iso) {
  const ok = dataIso(iso);
  return !!ok && ok >= "1900-01-01" && new Date(`${ok}T00:00:00`) <= new Date();
}

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

/**
 * Dados pessoais obrigatórios da inscrição pública (vaga ou banco de talentos):
 * CPF, data de nascimento e endereço completo com CEP. Retorna { dados } ou { erro }.
 */
function lerDadosPessoaisObrigatorios(b = {}) {
  const t = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
  if (!cpfValido(b.cpf)) return { erro: "Informe um CPF válido." };
  const nasc = dataIso(b.dataNascimento);
  if (!nasc || !dataNascimentoValida(nasc)) return { erro: "Informe sua data de nascimento (dd/mm/aaaa)." };
  const anos = idade(nasc);
  if (anos < 14 || anos > 100) return { erro: "Confira sua data de nascimento." };
  const cep = soDigitos(b.cep);
  if (cep.length !== 8) return { erro: "Informe o CEP com 8 dígitos." };
  const endereco = t(b.endereco, 160);
  const numero = t(b.numero, 20);
  const bairro = t(b.bairro, 100);
  const cidade = t(b.cidade, 80);
  const uf = t(b.uf, 2).toUpperCase();
  if (!endereco) return { erro: "Informe a rua / avenida do seu endereço." };
  if (!numero) return { erro: 'Informe o número do endereço (ou "S/N").' };
  if (!bairro) return { erro: "Informe o bairro." };
  if (!cidade) return { erro: "Informe a cidade." };
  if (!UFS.includes(uf)) return { erro: "Informe a UF (ex.: CE)." };
  return {
    dados: {
      cpf: formatarCpf(b.cpf),
      dataNascimento: nasc,
      cep: cep.replace(/(\d{5})(\d{3})/, "$1-$2"),
      endereco,
      numero,
      complemento: t(b.complemento, 80),
      bairro,
      cidade,
      uf,
    },
  };
}

module.exports = { soDigitos, cpfValido, formatarCpf, dataIso, idade, dataNascimentoValida, lerDadosPessoaisObrigatorios, UFS };
