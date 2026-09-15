import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const pluginRoot = path.join(root, 'node_modules', '@capgo', 'capacitor-health')
const androidRoot = path.join(pluginRoot, 'android')
const sourceRoot = path.join(androidRoot, 'src', 'main', 'java', 'app', 'capgo', 'plugin', 'health')
const dataTypeFile = path.join(sourceRoot, 'HealthDataType.kt')
const managerFile = path.join(sourceRoot, 'HealthManager.kt')
const pluginFile = path.join(sourceRoot, 'HealthPlugin.kt')
const rationaleFile = path.join(sourceRoot, 'PermissionsRationaleActivity.kt')

for (const file of [dataTypeFile, managerFile, pluginFile]) {
  if (!fs.existsSync(file)) {
    throw new Error(`@capgo/capacitor-health v7 backport target not found: ${file}`)
  }
}

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) {
    if (source.includes(to)) return source
    throw new Error(`Could not apply ${label}; expected source fragment was not found.`)
  }
  return source.replace(from, to)
}

let dataType = fs.readFileSync(dataTypeFile, 'utf8')
dataType = replaceOnce(
  dataType,
  `import androidx.health.connect.client.records.HeartRateRecord\nimport androidx.health.connect.client.records.Record`,
  `import androidx.health.connect.client.records.HeartRateRecord\nimport androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord\nimport androidx.health.connect.client.records.OxygenSaturationRecord\nimport androidx.health.connect.client.records.RestingHeartRateRecord\nimport androidx.health.connect.client.records.SleepSessionRecord\nimport androidx.health.connect.client.records.BloodPressureRecord\nimport androidx.health.connect.client.records.ExerciseSessionRecord\nimport androidx.health.connect.client.records.Record`,
  'advanced HealthDataType imports',
)
dataType = replaceOnce(
  dataType,
  `    HEART_RATE("heartRate", HeartRateRecord::class, "bpm"),\n    WEIGHT("weight", WeightRecord::class, "kilogram");`,
  `    HEART_RATE("heartRate", HeartRateRecord::class, "bpm"),\n    WEIGHT("weight", WeightRecord::class, "kilogram"),\n    SLEEP("sleep", SleepSessionRecord::class, "minute"),\n    OXYGEN_SATURATION("oxygenSaturation", OxygenSaturationRecord::class, "percent"),\n    RESTING_HEART_RATE("restingHeartRate", RestingHeartRateRecord::class, "bpm"),\n    HEART_RATE_VARIABILITY("heartRateVariability", HeartRateVariabilityRmssdRecord::class, "millisecond"),\n    BLOOD_PRESSURE("bloodPressure", BloodPressureRecord::class, "mmHg"),\n    EXERCISE_TIME("exerciseTime", ExerciseSessionRecord::class, "minute");`,
  'advanced HealthDataType enum values',
)
fs.writeFileSync(dataTypeFile, dataType)

let manager = fs.readFileSync(managerFile, 'utf8')
manager = replaceOnce(
  manager,
  `import androidx.health.connect.client.records.HeartRateRecord\nimport androidx.health.connect.client.records.Record`,
  `import androidx.health.connect.client.records.HeartRateRecord\nimport androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord\nimport androidx.health.connect.client.records.OxygenSaturationRecord\nimport androidx.health.connect.client.records.RestingHeartRateRecord\nimport androidx.health.connect.client.records.SleepSessionRecord\nimport androidx.health.connect.client.records.BloodPressureRecord\nimport androidx.health.connect.client.records.ExerciseSessionRecord\nimport androidx.health.connect.client.records.Record`,
  'advanced HealthManager imports',
)
manager = replaceOnce(
  manager,
  `import java.time.Instant\nimport java.time.ZoneId`,
  `import java.time.Instant\nimport java.time.Duration\nimport java.time.ZoneId`,
  'Duration import',
)

const readHeartRateBlock = `            HealthDataType.HEART_RATE -> readRecords(client, HeartRateRecord::class, startTime, endTime, limit) { record ->\n                record.samples.forEach { sample ->\n                    val payload = createSamplePayload(\n                        dataType,\n                        sample.time,\n                        sample.time,\n                        sample.beatsPerMinute.toDouble(),\n                        record.metadata\n                    )\n                    samples.add(sample.time to payload)\n                }\n            }`

