# Memory: features/financas-contas
Updated: 20/02/2026

## Módulo Contas Financeiras

### Tabela: financial_accounts
- Campos: id, user_id, account_type (carteira/banco), name, bank_name, bank_code, agency_code, account_number, account_digit, initial_balance, informed_balance, informed_balance_date, color, is_default
- RLS: CRUD restrito ao próprio user_id
- Trigger: update_updated_at_column + limit_financial_accounts (máx 10)
- financial_records.account_id → FK para financial_accounts (ON DELETE SET NULL)

### Funcionalidades
- CRUD de contas (carteira ou banco)
- Seleção de banco com código (lista dos principais bancos BR)
- Saldo calculado = saldo inicial + receitas pagas - despesas pagas vinculadas
- Saldo informado pelo usuário para verificação de sincronização
- Indicador visual de diferença (calculado vs informado)
- Conta padrão pré-selecionada em novos registros
- Cor personalizável por conta
- Filtro por conta na listagem de registros
- account_id incluído em criação, edição, clonagem e parcelas

### Componentes
- `src/components/finances/AccountsManager.tsx` — CRUD de contas com sync
- Integrado em `FinancesSection.tsx` (botão "Contas", filtro, calculatedBalances)
- Integrado em `FinanceFormModal.tsx` (seletor de conta, interface AccountOption)
