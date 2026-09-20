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
    // Apple-native QR bridge on iOS; ML Kit remains Android-only.
    includePlugins: ['@capacitor/app', '@capacitor/browser', '@capacitor/camera',
      '@capacitor/geolocation', '@capacitor/preferences', '@capacitor/status-bar',
      'capacitor-secure-storage-plugin'],
    backgroundColor: '#0f151d',
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
