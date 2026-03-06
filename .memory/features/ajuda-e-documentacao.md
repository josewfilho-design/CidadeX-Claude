# Memory: features/ajuda-e-documentacao
Updated: now

A página de ajuda (/ajuda) possui dois níveis de visibilidade:

**Usuário comum** vê apenas:
- Perguntas Frequentes (FAQ)

**Administrador** vê tudo:
- Arquitetura do Projeto (estrutura de pastas, stack, organização genérico vs específico)
- Termos de Uso e Política de Privacidade (LGPD)
- Funcionalidades do Aplicativo
- Perguntas Frequentes (FAQ)
- Botão "Forçar atualização" (limpa cache e service workers)
- Botões "Baixar PDF" / "Gerar PDF completo" (exporta documentação completa em PDF via jsPDF)

O controle de acesso usa o hook `useAdmin()` com `isAdmin` para renderização condicional. O README.md do repositório contém a documentação técnica completa da arquitetura.
