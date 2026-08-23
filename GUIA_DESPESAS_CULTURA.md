# Guia de Uso: Despesas e Cultura Organizacional

## 📋 Índice
1. [Despesas](#despesas)
2. [Cultura Organizacional](#cultura-organizacional)

---

## 💸 Despesas

### O que é o módulo de Despesas?

O módulo **Despesas** gerencia todos os gastos operacionais da sua consultoria e dos seus clientes:
- **Folha de Pagamento**: salários, adicionais, extras
- **Benefícios**: vale refeição, vale transporte, auxílio saúde
- **Sistemas/Ferramentas**: software, subscriptions, licenças
- **Outros**: despesas pontuais não enquadradas acima

### Quem tem acesso?

✅ **Gestor** - acesso total para criar, aprovar e marcar como pago
❌ **Consultor/Supervisora** - sem acesso

### Como usar Despesas

#### 1️⃣ Dashboard com KPIs

Na tela inicial de Despesas, você vê:
- **Total Geral**: soma de todas as despesas do mês/período
- **Aprovadas**: despesas com status "Aprovado"
- **Pagas**: despesas que já receberam data de pagamento
- **Por Categoria**: quebra visual mostrando quanto foi gasto em cada categoria (Folha, Benefício, Sistema, Outro)

#### 2️⃣ Filtros de Visualização

Você pode filtrar por:
- **Mês**: selecione o mês desejado
- **Ano**: qual ano está consultando
- **Categoria**: Folha de Pagamento, Benefício, Sistema/Ferramenta, Outro
- **Status**: Rascunho, Pendente Aprovação, Aprovado, Pago

**Exemplo:** Para ver quanto foi aprovado em Benefícios no mês de agosto, filtre por:
- Mês = Agosto
- Categoria = Benefício
- Status = Aprovado

#### 3️⃣ Gerar Despesas do Ponto (⚡ Automático)

**Como funciona:**

1. Clique em **⚡ Gerar do Ponto**
2. O sistema lê automaticamente:
   - Horas extras trabalhadas (calcula valor baseado em salário)
   - Dias de falta/atraso (para descontos se aplicável)
3. Cria **propostas** de despesas no status "Pendente Aprovação"
4. Você revisa e **aprova/rejeita** cada proposta

**Por quê?** Alguns funcionários trabalham extra, outros descumprem prazos. O sistema propõe automaticamente, mas você decide se aprova.

#### 4️⃣ Vale Refeição (Manual)

O Vale Refeição é sempre **manual** porque:
- Alguns funcionários têm direito, outros não
- O valor varia por funcionário (alguns recebem R$20/dia, outros R$0)

**Como preencher:**

1. Clique em **+ Nova Despesa**
2. Categoria = **Benefício**
3. Descrição = "Vale Refeição - [Mês]"
4. Valor = soma dos vales do mês
   - Se tem 20 funcionários, cada um com R$25/dia × 22 dias = R$550 × 20 = R$11.000/mês
   - Ou se alguns não têm direito, calcule individual
5. Salve no status "Rascunho"
6. Depois edite e marque como "Aprovado"

#### 5️⃣ Editar Despesa e Marcar como Pago

**Para editar:**
1. Na tabela, clique em **Editar** na despesa
2. Pode mudar: descrição, valor, categoria, observações
3. Se já foi aprovada, pode marcar **Status** e **Data de Pagamento**

**Para marcar como pago:**
1. Clique em **Editar** na despesa
2. Mude **Status** para "Aprovado" (se não está)
3. Preencha **Data de Pagamento** (data que você pagou)
4. Salve

**Resultado:**
- A despesa aparece em "Pagas" nos KPIs
- No Financeiro, você consegue rastrear fluxo de caixa

#### 6️⃣ Observações sobre Status

| Status | Significado | Próximo passo |
|--------|-------------|--------------|
| **Rascunho** | Criada mas ainda está sendo revisada | Editar e revisar |
| **Pendente Aprovação** | Pronta para você aprovar/rejeitar (ex: proposta do Ponto) | Editar e escolher "Aprovado" ou deletar |
| **Aprovado** | Você conferiu e aprova o gasto | Preencher data de pagamento |
| **Pago** | Tem data de pagamento preenchida | Concluído |

---

## 🌱 Cultura Organizacional

### O que é o módulo de Cultura?

**Cultura Organizacional** gerencia **projetos de implementação de cultura RH** dos seus clientes.

Você precisa entregar:
1. Um diagnóstico de cultura atual
2. Um planejamento de ações
3. Implementação das mudanças
4. Acompanhamento dos resultados
5. Encerramento e relatório final

### Quem tem acesso?

✅ **Gestor** - acesso total
❌ **Consultor/Supervisora** - sem acesso

### As 5 Etapas de um Projeto

```
Diagnóstico → Planejamento → Implementação → Acompanhamento → Encerramento
   (Observa)    (Planeja)       (Executa)       (Valida)       (Finaliza)
```

### Como usar Cultura

#### 1️⃣ Dashboard de Projetos

Na tela inicial, você vê:
- **Total de Projetos**: quantos projetos existem
- **Em Andamento**: projetos na fase Diagnóstico até Acompanhamento
- **Concluídos**: projetos em Encerramento
- **Progresso Médio**: média de progresso de todos os projetos (%)

#### 2️⃣ Criar Novo Projeto

Clique em **+ Novo Projeto** e preencha:

| Campo | Exemplo | Obrigatório? |
|-------|---------|--------------|
| **Título** | "Implementação de Cultura - ABC Consultoria" | ✅ Sim |
| **Cliente** | ABC Consultoria | ✅ Sim |
| **Descrição** | "Diagnóstico e implementação de modelo de liderança" | ❌ Não |
| **Objetivos** | "Aumentar retenção em 20%, melhorar clima" | ❌ Não |
| **Data Início** | 2026-08-01 | ❌ Não |
| **Data Fim** | 2026-11-30 | ❌ Não |

#### 3️⃣ Entender o Status de um Projeto

Os status seguem o cronograma de uma implementação de cultura:

- **Diagnóstico** 🔵 - Você está observando a cultura atual
  - Entrevistas, survey, análise documental
  - Prazo típico: 2-4 semanas
  
- **Planejamento** 🔴 - Desenhando as ações
  - Definir ações, responsáveis, prazos, métricas
  - Prazo típico: 2-3 semanas

- **Implementação** 🟠 - Executando as mudanças
  - Treinamentos, comunicação, ajustes
  - Prazo típico: 4-12 semanas

- **Acompanhamento** 🟢 - Monitorando os resultados
  - Verificar se as mudanças pegaram
  - Prazo típico: 4-8 semanas

- **Encerramento** ⚫ - Projeto finalizado
  - Relatório final, documentação, encerramento

#### 4️⃣ Clicar no Projeto para Ver Detalhes

Ao clicar em um projeto no card:
- Vê o resumo (status, progresso %, datas)
- Descrição e objetivos
- **Timeline de Ações por Etapa** (veja abaixo)

#### 5️⃣ Criar e Gerenciar Ações

Dentro de um projeto selecionado, clique em **+ Ação**:

| Campo | Exemplo | O que é? |
|-------|---------|----------|
| **Título** | "Entrevistas com lideranças" | Nome da ação |
| **Descrição** | "Entrevistar 15 líderes sobre visão de cultura" | Detalhes do que será feito |
| **Etapa** | Diagnóstico | Em qual fase ocorre? |
| **Data Vencimento** | 2026-08-15 | Quando deve terminar? |
| **Observações** | "Incluir CEO e diretores" | Notas adicionais |

#### 6️⃣ Status de uma Ação

Quando você **edita** uma ação depois de criada, pode mudar o status:

| Status | Significado |
|--------|-------------|
| **Não Iniciada** | Planejada mas ainda não começou |
| **Em Andamento** | Está sendo executada agora |
| **Concluída** | ✅ Finalizou com sucesso |
| **Atrasada** | ⚠️ Passou da data de vencimento |

#### 7️⃣ Progresso do Projeto

O **% Progresso** é calculado automaticamente:
- Quantas ações estão **Concluídas** / total de ações
- Se tem 10 ações e 5 estão prontas = 50%

**Para aumentar o progresso:** conclua mais ações marcando como "Concluída"

#### 8️⃣ Editar Projeto e Alterar Status

Clique em **Editar** no detalhe do projeto para:
- Mudar o **Status** (Diagnóstico → Planejamento → etc)
- Atualizar datas de início/fim
- Ajustar descrição/objetivos

### Exemplo Prático: Projeto de Cultura

**Cliente:** ABC Consultoria  
**Data:** Agosto a Novembro de 2026  
**Objetivo:** Melhorar clima e retenção

```
Diagnóstico (Agosto - 3 semanas)
├─ ✅ Entrevistas com lideranças
├─ ✅ Survey com colaboradores
└─ ⏳ Análise de dados (Em Andamento)

Planejamento (Setembro - 2 semanas)
├─ ⏳ Desenhar ações
├─ ⏳ Definir responsáveis
└─ ❌ Validar com cliente (Atrasada)

Implementação (Outubro - 6 semanas)
├─ ❌ Treinamento de líderes (Não Iniciada)
├─ ❌ Comunicação com time (Não Iniciada)
└─ ❌ Ajustes de processos (Não Iniciada)

Acompanhamento (Novembro - 4 semanas)
└─ ❌ Verificar impacto (Não Iniciada)

Encerramento
└─ ❌ Relatório final (Não Iniciada)
```

---

## 🎯 Dicas Finais

### Despesas
1. **Use o "Gerar do Ponto"** todo mês para propor folha de pagamento
2. **Sempre preencha a Data de Pagamento** para rastrear fluxo
3. **Organize por categoria** - isso ajuda no financeiro
4. **Revise Rascunhos** mensalmente antes de fechar o mês

### Cultura
1. **Comece sempre pelo Diagnóstico** - não pule etapas
2. **Quebre em ações pequenas** - cada ação com prazo claro
3. **Atualize status regularmente** - para manter projeto em dia
4. **Revise progresso mensalmente** com cliente

### Integração com Financeiro
- Despesas aprovadas e pagas aparecem no **Financeiro**
- Projetos de Cultura viram **Serviços** que você cobra do cliente
- Use ambos para fazer previsão de receita e despesa
