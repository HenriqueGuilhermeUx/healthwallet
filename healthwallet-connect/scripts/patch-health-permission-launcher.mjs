import fs from 'node:fs'
import path from 'node:path'

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

const javaRoot = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'java')
const pluginPath = findFile(javaRoot, 'DirectHealthReaderPlugin.java')
if (!pluginPath) throw new Error('DirectHealthReaderPlugin.java not found; run patch-direct-health-reader.mjs first.')

let plugin = fs.readFileSync(pluginPath, 'utf8')
const packageMatch = plugin.match(/^package\s+([\w.]+);/m)
if (!packageMatch) throw new Error('Could not determine Android package from DirectHealthReaderPlugin.java')
const packageName = packageMatch[1]
const activityPath = path.join(path.dirname(pluginPath), 'HealthPermissionRequestActivity.java')

const activitySource = `package ${packageName};

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.health.connect.client.PermissionController;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Small proxy Activity whose only job is to use AndroidX's Activity Result API
 * exactly as documented by Health Connect. Creating the permission contract's
 * Intent manually and calling startActivity() is not equivalent on every OEM;
 * Samsung/Android 14 can route that path back to generic Health Connect UI.
 */
public class HealthPermissionRequestActivity extends ComponentActivity {
    private static final Set<String> FULL_READ_PERMISSIONS = new LinkedHashSet<>(Arrays.asList(
        "android.permission.health.READ_STEPS",
        "android.permission.health.READ_SLEEP",
        "android.permission.health.READ_HEART_RATE",
        "android.permission.health.READ_RESTING_HEART_RATE",
        "android.permission.health.READ_OXYGEN_SATURATION",
        "android.permission.health.READ_HEART_RATE_VARIABILITY",
        "android.permission.health.READ_BLOOD_PRESSURE",
        "android.permission.health.READ_WEIGHT",
        "android.permission.health.READ_ACTIVE_CALORIES_BURNED",
        "android.permission.health.READ_EXERCISE"
    ));

    private ActivityResultLauncher<Set<String>> permissionLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        permissionLauncher = registerForActivityResult(
            PermissionController.createRequestPermissionResultContract(),
            grantedPermissions -> {
                Intent result = new Intent();
                result.putStringArrayListExtra(
                    "granted_permissions",
                    new ArrayList<>(grantedPermissions)
                );
                setResult(Activity.RESULT_OK, result);
                finish();
            }
        );

        // Post until the Activity is attached. This avoids launching the
        // Health Connect sheet before ActivityResultRegistry is ready.
        getWindow().getDecorView().post(() -> permissionLauncher.launch(FULL_READ_PERMISSIONS));
    }
}
`

fs.writeFileSync(activityPath, activitySource)

const methodPattern = /    @PluginMethod\n    public void requestHealthPermissions\(PluginCall call\) \{[\s\S]*?\n    \}\n\n    @PluginMethod/
if (!methodPattern.test(plugin)) {
  throw new Error('Could not locate requestHealthPermissions in DirectHealthReaderPlugin.java')
}

const replacement = `    @PluginMethod
    public void requestHealthPermissions(PluginCall call) {
        try {
            Intent intent = new Intent(getActivity(), HealthPermissionRequestActivity.class);
            getActivity().startActivity(intent);

            JSObject result = new JSObject();
            result.put("launched", true);
            result.put("packageName", getContext().getPackageName());
            result.put("requestedPermissionCount", FULL_READ_PERMISSIONS.size());
            result.put("strategy", "activity_result_launcher_proxy");
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Não foi possível abrir a tela oficial de permissões do Health Connect: " + error.getMessage(), null, error);
        }
    }

    @PluginMethod`

plugin = plugin.replace(methodPattern, replacement)
fs.writeFileSync(pluginPath, plugin)

const manifestPath = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'AndroidManifest.xml')
if (!fs.existsSync(manifestPath)) throw new Error('AndroidManifest.xml not found')
let manifest = fs.readFileSync(manifestPath, 'utf8')
const activityMarker = 'android:name=".HealthPermissionRequestActivity"'
if (!manifest.includes(activityMarker)) {
  const block = `
        <activity
            android:name=".HealthPermissionRequestActivity"
            android:exported="false"
            android:excludeFromRecents="true"
            android:theme="@android:style/Theme.DeviceDefault.Light.NoActionBar" />`
  manifest = manifest.replace('</application>', `${block}\n    </application>`)
  fs.writeFileSync(manifestPath, manifest)
}

console.log('Health Connect permission request now uses a lifecycle-aware ActivityResultLauncher proxy Activity.')
