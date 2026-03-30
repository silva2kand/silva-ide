import { existsSync, mkdirSync, copyFileSync, chmodSync, writeFileSync, cpSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

const isMac = process.platform === "darwin";
if (!isMac) {
  console.log("[healthkit-bridge] Skipping build on non-macOS platform.");
  process.exit(0);
}

const packagePath = join(process.cwd(), "native", "healthkit-bridge");
const buildOutput = join(packagePath, ".build", "release", "HealthKitBridge");
const destinationDir = join(process.cwd(), "build", "healthkit-bridge");
const destination = join(destinationDir, "HealthKitBridge");
const appBundle = join(destinationDir, "HealthKitBridge.app");
const appContents = join(appBundle, "Contents");
const appMacOS = join(appContents, "MacOS");
const appExecutable = join(appMacOS, "HealthKitBridge");
const pkgInfo = "APPL????\n";
const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>HealthKitBridge</string>
  <key>CFBundleIdentifier</key>
  <string>com.cowork.healthkitbridge</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>HealthKitBridge</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleSupportedPlatforms</key>
  <array>
    <string>MacOSX</string>
  </array>
  <key>LSUIElement</key>
  <true/>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>NSHealthShareUsageDescription</key>
  <string>CoWork needs access to your Health data to connect Apple Health, read metrics, and generate insights.</string>
  <key>NSHealthUpdateUsageDescription</key>
  <string>CoWork needs access to your Health data to write approved health updates back to Apple Health.</string>
  <key>NSHealthClinicalHealthRecordsShareUsageDescription</key>
  <string>CoWork needs access to clinical health records you choose to share with the app.</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
</dict>
</plist>
`;

const identities = spawnSync("security", ["find-identity", "-v", "-p", "codesigning"], {
  encoding: "utf8",
  env: process.env,
});
const identityMatch = identities.stdout?.match(/Apple Development: [^("]+/);
const signingIdentity = identityMatch?.[0]?.trim() || "-";
const developmentTeam = process.env.COWORK_HEALTHKIT_DEVELOPMENT_TEAM || process.env.DEVELOPMENT_TEAM || "LJNM8V8M95";

const xcodeProjectPath = join(packagePath, "HealthKitBridge.xcodeproj");
const xcodeAppBundle = join(packagePath, ".build", "xcode", "Build", "Products", "Release", "HealthKitBridge.app");

if (existsSync(xcodeProjectPath)) {
  const xcodebuild = spawnSync(
    "xcodebuild",
    [
      "-project",
      xcodeProjectPath,
      "-scheme",
      "HealthKitBridge",
      "-configuration",
      "Release",
      "-derivedDataPath",
      join(packagePath, ".build", "xcode"),
      "-allowProvisioningUpdates",
      "CODE_SIGN_STYLE=Automatic",
      `DEVELOPMENT_TEAM=${developmentTeam}`,
      "ENABLE_HARDENED_RUNTIME=YES",
    ],
    { stdio: "inherit", env: process.env },
  );

  if (xcodebuild.status === 0 && existsSync(xcodeAppBundle)) {
    mkdirSync(destinationDir, { recursive: true });
    cpSync(xcodeAppBundle, appBundle, { recursive: true, force: true });
    copyFileSync(join(appBundle, "Contents", "MacOS", "HealthKitBridge"), destination);
    chmodSync(destination, 0o755);
    console.log(`[healthkit-bridge] Built app target at ${appBundle}`);
    process.exit(0);
  }

  console.warn("[healthkit-bridge] Xcode app build failed or did not produce a bundle; falling back to SwiftPM packaging.");
}

const build = spawnSync("swift", ["build", "--package-path", packagePath, "-c", "release"], {
  stdio: "inherit",
  env: process.env,
});

if (build.status !== 0) {
  console.error("[healthkit-bridge] swift build failed.");
  process.exit(build.status ?? 1);
}

if (!existsSync(buildOutput)) {
  console.error(`[healthkit-bridge] Expected binary not found at ${buildOutput}`);
  process.exit(1);
}

mkdirSync(destinationDir, { recursive: true });
copyFileSync(buildOutput, destination);
chmodSync(destination, 0o755);
mkdirSync(appMacOS, { recursive: true });
writeFileSync(join(appContents, "Info.plist"), infoPlist);
writeFileSync(join(appContents, "PkgInfo"), pkgInfo);
copyFileSync(buildOutput, appExecutable);
chmodSync(appExecutable, 0o755);
const provisioningProfile = process.env.COWORK_HEALTHKIT_PROVISIONING_PROFILE || process.env.HEALTHKIT_BRIDGE_PROVISIONING_PROFILE;
if (provisioningProfile && existsSync(provisioningProfile)) {
  copyFileSync(provisioningProfile, join(appContents, "embedded.provisionprofile"));
}
const codesign = spawnSync(
  "codesign",
  [
    "--force",
    "--sign",
    signingIdentity,
    "--options",
    "runtime",
    "--entitlements",
    join(packagePath, "HealthKitBridge.entitlements"),
    appBundle,
  ],
  { stdio: "inherit", env: process.env },
);
if (codesign.status !== 0) {
  console.error("[healthkit-bridge] codesign failed.");
  process.exit(codesign.status ?? 1);
}
console.log(`[healthkit-bridge] Copied helper to ${destination}`);
