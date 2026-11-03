package com.kong.browser

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/** 화면(Compose)이 보는 브라우저 상태 */
class PageState {
    var url by mutableStateOf("")
    var title by mutableStateOf("")
    var loading by mutableStateOf(false)
    var progress by mutableStateOf(0)
    var canGoBack by mutableStateOf(false)
    /** 원본/통합 토글 (앱 전체 설정) */
    var original by mutableStateOf(false)
    /** 이 사이트에 레시피가 있는지 (토글 표시용) */
    var hasRecipe by mutableStateOf(false)
    /** 엔진 판정: ok / degraded / broken / none, 레시피 없는 페이지는 null */
    var verdict by mutableStateOf<String?>(null)
    var failed by mutableStateOf(listOf<String>())
}

/**
 * WebView 하나 + 엔진 주입. PC 앱 main.ts 의 탭 하나에 해당한다.
 * - 레시피가 있는 사이트는 PC 브라우저로 접속 (레시피가 PC 화면 기준). 그 외 사이트는 기본(모바일) 그대로
 * - 엔진은 document-start 스크립트로 넣고, 페이지가 KongBridge 로 설정을 받아 재배치한다
 */
@SuppressLint("SetJavaScriptEnabled")
class KongWebView(context: Context, private val engine: Engine, private val store: Store, val state: PageState) {
    val view = WebView(context)
    private val main = Handler(Looper.getMainLooper())
    private val mobileUserAgent: String

    init {
        val s = view.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        // 재배치하지 않은 PC 페이지(원본 보기, 고장 판정)는 화면 폭에 맞게 축소해서 보여준다. 통합 화면은 엔진이 기기 폭으로 바꾼다
        s.useWideViewPort = true
        s.loadWithOverviewMode = true
        s.builtInZoomControls = true
        s.displayZoomControls = false
        s.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        mobileUserAgent = s.userAgentString

        view.addJavascriptInterface(Bridge(), "KongBridge")
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            // 레시피가 있는 호스트에만 (다른 사이트에는 엔진을 넣지 않는다)
            val origins = engine.hosts.map { "https://$it" }.toSet()
            WebViewCompat.addDocumentStartJavaScript(view, engine.startScript(), origins)
        }
        view.webViewClient = Client()
        view.webChromeClient = object : android.webkit.WebChromeClient() {
            override fun onProgressChanged(v: WebView, p: Int) {
                state.progress = p
            }
            override fun onReceivedTitle(v: WebView, title: String?) {
                state.title = title ?: ""
            }
        }
        state.original = store.original
    }

    /** 주소를 연다. 사이트에 맞는 UA(PC/모바일)로 바꾼 뒤 */
    fun load(url: String) {
        useAgentFor(url)
        view.loadUrl(url)
    }

    /** 원본 ↔ 통합: 앱 전체 설정을 바꾸고 지금 페이지를 다시 불러온다 */
    fun toggleOriginal() {
        store.original = !store.original
        state.original = store.original
        view.reload()
    }

    fun goBack() = view.goBack()
    fun reload() = view.reload()
    fun stop() = view.stopLoading()

    /** UA 를 바꿔야 하면 바꾸고 true (바꾼 뒤에는 다시 불러와야 사이트가 새 UA 를 본다) */
    private fun useAgentFor(url: String): Boolean {
        val want = if (wantsPcPage(url, engine.hosts)) PC_USER_AGENT else mobileUserAgent
        if (view.settings.userAgentString == want) return false
        view.settings.userAgentString = want
        return true
    }

    private fun sync(url: String?) {
        state.url = url ?: ""
        state.canGoBack = view.canGoBack()
        state.hasRecipe = engine.hasRecipe(state.url)
    }

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(v: WebView, req: WebResourceRequest): Boolean {
            val url = req.url.toString()
            if (!url.startsWith("http")) return false
            // 레시피 사이트로 들어가거나 나올 때 UA 를 바꿔서 다시 연다 (메인 프레임만)
            if (req.isForMainFrame && useAgentFor(url)) {
                v.loadUrl(url)
                return true
            }
            return false
        }

        override fun onPageStarted(v: WebView, url: String?, favicon: Bitmap?) {
            state.loading = true
            state.verdict = null
            state.failed = emptyList()
            sync(url)
        }

        override fun onPageFinished(v: WebView, url: String?) {
            state.loading = false
            sync(url)
            if (url != null) {
                store.addVisit(url)
                store.lastUrl = url
            }
        }

        override fun doUpdateVisitedHistory(v: WebView, url: String?, isReload: Boolean) {
            sync(url)
        }
    }

    /** 페이지(엔진) ↔ 앱. JS 쪽 이름은 window.KongBridge (PC 의 preload-page.ts 와 같은 모양) */
    private inner class Bridge {
        /** 엔진 시작 전: 레시피와 이 페이지의 설정 */
        @JavascriptInterface
        fun config(url: String): String = engine.config(store.original, store.navOpen, store.visitedOn(hostOf(url)))

        /** 엔진 판정 결과 */
        @JavascriptInterface
        fun onStatus(json: String) {
            val s = try {
                JSONObject(json)
            } catch (e: Exception) {
                return
            }
            val failed = s.optJSONArray("failed")?.let { a -> List(a.length()) { a.getString(it) } } ?: emptyList()
            main.post {
                state.verdict = s.optString("verdict").ifEmpty { null }
                state.failed = failed
            }
        }

        /** 왼쪽 메뉴 접기/펼치기 (넓은 화면에서만 불림) */
        @JavascriptInterface
        fun onNav(open: Boolean) {
            store.navOpen = open
        }
    }
}
