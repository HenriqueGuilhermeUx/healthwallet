import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const handoffPath = path.join(root, 'src', 'services', 'handoff.ts')

if (!fs.existsSync(handoffPath)) {
  throw new Error('healthwallet-connect/src/services/handoff.ts not found')
}

let source = fs.readFileSync(handoffPath, 'utf8')

source = source.replace(
  "import { Capacitor } from '@capacitor/core'",
  "import { Capacitor, registerPlugin } from '@capacitor/core'",
)

const oldMetricsForPlatform = `function metricsForPlatform(metrics: HealthMetric[]) {
  const unique = Array.from(new Set(metrics))

  // Capgo Health v8 intentionally does not expose exerciseTime as an Android
  // HealthDataType. Health Connect represents exercise as workout sessions
  // instead. Keep exerciseTime for the future iOS path, but never send it to
  // Android requestAuthorization/readSamples where it would be rejected.
  if (Capacitor.getPlatform() === 'android') {
    return unique.filter((metric) => metric !== 'exerciseTime')
  }

  return unique
}`

const newMetricsForPlatform = `function metricsForPlatform(metrics: HealthMetric[]) {
  // The full-native Android reader supports all HealthWallet Connect metrics,
  // including exercise sessions mapped to activity minutes.
  return Array.from(new Set(metrics))
}`

if (source.includes(oldMetricsForPlatform)) {
  source = source.replace(oldMetricsForPlatform, newMetricsForPlatform)
}

const protocolMarker = "const DEFAULT_RETURN_PROTOCOL = 'healthwallet:'"
const launcherDefinition = `const DEFAULT_RETURN_PROTOCOL = 'healthwallet:'

type NativeHealthWalletReturnLauncherPlugin = {
  open(options: { url: string }): Promise<{ completed: boolean; packageName?: string }>
}

const NativeHealthWalletReturnLauncher = registerPlugin<NativeHealthWalletReturnLauncherPlugin>('HealthWalletReturnLauncher')`

if (!source.includes('NativeHealthWalletReturnLauncherPlugin')) {
  source = source.replace(protocolMarker, launcherDefinition)
}

const oldNativeReturn = `    if (Capacitor.isNativePlatform()) {
      const opened = await AppLauncher.openUrl({ url: target })
      return opened.completed
    }

    window.location.assign(target)
    return true`

const newNativeReturn = `    if (Capacitor.getPlatform() === 'android') {
      try {
        const opened = await NativeHealthWalletReturnLauncher.open({ url: target })
        if (opened?.completed) return true
      } catch (error) {
        console.warn('Targeted HealthWallet return failed; trying generic deep link.', error)
      }
    }

    if (Capacitor.isNativePlatform()) {
      const opened = await AppLauncher.openUrl({ url: target })
      return opened.completed
    }

    window.location.assign(target)
    return true`

if (source.includes(oldNativeReturn)) {
  source = source.replace(oldNativeReturn, newNativeReturn)
}

if (!source.includes('NativeHealthWalletReturnLauncher.open')) {
  throw new Error('Could not patch targeted HealthWallet return flow in handoff.ts')
}

if (!source.includes('return Array.from(new Set(metrics))')) {
  throw new Error('Could not enable full native Android metric handoff')
}

fs.writeFileSync(handoffPath, source)

function findFile(rootDir, filename) {
  if (!fs.existsSync(rootDir)) return null
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const full = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      const nested = findFile(full, filename)
      if (nested) return nested
    } else if (entry.name === filename) {
      return full
    }
  }
  return null
}

const androidRoot = path.join(root, 'android')
if (!fs.existsSync(androidRoot)) {
  console.log('Patched Connect web return flow. Android project not generated yet; native launcher patch deferred.')
  process.exit(0)
}

const javaRoot = path.join(androidRoot, 'app', 'src', 'main', 'java')
const mainActivityPath = findFile(javaRoot, 'MainActivity.java')
if (!mainActivityPath) throw new Error('MainActivity.java not found while patching HealthWallet return launcher')

let mainActivity = fs.readFileSync(mainActivityPath, 'utf8')
const packageMatch = mainActivity.match(/^package\s+([\w.]+);/m)
if (!packageMatch) throw new Error('Could not determine Connect MainActivity Java package')

const packageName = packageMatch[1]
const pluginClass = 'HealthWalletReturnLauncherPlugin'
const pluginPath = path.join(path.dirname(mainActivityPath), `${pluginClass}.java`)

const pluginSource = `package ${packageName};

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HealthWalletReturnLauncher")
public class ${pluginClass} extends Plugin {
    private static final String[] HEALTHWALLET_PACKAGES = new String[] {
        "br.com.healthwallet.app.connecttest",
        "br.com.healthwallet.app"
    };

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("Missing HealthWallet return URL");
            return;
        }

        for (String targetPackage : HEALTHWALLET_PACKAGES) {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.setPackage(targetPackage);
                intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                getActivity().startActivity(intent);

                JSObject result = new JSObject();
                result.put("completed", true);
                result.put("packageName", targetPackage);
                call.resolve(result);
                return;
            } catch (ActivityNotFoundException ignored) {
                // Try the next HealthWallet package id.
            }
        }

        try {
            Intent fallback = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            fallback.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            getActivity().startActivity(fallback);

            JSObject result = new JSObject();
            result.put("completed", true);
            result.put("packageName", "generic");
            call.resolve(result);
        } catch (Exception error) {
            call.reject("HealthWallet is not installed or cannot handle the return link", error);
        }
    }
}
`

fs.writeFileSync(pluginPath, pluginSource)

if (!mainActivity.includes(`${pluginClass}.class`)) {
  if (mainActivity.includes('super.onCreate(savedInstanceState);')) {
    mainActivity = mainActivity.replace(
      'super.onCreate(savedInstanceState);',
      `registerPlugin(${pluginClass}.class);\n        super.onCreate(savedInstanceState);`,
    )
  } else {
    if (!mainActivity.includes('import android.os.Bundle;')) {
      mainActivity = mainActivity.replace(/(package\s+[\w.]+;\s*)/, '$1\nimport android.os.Bundle;\n')
    }

    const classPattern = /(public\s+class\s+MainActivity\s+extends\s+BridgeActivity\s*\{)/
    if (!classPattern.test(mainActivity)) {
      throw new Error('Could not register HealthWalletReturnLauncherPlugin in MainActivity')
    }

    mainActivity = mainActivity.replace(
      classPattern,
      `$1\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(${pluginClass}.class);\n        super.onCreate(savedInstanceState);\n    }`,
    )
  }

  fs.writeFileSync(mainActivityPath, mainActivity)
}

const manifestPath = path.join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml')
if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8')
  const packageQueries = [
    '        <package android:name="br.com.healthwallet.app.connecttest" />',
    '        <package android:name="br.com.healthwallet.app" />',
  ]

  for (const query of packageQueries) {
    if (manifest.includes(query.trim())) continue
    if (manifest.includes('</queries>')) {
      manifest = manifest.replace('</queries>', `${query}\n    </queries>`)
    } else {
      manifest = manifest.replace(/\s*<application/, `\n    <queries>\n${query}\n    </queries>\n\n    <application`)
    }
  }

  fs.writeFileSync(manifestPath, manifest)
}

console.log('HealthWallet Connect return launcher patched: test package first, production package second, generic deep-link fallback last. Full native metric handoff enabled.')
