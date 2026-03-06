# Memory: features/padroes-do-sistema
Updated: 24/02/2026

## Regras e Padrões Obrigatórios do CidadeX-BR

Sempre que implementar algo novo, seguir estas regras sem exceção:

### 1. Controle de Acesso (Página de Ajuda)
- **Usuário comum**: Só vê a seção "Perguntas Frequentes" na página /ajuda.
- **Administrador**: Vê todas as seções (Arquitetura do Projeto, Termos de Uso, Funcionalidades, FAQ) + botões "Forçar atualização" e "Gerar PDF completo".
- Hook usado: `useAdmin()` → `isAdmin`.

### 2. Abas Fixas (Navegação Principal)
- As abas **"Contatos"** e **"Social"** são FIXED_TABS.
- Posicionadas obrigatoriamente após a aba "Info" no menu.
- **Não podem** ser ocultadas ou reordenadas pelo usuário.
- Definidas em `FIXED_TABS` tanto em `Index.tsx` quanto em `Profile.tsx`.

### 3. Sincronização Entre Dispositivos
- A sincronização de aba ativa e cidade favorita usa realtime do banco.
- **Ignora eventos próprios** (dentro de 3 segundos) para evitar loops.
- Só muda a aba se o valor for realmente diferente do atual (`setTab(prev => prev === val ? prev : val)`).
- Controlada pelo campo `sync_enabled` no perfil (padrão: true).

### 4. Versionamento e Atualização
- Versão em `src/config/version.ts` (APP_VERSION e APP_LAST_UPDATE).
- Versão pública em `public/version.json`.
- **Ambos devem ser atualizados juntos** ao lançar nova versão.
- UpdatePrompt via Service Worker (verifica a cada 5 minutos).

### 5. Vibração em Chamadas
- Vibração do dispositivo ativada junto com toque de chamada recebida.
- Toggle ON/OFF no modal de chamada recebida (persiste em localStorage: `cidadex-vibration-enabled`).
- Padrão: ativado.

### 6. Design System
- Usar tokens semânticos do Tailwind (`bg-primary`, `text-foreground`, etc.).
- **Nunca** usar cores hardcoded em componentes.
- Todas as cores em HSL via `index.css` e `tailwind.config.ts`.
- Componentes shadcn/ui como base.

### 7. Lazy Loading
- Componentes pesados de abas são carregados com `lazy()` + `Suspense`.
- `TabErrorBoundary` envolve cada aba para capturar erros sem derrubar o app.

### 8. Cache e Performance
- Seções com dados da API (Notícias, Lugares, Eventos) usam cache em memória (`useRef`).
- Evitar chamadas duplicadas ao trocar abas.

### 9. Segurança
- Tabelas com RLS policies sempre.
- Nunca expor chaves privadas no código.
- Dados sensíveis protegidos por `auth.uid()`.

### 10. Idioma
- Interface 100% em Português Brasileiro.
- Mensagens de toast, labels, placeholders — tudo em PT-BR.

### 11. PWA
- App configurado como PWA instalável.
- Service Worker gerenciado por `vite-plugin-pwa`.
- Página /install com instruções de instalação.

### 12. Estrutura de Componentes
- `src/components/ui/` → shadcn/ui genéricos.
- `src/components/common/` → utilitários do sistema.
- `src/components/city/` → módulo cidade.
- `src/components/social/` → módulo social.
- `src/components/navigation/` → navegação urbana.
- `src/components/agenda/` → agenda pessoal.
- `src/components/admin/` → administrativo.
- `src/config/` → configurações.
- `src/hooks/` → hooks genéricos e de domínio.
- `src/pages/` → páginas.
- `supabase/functions/` → edge functions.

### 13. Confirmação de Ações Destrutivas
- **Toda ação destrutiva** (excluir, sair, limpar dados, etc.) **deve exigir confirmação** antes de executar.
- Usar `AlertDialog` do shadcn/ui para confirmações modais.
- Texto claro informando a consequência da ação (ex: "Esta ação é irreversível").
- Botão de confirmação com estilo `destructive`, botão de cancelar com `outline`.

### 14. Ícones WhatsApp
- **Todo ícone/botão** referente a WhatsApp deve usar obrigatoriamente o token `whatsapp` do design system.
- Classes: `bg-whatsapp/10 text-whatsapp hover:bg-whatsapp/20`.
- Token CSS: `--whatsapp: 142 70% 49%` (verde oficial WhatsApp em HSL).

### 15. Ícones de Comunicação do App (Chat, Chamada de Voz, Vídeo)
- **Todo ícone/botão** de chat interno, chamada de voz e chamada de vídeo do sistema deve usar o token `app-comm`.
- Classes: `bg-app-comm/10 text-app-comm hover:bg-app-comm/20`.
- Token CSS: `--app-comm: 217 80% 50%` (azul em HSL).

### 16. Separação Visual de Ícones: Sistema vs WhatsApp
- Em listas de contatos, botões de ação agrupados e separados visualmente.
- Grupo "Sistema" (azul) + Separador + Grupo "WhatsApp" (verde) + Separador + Ações.

### 17. Último Ícone Salvo (CidX) — PROTEGIDO
- O ícone/logo **CidX** **nunca deve ser substituído ou alterado pela IA** sem permissão explícita do usuário.

### 18. Campos de Data — Digitação + Calendário
- **Todo campo de data** deve usar o componente `DateInput`.
- **Nunca** usar `<input type="date">` nativo.

### 19. Dicas (Tooltips) em Botões — OBRIGATÓRIO
- **Todo botão de ação, ícone clicável e elemento interativo** DEVE ter o atributo `title` com dica descritiva.

### 20. Exportação PDF — OBRIGATÓRIO E VERIFICADO
- **Toda seção que gere PDF** deve refletir todos os campos visíveis da UI.
- Formatos: data `dd/MM/yyyy`, valores `R$ 1.234,56`.

### 21. Tooltip Global — DO NOT CHANGE
- O componente `TooltipContent` (`src/components/ui/tooltip.tsx`) usa **Portal + z-[9999] + side="top" + avoidCollisions + collisionPadding={8}**.
- **NÃO ALTERAR** — qualquer mudança causa regressão de tooltips encobertos por banners/headers sticky.

### 22. TooltipProvider Único
- O `TooltipProvider` (com `delayDuration={300}`) está em `App.tsx` (raiz).
- **NÃO adicionar TooltipProvider duplicado** em páginas individuais — causa conflitos.

### 23. Watermark z-index
- O `Watermark` usa **z-[9990]** para ficar ABAIXO dos tooltips (z-[9999]).
- **NÃO usar z-[9999]** no Watermark.

### 24. Separadores de Abas
- A barra de abas usa uma única função `sep()` para separadores visuais.
- **NÃO duplicar** como groupSeparator/thinSeparator — são idênticos.

### 25. Arquivos Protegidos — DO NOT CHANGE
- Os seguintes arquivos possuem comentários `⚠️ DO NOT CHANGE` e **não devem ser alterados** sem aprovação explícita:
  - `src/components/ui/tooltip.tsx` — Portal + z-index + posicionamento
  - `src/hooks/useAuth.tsx` — Autenticação central + ban check + auto-logout
  - `src/hooks/useAdmin.ts` — Verificação de role + configurações globais
  - `src/hooks/useContentProtection.ts` — Proteção de conteúdo
  - `src/components/common/BottomNav.tsx` — Navegação inferior mobile
  - `src/components/common/Watermark.tsx` — Marca d'água protegida (Regra #17)
