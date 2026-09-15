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
if (!pluginPath) throw new Error('DirectHealthReaderPlugin.java not found')

let source = fs.readFileSync(pluginPath, 'utf8')
if (source.includes('public void readHealthDaily(PluginCall call)')) {
  console.log('Full native health reader already installed.')
  process.exit(0)
}

const extraImports = `
import android.health.connect.AggregateRecordsGroupedByPeriodResponse;
import android.health.connect.LocalTimeRangeFilter;
import android.health.connect.ReadRecordsRequestUsingFilters;
import android.health.connect.ReadRecordsResponse;
import android.health.connect.datatypes.ActiveCaloriesBurnedRecord;
import android.health.connect.datatypes.AggregationType;
import android.health.connect.datatypes.BloodPressureRecord;
import android.health.connect.datatypes.ExerciseSessionRecord;
import android.health.connect.datatypes.HeartRateRecord;
import android.health.connect.datatypes.HeartRateVariabilityRmssdRecord;
import android.health.connect.datatypes.OxygenSaturationRecord;
import android.health.connect.datatypes.RestingHeartRateRecord;
import android.health.connect.datatypes.SleepSessionRecord;
import android.health.connect.datatypes.WeightRecord;
import android.health.connect.datatypes.units.Energy;
import android.health.connect.datatypes.units.Mass;

import java.time.LocalDateTime;
import java.time.Period;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
`

const importMarker = 'import java.util.concurrent.Executors;'
if (!source.includes(importMarker)) throw new Error('Could not locate import marker in DirectHealthReaderPlugin.java')
source = source.replace(importMarker, `${importMarker}${extraImports}`)

