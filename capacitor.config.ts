import type { CapacitorConfig } from '@capacitor/cli'

const isConnectTestVariant = process.env.HEALTHWALLET_TEST_VARIANT === 'true'

const config: CapacitorConfig = {
  appId: isConnectTestVariant ? 'br.com.healthwallet.app.connecttest' : 'br.com.healthwallet.app',
  appName: isConnectTestVariant ? 'HealthWallet Test' : 'HealthWallet',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#0891B2',
      showSpinner: false,
    },
    Geolocation: {
      permissions: ['location'],
    },
  },
}

export default config
