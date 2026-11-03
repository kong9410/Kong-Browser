// npm run build → dist/transformer.js (Android 앱 assets 로 복사해서 쓰는 파일)
import fs from "node:fs";
import { buildBundle, DIST } from "./shared.js";

const code = await buildBundle();
console.log(`${DIST} (${(fs.statSync(DIST).size / 1024).toFixed(1)}KB, ${code.split("\n").length} lines)`);
