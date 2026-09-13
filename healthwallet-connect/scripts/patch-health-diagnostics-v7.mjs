import fs from 'node:fs'
import path from 'node:path'

const pluginFile = path.join(
  process.cwd(),
  'node_modules',
  '@capgo',
  'capacitor-health',
  'android',
  'src',
  'main',
  'java',
  'app',
  'capgo',
  'plugin',
  'health',
  'HealthPlugin.kt',
)

if (!fs.existsSync(pluginFile)) {
  throw new Error(`HealthPlugin.kt not found: ${pluginFile}`)
}

let source = fs.readFileSync(pluginFile, 'utf8')

if (source.includes('fun getHealthConnectDiagnostics(')) {
  console.log('HealthWallet Connect: Health Connect diagnostic bridge already patched.')
  process.exit(0)
}

source = source.replace(
  'import android.content.Intent\nimport androidx.activity.result.ActivityResult',
  'import android.content.Intent\nimport android.content.pm.PackageManager\nimport android.os.Build\nimport androidx.activity.result.ActivityResult',
)

const marker = '\n    companion object {'
if (!source.includes(marker)) {
  throw new Error('Could not find HealthPlugin companion object marker for diagnostic bridge patch.')
}

const methods = `

    @PluginMethod
    fun getHealthConnectDiagnostics(call: PluginCall) {
        val readTypes = try {
            parseTypeList(call, "read")
        } catch (e: IllegalArgumentException) {
            call.reject(e.message, null, e)
            return
        }

        val writeTypes = try {
            parseTypeList(call, "write")
        } catch (e: IllegalArgumentException) {
            call.reject(e.message, null, e)
            return
        }

        try {
            val sdkStatus = HealthConnectClient.getSdkStatus(context)
            val permissions = manager.permissionsFor(readTypes, writeTypes)
            val permissionIntent = permissionContract.createIntent(context, permissions)
            val manageIntent = buildManageHealthPermissionsIntent()
            val settingsIntent = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            val packageManager = context.packageManager
            @Suppress("DEPRECATION")
            val packageInfo = packageManager.getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
            val manifestPermissions = packageInfo.requestedPermissions
                ?.filter { it.startsWith("android.permission.health.") }
                ?.sorted()
                ?: emptyList()
            val missingManifestPermissions = permissions.filterNot { manifestPermissions.contains(it) }.sorted()

            val requested = JSArray()
            manifestPermissions.forEach { requested.put(it) }
            val requestedNow = JSArray()
            permissions.sorted().forEach { requestedNow.put(it) }
            val missing = JSArray()
            missingManifestPermissions.forEach { missing.put(it) }

            call.resolve(JSObject().apply {
                put("packageName", context.packageName)
                put("manufacturer", Build.MANUFACTURER)
                put("model", Build.MODEL)
                put("androidSdk", Build.VERSION.SDK_INT)
                put("healthConnectSdkStatus", sdkStatus)
                put("healthConnectSdkStatusLabel", when (sdkStatus) {
                    HealthConnectClient.SDK_AVAILABLE -> "available"
                    HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "provider_update_required"
                    HealthConnectClient.SDK_UNAVAILABLE -> "unavailable"
                    else -> "unknown"
                })
                put("permissionIntentAction", permissionIntent.action ?: "")
                put("permissionIntentResolvable", permissionIntent.resolveActivity(packageManager) != null)
                put("managePermissionsIntentResolvable", manageIntent.resolveActivity(packageManager) != null)
                put("settingsIntentResolvable", settingsIntent.resolveActivity(packageManager) != null)
                put("requestedPermissionCount", permissions.size)
                put("requestedPermissions", requestedNow)
                put("manifestHealthPermissions", requested)
                put("missingManifestPermissions", missing)
                put("allRequestedPermissionsDeclared", missingManifestPermissions.isEmpty())
            })
        } catch (e: Exception) {
            call.reject("Failed to inspect Health Connect permission flow", null, e)
        }
    }

    @PluginMethod
    fun openHealthPermissions(call: PluginCall) {
        try {
            val packageManager = context.packageManager
            val manageIntent = buildManageHealthPermissionsIntent()
            if (manageIntent.resolveActivity(packageManager) != null) {
                context.startActivity(manageIntent)
                call.resolve(JSObject().apply { put("route", "app_health_permissions") })
                return
            }

            val settingsIntent = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            if (settingsIntent.resolveActivity(packageManager) != null) {
                context.startActivity(settingsIntent)
                call.resolve(JSObject().apply { put("route", "health_connect_settings") })
                return
            }

            call.reject("No Health Connect permissions/settings activity is available on this device.")
        } catch (e: Exception) {
            call.reject("Failed to open Health Connect permissions", null, e)
        }
    }

    @PluginMethod
    fun openHealthConnectSettings(call: PluginCall) {
        try {
            val intent = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            if (intent.resolveActivity(context.packageManager) == null) {
                call.reject("Health Connect settings activity is unavailable on this device.")
                return
            }
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to open Health Connect settings", null, e)
        }
    }

    private fun buildManageHealthPermissionsIntent(): Intent {
        return Intent("android.health.connect.action.MANAGE_HEALTH_PERMISSIONS").apply {
            putExtra(Intent.EXTRA_PACKAGE_NAME, context.packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }
`

source = source.replace(marker, `${methods}${marker}`)
fs.writeFileSync(pluginFile, source)

console.log('HealthWallet Connect: added native Health Connect diagnostics and direct permissions fallback.')
