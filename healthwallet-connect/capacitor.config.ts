import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'br.com.healthwallet.connect',
  appName: 'HealthWallet Connect',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
