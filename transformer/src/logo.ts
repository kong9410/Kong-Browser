// 사이트 로고: 사이트 맨 위의 "로고 + 홈으로" 링크를 읽어 통합 화면 머리에 다시 그린다 (text 슬롯 방식).
// 로고 그림은 링크 안의 <img> 를, 없으면 CSS 배경 그림(디시처럼 글자를 숨기고 배경으로 그린 로고)을 쓴다.
import { hit } from "./locate.js";
import type { Recipe } from "./recipe.js";

export interface Logo {
  href: string;
  /** 로고 그림 주소. 못 찾으면 null (사이트 이름 글자로) */
  src: string | null;
}

const bgUrl = (el: Element): string | null => {
  const m = getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
  return m ? m[1] : null;
};

export function readLogo(recipe: Recipe, doc: Document = document): Logo | null {
  const found = hit(doc, recipe.logo)?.el;
  const a = found?.closest("a") ?? found?.querySelector("a");
  const href = a?.getAttribute("href");
  if (!a || !href) return null;
  const img = a.querySelector("img");
  let src = img?.getAttribute("src") ?? null;
  if (!src) for (const el of [a, ...Array.from(a.querySelectorAll("*"))]) if ((src = bgUrl(el))) break;
  const abs = (u: string) => new URL(u, doc.location.href).toString();
  return { href: abs(href), src: src ? abs(src) : null };
}

/** 통합 화면 머리의 사이트 표시: 로고가 있으면 로고 링크(누르면 사이트 홈), 없으면 사이트 이름 글자 */
export function siteMark(recipe: Recipe): HTMLElement {
  const logo = recipe.logo ? readLogo(recipe) : null;
  if (!logo) {
    const d = document.createElement("div");
    d.className = "k-site";
    d.textContent = recipe.siteName;
    return d;
  }
  const a = document.createElement("a");
  a.className = "k-site k-logo";
  a.href = logo.href;
  a.title = `${recipe.siteName} 홈`;
  if (logo.src) {
    const img = document.createElement("img");
    img.src = logo.src;
    img.alt = recipe.siteName;
    // 그림을 못 불러오면 이름 글자로
    img.onerror = () => img.replaceWith(document.createTextNode(recipe.siteName));
    a.appendChild(img);
  } else a.textContent = recipe.siteName;
  return a;
}
