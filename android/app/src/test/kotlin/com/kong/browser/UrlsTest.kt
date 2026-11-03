package com.kong.browser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UrlsTest {
    private val recipeHosts = listOf("bbs.ruliweb.com", "gall.dcinside.com", "m.ruliweb.com")

    @Test
    fun `주소창 입력 - 주소는 https 를 붙이고 그 외는 검색`() {
        assertEquals("https://bbs.ruliweb.com", toUrl("bbs.ruliweb.com"))
        assertEquals("http://localhost:3000", toUrl("http://localhost:3000"))
        assertEquals("https://www.google.com/search?q=%EB%A3%A8%EB%A6%AC%EC%9B%B9%20%EC%9C%A0%EA%B2%8C", toUrl("루리웹 유게"))
    }

    @Test
    fun `사이트 단위 도메인`() {
        assertEquals("ruliweb.com", siteDomain("bbs.ruliweb.com"))
        assertEquals("ppomppu.co.kr", siteDomain("www.ppomppu.co.kr"))
        assertEquals("dcinside.com", siteDomain("dcinside.com"))
    }

    @Test
    fun `레시피가 있는 사이트는 하위 도메인까지 PC 화면으로`() {
        assertTrue(wantsPcPage("https://bbs.ruliweb.com/community/board/300143", recipeHosts))
        assertTrue(wantsPcPage("https://www.dcinside.com/", recipeHosts))
        assertTrue(wantsPcPage("https://gall.dcinside.com/board/lists/?id=programming", recipeHosts))
        assertFalse(wantsPcPage("https://www.fmkorea.com/", recipeHosts))
        assertFalse(wantsPcPage("https://notruliweb.com/", recipeHosts))
        assertFalse(wantsPcPage("about:blank", recipeHosts))
    }

    @Test
    fun `커뮤니티 목록은 15곳, 모두 https`() {
        assertEquals(15, COMMUNITIES.size)
        assertTrue(COMMUNITIES.all { it.url.startsWith("https://") })
    }
}