const fullReaderMethods = `
    private interface MetricCallback {
        void complete(String metric, String error);
    }

    @PluginMethod
    public void readHealthDaily(PluginCall call) {
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

        Integer requestedDays = call.getInt("days");
        int days = requestedDays == null ? 30 : Math.max(1, Math.min(30, requestedDays));
        JSArray metricArray = call.getArray("metrics");
        Set<String> requestedMetrics = new LinkedHashSet<>();
        if (metricArray != null) {
            for (int i = 0; i < metricArray.length(); i++) {
                String metric = metricArray.optString(i, "");
                if (!metric.isEmpty() && isSupportedMetric(metric)) requestedMetrics.add(metric);
            }
        }
        if (requestedMetrics.isEmpty()) requestedMetrics.add("steps");

        Set<String> runnableMetrics = new LinkedHashSet<>();
        Map<String, String> metricErrors = Collections.synchronizedMap(new LinkedHashMap<>());
        for (String metric : requestedMetrics) {
            String permission = permissionForMetric(metric);
            if (permission != null && isGranted(permission)) runnableMetrics.add(metric);
            else metricErrors.put(metric, "PERMISSION_NOT_GRANTED");
        }

        Map<String, Map<String, Double>> rows = new ConcurrentHashMap<>();
        ZoneId zone = ZoneId.systemDefault();
        LocalDate today = LocalDate.now(zone);
        for (int i = 0; i < days; i++) {
            LocalDate date = today.minusDays(days - 1L - i);
            rows.put(date.toString(), new ConcurrentHashMap<>());
        }

        if (runnableMetrics.isEmpty()) {
            finishFullRead(call, days, rows, Collections.emptySet(), metricErrors);
            return;
        }

        ExecutorService executor = Executors.newFixedThreadPool(Math.min(4, runnableMetrics.size()));
        AtomicInteger remaining = new AtomicInteger(runnableMetrics.size());
        Set<String> metricsRead = Collections.synchronizedSet(new LinkedHashSet<>());

        MetricCallback callback = (metric, error) -> {
            if (error == null) metricsRead.add(metric);
            else metricErrors.put(metric, error);

            if (remaining.decrementAndGet() == 0) {
                executor.shutdown();
                finishFullRead(call, days, rows, metricsRead, metricErrors);
            }
        };

        for (String metric : runnableMetrics) {
            switch (metric) {
                case "steps":
                    aggregateLongDaily(manager, executor, days, StepsRecord.STEPS_COUNT_TOTAL, "steps", 1.0, metric, rows, callback);
                    break;
                case "sleep":
                    aggregateLongDaily(manager, executor, days, SleepSessionRecord.SLEEP_DURATION_TOTAL, "sleepMinutes", 60000.0, metric, rows, callback);
                    break;
                case "heartRate":
                    aggregateLongDaily(manager, executor, days, HeartRateRecord.BPM_AVG, "avgHeartRate", 1.0, metric, rows, callback);
                    break;
                case "restingHeartRate":
                    aggregateLongDaily(manager, executor, days, RestingHeartRateRecord.BPM_AVG, "restingHeartRate", 1.0, metric, rows, callback);
                    break;
                case "weight":
                    aggregateMassDaily(manager, executor, days, WeightRecord.WEIGHT_AVG, "weightKg", metric, rows, callback);
                    break;
                case "calories":
                    aggregateEnergyDaily(manager, executor, days, ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL, "activeCalories", metric, rows, callback);
                    break;
                case "exerciseTime":
                    aggregateLongDaily(manager, executor, days, ExerciseSessionRecord.EXERCISE_DURATION_TOTAL, "activityMinutes", 60000.0, metric, rows, callback);
                    break;
                case "oxygenSaturation":
                    readOxygenDaily(manager, executor, days, rows, callback);
                    break;
                case "heartRateVariability":
                    readHrvDaily(manager, executor, days, rows, callback);
                    break;
                case "bloodPressure":
                    readBloodPressureDaily(manager, executor, days, rows, callback);
                    break;
                default:
                    callback.complete(metric, "UNSUPPORTED_METRIC");
                    break;
            }
        }
    }

    private boolean isSupportedMetric(String metric) {
        switch (metric) {
            case "steps":
            case "sleep":
            case "heartRate":
            case "restingHeartRate":
            case "oxygenSaturation":
            case "heartRateVariability":
            case "bloodPressure":
            case "weight":
            case "calories":
            case "exerciseTime":
                return true;
            default:
                return false;
        }
    }

    private String permissionForMetric(String metric) {
        switch (metric) {
            case "steps": return "android.permission.health.READ_STEPS";
            case "sleep": return "android.permission.health.READ_SLEEP";
            case "heartRate": return "android.permission.health.READ_HEART_RATE";
            case "restingHeartRate": return "android.permission.health.READ_RESTING_HEART_RATE";
            case "oxygenSaturation": return "android.permission.health.READ_OXYGEN_SATURATION";
            case "heartRateVariability": return "android.permission.health.READ_HEART_RATE_VARIABILITY";
            case "bloodPressure": return "android.permission.health.READ_BLOOD_PRESSURE";
            case "weight": return "android.permission.health.READ_WEIGHT";
            case "calories": return "android.permission.health.READ_ACTIVE_CALORIES_BURNED";
            case "exerciseTime": return "android.permission.health.READ_EXERCISE";
            default: return null;
        }
    }

    private LocalTimeRangeFilter localRange(int days) {
        ZoneId zone = ZoneId.systemDefault();
        LocalDate today = LocalDate.now(zone);
        LocalDateTime start = today.minusDays(days - 1L).atStartOfDay();
        LocalDateTime end = LocalDateTime.now(zone);
        return new LocalTimeRangeFilter.Builder().setStartTime(start).setEndTime(end).build();
    }

    private TimeInstantRangeFilter instantRange(int days) {
        ZoneId zone = ZoneId.systemDefault();
        LocalDate today = LocalDate.now(zone);
        Instant start = today.minusDays(days - 1L).atStartOfDay(zone).toInstant();
        return new TimeInstantRangeFilter.Builder().setStartTime(start).setEndTime(Instant.now()).build();
    }

    private void putValue(Map<String, Map<String, Double>> rows, String date, String field, double value) {
        Map<String, Double> row = rows.get(date);
        if (row != null && !Double.isNaN(value) && !Double.isInfinite(value)) row.put(field, value);
    }

    private void aggregateLongDaily(
        HealthConnectManager manager,
        ExecutorService executor,
        int days,
        AggregationType<Long> type,
        String field,
        double divisor,
        String metric,
        Map<String, Map<String, Double>> rows,
        MetricCallback callback
    ) {
        try {
            AggregateRecordsRequest<Long> request = new AggregateRecordsRequest.Builder<Long>(localRange(days))
                .addAggregationType(type)
                .build();

            manager.aggregateGroupByPeriod(
                request,
                Period.ofDays(1),
                executor,
                new OutcomeReceiver<List<AggregateRecordsGroupedByPeriodResponse<Long>>, HealthConnectException>() {
                    @Override
                    public void onResult(List<AggregateRecordsGroupedByPeriodResponse<Long>> response) {
                        for (AggregateRecordsGroupedByPeriodResponse<Long> bucket : response) {
                            Long value = bucket.get(type);
                            if (value != null) putValue(rows, bucket.getStartTime().toLocalDate().toString(), field, value.doubleValue() / divisor);
                        }
                        callback.complete(metric, null);
                    }

                    @Override
                    public void onError(HealthConnectException error) {
                        callback.complete(metric, "HC_" + error.getErrorCode() + ": " + String.valueOf(error.getMessage()));
                    }
                }
            );
        } catch (Exception error) {
            callback.complete(metric, error.getClass().getSimpleName() + ": " + String.valueOf(error.getMessage()));
        }
    }

    private void aggregateMassDaily(
        HealthConnectManager manager,
        ExecutorService executor,
        int days,
        AggregationType<Mass> type,
        String field,
        String metric,
        Map<String, Map<String, Double>> rows,
        MetricCallback callback
    ) {
        try {
            AggregateRecordsRequest<Mass> request = new AggregateRecordsRequest.Builder<Mass>(localRange(days))
                .addAggregationType(type)
                .build();
            manager.aggregateGroupByPeriod(
                request,
                Period.ofDays(1),
                executor,
                new OutcomeReceiver<List<AggregateRecordsGroupedByPeriodResponse<Mass>>, HealthConnectException>() {
                    @Override
                    public void onResult(List<AggregateRecordsGroupedByPeriodResponse<Mass>> response) {
                        for (AggregateRecordsGroupedByPeriodResponse<Mass> bucket : response) {
                            Mass value = bucket.get(type);
                            if (value != null) putValue(rows, bucket.getStartTime().toLocalDate().toString(), field, value.getInGrams() / 1000.0);
                        }
                        callback.complete(metric, null);
                    }

                    @Override
                    public void onError(HealthConnectException error) {
                        callback.complete(metric, "HC_" + error.getErrorCode() + ": " + String.valueOf(error.getMessage()));
                    }
                }
            );
        } catch (Exception error) {
            callback.complete(metric, error.getClass().getSimpleName() + ": " + String.valueOf(error.getMessage()));
        }
    }

    private void aggregateEnergyDaily(
        HealthConnectManager manager,
        ExecutorService executor,
        int days,
        AggregationType<Energy> type,
        String field,
        String metric,
        Map<String, Map<String, Double>> rows,
        MetricCallback callback
    ) {
        try {
            AggregateRecordsRequest<Energy> request = new AggregateRecordsRequest.Builder<Energy>(localRange(days))
                .addAggregationType(type)
                .build();
            manager.aggregateGroupByPeriod(
                request,
                Period.ofDays(1),
                executor,
                new OutcomeReceiver<List<AggregateRecordsGroupedByPeriodResponse<Energy>>, HealthConnectException>() {
                    @Override
                    public void onResult(List<AggregateRecordsGroupedByPeriodResponse<Energy>> response) {
                        for (AggregateRecordsGroupedByPeriodResponse<Energy> bucket : response) {
                            Energy value = bucket.get(type);
                            // Platform Energy exposes physical calories. HealthWallet stores kcal.
                            if (value != null) putValue(rows, bucket.getStartTime().toLocalDate().toString(), field, value.getInCalories() / 1000.0);
                        }
                        callback.complete(metric, null);
                    }

                    @Override
                    public void onError(HealthConnectException error) {
                        callback.complete(metric, "HC_" + error.getErrorCode() + ": " + String.valueOf(error.getMessage()));
                    }
                }
            );
        } catch (Exception error) {
            callback.complete(metric, error.getClass().getSimpleName() + ": " + String.valueOf(error.getMessage()));
        }
    }

    private void readOxygenDaily(
        HealthConnectManager manager,
        ExecutorService executor,
        int days,
        Map<String, Map<String, Double>> rows,
        MetricCallback callback
    ) {
        try {
            ReadRecordsRequestUsingFilters<OxygenSaturationRecord> request =
                new ReadRecordsRequestUsingFilters.Builder<OxygenSaturationRecord>(OxygenSaturationRecord.class)
                    .setTimeRangeFilter(instantRange(days))
                    .setPageSize(5000)
                    .build();
            manager.readRecords(request, executor, new OutcomeReceiver<ReadRecordsResponse<OxygenSaturationRecord>, HealthConnectException>() {
                @Override
                public void onResult(ReadRecordsResponse<OxygenSaturationRecord> response) {
                    Map<String, double[]> accum = new LinkedHashMap<>();
                    ZoneId zone = ZoneId.systemDefault();
                    for (OxygenSaturationRecord record : response.getRecords()) {
                        String date = record.getTime().atZone(zone).toLocalDate().toString();
                        double[] pair = accum.computeIfAbsent(date, key -> new double[] {0.0, 0.0});
                        pair[0] += record.getPercentage().getValue();
                        pair[1] += 1.0;
                    }
                    for (Map.Entry<String, double[]> entry : accum.entrySet()) {
                        double[] pair = entry.getValue();
                        if (pair[1] > 0) putValue(rows, entry.getKey(), "spo2Avg", pair[0] / pair[1]);
                    }
                    callback.complete("oxygenSaturation", null);
                }

                @Override
                public void onError(HealthConnectException error) {
                    callback.complete("oxygenSaturation", "HC_" + error.getErrorCode() + ": " + String.valueOf(error.getMessage()));
                }
            });
        } catch (Exception error) {
            callback.complete("oxygenSaturation", error.getClass().getSimpleName() + ": " + String.valueOf(error.getMessage()));
        }
    }

    private void readHrvDaily(
        HealthConnectManager manager,
        ExecutorService executor,
        int days,
        Map<String, Map<String, Double>> rows,
        MetricCallback callback
    ) {
        try {
            ReadRecordsRequestUsingFilters<HeartRateVariabilityRmssdRecord> request =
                new ReadRecordsRequestUsingFilters.Builder<HeartRateVariabilityRmssdRecord>(HeartRateVariabilityRmssdRecord.class)
                    .setTimeRangeFilter(instantRange(days))
                    .setPageSize(5000)
                    .build();
            manager.readRecords(request, executor, new OutcomeReceiver<ReadRecordsResponse<HeartRateVariabilityRmssdRecord>, HealthConnectException>() {
                @Override
                public void onResult(ReadRecordsResponse<HeartRateVariabilityRmssdRecord> response) {
                    Map<String, double[]> accum = new LinkedHashMap<>();
                    ZoneId zone = ZoneId.systemDefault();
                    for (HeartRateVariabilityRmssdRecord record : response.getRecords()) {
                        String date = record.getTime().atZone(zone).toLocalDate().toString();
                        double[] pair = accum.computeIfAbsent(date, key -> new double[] {0.0, 0.0});
                        pair[0] += record.getHeartRateVariabilityMillis();
                        pair[1] += 1.0;
                    }
                    for (Map.Entry<String, double[]> entry : accum.entrySet()) {
                        double[] pair = entry.getValue();
                        if (pair[1] > 0) putValue(rows, entry.getKey(), "hrvAvg", pair[0] / pair[1]);
                    }
                    callback.complete("heartRateVariability", null);
                }

                @Override
                public void onError(HealthConnectException error) {
                    callback.complete("heartRateVariability", "HC_" + error.getErrorCode() + ": " + String.valueOf(error.getMessage()));
                }
            });
        } catch (Exception error) {
            callback.complete("heartRateVariability", error.getClass().getSimpleName() + ": " + String.valueOf(error.getMessage()));
        }
    }

    private void readBloodPressureDaily(
        HealthConnectManager manager,
        ExecutorService executor,
        int days,
        Map<String, Map<String, Double>> rows,
        MetricCallback callback
    ) {
        try {
            ReadRecordsRequestUsingFilters<BloodPressureRecord> request =
                new ReadRecordsRequestUsingFilters.Builder<BloodPressureRecord>(BloodPressureRecord.class)
                    .setTimeRangeFilter(instantRange(days))
                    .setPageSize(5000)
                    .build();
            manager.readRecords(request, executor, new OutcomeReceiver<ReadRecordsResponse<BloodPressureRecord>, HealthConnectException>() {
                @Override
                public void onResult(ReadRecordsResponse<BloodPressureRecord> response) {
                    Map<String, double[]> accum = new LinkedHashMap<>();
                    ZoneId zone = ZoneId.systemDefault();
                    for (BloodPressureRecord record : response.getRecords()) {
                        String date = record.getTime().atZone(zone).toLocalDate().toString();
                        double[] values = accum.computeIfAbsent(date, key -> new double[] {0.0, 0.0, 0.0});
                        values[0] += record.getSystolic().getInMillimetersOfMercury();
                        values[1] += record.getDiastolic().getInMillimetersOfMercury();
                        values[2] += 1.0;
                    }
                    for (Map.Entry<String, double[]> entry : accum.entrySet()) {
                        double[] values = entry.getValue();
                        if (values[2] > 0) {
                            putValue(rows, entry.getKey(), "systolicBp", values[0] / values[2]);
                            putValue(rows, entry.getKey(), "diastolicBp", values[1] / values[2]);
                        }
                    }
                    callback.complete("bloodPressure", null);
                }

                @Override
                public void onError(HealthConnectException error) {
                    callback.complete("bloodPressure", "HC_" + error.getErrorCode() + ": " + String.valueOf(error.getMessage()));
                }
            });
        } catch (Exception error) {
            callback.complete("bloodPressure", error.getClass().getSimpleName() + ": " + String.valueOf(error.getMessage()));
        }
    }

    private void finishFullRead(
        PluginCall call,
        int days,
        Map<String, Map<String, Double>> rows,
        Set<String> metricsRead,
        Map<String, String> metricErrors
    ) {
        getActivity().runOnUiThread(() -> {
            JSArray outputRows = new JSArray();
            ZoneId zone = ZoneId.systemDefault();
            LocalDate today = LocalDate.now(zone);
            for (int i = 0; i < days; i++) {
                String date = today.minusDays(days - 1L - i).toString();
                JSObject row = new JSObject();
                row.put("date", date);
                Map<String, Double> values = rows.get(date);
                if (values != null) {
                    for (Map.Entry<String, Double> entry : values.entrySet()) row.put(entry.getKey(), entry.getValue());
                }
                outputRows.put(row);
            }

            JSArray readArray = new JSArray();
            for (String metric : metricsRead) readArray.put(metric);
            JSObject errors = new JSObject();
            synchronized (metricErrors) {
                for (Map.Entry<String, String> entry : metricErrors.entrySet()) errors.put(entry.getKey(), entry.getValue());
            }

            JSObject result = new JSObject();
            result.put("reader", "android_platform_health_connect");
            result.put("daysRequested", days);
            result.put("days", outputRows);
            result.put("metricsRead", readArray);
            result.put("metricErrors", errors);
            call.resolve(result);
        });
    }
`

const classEnd = source.lastIndexOf('\n}')
if (classEnd === -1) throw new Error('Could not locate DirectHealthReaderPlugin class end')
source = source.slice(0, classEnd) + fullReaderMethods + source.slice(classEnd)

const required = [
  'readHealthDaily',
  'aggregateLongDaily',
  'aggregateMassDaily',
  'aggregateEnergyDaily',
  'readOxygenDaily',
  'readHrvDaily',
  'readBloodPressureDaily',
  'ExerciseSessionRecord.EXERCISE_DURATION_TOTAL',
  'SleepSessionRecord.SLEEP_DURATION_TOTAL',
  'HeartRateRecord.BPM_AVG',
  'RestingHeartRateRecord.BPM_AVG',
  'ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL',
]
for (const marker of required) {
  if (!source.includes(marker)) throw new Error(`Full native reader marker missing: ${marker}`)
}

fs.writeFileSync(pluginPath, source)
console.log('Full native Android Health Connect reader installed for all 10 HealthWallet metrics.')
