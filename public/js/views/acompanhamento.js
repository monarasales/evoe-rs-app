import { api } from "../api.js";
import { store, showToast, nomeEmpresa } from "../state.js";
import { abrirModal, fecharModal } from "../modal.js";

function formatarData(iso) {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarMoeda(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor || 0);
}

export async function renderAcompanhamento(root) {
  let contratos = [];
  let relatorio = {};

  root.innerHTML = `
    <div class="view-header">
      <div>
        <h2>📋 Acompanhamento de Garantia</h2>
        <div class="sub">Período de experiência 45, 60 ou 90 dias com check-ins automáticos a cada 30 dias.</div>
      </div>
    </div>

    <div id="acomp-resumo" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:12px; margin-bottom:20px;"></div>

    <div style="background:var(--bg-alt); padding:16px; border-radius:6px; margin-bottom:20px;">
      <h3 style="margin-top:0;">Contratos em Período de Garantia</h3>
      <div id="acomp-tabela"></div>
    </div>
  `;

  const resumoEl = root.querySelector("#acomp-resumo");
  const tabelaEl = root.querySelector("#acomp-tabela");

  async function carregar() {
    try {
      contratos = await api.get("/api/contratos/acompanhamento/pendentes");
      relatorio = await api.get("/api/contratos/acompanhamento/relatorio");
      renderizar();
    } catch (err) {
      showToast(err.message, "erro");
    }
  }

  function renderizar() {
    // KPIs
    resumoEl.innerHTML = `
      <div style="padding:16px; background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius:6px; color:white;">
        <div class="sub" style="color:rgba(255,255,255,0.8); margin-bottom:4px;">Total</div>
        <div style="font-size:28px; font-weight:700;">${relatorio.totalContratos || 0}</div>
        <div class="sub" style="color:rgba(255,255,255,0.7); margin-top:4px;">em garantia</div>
      </div>
      <div style="padding:16px; background:linear-gradient(135deg, #4CAF50 0%, #45a049 100%); border-radius:6px; color:white;">
        <div class="sub" style="color:rgba(255,255,255,0.8); margin-bottom:4px;">Sucessos</div>
        <div style="font-size:28px; font-weight:700;">${relatorio.sucessos || 0}</div>
        <div class="sub" style="color:rgba(255,255,255,0.7); margin-top:4px;">tudo ok</div>
      </div>
      <div style="padding:16px; background:linear-gradient(135deg, #FF9800 0%, #F57C00 100%); border-radius:6px; color:white;">
        <div class="sub" style="color:rgba(255,255,255,0.8); margin-bottom:4px;">Problemas</div>
        <div style="font-size:28px; font-weight:700;">${relatorio.problemas || 0}</div>
        <div class="sub" style="color:rgba(255,255,255,0.7); margin-top:4px;">reportados</div>
      </div>
      <div style="padding:16px; background:linear-gradient(135deg, #2196F3 0%, #1976D2 100%); border-radius:6px; color:white;">
        <div class="sub" style="color:rgba(255,255,255,0.8); margin-bottom:4px;">Taxa Sucesso</div>
        <div style="font-size:28px; font-weight:700;">${relatorio.taxaSucesso || "—"}</div>
        <div class="sub" style="color:rgba(255,255,255,0.7); margin-top:4px;">conversão</div>
      </div>
    `;

    // Tabela
    if (contratos.length === 0) {
      tabelaEl.innerHTML = '<div class="empty-state">Nenhum contrato em período de garantia no momento.</div>';
      return;
    }

    tabelaEl.innerHTML = `
      <table style="width:100%;">
        <thead>
          <tr>
            <th>Candidato/Vaga</th>
            <th>Cliente</th>
            <th>Período</th>
            <th>Vencimento</th>
            <th>Status</th>
            <th>Check-ins</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${contratos.map(c => {
            const statusCor = c.statusGarantia === 'vencido' ? '#f44336' :
                            c.statusGarantia === 'checkin-pendente' ? '#FF9800' : '#4CAF50';
            const statusTexto = c.statusGarantia === 'vencido' ? '⏰ Vencido' :
                              c.statusGarantia === 'checkin-pendente' ? '⚠️ Check-in Pendente' : '✅ Ativo';
            return `
              <tr>
                <td style="font-weight:500;">${c.vagaTitulo}</td>
                <td>${nomeEmpresa(c.empresaId)}</td>
                <td>${c.periodoGarantiaDias} dias</td>
                <td>${formatarData(c.dataVencimento)}</td>
                <td><span style="background:${statusCor}; color:white; padding:4px 8px; border-radius:3px; font-size:12px; font-weight:500;">${statusTexto}</span></td>
                <td>${c.checkinsRealizados}/${c.periodoGarantiaDias === 45 ? 1 : c.periodoGarantiaDias === 60 ? 2 : 3}</td>
                <td>
                  <button class="btn-check-in" data-id="${c.id}" style="background:none; border:none; color:var(--link); cursor:pointer; text-decoration:underline; font-size:13px; padding:0; margin:0;">
                    Registrar Check-in
                  </button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;

    tabelaEl.querySelectorAll(".btn-check-in").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const contrato = contratos.find(c => c.id === id);
        abrirFormularioCheckIn(contrato);
      });
    });
  }

  function abrirFormularioCheckIn(contrato) {
    abrirModal(`
      <h2 style="margin-bottom:20px;">✅ Registrar Check-in de Acompanhamento</h2>
      <div style="background:var(--bg-alt); padding:12px; border-radius:4px; margin-bottom:16px;">
        <strong>${contrato.vagaTitulo}</strong> - ${nomeEmpresa(contrato.empresaId)}
        <div class="sub" style="margin-top:4px;">Período: ${contrato.periodoGarantiaDias} dias | Vencimento: ${formatarData(contrato.dataVencimento)}</div>
      </div>
      <form id="form-check-in" style="display:flex; flex-direction:column; gap:16px;">
        <div>
          <label style="display:block; font-weight:600; margin-bottom:8px;">Como está o candidato/prestador de serviço?</label>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:12px; border:2px solid var(--divider); border-radius:4px; transition:all 0.2s;">
              <input type="radio" name="status" value="tudo-ok" required style="cursor:pointer;" />
              <span style="flex:1;">
                <strong>✅ Tudo OK</strong>
                <div class="sub" style="font-size:12px;">Está se saindo bem</div>
              </span>
            </label>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:12px; border:2px solid var(--divider); border-radius:4px; transition:all 0.2s;">
              <input type="radio" name="status" value="problema" required style="cursor:pointer;" />
              <span style="flex:1;">
                <strong>⚠️ Problema</strong>
                <div class="sub" style="font-size:12px;">Encontramos uma issue</div>
              </span>
            </label>
          </div>
        </div>

        <div>
          <label style="display:block; font-weight:600; margin-bottom:6px;">Detalhes (obrigatório)</label>
          <textarea id="notas" required style="width:100%; padding:10px; border:1px solid var(--divider); border-radius:4px; font-size:14px; resize:vertical; min-height:80px;" placeholder="Descreva a situação, comportamento, desempenho, qualquer questão observada..."></textarea>
        </div>

        <div id="form-erro" class="form-erro hidden" style="padding:12px; background:#ffebee; border:1px solid #f44336; border-radius:4px; color:#c62828; display:none;"></div>

        <div style="display:flex; gap:12px; justify-content:flex-end; margin-top:12px; padding-top:12px; border-top:1px solid var(--divider);">
          <button type="button" id="btn-cancelar" class="btn btn-outline">Cancelar</button>
          <button type="submit" class="btn btn-primary">Registrar Check-in</button>
        </div>
      </form>
    `);

    const form = root.querySelector("#form-check-in");
    const erroBox = root.querySelector("#form-erro");

    root.querySelector("#btn-cancelar").addEventListener("click", fecharModal);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const status = root.querySelector("input[name='status']:checked").value;
      const notas = root.querySelector("#notas").value.trim();

      if (!notas) {
        erroBox.textContent = "Preencha os detalhes do check-in";
        erroBox.style.display = "block";
        return;
      }

      try {
        await api.post(`/api/contratos/${contrato.id}/acompanhamentos`, { status, notas });
        showToast("✅ Check-in registrado com sucesso", "sucesso");
        fecharModal();
        await carregar();
      } catch (err) {
        erroBox.textContent = err.message;
        erroBox.style.display = "block";
      }
    });
  }

  await carregar();
}
