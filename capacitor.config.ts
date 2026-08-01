import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.lxuan.ntou_tat',
  appName: '海大 TAT',
  webDir: 'dist',
  bundledWebRuntime: false,
  loggingBehavior: 'none',
  android: {
    backgroundColor: '#f7f9f8',
  },
  ios: {
    backgroundColor: '#f7f9f8',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    CapacitorCookies: {
      enabled: true,
    },
  },
}

export default config
