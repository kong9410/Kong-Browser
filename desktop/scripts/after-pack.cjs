// electron-builder afterPack: macOS 앱에 ad-hoc 서명
// 개발자 인증서가 없어 정식 서명은 못 하지만, Apple Silicon(arm64)은 서명이 전혀 없으면 "손상됨"으로 실행이 안 되므로
// 내용이 바뀐 앱 묶음 전체를 ad-hoc(-) 으로 다시 서명한다. macOS 에서 빌드할 때만 동작
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
};
