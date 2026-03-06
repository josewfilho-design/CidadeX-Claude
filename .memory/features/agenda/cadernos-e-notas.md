# Memory: features/agenda/cadernos-e-notas
Updated: now

A aba **'Notas'** (renomeada de 'Lembrar') dentro da Agenda implementa um sistema de organização inspirado no Evernote, estruturado em Cadernos e Notas.
- **Estrutura**: Cadernos ilimitados por usuário, com nomes e paleta de 300 cores HSL. Limite de 100 notas por caderno.
- **Editor de Notas**: Campo memo com formatação rica (negrito, itálico, listas com marcadores, numeradas e checklists) e inserção inteligente de links (URLs, e-mails, telefones). Auto-continuação de listas ao pressionar Enter.
- **Imagens**: Botão na toolbar permite inserir imagens (até 5 MB) que são armazenadas no bucket `note-images` do Storage. A imagem é inserida como markdown `![imagem](url)` e renderizada inline no preview com suporte a lightbox (zoom/pinch) ao clicar. Políticas RLS garantem que cada usuário só pode enviar/excluir imagens no seu diretório (`user_id/`).
- **Visualização (Preview)**: Renderização com checklists interativos (auto-save ao marcar/desmarcar). Links são exibidos em azul (`text-app-comm`) e clicáveis nativamente. Detecção automática de: URLs, e-mails, telefones brasileiros (com link `tel:`) e CEPs (formato 00000-000, abre popup interno com dados do endereço via edge function `lookup-cep`).
- **Popup de CEP**: Ao clicar em um CEP detectado no preview, um popup interno exibe rua, bairro e cidade/UF consultados pela edge function. Oferece botões para copiar o endereço ou inserir diretamente no conteúdo da nota.
- **Integrações**: Busca por palavras-chave, compartilhamento via WhatsApp, exportação PDF (visualizador interno /visualizador).
- **Privacidade**: RLS restrito (`auth.uid() = user_id`).
