# Memory: features/financas
Updated: 02/03/2026

## Módulo Finanças

### Tabela: financial_records
- Campos: id, user_id, type (receita/despesa), description, amount, entry_date, due_date, payment_date, payee (favorecido), category, referente, payment_method (forma de pagamento), status (pendente/pago/vencido/cancelado), notes, attachment_url (legacy), attachment_name (legacy)
- RLS: CRUD restrito ao próprio user_id
- Trigger: update_updated_at_column

### Tabela: financial_record_attachments
- Campos: id, record_id (FK → financial_records ON DELETE CASCADE), user_id, file_url, file_name, display_name, file_type, file_size, position, created_at
- RLS: CRUD restrito ao próprio user_id
- Limite: até 10 anexos por registro
- Suporta nomes editáveis (display_name)
- Dados migrados automaticamente de attachment_url/attachment_name legados

### Favorecidos
- Usa a tabela `manual_contacts` existente (nome + celular) como fonte de favorecidos
- Não possui tabela própria — compartilha a base de contatos manuais do sistema
- Sugestões no formulário combinam contatos manuais + favorecidos já usados em registros
- Possível adicionar novo contato manual direto do campo de digitação
- Possível remover sugestão (apaga o contato manual correspondente)

### Componentes
- `src/components/finances/FinancesSection.tsx` — Listagem principal com filtros, busca, ordenação
- `src/components/finances/FinanceFormModal.tsx` — Modal de criação/edição com todos os campos
- `src/components/finances/FinanceReports.tsx` — Relatórios com resumo, por categoria e por mês

### Funcionalidades
- CRUD completo (criar, editar, excluir)
- Múltiplos anexos por registro (até 10), com nome editável individualmente
- Badge na listagem: "Anexo" (1) ou "Anexos (N)" (N>1)
- Visualizador abre todos os anexos do registro de uma vez
- Pagamento parcial: ao pagar, o valor é editável; se menor que o total, o registro é pago com o valor informado e um novo registro de saldo é criado automaticamente referenciando a parcela original (sufixo `.1`, `.2`, etc., ex: `(1/7.1)`)
- Recorrência mensal: cria 1 registro com is_recurring=true; cron mensal (generate-recurring) gera o próximo automaticamente no início de cada mês; botão "Encerrar" define recurring_active=false e para a geração
- Clonar registro (cria cópia com data atual e status pendente)
- Filtros por tipo (receita/despesa) e status
- Busca por descrição, favorecido, referente, categoria
- Ordenação por data de entrada, vencimento ou valor
- Detecção automática de vencidos (status pendente + data passada)
- Preenchimento automático do status "pago" ao informar data de pagamento
- Confirmação antes de excluir
- Relatórios: totais, saldo, por categoria (com barras visuais), por mês

### Regras de Exibição de Parcelas (NÃO MODIFICAR)
**Regra crítica**: A exibição de parcelas na listagem segue a fórmula individual:
- **Parcela normal/sub-parcela**: `Valor da Parcela − Pago = Devido`
  - Cada registro mostra APENAS seus próprios valores (amount + juros - desconto)
  - Se status "pago", Pago = valor da parcela; senão Pago = 0
- **Parcela paga parcialmente** (que gerou sub-parcela): `Valor Original − Valor Recebido = Devido`
  - O valor original é reconstruído somando o valor pago + valor da sub-parcela gerada
  - Exemplo: Parcela 1/7 de R$ 500 → pago R$ 300 → Devido R$ 200 (Gerada parcela 1/7.1)
  - A sub-parcela 1/7.1 mostra: R$ 200 − R$ 0 = Devido R$ 200
- **Totalização de parcelas**: somente nos Relatórios, NUNCA na listagem individual

### Regras de Exibição dos Cards na Listagem (NÃO MODIFICAR)
**Cada card de registro financeiro DEVE SEMPRE exibir:**
1. **Valor principal** (canto superior direito): `+/-R$ amount` em verde (receita) ou vermelho (despesa)
2. **Juros/Desconto** (se houver): linhas abaixo do valor com `+juros` e `-desc`, seguido de `= effectiveAmount`
3. **Badges de status**: Pendente (primary), Pago (green), Vencido (destructive), Cancelado (muted)
4. **Badge Vencido extra**: se pendente + due_date passada, com ícone AlertTriangle
5. **Badge Recorrente**: se is_recurring, com ícone Repeat
6. **Badge Parcela**: se installment_total > 1 e não é recorrente, mostra `installment_number/installment_total`
7. **Datas**: Entrada (sempre), Vencimento (destaque colorido por status), Pagamento (se pago, verde)
8. **Favorecido**: em negrito com ícone User
9. **Seção de parcela**: fórmula `Parcela X: ValorParcela − Pago = Devido` (conforme regras acima)
10. **Ações**: Receber/Pagar, Reverter, Editar, Clonar, Recibo, Encerrar/Reativar, Excluir

### Regras dos Cards de Resumo (NÃO MODIFICAR)
**Os 3 cards de resumo (Receitas, Despesas, Saldo) DEVEM:**
- Receitas: somatório de amount + juros - desconto de registros filtrados com type="receita" AND status="pago"
- Despesas: somatório de amount + juros - desconto de registros filtrados com type="despesa" AND status="pago"
- Saldo: Receitas - Despesas
- Cores: Receitas=green-500, Despesas=destructive, Saldo=green-500 se ≥0, destructive se <0

### Regras de Edição em Grupo (NÃO MODIFICAR)
**Ao EDITAR uma parcela que pertence a um grupo (parcelamento ou recorrência):**
- SEMPRE exibir AlertDialog perguntando: "Só esta parcela" ou "Todas as parcelas"
- "Só esta": salva apenas o registro editado
- "Todas": aplica tipo, categoria, favorecido, referente, conta, forma de pagamento e descrição a todas as parcelas do grupo (preservando sufixos de parcelamento, datas, valores e status individuais)
- NUNCA criar novos registros ao editar — apenas atualizar os existentes
- No FinanceFormModal, ao editar (editRecord?.id existe), NUNCA passar isRecurring como flag de criação

### Regras de Exclusão em Grupo (NÃO MODIFICAR)
**Ao EXCLUIR uma parcela que pertence a um grupo com mais de 1 registro:**
- SEMPRE exibir AlertDialog perguntando: "Só esta" ou "Excluir todas"
- "Só esta": exclui apenas o registro clicado
- "Excluir todas": exclui todos os registros do grupo (installment_group_id)
- Funciona tanto para parcelamentos quanto para recorrências

### Tab
- Chave: "financas"
- Label: "Finanças"
- Ícone: DollarSign
- Posicionada após "Agenda" na lista de tabs
- Configurável em Profile.tsx (pode ser ocultada/reordenada pelo usuário)
