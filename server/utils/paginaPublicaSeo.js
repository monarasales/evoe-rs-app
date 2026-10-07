// Monta as páginas públicas (/vagas, /vaga/<código>, /talentos, /disc/<código>) já com
// título, descrição, prévia para WhatsApp/redes (Open Graph) e, nas vagas, os dados
// estruturados JobPosting (schema.org) usados pelo Google para Vagas.
// O conteúdo visível continua sendo montado no navegador por public/js/inscricao.js.

const fs = require("fs");
const path = require("path");
const db = require("../db");
const { paginaPublica } = require("./vagaPagina");

const ARQUIVO = path.join(__dirname, "..", "..", "public", "inscricao.html");
const encerrada = (v) => /^1[12]\./.test(v.etapaAtual || "");

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const TIPO_EMPREGO = { CLT: "FULL_TIME", PJ: "CONTRACTOR", "Estágio": "INTERN", "Temporário": "TEMPORARY", "Jovem Aprendiz": "INTERN", Freelancer: "CONTRACTOR" };

/** Descrição em HTML simples para o Google, só com o conteúdo PÚBLICO da vaga. */
function descricaoHtml(vaga, p) {
  const lista = (t, itens) => (itens && itens.length ? `<p><strong>${t}</strong></p><ul>${itens.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "");
  const par = (t, x) => (x ? `<p><strong>${t}</strong></p><p>${esc(x)}</p>` : "");
  return [
    par("Missão do cargo", p.missao),
    lista("Objetivos", p.objetivos),
    lista("Responsabilidades", (p.responsabilidades || []).map((r) => r.texto + (r.frequencia ? ` (${r.frequencia.toLowerCase()})` : ""))),
    lista("Requisitos", p.requisitos),
    lista("Diferenciais", p.diferenciais),
    par("Perfil comportamental", p.perfilComportamental),
    par("Ferramentas", p.ferramentas),
    par("Salário", p.salario),
    lista("Benefícios", p.beneficios),
    par("Horário", p.horario),
    par("Informações adicionais", vaga.descricaoPublica),
  ].join("");
}

function jobPosting(vaga, base) {
  const p = paginaPublica(vaga.pagina) || {};
  const descricao = descricaoHtml(vaga, p);
  if (!descricao) return null; // Google exige descrição; vaga sem conteúdo fica fora
  const empresa = vaga.mostrarEmpresa ? (db.findById("empresas", vaga.empresaId) || {}).nome : null;
  const publicada = String(vaga.linkCriadoEm || vaga.dataAbertura || new Date().toISOString()).slice(0, 10);
  const prazo = vaga.prazoFechamento && vaga.prazoFechamento > new Date().toISOString().slice(0, 10) ? vaga.prazoFechamento : null;
  const [cidade, uf] = String(p.cidade || "Fortaleza/CE").split("/").map((x) => x.trim());
  const dados = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: vaga.titulo,
    description: descricao,
    datePosted: publicada,
    ...(prazo ? { validThrough: `${prazo}T23:59:59-03:00` } : {}),
    ...(TIPO_EMPREGO[p.tipoContratacao] ? { employmentType: TIPO_EMPREGO[p.tipoContratacao] } : {}),
    hiringOrganization: {
      "@type": "Organization",
      name: empresa || "Evoé Gestão e RH (empresa confidencial)",
      sameAs: base,
      logo: `${base}/img/og-vagas.png`,
    },
    directApply: true,
    url: `${base}/vaga/${vaga.linkToken}`,
  };
  if (p.modeloTrabalho === "Remoto") {
    dados.jobLocationType = "TELECOMMUTE";
    dados.applicantLocationRequirements = { "@type": "Country", name: "Brasil" };
  } else {
    dados.jobLocation = {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        ...(p.bairro ? { streetAddress: p.bairro } : {}),
        addressLocality: cidade || "Fortaleza",
        addressRegion: uf || "CE",
        addressCountry: "BR",
      },
    };
  }
  return dados;
}

let modelo = null;
function lerModelo() {
  if (!modelo || process.env.NODE_ENV !== "production") modelo = fs.readFileSync(ARQUIVO, "utf-8");
  return modelo;
}

/** Devolve o HTML da página pública com os metadados certos para o endereço pedido. */
function renderizar(req) {
  const base = `${req.protocol}://${req.get("host")}`;
  const url = `${base}${req.originalUrl.split("?")[0]}`;
  let titulo = "Vagas abertas — Evoé Gestão e RH";
  let descricao = "Vagas abertas em processos seletivos conduzidos pela Evoé Gestão e RH. Veja os detalhes e candidate-se enviando seu currículo.";
  let indexar = true;
  let ld = null;

  const partes = req.path.split("/").filter(Boolean);
  if (partes[0] === "vaga" && partes[1]) {
    const vaga = db.readCollection("vagas").find((v) => v.linkToken && v.linkToken === partes[1]);
    if (vaga) {
      const p = paginaPublica(vaga.pagina) || {};
      const local = [p.bairro, p.cidade].filter(Boolean).join(", ");
      titulo = `${vaga.titulo}${local ? ` — ${local}` : ""} | Evoé Gestão e RH`;
      const resumo = p.missao || vaga.descricaoPublica || "";
      descricao = `${[p.tipoContratacao, p.modeloTrabalho, local, p.salario].filter(Boolean).join(" · ")}${resumo ? ` — ${resumo}` : ""}`.slice(0, 220) || `Vaga de ${vaga.titulo}. Candidate-se pela Evoé Gestão e RH.`;
      if (!encerrada(vaga)) ld = jobPosting(vaga, base);
      else indexar = false;
    } else indexar = false;
  } else if (partes[0] === "disc") {
    titulo = "Teste de perfil comportamental — Evoé Gestão e RH";
    indexar = false; // link pessoal do candidato
  } else if (partes[0] === "avaliacao") {
    titulo = "Pesquisa de satisfação — Evoé Gestão e RH";
    descricao = "Conte como foi o processo seletivo conduzido pela Evoé Gestão e RH.";
    indexar = false; // link pessoal do cliente
  } else if (partes[0] === "talentos") {
    titulo = "Banco de talentos — Evoé Gestão e RH";
    descricao = "Não encontrou a vaga ideal? Cadastre seu currículo no banco de talentos da Evoé Gestão e RH.";
  }

  const meta = `
  <title>${esc(titulo)}</title>
  <meta name="description" content="${esc(descricao)}" />
  <meta name="robots" content="${indexar ? "index, follow" : "noindex, nofollow"}" />
  <link rel="canonical" href="${esc(url)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Evoé Gestão e RH" />
  <meta property="og:locale" content="pt_BR" />
  <meta property="og:title" content="${esc(titulo)}" />
  <meta property="og:description" content="${esc(descricao)}" />
  <meta property="og:url" content="${esc(url)}" />
  <meta property="og:image" content="${esc(base)}/img/og-vagas.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  ${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>` : ""}`;

  return lerModelo()
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/<meta name="description"[^>]*>/, "")
    .replace(/<meta name="robots"[^>]*>/, "")
    .replace("</head>", `${meta}\n</head>`);
}

module.exports = { renderizar, jobPosting };
