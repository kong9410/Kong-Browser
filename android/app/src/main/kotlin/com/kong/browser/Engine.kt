package com.kong.browser

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * 앱에 내장한 엔진 번들(assets/transformer.js)과 레시피(assets/recipes/*.json).
 * PC 앱과 똑같은 파일이고, 빌드할 때 저장소의 transformer/, recipes/ 에서 복사된다 (app/build.gradle.kts)
 */
class Engine(context: Context) {
    val recipes: List<JSONObject>
    val hosts: List<String>
    private val bundle: String
    private val recipesJson: String

    init {
        val assets = context.assets
        bundle = assets.open("transformer.js").bufferedReader().use { it.readText() }
        recipes = (assets.list("recipes") ?: emptyArray())
            .filter { it.endsWith(".json") }
            .sorted()
            .map { JSONObject(assets.open("recipes/$it").bufferedReader().use { r -> r.readText() }) }
        hosts = recipes.map { it.getString("host") }
        recipesJson = JSONArray(recipes).toString()
    }

    fun hasRecipe(url: String) = hostOf(url) in hosts

    /**
     * 페이지 스크립트보다 먼저(document-start) 넣을 스크립트: 엔진 + 시작 코드.
     * 페이지마다 바뀌는 값(원본 토글, 방문 기록)은 시작할 때 KongBridge.config 로 받는다 (PC 의 preload-page.ts 와 같은 역할)
     */
    fun startScript(): String = bundle + "\n" + BOOT

    /** KongBridge.config 의 응답: 레시피, 원본 보기, 메뉴 펼침, 이 사이트 방문 기록 */
    fun config(off: Boolean, navOpen: Boolean, visited: List<String>): String =
        """{"recipes":$recipesJson,"off":$off,"navOpen":$navOpen,"visited":${JSONArray(visited)}}"""

    companion object {
        private val BOOT = """
            ;(function () {
              try {
                if (window.top !== window || !window.KongBridge || !window.kong) return;
                var c = JSON.parse(KongBridge.config(location.href));
                if (!c.off) kong.boot(c.recipes, { navOpen: c.navOpen, visited: c.visited });
              } catch (e) {
                /* 엔진이 실패해도 원본 페이지는 그대로 (fail-open) */
              }
            })();
        """.trimIndent()
    }
}
