import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const pluginRoot = path.join(root, 'node_modules', '@capgo', 'capacitor-health')
const androidRoot = path.join(pluginRoot, 'android')
const sourceRoot = path.join(androidRoot, 'src', 'main', 'java', 'app', 'capgo', 'plugin', 'health')
const dataTypeFile = path.join(sourceRoot, 'HealthDataType.kt')
const managerFile = path.join(sourceRoot, 'HealthManager.kt')
const gradleFile = path.join(androidRoot, 'build.gradle')

for (const file of [dataTypeFile, managerFile, gradleFile]) {
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

const advancedReadBlocks = `${readHeartRateBlock}\n            HealthDataType.SLEEP -> readRecords(client, SleepSessionRecord::class, startTime, endTime, limit) { record ->\n                val durationMinutes = Duration.between(record.startTime, record.endTime).toMinutes().toDouble()\n                val payload = createSamplePayload(\n                    dataType,\n                    record.startTime,\n                    record.endTime,\n                    durationMinutes,\n                    record.metadata\n                )\n                samples.add(record.startTime to payload)\n            }\n            HealthDataType.OXYGEN_SATURATION -> readRecords(client, OxygenSaturationRecord::class, startTime, endTime, limit) { record ->\n                val payload = createSamplePayload(\n                    dataType,\n                    record.time,\n                    record.time,\n                    record.percentage.value,\n                    record.metadata\n                )\n                samples.add(record.time to payload)\n            }\n            HealthDataType.RESTING_HEART_RATE -> readRecords(client, RestingHeartRateRecord::class, startTime, endTime, limit) { record ->\n                val payload = createSamplePayload(\n                    dataType,\n                    record.time,\n                    record.time,\n                    record.beatsPerMinute.toDouble(),\n                    record.metadata\n                )\n                samples.add(record.time to payload)\n            }\n            HealthDataType.HEART_RATE_VARIABILITY -> readRecords(client, HeartRateVariabilityRmssdRecord::class, startTime, endTime, limit) { record ->\n                val payload = createSamplePayload(\n                    dataType,\n                    record.time,\n                    record.time,\n                    record.heartRateVariabilityMillis,\n                    record.metadata\n                )\n                samples.add(record.time to payload)\n            }\n            HealthDataType.BLOOD_PRESSURE -> readRecords(client, BloodPressureRecord::class, startTime, endTime, limit) { record ->\n                val payload = createSamplePayload(\n                    dataType,\n                    record.time,\n                    record.time,\n                    record.systolic.inMillimetersOfMercury,\n                    record.metadata\n                )\n                payload.put("systolic", record.systolic.inMillimetersOfMercury)\n                payload.put("diastolic", record.diastolic.inMillimetersOfMercury)\n                samples.add(record.time to payload)\n            }\n            HealthDataType.EXERCISE_TIME -> readRecords(client, ExerciseSessionRecord::class, startTime, endTime, limit) { record ->\n                val durationMinutes = Duration.between(record.startTime, record.endTime).toMinutes().toDouble()\n                val payload = createSamplePayload(\n                    dataType,\n                    record.startTime,\n                    record.endTime,\n                    durationMinutes,\n                    record.metadata\n                )\n                samples.add(record.startTime to payload)\n            }`
manager = replaceOnce(manager, readHeartRateBlock, advancedReadBlocks, 'advanced Health Connect readers')

const saveHeartRateBlock = `            HealthDataType.HEART_RATE -> {\n                val samples = listOf(HeartRateRecord.Sample(time = startTime, beatsPerMinute = value.toBpmLong()))\n                val record = HeartRateRecord(\n                    startTime = startTime,\n                    startZoneOffset = zoneOffset(startTime),\n                    endTime = endTime,\n                    endZoneOffset = zoneOffset(endTime),\n                    samples = samples\n                )\n                client.insertRecords(listOf(record))\n            }`
const saveWithReadOnlyAdvanced = `${saveHeartRateBlock}\n            HealthDataType.SLEEP,\n            HealthDataType.OXYGEN_SATURATION,\n            HealthDataType.RESTING_HEART_RATE,\n            HealthDataType.HEART_RATE_VARIABILITY,\n            HealthDataType.BLOOD_PRESSURE,\n            HealthDataType.EXERCISE_TIME -> {\n                throw IllegalArgumentException("This HealthWallet Connect backport exposes advanced Android metrics as read-only.")\n            }`
manager = replaceOnce(manager, saveHeartRateBlock, saveWithReadOnlyAdvanced, 'read-only advanced save branches')
fs.writeFileSync(managerFile, manager)

let gradle = fs.readFileSync(gradleFile, 'utf8')
gradle = gradle.replace(
  "implementation 'androidx.health.connect:connect-client:1.1.0-alpha10'",
  "implementation 'androidx.health.connect:connect-client:1.1.0'",
)
fs.writeFileSync(gradleFile, gradle)

console.log('HealthWallet Connect: patched @capgo/capacitor-health 7.2.15 with advanced read-only Android Health Connect support.')
