// 단위 테스트: 실제 브라우저 없이 가짜 DOM(happy-dom)에서 엔진 함수만 검사한다 (통합 검사는 npm run check)
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "happy-dom",
  },
});
