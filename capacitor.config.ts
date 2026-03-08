import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cidadex.br',
  appName: 'CidadeX',
  webDir: 'dist',
  server: {
    url: 'https://cidadex-br.com',
    cleartext: false,
  },
};

export default config;
