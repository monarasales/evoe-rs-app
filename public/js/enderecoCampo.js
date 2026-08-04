// Componente de endereço reutilizável (Configurações > Funcionários e Meu Cadastro):
// a pessoa digita só o CEP e o sistema preenche rua/bairro/cidade automaticamente
// (via ViaCEP), com número e complemento em campos separados (porque às vezes é
// apartamento). Não muda o formato salvo no banco — continua sendo uma única string
// em "endereco"/"enderecoTrabalho" (ver server/routes/consultores.js); só a forma de
// preencher no formulário que fica mais fácil e precisa.
import { buscarCep } from "./cep.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

export function campoEnderecoHtml(prefixo, rotulo, enderecoAtual) {
  return `
    <div class="form-row"><label>${rotulo}</label></div>
    ${
      enderecoAtual
        ? `<div class="sub" style="margin:-4px 0 8px;">Endereço atual: ${escapeHtml(enderecoAtual)}. Deixe os campos abaixo em branco para manter como está, ou preencha para atualizar.</div>`
        : ""
    }
    <div class="form-cols">
      <div class="form-row" style="max-width:150px;">
        <label>CEP</label>
        <input type="text" id="${prefixo}-cep" placeholder="00000-000" maxlength="9" inputmode="numeric" />
      </div>
      <div class="form-row" style="flex:2;">
        <label>Rua / Logradouro</label>
        <input type="text" id="${prefixo}-logradouro" />
      </div>
    </div>
    <div class="form-cols">
      <div class="form-row" style="max-width:110px;">
        <label>Número</label>
        <input type="text" id="${prefixo}-numero" />
      </div>
      <div class="form-row">
        <label>Complemento</label>
        <input type="text" id="${prefixo}-complemento" placeholder="apto, bloco... (opcional)" />
      </div>
    </div>
    <div class="form-cols">
      <div class="form-row">
        <label>Bairro</label>
        <input type="text" id="${prefixo}-bairro" />
      </div>
      <div class="form-row">
        <label>Cidade/UF</label>
        <input type="text" id="${prefixo}-cidade" placeholder="ex: Fortaleza/CE" />
      </div>
    </div>
    <div class="sub" id="${prefixo}-cep-status" style="margin-top:-6px; margin-bottom:10px; min-height:16px;"></div>
  `;
}

// Busca automática: assim que o CEP tiver 8 dígitos, preenche rua/bairro/cidade
// sozinho. A pessoa ainda pode corrigir manualmente se o resultado vier incompleto
// ou errado.
export function aplicarBuscaCep(prefixo) {
  const cepEl = document.getElementById(`${prefixo}-cep`);
  const statusEl = document.getElementById(`${prefixo}-cep-status`);
  if (!cepEl) return;

  async function buscar() {
    const digits = cepEl.value.replace(/\D/g, "");
    if (digits.length !== 8) return;
    statusEl.textContent = "Buscando endereço...";
    const resultado = await buscarCep(digits);
    if (!resultado) {
      statusEl.textContent = "Não encontramos esse CEP automaticamente — preencha rua, bairro e cidade manualmente.";
      return;
    }
    document.getElementById(`${prefixo}-logradouro`).value = resultado.logradouro;
    document.getElementById(`${prefixo}-bairro`).value = resultado.bairro;
    document.getElementById(`${prefixo}-cidade`).value =
      resultado.cidade && resultado.uf ? `${resultado.cidade}/${resultado.uf}` : resultado.cidade;
    statusEl.textContent = "Endereço preenchido — confira e complete o número (e complemento, se houver).";
    document.getElementById(`${prefixo}-numero`).focus();
  }

  cepEl.addEventListener("input", () => {
    const digits = cepEl.value.replace(/\D/g, "").slice(0, 8);
    cepEl.value = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    if (digits.length === 8) buscar();
  });
  cepEl.addEventListener("blur", buscar);
}

// Monta a string final de endereço a partir dos campos separados. Se a pessoa não
// mexeu em nada (todos os campos em branco) e já existia um endereço salvo, mantém
// o que já estava — evita apagar um endereço válido só porque o formulário de CEP
// ficou vazio (os campos não vêm pré-preenchidos a partir do texto salvo, já que uma
// string livre antiga não dá pra "desmontar" com segurança em rua/número/bairro).
export function montarEnderecoDosCampos(prefixo, enderecoAtual) {
  const get = (sufixo) => {
    const el = document.getElementById(`${prefixo}-${sufixo}`);
    return el ? (el.value || "").trim() : "";
  };
  const logradouro = get("logradouro");
  const numero = get("numero");
  const complemento = get("complemento");
  const bairro = get("bairro");
  const cidade = get("cidade");

  if (!logradouro && !numero && !complemento && !bairro && !cidade) {
    return enderecoAtual || "";
  }

  let linha1 = logradouro;
  if (numero) linha1 += linha1 ? `, ${numero}` : numero;
  if (complemento) linha1 += linha1 ? ` - ${complemento}` : complemento;

  const partes = [];
  if (linha1) partes.push(linha1);
  if (bairro) partes.push(bairro);
  if (cidade) partes.push(cidade);
  return partes.join(", ");
}
