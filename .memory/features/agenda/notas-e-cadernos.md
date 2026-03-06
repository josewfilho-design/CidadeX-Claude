# Memory: features/agenda/notas-e-cadernos
Updated: now

A funcionalidade "Notas" na Agenda (anteriormente "Lembrar") implementa um sistema de organização inspirado no Evernote, estruturado em Cadernos e Notas.
- **Estrutura**: Permite criar cadernos ilimitados com nomes e uma paleta de 300 cores geradas via HSL. O limite técnico é de 100 notas por caderno.
- **Classificação**: Botão de classificação na lista de notas com opções: mais recentes, mais antigas, título A→Z e título Z→A. Notas fixadas (pinned) são sempre exibidas primeiro, independente da ordenação escolhida.
- **Editor e Formatação**: Suporta formatação rica (negrito, itálico, listas e checklists), atalhos de markdown simplificados como `[link]` ou `[email]` e auto-continuação de listas ao pressionar Enter. Links (HTTP/S), e-mails (mailto:) e telefones (tel:) são detectados automaticamente e formatados como links azuis clicáveis que utilizam o comportamento nativo do navegador para evitar bloqueios de popups.
- **Imagens**: Permite a inserção de imagens exclusivamente via área de transferência (Ctrl+V), realizando o upload automático para o bucket 'note-images' no Supabase e inserindo a sintaxe markdown correspondente no cursor; o botão de upload manual foi removido para manter o fluxo de escrita limpo.
- **Detecção de CEP**: Identifica automaticamente CEPs brasileiros (com ou sem hífen) no preview, normalizando-os para o formato 00000-000. O clique em um CEP abre um popup interno que consulta o endereço via Edge Function (lookup-cep), permitindo copiar os dados formatados ou inseri-los diretamente no conteúdo da nota.
- **Visualização**: O editor inclui uma seção de "Pré-visualização interativa" persistente logo abaixo da área de texto que exibe apenas os links, e-mails, CEPs e telefones detectados como chips clicáveis, facilitando o acesso rápido durante a edição. O modo Preview em tela cheia permite interagir com checklists, persistindo o estado automaticamente no banco.
- **Comunicação Móvel**: Números de telefone com 11 ou mais dígitos detectados nas notas são redirecionados automaticamente para o WhatsApp (https://wa.me/) em vez do discador padrão.
- **Integrações**: Suporta busca por palavras-chave, compartilhamento via WhatsApp e exportação para PDF formatado (via visualizador interno /visualizador).
- **Privacidade**: Protegido por políticas de RLS que garantem acesso exclusivo ao proprietário dos dados.
