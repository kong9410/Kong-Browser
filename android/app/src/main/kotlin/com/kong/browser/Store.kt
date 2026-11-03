package com.kong.browser

import android.content.Context
import org.json.JSONArray
import java.io.File

/**
 * 이 기기에만 저장하는 것 (서버로 보내지 않음). PC 앱의 settings.json / history.json / session.json 에 해당
 * - 설정: 원본/통합 토글, 왼쪽 메뉴 펼침 (SharedPreferences)
 * - 방문 기록: 목록의 읽은 글 표시용 주소 (최근 5000개, files/history.json)
 */
class Store(context: Context) {
    private val prefs = context.getSharedPreferences("kong", Context.MODE_PRIVATE)
    private val historyFile = File(context.filesDir, "history.json")

    /** 원본 화면으로 보기 (앱 전체, 페이지를 옮겨도 유지) */
    var original: Boolean
        get() = prefs.getBoolean("original", false)
        set(v) = prefs.edit().putBoolean("original", v).apply()

    /** 통합 화면의 왼쪽 메뉴 펼침 (넓은 화면·태블릿용. 폰에서는 서랍이라 쓰지 않음) */
    var navOpen: Boolean
        get() = prefs.getBoolean("navOpen", true)
        set(v) = prefs.edit().putBoolean("navOpen", v).apply()

    /** 마지막으로 보던 주소 (다시 실행하면 이어서) */
    var lastUrl: String?
        get() = prefs.getString("lastUrl", null)
        set(v) = prefs.edit().putString("lastUrl", v).apply()

    private val history: ArrayList<String> by lazy {
        val list = ArrayList<String>()
        try {
            val arr = JSONArray(historyFile.readText())
            for (i in 0 until arr.length()) list.add(arr.getString(i))
        } catch (e: Exception) {
            // 처음 실행이거나 깨진 파일: 빈 기록
        }
        list
    }

    /** 새 방문 (최신이 앞). 같은 주소를 연달아 방문하면(새로고침 등) 한 번만 */
    @Synchronized
    fun addVisit(url: String) {
        if (!url.startsWith("http")) return
        if (history.firstOrNull() == url) return
        history.add(0, url)
        while (history.size > HISTORY_MAX) history.removeAt(history.size - 1)
        historyFile.writeText(JSONArray(history).toString())
    }

    /** 읽은 글 표시용: 이 호스트의 방문 주소 */
    @Synchronized
    fun visitedOn(host: String): List<String> =
        if (host.isEmpty()) emptyList()
        else history.filter { it.startsWith("https://$host/") || it.startsWith("http://$host/") }

    companion object {
        const val HISTORY_MAX = 5000
    }
}
