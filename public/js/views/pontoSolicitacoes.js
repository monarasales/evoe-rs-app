// Solicitações de ajuste do ponto — lado do COLABORADOR (Meu Ponto): pedir ajuste ou
// justificar (esqueci de bater, bati errado, saí mais cedo, cheguei atrasado, faltei),
// anexar comprovante e acompanhar a decisão da gestão.
import { api } from "../api.js";
import { showToast } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";
import { escapeHtml as esc, campoData, brParaIso, dataBr, hhmm } from "../pontoUtil.js";

const TAG = { Pendente: "tag-standby", Aprovada: "tag-nprazo", Recusada: "tag-atrasada", Cancelada: "tag-encerrada" };

function lerArquivo(arquivo) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    r.readAsDataURL(arquivo);
  });
}

function detalhe(s) {
  if (s.tipo === "esqueci") return (s.batidas || []).map((b) => `${b.rotulo} ${b.hora}`).join(" · ");
  if (s.tipo === "corrigir") return `batida das ${s.horaRegistrada} → ${s.horaCorreta}`;
  if (s.tipo === "saida_antecipada") return `saiu às ${s.horaSaida}${s.incluirBatida ? " (sem bater a saída)" : ""}`;
  if (s.tipo === "atraso") return s.horaChegada ? `chegou às ${s.horaChegada}` : "";
  if (s.tipo === "falta") return s.dataFim && s.dataFim !== s.data ? `até ${dataBr(s.dataFim)}` : "";
  return "";
}

/** Lista "Meus pedidos de ajuste" (dentro do Meu Ponto). */
export async function blocoMinhasSolicitacoes(el, aoMudar) {
  let lista = [];
  try {
    lista = await api.get("/api/ponto/meu/solicitacoes");
  } catch (e) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = `
    <div class="ponto-sol-topo"><strong>📝 Ajustes e justificativas</strong>
      <button type="button" class="btn btn-primary btn-sm" id="sol-novo">Solicitar ajuste</button></div>
    <div class="sub" style="margin:4px 0 8px;">Esqueceu de bater, bateu errado, saiu mais cedo, chegou atrasado(a) ou faltou? Explique aqui — a gestão analisa e aprova.</div>
    ${
      lista.length
        ? `<div class="ponto-sol-lista">${lista
            .slice(0, 20)
            .map(
              (s) => `<div class="ponto-sol-item">
                <div><strong>${esc(s.tipoNome)}</strong> · ${dataBr(s.data)} <span class="tag ${TAG[s.status] || ""}">${esc(s.status)}</span></div>
                <div class="sub">${esc(detalhe(s))}${detalhe(s) ? " · " : ""}"${esc(s.motivo)}"</div>
                ${s.decisao && s.decisao.comentario ? `<div class="sub">💬 Gestão: ${esc(s.decisao.comentario)}</div>` : ""}
                ${s.status === "Pendente" ? `<button type="button" class="link-btn" data-cancelar="${esc(s.id)}">cancelar pedido</button>` : ""}
              </div>`
            )
            .join("")}</div>`
        : '<div class="sub">Nenhum pedido ainda.</div>'
    }`;
  el.querySelector("#sol-novo").addEventListener("click", () => abrirSolicitacao({}, aoMudar));
  el.querySelectorAll("[data-cancelar]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Cancelar este pedido?")) return;
      try {
        await api.post(`/api/ponto/meu/solicitacoes/${b.dataset.cancelar}/cancelar`);
        aoMudar();
      } catch (e) {
        showToast(e.message, "erro");
      }
    })
  );
}

/** Batidas de um dia (para "bati errado"), buscando o mês do dia escolhido. */
async function batidasDoDia(dataIso) {
  const [ano, mes] = dataIso.split("-").map(Number);
  const r = await api.get(`/api/ponto/meu/periodo?ano=${ano}&mes=${mes}`);
  const dia = r.dias.find((d) => d.data === dataIso);
  return dia ? dia.marcacoesDetalhe || [] : [];
}