const advancedReadBlocks = `${readHeartRateBlock}\n            HealthDataType.SLEEP -> readRecords(client, SleepSessionRecord::class, startTime, endTime, limit) { record ->\n                val durationMinutes = Duration.between(record.startTime, record.endTime).toMinutes().toDouble()\n                val payload = createSamplePayload(dataType, record.startTime, record.endTime, durationMinutes, record.metadata)\n                samples.add(record.startTime to payload)\n            }\n            HealthDataType.OXYGEN_SATURATION -> readRecords(client, OxygenSaturationRecord::class, startTime, endTime, limit) { record ->\n                val payload = createSamplePayload(dataType, record.time, record.time, record.percentage.value, record.metadata)\n                samples.add(record.time to payload)\n            }\n            HealthDataType.RESTING_HEART_RATE -> readRecords(client, RestingHeartRateRecord::class, startTime, endTime, limit) { record ->\n                val payload = createSamplePayload(dataType, record.time, record.time, record.beatsPerMinute.toDouble(), record.metadata)\n                samples.add(record.time to payload)\n            }\n            HealthDataType.HEART_RATE_VARIABILITY -> readRecords(client, HeartRateVariabilityRmssdRecord::class, startTime, endTime, limit) { record ->\n                val payload = createSamplePayload(dataType, record.time, record.time, record.heartRateVariabilityMillis, record.metadata)\n                samples.add(record.time to payload)\n            }\n            HealthDataType.BLOOD_PRESSURE -> readRecords(client, BloodPressureRecord::class, startTime, endTime, limit) { record ->\n                val payload = createSamplePayload(dataType, record.time, record.time, record.systolic.inMillimetersOfMercury, record.metadata)\n                payload.put("systolic", record.systolic.inMillimetersOfMercury)\n                payload.put("diastolic", record.diastolic.inMillimetersOfMercury)\n                samples.add(record.time to payload)\n            }\n            HealthDataType.EXERCISE_TIME -> readRecords(client, ExerciseSessionRecord::class, startTime, endTime, limit) { record ->\n                val durationMinutes = Duration.between(record.startTime, record.endTime).toMinutes().toDouble()\n                val payload = createSamplePayload(dataType, record.startTime, record.endTime, durationMinutes, record.metadata)\n                samples.add(record.startTime to payload)\n            }`
manager = replaceOnce(manager, readHeartRateBlock, advancedReadBlocks, 'advanced Health Connect readers')

const saveHeartRateBlock = `            HealthDataType.HEART_RATE -> {\n                val samples = listOf(HeartRateRecord.Sample(time = startTime, beatsPerMinute = value.toBpmLong()))\n                val record = HeartRateRecord(\n                    startTime = startTime,\n                    startZoneOffset = zoneOffset(startTime),\n                    endTime = endTime,\n                    endZoneOffset = zoneOffset(endTime),\n                    samples = samples\n                )\n                client.insertRecords(listOf(record))\n            }`
const saveWithReadOnlyAdvanced = `${saveHeartRateBlock}\n            HealthDataType.SLEEP,\n            HealthDataType.OXYGEN_SATURATION,\n            HealthDataType.RESTING_HEART_RATE,\n            HealthDataType.HEART_RATE_VARIABILITY,\n            HealthDataType.BLOOD_PRESSURE,\n            HealthDataType.EXERCISE_TIME -> {\n                throw IllegalArgumentException("This HealthWallet Connect backport exposes advanced Android metrics as read-only.")\n            }`
manager = replaceOnce(manager, saveHeartRateBlock, saveWithReadOnlyAdvanced, 'read-only advanced save branches')
fs.writeFileSync(managerFile, manager)

let plugin = fs.readFileSync(pluginFile, 'utf8')
const grantedPreflight = `            val granted = client.permissionController.getGrantedPermissions()\n            if (granted.containsAll(permissions)) {\n                val status = manager.authorizationStatus(client, readTypes, writeTypes)\n                call.resolve(status)\n                return@launch\n            }\n\n`
plugin = replaceOnce(
  plugin,
  grantedPreflight,
  `            // HealthWallet Connect intentionally skips the preflight getGrantedPermissions() call.\n            // Some Android/Samsung Health Connect providers can leave that IPC suspended before\n            // the permission UI is launched. The system permission activity itself is authoritative.\n\n`,
  'Health Connect permission preflight bypass',
)

const oldCallback = `        pluginScope.launch {\n            val client = getClientOrReject(call) ?: return@launch\n            val status = manager.authorizationStatus(client, readTypes, writeTypes)\n            call.resolve(status)\n        }`
const newCallback = `        val granted = permissionContract.parseResult(result.resultCode, result.data)\n        val readAuthorized = JSArray()\n        val readDenied = JSArray()\n        readTypes.forEach { type ->\n            if (granted.contains(type.readPermission)) readAuthorized.put(type.identifier)\n            else readDenied.put(type.identifier)\n        }\n\n        val writeAuthorized = JSArray()\n        val writeDenied = JSArray()\n        writeTypes.forEach { type ->\n            if (granted.contains(type.writePermission)) writeAuthorized.put(type.identifier)\n            else writeDenied.put(type.identifier)\n        }\n\n        call.resolve(JSObject().apply {\n            put("readAuthorized", readAuthorized)\n            put("readDenied", readDenied)\n            put("writeAuthorized", writeAuthorized)\n            put("writeDenied", writeDenied)\n        })`
plugin = replaceOnce(plugin, oldCallback, newCallback, 'permission activity result handling')
fs.writeFileSync(pluginFile, plugin)

if (!fs.existsSync(rationaleFile)) {
  fs.writeFileSync(rationaleFile, `package app.capgo.plugin.health\n\nimport android.app.Activity\nimport android.os.Bundle\nimport android.webkit.WebView\nimport android.webkit.WebViewClient\n\nclass PermissionsRationaleActivity : Activity() {\n    override fun onCreate(savedInstanceState: Bundle?) {\n        super.onCreate(savedInstanceState)\n        val webView = WebView(applicationContext)\n        webView.webViewClient = WebViewClient()\n        webView.settings.javaScriptEnabled = false\n        setContentView(webView)\n        webView.loadUrl("https://healthwallet1.netlify.app/privacy")\n    }\n}\n`)
}

console.log('HealthWallet Connect: patched @capgo/capacitor-health 7.2.15 with advanced read-only Android support, rationale Activity, and Samsung-safe permission flow.')
