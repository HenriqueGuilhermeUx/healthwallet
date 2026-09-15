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
const mainActivityPath = findFile(javaRoot, 'MainActivity.java')
if (!mainActivityPath) throw new Error('MainActivity.java not found; run cap sync android first.')

let mainActivity = fs.readFileSync(mainActivityPath, 'utf8')
const packageMatch = mainActivity.match(/^package\s+([\w.]+);/m)
if (!packageMatch) throw new Error('Could not determine Android package from MainActivity.java')
const packageName = packageMatch[1]
const pluginClass = 'DirectHealthReaderPlugin'
const pluginPath = path.join(path.dirname(mainActivityPath), `${pluginClass}.java`)

const source = `package ${packageName};

import android.content.Intent;
import android.content.pm.PackageManager;
import android.health.connect.AggregateRecordsRequest;
import android.health.connect.AggregateRecordsResponse;
import android.health.connect.HealthConnectException;
import android.health.connect.HealthConnectManager;
import android.health.connect.TimeInstantRangeFilter;
import android.health.connect.datatypes.StepsRecord;
import android.os.Build;
import android.os.OutcomeReceiver;
import android.os.ext.SdkExtensions;

import androidx.activity.result.contract.ActivityResultContract;
import androidx.health.connect.client.PermissionController;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "DirectHealthReader")
public class ${pluginClass} extends Plugin {
    private static final String READ_STEPS_PERMISSION = "android.permission.health.READ_STEPS";
    private static final String ACTION_MANAGE_HEALTH_PERMISSIONS = "android.health.connect.action.MANAGE_HEALTH_PERMISSIONS";

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

    private boolean isGranted(String permission) {
        return getContext().checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void checkHealthPermissions(PluginCall call) {
        JSArray granted = new JSArray();
        JSArray missing = new JSArray();

        for (String permission : FULL_READ_PERMISSIONS) {
            if (isGranted(permission)) granted.put(permission);
            else missing.put(permission);
        }

        JSObject result = new JSObject();
        result.put("packageName", getContext().getPackageName());
        result.put("grantedPermissions", granted);
        result.put("missingPermissions", missing);
        result.put("allGranted", missing.length() == 0);
        result.put("requestedPermissionCount", FULL_READ_PERMISSIONS.size());
        call.resolve(result);
    }

    @PluginMethod
    public void requestHealthPermissions(PluginCall call) {
        try {
            ActivityResultContract<Set<String>, Set<String>> contract =
                PermissionController.createRequestPermissionResultContract();
            Intent intent = contract.createIntent(getActivity(), FULL_READ_PERMISSIONS);

            if (intent.resolveActivity(getContext().getPackageManager()) == null) {
                call.reject("O Android não encontrou a tela oficial de permissões do Health Connect.");
                return;
            }

            getActivity().startActivity(intent);

            JSObject result = new JSObject();
            result.put("launched", true);
            result.put("packageName", getContext().getPackageName());
            result.put("requestedPermissionCount", FULL_READ_PERMISSIONS.size());
            result.put("strategy", "platform_permission_controller_contract");
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Não foi possível abrir o pedido oficial de permissão do Health Connect: " + error.getMessage(), null, error);
        }
    }

    // Compatibility methods retained while the Connect UI migrates to the full profile flow.
    @PluginMethod
    public void checkStepsPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("permission", READ_STEPS_PERMISSION);
        result.put("granted", isGranted(READ_STEPS_PERMISSION));
        result.put("packageName", getContext().getPackageName());
        call.resolve(result);
    }

    @PluginMethod
    public void requestStepsPermission(PluginCall call) {
        requestHealthPermissions(call);
    }

    @PluginMethod
    public void openStepsPermissionSettings(PluginCall call) {
        try {
            Intent intent = new Intent(ACTION_MANAGE_HEALTH_PERMISSIONS);
            intent.putExtra(Intent.EXTRA_PACKAGE_NAME, getContext().getPackageName());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            if (intent.resolveActivity(getContext().getPackageManager()) == null) {
                call.reject("A tela de permissões do Health Connect não está disponível neste aparelho.");
                return;
            }

            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("opened", true);
            result.put("packageName", getContext().getPackageName());
            result.put("permission", READ_STEPS_PERMISSION);
            result.put("strategy", "manage_health_permissions_fallback");
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Não foi possível abrir as permissões do Health Connect: " + error.getMessage(), null, error);
        }
    }

    @PluginMethod
    public void readStepsDaily(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            call.reject("Direct Health Connect reader requires Android 14 or newer.");
            return;
        }

        if (!isGranted(READ_STEPS_PERMISSION)) {
            call.reject("READ_STEPS_NOT_GRANTED");
            return;
        }

        int extension = SdkExtensions.getExtensionVersion(Build.VERSION_CODES.UPSIDE_DOWN_CAKE);
        if (extension < 7) {
            call.reject("Health Connect platform extension is too old: " + extension);
            return;
        }

        HealthConnectManager manager = getContext().getSystemService(HealthConnectManager.class);
        if (manager == null) {
            call.reject("Android HealthConnectManager service is unavailable.");
            return;
        }

        Integer requested = call.getInt("days");
        int days = requested == null ? 7 : Math.max(1, Math.min(30, requested));
        JSArray rows = new JSArray();
        ExecutorService executor = Executors.newSingleThreadExecutor();
        readDay(call, manager, executor, days, 0, rows);
    }

    private void readDay(
        PluginCall call,
        HealthConnectManager manager,
        ExecutorService executor,
        int days,
        int index,
        JSArray rows
    ) {
        if (index >= days) {
            executor.shutdown();
            JSObject result = new JSObject();
            result.put("reader", "android_platform_health_connect");
            result.put("daysRequested", days);
            result.put("days", rows);
            call.resolve(result);
            return;
        }

        ZoneId zone = ZoneId.systemDefault();
        LocalDate date = LocalDate.now(zone).minusDays(days - 1L - index);
        Instant start = date.atStartOfDay(zone).toInstant();
        Instant end = date.plusDays(1).atStartOfDay(zone).toInstant();
        Instant now = Instant.now();
        if (end.isAfter(now)) end = now;

        TimeInstantRangeFilter filter = new TimeInstantRangeFilter.Builder()
            .setStartTime(start)
            .setEndTime(end)
            .build();

        AggregateRecordsRequest<Long> request = new AggregateRecordsRequest.Builder<Long>(filter)
            .addAggregationType(StepsRecord.STEPS_COUNT_TOTAL)
            .build();

        manager.aggregate(
            request,
            executor,
            new OutcomeReceiver<AggregateRecordsResponse<Long>, HealthConnectException>() {
                @Override
                public void onResult(AggregateRecordsResponse<Long> response) {
                    Long total = response.get(StepsRecord.STEPS_COUNT_TOTAL);
                    JSObject row = new JSObject();
                    row.put("date", date.toString());
                    row.put("steps", total == null ? 0L : total);
                    rows.put(row);
                    readDay(call, manager, executor, days, index + 1, rows);
                }

                @Override
                public void onError(HealthConnectException error) {
                    executor.shutdown();
                    call.reject(
                        "Direct Android Health Connect read failed: " + error.getMessage(),
                        String.valueOf(error.getErrorCode()),
                        error
                    );
                }
            }
        );
    }
}
`

fs.writeFileSync(pluginPath, source)

const appGradlePath = path.join(process.cwd(), 'android', 'app', 'build.gradle')
if (fs.existsSync(appGradlePath)) {
  let appGradle = fs.readFileSync(appGradlePath, 'utf8')
  if (!appGradle.includes('androidx.health.connect:connect-client:1.1.0')) {
    appGradle = appGradle.replace(
      /dependencies\s*\{/,
      'dependencies {\n    implementation "androidx.health.connect:connect-client:1.1.0"',
    )
    fs.writeFileSync(appGradlePath, appGradle)
  }
}

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
    if (!classPattern.test(mainActivity)) throw new Error('Could not patch MainActivity for DirectHealthReader.')
    mainActivity = mainActivity.replace(
      classPattern,
      `$1\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(${pluginClass}.class);\n        super.onCreate(savedInstanceState);\n    }`,
    )
  }
  fs.writeFileSync(mainActivityPath, mainActivity)
}

console.log('DirectHealthReader registered with platform Health Connect permission sheet for the full read-only profile, settings fallback, and direct steps reader.')
await import('./patch-full-health-reader.mjs')
