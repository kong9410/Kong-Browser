package com.kong.browser

import java.net.URI
import java.net.URLEncoder

// 주소 관련 순수 함수 (Android 없이 단위 테스트). desktop/src/suggest.ts, dock.ts 와 같은 규칙

const SEARCH_URL = "https://www.google.com/search?q="

/** 레시피가 PC 화면 기준이라, 레시피가 있는 사이트는 PC 브라우저로 접속한다 (사이트가 모바일 주소로 보내지 않도록) */
const PC_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"

/** 주소처럼 보이는지: 스킴이 있거나, 공백 없이 점이 들어간 이름, 또는 localhost */
fun looksLikeUrl(text: String): Boolean {
    val t = text.trim()
    return Regex("^[a-z][a-z0-9+.-]*://", RegexOption.IGNORE_CASE).containsMatchIn(t) ||
        Regex("^[^\\s]+\\.[^\\s]{2,}(/.*)?$").matches(t) ||
        Regex("^localhost(:\\d+)?(/.*)?$").matches(t)
}

/** 주소창 입력 → URL. 주소처럼 보이지 않으면 검색 */
fun toUrl(text: String): String {
    val t = text.trim()
    if (Regex("^[a-z][a-z0-9+.-]*://", RegexOption.IGNORE_CASE).containsMatchIn(t)) return t
    if (looksLikeUrl(t)) return "https://$t"
    return SEARCH_URL + URLEncoder.encode(t, "UTF-8").replace("+", "%20")
}

fun hostOf(url: String): String =
    try {
        URI(url).host?.lowercase() ?: ""
    } catch (e: Exception) {
        ""
    }

/** 사이트 단위 도메인 (bbs.ruliweb.com → ruliweb.com). 국내 2단계 도메인(co.kr 등)은 세 덩어리 */
fun siteDomain(host: String): String {
    val parts = host.lowercase().split('.').filter { it.isNotEmpty() }
    if (parts.size <= 2) return parts.joinToString(".")
    val second = parts[parts.size - 2]
    val n = if (parts.last() == "kr" && second in setOf("co", "or", "ne", "go", "re", "pe")) 3 else 2
    return parts.takeLast(n).joinToString(".")
}

/**
 * 이 주소를 PC 화면으로 받을지: 레시피가 있는 사이트 전체 (같은 사이트의 다른 하위 도메인 포함).
 * 예) 디시 첫 화면 www.dcinside.com 도 PC 로 받아야 갤러리 링크가 gall.dcinside.com(PC, 레시피 있음)으로 이어진다
 */
fun wantsPcPage(url: String, recipeHosts: Collection<String>): Boolean {
    val host = hostOf(url)
    if (host.isEmpty()) return false
    val sites = recipeHosts.map { siteDomain(it) }.toSet()
    return siteDomain(host) in sites
}

/** 화면에 보일 주소: 스킴과 끝의 / 를 뗀다 */
fun displayUrl(url: String): String = url.replace(Regex("^https?://"), "").removeSuffix("/")

/** 시작 화면의 국내 주요 커뮤니티 (PC 앱 dock 과 같은 목록) */
data class Community(val name: String, val url: String, val color: Long)

val COMMUNITIES = listOf(
    Community("루리웹", "https://bbs.ruliweb.com/", 0xFF1E4FA3),
    Community("디시인사이드", "https://www.dcinside.com/", 0xFF3B4890),
    Community("에펨코리아", "https://www.fmkorea.com/", 0xFF3F6AD8),
    Community("더쿠", "https://theqoo.net/", 0xFF58A0D8),
    Community("클리앙", "https://www.clien.net/service/", 0xFF5A6EA8),
    Community("뽐뿌", "https://www.ppomppu.co.kr/", 0xFFD84A3A),
    Community("인벤", "https://www.inven.co.kr/", 0xFFE8590C),
    Community("MLB파크", "https://mlbpark.donga.com/", 0xFF2B6CB0),
    Community("오늘의유머", "https://www.todayhumor.co.kr/", 0xFFE8A20C),
    Community("보배드림", "https://www.bobaedream.co.kr/", 0xFF1A73E8),
    Community("웃긴대학", "https://web.humoruniv.com/", 0xFFF0A020),
    Community("인스티즈", "https://www.instiz.net/", 0xFFFF6F91),
    Community("네이트판", "https://pann.nate.com/", 0xFFFF4D4D),
    Community("82쿡", "https://www.82cook.com/", 0xFF7CB342),
    Community("SLR클럽", "https://www.slrclub.com/", 0xFF455A64),
)
