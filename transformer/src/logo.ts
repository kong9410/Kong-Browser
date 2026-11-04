// 사이트 로고: 사이트 맨 위의 "로고 + 홈으로" 링크를 읽어 통합 화면 머리에 다시 그린다 (text 슬롯 방식).
// 로고 그림은 링크 안의 <img> 를, 없으면 CSS 배경 그림(디시처럼 글자를 숨기고 배경으로 그린 로고)을, 그것도 없으면 인라인 SVG(네이버 N 로고)를 쓴다.
// landing 화면(설계 8-14절)의 큰 로고(hero)도 같은 방식으로 그린다.
import { hit } from "./locate.js";
import type { Recipe } from "./recipe.js";

export interface Logo {
  href: string;
  /** 로고 그림 주소. 못 찾으면 null (svg 또는 사이트 이름 글자로) */
  src: string | null;
  /** 그림 주소가 없을 때 로고 안의 인라인 SVG (복사해 쓴다) */
  svg?: SVGSVGElement | null;
}

const bgUrl = (el: Element): string | null => {
  const m = getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
  return m ? m[1] : null;
};

const absUrl = (u: string, doc: Document = document) => new URL(u, doc.location.href).toString();

export function readLogo(recipe: Recipe, doc: Document = document): Logo | null {
  const found = hit(doc, recipe.logo)?.el;
  const a = found?.closest("a") ?? found?.querySelector("a");
  const href = a?.getAttribute("href");
  if (!a || !href) return null;
  const img = a.querySelector("img");
  let src = img?.getAttribute("src") ?? null;
  if (!src) for (const el of [a, ...Array.from(a.querySelectorAll("*"))]) if ((src = bgUrl(el))) break;
  return src ? { href: absUrl(href, doc), src: absUrl(src, doc) } : { href: absUrl(href, doc), src: null, svg: a.querySelector("svg") };
}

/** 인라인 SVG 복사본 (id 는 지워 원본과 겹치지 않게, 크기는 CSS 로) */
function svgCopy(svg: SVGSVGElement): SVGSVGElement {
  const c = svg.cloneNode(true) as SVGSVGElement;
  for (const e of [c, ...Array.from(c.querySelectorAll("[id]"))]) e.removeAttribute("id");
  c.removeAttribute("width");
  c.removeAttribute("height");
  c.setAttribute("aria-hidden", "true");
  return c;
}

function fill(a: HTMLAnchorElement, recipe: Recipe, src: string | null, svg: SVGSVGElement | null | undefined, alt?: string | null) {
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = alt || recipe.siteName;
    // 그림을 못 불러오면 이름 글자로
    img.onerror = () => img.replaceWith(document.createTextNode(recipe.siteName));
    a.appendChild(img);
  } else if (svg) {
    a.appendChild(svgCopy(svg));
    const name = document.createElement("span");
    name.className = "k-blind";
    name.textContent = recipe.siteName;
    a.appendChild(name);
  } else a.textContent = recipe.siteName;
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
  fill(a, recipe, logo.src, logo.svg);
  return a;
}

/**
 * landing 의 큰 로고. el 은 레시피 hero 로 찾은 요소 (없으면 사이트 이름 글자).
 * 링크: 그림의 이미지 맵 링크(네이버 두들의 그날 검색어) → 가장 가까운 링크 → 사이트 홈
 */
export function heroMark(el: Element | null, recipe: Recipe): HTMLElement {
  const a = document.createElement("a");
  a.className = "k-hero-logo";
  a.title = recipe.siteName;
  const img = el instanceof HTMLImageElement ? el : (el?.querySelector("img") ?? null);
  const svg = img ? null : el instanceof SVGSVGElement ? el : (el?.querySelector("svg") ?? null);
  let href: string | null = null;
  const mapName = img?.useMap?.replace(/^#/, "");
  if (mapName)
    for (const m of Array.from(document.querySelectorAll("map")))
      if (m.getAttribute("name") === mapName) href = m.querySelector("area[href]")?.getAttribute("href") ?? null;
  href ??= el?.closest("a")?.getAttribute("href") ?? el?.querySelector("a")?.getAttribute("href") ?? null;
  a.href = href && !/^javascript:/i.test(href) ? absUrl(href) : `${location.origin}/`;
  const src = img ? img.currentSrc || img.getAttribute("src") : null;
  fill(a, recipe, src ? absUrl(src) : null, svg, img?.alt);
  if (img?.alt) a.title = img.alt;
  const box = document.createElement("div");
  box.className = "k-hero";
  box.appendChild(a);
  return box;
}
