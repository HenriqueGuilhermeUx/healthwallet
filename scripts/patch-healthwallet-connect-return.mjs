import fs from 'node:fs'
import path from 'node:path'

const manifestPath = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'AndroidManifest.xml')

if (!fs.existsSync(manifestPath)) {
  throw new Error('AndroidManifest.xml not found. Run cap sync android before patching HealthWallet Connect return URL.')
}

function ensureSchemeQuery(content, scheme) {
  const marker = `<data android:scheme="${scheme}" />`
  if (content.includes(marker)) return content

  const intent = `        <intent>\n            <action android:name="android.intent.action.VIEW" />\n            ${marker}\n        </intent>`

  if (content.includes('</queries>')) {
    return content.replace('</queries>', `${intent}\n    </queries>`)
  }

  const queries = `    <queries>\n${intent}\n    </queries>\n\n`
  return content.replace(/\s*<application/, `\n${queries}    <application`)
}

function ensurePackageQuery(content, packageName) {
  const marker = `<package android:name="${packageName}" />`
  if (content.includes(marker)) return content

  if (content.includes('</queries>')) {
    return content.replace('</queries>', `        ${marker}\n    </queries>`)
  }

  const queries = `    <queries>\n        ${marker}\n    </queries>\n\n`
  return content.replace(/\s*<application/, `\n${queries}    <application`)
}

function findFile(root, filename) {
  if (!fs.existsSync(root)) return null
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) {
      const nested = findFile(full, filename)
      if (nested) return nested
    } else if (entry.name === filename) {
      return full
    }
  }
  return null
}

function installTargetedLauncherPlugin() {
  const javaRoot = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'java')
  const mainActivityPath = findFile(javaRoot, 'MainActivity.java')
  if (!mainActivityPath) {
    console.log('MainActivity.java not found; skipping targeted launcher plugin patch.')
    return
  }

  let mainActivity = fs.readFileSync(mainActivityPath, 'utf8')
  const packageMatch = mainActivity.match(/^package\s+([\w.]+);/m)
  if (!packageMatch) throw new Error('Could not determine MainActivity Java package.')

  const packageName = packageMatch[1]
  const pluginClass = 'HealthWalletConnectLauncherPlugin'
  const pluginPath = path.join(path.dirname(mainActivityPath), `${pluginClass}.java`)

  const pluginSource = `package ${packageName};

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HealthWalletConnectLauncher")
public class ${pluginClass} extends Plugin {
    private static final String CONNECT_PACKAGE = "br.com.healthwallet.connect";
    private static final String PLAY_STORE_PACKAGE = "com.android.vending";
    private static final String PLAY_STORE_WEB_URL = "https://play.google.com/store/apps/details?id=" + CONNECT_PACKAGE;

    @PluginMethod
    public void isInstalled(PluginCall call) {
        JSObject result = new JSObject();
        try {
            getContext().getPackageManager().getPackageInfo(CONNECT_PACKAGE, 0);
            result.put("installed", true);
        } catch (PackageManager.NameNotFoundException error) {
            result.put("installed", false);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void openStore(PluginCall call) {
        try {
            Intent marketIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + CONNECT_PACKAGE));
            marketIntent.setPackage(PLAY_STORE_PACKAGE);
            getActivity().startActivity(marketIntent);

            JSObject result = new JSObject();
            result.put("completed", true);
            call.resolve(result);
        } catch (ActivityNotFoundException marketMissing) {
            try {
                Intent webIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(PLAY_STORE_WEB_URL));
                getActivity().startActivity(webIntent);

                JSObject result = new JSObject();
                result.put("completed", true);
                call.resolve(result);
            } catch (Exception webError) {
                call.reject("Could not open HealthWallet Connect in Google Play", webError);
            }
        } catch (Exception error) {
            call.reject("Could not open HealthWallet Connect in Google Play", error);
        }
    }

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("Missing HealthWallet Connect URL");
            return;
        }

        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.setPackage(CONNECT_PACKAGE);
            getActivity().startActivity(intent);

            JSObject result = new JSObject();
            result.put("completed", true);
            call.resolve(result);
        } catch (ActivityNotFoundException error) {
            call.reject("HealthWallet Connect is not installed");
        } catch (Exception error) {
            call.reject("Could not open HealthWallet Connect", error);
        }
    }
}
`

  fs.writeFileSync(pluginPath, pluginSource)

  if (!mainActivity.includes(`${pluginClass}.class`)) {
    if (!mainActivity.includes('import android.os.Bundle;')) {
      mainActivity = mainActivity.replace(/(package\s+[\w.]+;\s*)/, '$1\nimport android.os.Bundle;\n')
    }

    if (mainActivity.includes('super.onCreate(savedInstanceState);')) {
      mainActivity = mainActivity.replace(
        'super.onCreate(savedInstanceState);',
        `registerPlugin(${pluginClass}.class);\n        super.onCreate(savedInstanceState);`,
      )
    } else {
      const classPattern = /(public\s+class\s+MainActivity\s+extends\s+BridgeActivity\s*\{)/
      if (!classPattern.test(mainActivity)) {
        throw new Error('Could not patch MainActivity with targeted HealthWallet Connect launcher.')
      }
      mainActivity = mainActivity.replace(
        classPattern,
        `$1\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(${pluginClass}.class);\n        super.onCreate(savedInstanceState);\n    }`,
      )
    }

    fs.writeFileSync(mainActivityPath, mainActivity)
  }

  console.log('Targeted Android launcher registered for br.com.healthwallet.connect with Google Play fallback.')
}

let manifest = fs.readFileSync(manifestPath, 'utf8')

if (!manifest.includes('android:scheme="healthwallet"')) {
  const intentFilter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="healthwallet" android:host="connect-complete" />
            </intent-filter>`

  const mainActivity = /(<activity\b[^>]*android:name=["']\.MainActivity["'][^>]*>)([\s\S]*?)(<\/activity>)/
  if (!mainActivity.test(manifest)) {
    throw new Error('Could not find MainActivity while registering HealthWallet Connect return deep link.')
  }

  manifest = manifest.replace(mainActivity, (_match, open, body, close) => `${open}${body}${intentFilter}\n        ${close}`)
}

manifest = ensureSchemeQuery(manifest, 'healthwallet-connect')
manifest = ensurePackageQuery(manifest, 'br.com.healthwallet.connect')
fs.writeFileSync(manifestPath, manifest)
installTargetedLauncherPlugin()

console.log('HealthWallet Connect return deep link registered: healthwallet://connect-complete; launch target query: healthwallet-connect://; package visibility + Google Play fallback enabled.')