/** Formulário do pedido. inicial: { tipo, data } (ex.: vindo do botão "Justificar" de um dia). */
export function abrirSolicitacao(inicial = {}, aoMudar = () => {}) {
  let tipo = inicial.tipo || "esqueci";
  const TIPOS = [
    ["esqueci", "⏰ Esqueci de bater"],
    ["corrigir", "✏️ Bati no horário errado"],
    ["saida_antecipada", "🚪 Saí mais cedo"],
    ["atraso", "🕘 Cheguei atrasado(a)"],
    ["falta", "📅 Faltei / me ausentei"],
  ];
  const dataInicial = inicial.data ? dataBr(inicial.data) : "";
  abrirModal(`
    <h2>📝 Solicitar ajuste do ponto</h2>
    <label>O que aconteceu?</label>
    <div class="sol-tipos">${TIPOS.map(([id, rot]) => `<button type="button" class="sol-tipo ${id === tipo ? "ativo" : ""}" data-tipo="${id}">${rot}</button>`).join("")}</div>
    <div class="form-cols">
      <div class="form-row"><label id="sol-data-rot">Dia</label><input type="text" id="sol-data" inputmode="numeric" maxlength="10" placeholder="dd/mm/aaaa" value="${esc(dataInicial)}" /></div>
      <div class="form-row" id="sol-datafim-row"><label>Até o dia <span class="sub">(se foi mais de um)</span></label><input type="text" id="sol-datafim" inputmode="numeric" maxlength="10" placeholder="dd/mm/aaaa" /></div>
    </div>
    <div id="sol-campos"></div>
    <div class="form-row"><label>Explique o motivo *</label><textarea id="sol-motivo" rows="3" placeholder="Ex.: o celular descarregou e não consegui bater a saída; saí às 15h para levar meu filho ao médico."></textarea></div>
    <div class="form-row" id="sol-anexo-row"><label>Comprovante <span class="sub">(opcional — ex.: atestado, declaração)</span></label><input type="file" id="sol-anexo" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
      <div class="sub">Não é preciso informar diagnóstico ou CID — só o documento.</div></div>
    <div id="sol-erro" class="form-erro hidden"></div>
    <div class="modal-close-row"><button type="button" class="btn btn-outline" id="sol-fechar">Fechar</button><button type="button" class="btn btn-primary" id="sol-enviar">Enviar para a gestão</button></div>`);
  const $ = (id) => document.getElementById(id);
  campoData($("sol-data"));
  campoData($("sol-datafim"));
  const erro = (m) => {
    $("sol-erro").textContent = m;
    $("sol-erro").classList.toggle("hidden", !m);
  };

  async function desenharCampos() {
    document.querySelectorAll(".sol-tipo").forEach((b) => b.classList.toggle("ativo", b.dataset.tipo === tipo));
    $("sol-datafim-row").style.display = tipo === "falta" ? "" : "none";
    $("sol-data-rot").textContent = tipo === "falta" ? "Dia (ou primeiro dia)" : "Dia";
    $("sol-anexo-row").style.display = ["falta", "atraso", "saida_antecipada"].includes(tipo) ? "" : "none";
    const c = $("sol-campos");
    if (tipo === "esqueci") {
      c.innerHTML = `<label>Quais batidas faltaram? <span class="sub">(preencha só as que esqueceu)</span></label>
        <div class="form-cols sol-batidas">${["Entrada", "Saída para almoço", "Volta do almoço", "Saída"].map((r, i) => `<div class="form-row"><label class="sub">${r}</label><input type="time" data-batida="${r}" id="sol-b${i}" /></div>`).join("")}</div>`;
    } else if (tipo === "corrigir") {
      const iso = brParaIso($("sol-data").value);
      c.innerHTML = '<div class="sub">Informe o dia para ver as suas batidas.</div>';
      if (iso) {
        try {
          const bs = await batidasDoDia(iso);
          c.innerHTML = bs.length
            ? `<div class="form-cols"><div class="form-row"><label>Batida errada</label><select id="sol-marcacao">${bs.map((b) => `<option value="${esc(b.id)}">${hhmm(b.horaMin)}${b.ajuste ? " (ajuste)" : ""}</option>`).join("")}</select></div>
               <div class="form-row"><label>Horário correto</label><input type="time" id="sol-hora-correta" /></div></div>`
            : '<div class="sub">Não há batidas neste dia. Use "Esqueci de bater".</div>';
        } catch (e) {
          c.innerHTML = `<div class="sub">${esc(e.message)}</div>`;
        }
      }
    } else if (tipo === "saida_antecipada") {
      c.innerHTML = `<div class="form-cols"><div class="form-row"><label>Que horas você saiu?</label><input type="time" id="sol-hora-saida" /></div>
        <div class="form-row"><label>&nbsp;</label><label class="checkbox-row" style="margin:0;font-weight:400;"><input type="checkbox" id="sol-incluir" /> Não bati a saída (incluir este horário)</label></div></div>`;
    } else if (tipo === "atraso") {
      c.innerHTML = '<div class="form-row" style="max-width:220px;"><label>Que horas você chegou? <span class="sub">(opcional)</span></label><input type="time" id="sol-hora-chegada" /></div>';
    } else c.innerHTML = "";
  }
  document.querySelectorAll(".sol-tipo").forEach((b) =>
    b.addEventListener("click", () => {
      tipo = b.dataset.tipo;
      desenharCampos();
    })
  );
  $("sol-data").addEventListener("change", () => tipo === "corrigir" && desenharCampos());
  $("sol-data").addEventListener("input", () => tipo === "corrigir" && $("sol-data").value.length === 10 && desenharCampos());
  $("sol-fechar").addEventListener("click", fecharModal);
  $("sol-enviar").addEventListener("click", async () => {
    erro("");
    const data = brParaIso($("sol-data").value);
    if (!data) return erro("Informe o dia (dd/mm/aaaa).");
    const corpo = { tipo, data, motivo: $("sol-motivo").value };
    if (tipo === "esqueci") corpo.batidas = [...document.querySelectorAll("[data-batida]")].map((i) => ({ rotulo: i.dataset.batida, hora: i.value })).filter((x) => x.hora);
    if (tipo === "corrigir") {
      if (!$("sol-marcacao")) return erro("Este dia não tem batida para corrigir.");
      corpo.marcacaoId = $("sol-marcacao").value;
      corpo.horaCorreta = $("sol-hora-correta").value;
    }
    if (tipo === "saida_antecipada") {
      corpo.horaSaida = $("sol-hora-saida").value;
      corpo.incluirBatida = $("sol-incluir").checked;
    }
    if (tipo === "atraso") corpo.horaChegada = $("sol-hora-chegada").value;
    if (tipo === "falta") corpo.dataFim = brParaIso($("sol-datafim").value) || data;
    const arq = $("sol-anexo").files[0];
    if (arq) {
      if (arq.size > 8 * 1024 * 1024) return erro("O comprovante passa de 8 MB.");
      corpo.anexo = { nomeArquivo: arq.name, conteudoBase64: await lerArquivo(arq) };
    }
    const btn = $("sol-enviar");
    btn.disabled = true;
    try {
      await api.post("/api/ponto/meu/solicitacoes", corpo);
      fecharModal();
      showToast("Pedido enviado. A gestão vai analisar e você recebe o aviso aqui no sistema.", "sucesso");
      aoMudar();
    } catch (e) {
      erro(e.message);
      btn.disabled = false;
    }
  });
  desenharCampos();
}
