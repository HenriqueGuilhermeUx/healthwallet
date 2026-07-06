import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'br.com.healthwallet.app',
  appName: 'HealthWallet',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#059669',
      showSpinner: false,
    },
    Geolocation: {
      permissions: ['location'],
    },
  },
}

export default config
