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

import android.health.connect.AggregateRecordsRequest;
import android.health.connect.AggregateRecordsResponse;
import android.health.connect.HealthConnectException;
import android.health.connect.HealthConnectManager;
import android.health.connect.TimeInstantRangeFilter;
import android.health.connect.datatypes.StepsRecord;
import android.os.Build;
import android.os.OutcomeReceiver;
import android.os.ext.SdkExtensions;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "DirectHealthReader")
public class ${pluginClass} extends Plugin {
    @PluginMethod
    public void readStepsDaily(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            call.reject("Direct Health Connect reader requires Android 14 or newer.");
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

console.log('DirectHealthReader registered using Android platform HealthConnectManager API.')
