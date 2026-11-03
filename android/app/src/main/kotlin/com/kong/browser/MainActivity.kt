package com.kong.browser

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView

private val Accent = Color(0xFF4F46E5)
private val Field = Color(0xFFF1F3F4)
private val Line = Color(0xFFE3E3E6)
private val Muted = Color(0xFF86868B)

class MainActivity : ComponentActivity() {
    private lateinit var web: KongWebView
    /** 시작 화면(커뮤니티 목록)을 보고 있는지 */
    private val home = mutableStateOf(true)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val store = Store(this)
        web = KongWebView(this, Engine(this), store, PageState())

        // 다른 앱에서 연 링크 > 마지막으로 보던 페이지 > 시작 화면
        val start = intent?.dataString ?: store.lastUrl
        if (start != null) open(start)

        setContent {
            MaterialTheme(colorScheme = lightColorScheme(primary = Accent, background = Color.White, surface = Color.White)) {
                Surface(Modifier.fillMaxSize(), color = Color.White) {
                    Browser()
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.dataString?.let { open(it) }
    }

    private fun open(url: String) {
        home.value = false
        web.load(url)
    }

    @Composable
    private fun Browser() {
        val s = web.state
        BackHandler(enabled = !home.value) {
            if (s.canGoBack) web.goBack() else home.value = true
        }
        Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding()) {
            Toolbar(s)
            if (s.loading) LinearProgressIndicator(progress = { s.progress / 100f }, Modifier.fillMaxWidth().height(2.dp), color = Accent)
            else Spacer(Modifier.height(2.dp))
            if (!home.value && s.verdict == "broken" && !s.original) Banner(s.failed)
            Box(Modifier.weight(1f).fillMaxWidth()) {
                AndroidView(factory = { web.view }, modifier = Modifier.fillMaxSize())
                if (home.value) StartScreen { open(it) }
            }
        }
    }

    @Composable
    private fun Toolbar(s: PageState) {
        val focus = LocalFocusManager.current
        var editing by remember { mutableStateOf(false) }
        var text by remember { mutableStateOf(TextFieldValue("")) }
        if (!editing) {
            val shown = if (home.value) "" else displayUrl(s.url)
            if (text.text != shown) text = TextFieldValue(shown)
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = { home.value = true }) { Icon(Icons.Filled.Home, "시작 화면") }
            Box(
                Modifier.weight(1f).height(38.dp).clip(RoundedCornerShape(19.dp)).background(Field).padding(horizontal = 14.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (text.text.isEmpty()) Text("주소 또는 검색어 입력", color = Muted, fontSize = 14.sp)
                BasicTextField(
                    value = text,
                    onValueChange = { text = it },
                    singleLine = true,
                    textStyle = TextStyle(fontSize = 14.sp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
                    keyboardActions = KeyboardActions(onGo = {
                        if (text.text.isNotBlank()) open(toUrl(text.text))
                        focus.clearFocus()
                    }),
                    modifier = Modifier.fillMaxWidth().onFocusChanged {
                        editing = it.isFocused
                        // 누르면 전체 선택 (바로 새 주소를 입력할 수 있게)
                        if (it.isFocused) text = text.copy(selection = TextRange(0, text.text.length))
                    },
                )
            }
            if (!home.value && s.hasRecipe) {
                Spacer(Modifier.width(6.dp))
                ModeSwitch(s.original) { web.toggleOriginal() }
            }
            if (!home.value) {
                IconButton(onClick = { if (s.loading) web.stop() else web.reload() }) {
                    if (s.loading) Icon(Icons.Filled.Close, "중지") else Icon(Icons.Filled.Refresh, "새로고침")
                }
            }
        }
    }

    /** 원본 | 통합 토글: 지금 보고 있는 쪽이 채워진다. 앱 전체 설정이라 페이지를 옮겨도 유지 */
    @Composable
    private fun ModeSwitch(original: Boolean, onToggle: () -> Unit) {
        Row(
            Modifier.clip(RoundedCornerShape(16.dp)).border(1.dp, Line, RoundedCornerShape(16.dp)).background(Field)
                .clickable(onClick = onToggle).padding(2.dp),
        ) {
            for ((label, on) in listOf("원본" to original, "통합" to !original)) {
                Text(
                    label,
                    color = if (on) Color.White else Muted,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clip(RoundedCornerShape(14.dp)).background(if (on) Accent else Color.Transparent)
                        .padding(horizontal = 9.dp, vertical = 5.dp),
                )
            }
        }
    }

    @Composable
    private fun Banner(failed: List<String>) {
        Text(
            "이 사이트의 화면 구성이 바뀌어서 원래 화면으로 보여드리고 있어요." +
                if (failed.isNotEmpty()) " (${failed.joinToString(", ")})" else "",
            color = Color(0xFF8A5300),
            fontSize = 13.sp,
            modifier = Modifier.fillMaxWidth().background(Color(0xFFFFF7E6)).padding(horizontal = 16.dp, vertical = 8.dp),
        )
    }

    /** 시작 화면: 국내 주요 커뮤니티 (PC 앱의 dock 과 같은 목록) */
    @Composable
    private fun StartScreen(onOpen: (String) -> Unit) {
        Column(Modifier.fillMaxSize().background(Color.White).padding(16.dp)) {
            Text("커뮤니티", fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 12.dp))
            LazyVerticalGrid(
                columns = GridCells.Adaptive(76.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(COMMUNITIES) { c ->
                    Column(
                        Modifier.clip(RoundedCornerShape(12.dp)).clickable { onOpen(c.url) }.padding(vertical = 6.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Box(Modifier.size(48.dp).clip(CircleShape).background(Color(c.color)), contentAlignment = Alignment.Center) {
                            Text(c.name.take(1), color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                        }
                        Text(
                            c.name,
                            fontSize = 12.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(top = 6.dp),
                        )
                    }
                }
            }
        }
    }
}
