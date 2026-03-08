import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cidadex.br',
  appName: 'CidadeX',
  webDir: 'dist',
  server: {
    url: 'https://cidadex-br.com',
    cleartext: false,
  },
  android: {
    backgroundColor: '#ffffff',
  },
  plugins: {
    StatusBar: {
      style: 'DEFAULT',
      backgroundColor: '#ffffff',
      overlaysWebView: false,
    },
  },
};

export default config;
