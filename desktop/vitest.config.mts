// 단위 테스트: Electron 없이 순수 함수만 검사한다 (실제 앱을 띄우는 통합 검사는 npm run e2e)
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
