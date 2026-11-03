import org.apache.tools.ant.taskdefs.condition.Os

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.kong.browser"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.kong.browser"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // 지인용 배포: 디버그 키로 서명 (스토어 배포 시 별도 키로)
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
    }
    // 엔진 번들과 레시피는 저장소의 transformer/, recipes/ 에서 빌드할 때 복사해 온다 (아래 kongAssets)
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/kong-assets"))
}

// ---------- 엔진(transformer.js) + 레시피를 assets 로 ----------
// PC 앱(desktop/)과 같은 엔진·레시피를 그대로 쓴다. 레시피가 PC 화면 기준이므로 폰에서도 사이트의 PC 화면을 받는다 (KongWebView.kt)
val repoRoot = rootProject.projectDir.parentFile
val buildEngine by tasks.registering(Exec::class) {
    description = "transformer 엔진 번들 빌드 (npm run build)"
    workingDir = File(repoRoot, "transformer")
    commandLine(if (Os.isFamily(Os.FAMILY_WINDOWS)) listOf("cmd", "/c", "npm", "run", "build") else listOf("npm", "run", "build"))
    inputs.dir(File(repoRoot, "transformer/src"))
    outputs.file(File(repoRoot, "transformer/dist/transformer.js"))
}
val kongAssets by tasks.registering(Sync::class) {
    dependsOn(buildEngine)
    from(File(repoRoot, "transformer/dist/transformer.js"))
    from(File(repoRoot, "recipes")) {
        include("*.json")
        into("recipes")
    }
    into(layout.buildDirectory.dir("generated/kong-assets"))
}
tasks.named("preBuild") { dependsOn(kongAssets) }

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.webkit:webkit:1.12.1")

    testImplementation("junit:junit:4.13.2")
}
