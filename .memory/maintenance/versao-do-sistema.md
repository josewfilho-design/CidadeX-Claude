# Memory: maintenance/versao-do-sistema
Updated: now

O gerenciamento de versão é centralizado em src/config/version.ts e public/version.json. A versão atual do sistema é 1.5.5 (03/03/2026). Para garantir atualizações em todos os dispositivos, o sistema utiliza uma detecção em três camadas: estado 'waiting' do Service Worker, comando reg.update() e um fallback de busca de version.json com cache-busting. Caso uma nova versão seja detectada, o sistema limpa todos os caches do navegador e força o recarregamento da página. A partir da v1.5.5, a edge function generate-recurring é executada automaticamente via cron job (pg_cron) todo dia 1 de cada mês às 06:00 UTC.
