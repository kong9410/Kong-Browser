// 왼쪽 메뉴 열(과 오른쪽 열의 링크 블록)의 내용: 레시피대로 사이트 페이지에 있는 링크를 읽는다 (설계 8-2절).
// 읽기만 하고 DOM 은 바꾸지 않는다. 그리는 것은 nav.ts.
import { cleanText, findAll, hit } from "./locate.js";
import type { Menu, MenuGroup, MenuSpec, Recipe } from "./recipe.js";

/** 게시판을 구분하는 값. 레시피 목록 페이지의 sameBoard 정규식을 재사용한다 (예: /board/300143, ?id=programming) */
function boardKeyOf(recipe: Recipe): (url: string) => string | null {
  const re = recipe.pages.flatMap((p) => (p.type === "board" && p.rows.sameBoard ? [new RegExp(p.rows.sameBoard)] : []))[0];
  return (url) => {
    try {
      const u = new URL(url, location.href);
      if (u.host !== location.host) return null;
      return re ? ((u.pathname + u.search).match(re)?.[1] ?? null) : u.pathname;
    } catch {
      return null;
    }
  };
}

/** prefix 방식: 지금 주소의 경로가 링크 경로로 시작 (경계는 / 단위). /community 는 /community/board/300143 의 상위 */
function prefixOf(url: string | null): string | null {
  if (!url) return null; // 링크가 없는 그룹 제목 (빈 주소를 "지금 페이지"로 해석하지 않게)
  try {
    const u = new URL(url, location.href);
    if (u.host !== location.host) return null;
    const p = u.pathname.replace(/\/+$/, "");
    return p && (location.pathname === p || location.pathname.startsWith(p + "/")) ? p : null;
  } catch {
    return null;
  }
}

function readBlock(spec: MenuSpec, recipe: Recipe): MenuGroup[] {
  const key = boardKeyOf(recipe);
  const here = key(location.href);
  const mode = spec.current ?? "board";
  const isCurrent = (href: string | null, el?: Element | null) => {
    if (mode === "none") return false;
    if (mode === "mark") {
      // 사이트가 지금 위치에 붙여 둔 표시를 그대로 따른다 (링크 자신 또는 감싸는 li)
      if (!el || !spec.mark) return false;
      try {
        return el.matches(spec.mark) || !!el.closest("li")?.matches(spec.mark);
      } catch {
        return false;
      }
    }
    return mode === "prefix" ? prefixOf(href) !== null : !!href && here !== null && key(href) === here;
  };
  const abs = (href: string | null) => (href ? new URL(href, location.href).toString() : null);

  const groups: MenuGroup[] = [];
  for (const g of findAll(document, spec.groups).els) {
    const head = spec.heading ? hit(g, spec.heading) : null;
    // 제목 링크: 제목이 링크 안에 있으면 그 링크, 아니면 제목 안의 첫 링크 (예: 루리웹 "유머 게시판 BEST 더보기")
    const headLink = head?.el?.closest("a") ?? head?.el?.querySelector("a");
    const headHref = abs(headLink?.getAttribute("href") ?? null);
    const seen = new Set<string>();
    const skip = spec.skip ? new RegExp(spec.skip) : null;
    const links = findAll(g, spec.links)
      .els.map((a) => {
        const href = abs(a.getAttribute("href"));
        const text = (spec.linkText ? hit(a, spec.linkText)?.value : null) ?? cleanText(a.textContent);
        return { text, href: href ?? "", current: isCurrent(href, a) };
      })
      // 빈 링크, javascript: 링크, skip 에 맞는 링크, 같은 주소 중복은 뺀다
      .filter((l) => l.text && /^https?:/.test(l.href) && !(skip && skip.test(l.text)) && !seen.has(l.href) && seen.add(l.href));
    const title = head?.value ?? spec.label ?? "";
    if (!title && !links.length) continue;
    groups.push({ title, style: spec.style ?? "list", href: headHref, current: isCurrent(headHref, head?.el?.closest("a")), links });
  }

  // 블록 안에서 강조는 하나만: 지금 주소와 완전히 같은 링크 → (prefix) 가장 긴 경로 / (board) 가장 짧은 주소
  const norm = (u: string | null) => (u ?? "").replace(/[?#]$/, "");
  const marked = groups.flatMap((g) => [g, ...g.links]).filter((x) => x.current);
  const len = (x: { href: string | null }) => (mode === "prefix" ? -(prefixOf(x.href)?.length ?? 0) : (x.href ?? "").length);
  const keep = marked.find((x) => norm(x.href) === norm(location.href)) ?? marked.sort((a, b) => len(a) - len(b))[0];
  for (const x of marked) x.current = x === keep;
  return groups;
}

/** 링크 블록 하나를 읽는다 (오른쪽 열의 links 블록도 같은 방식) */
export function readLinks(spec: MenuSpec, recipe: Recipe): MenuGroup[] {
  return readBlock(spec, recipe);
}

export function extractMenu(recipe: Recipe): Menu | null {
  const groups = (recipe.menu ?? []).flatMap((spec) => readBlock(spec, recipe));
  return groups.length ? { site: recipe.siteName, host: recipe.host, groups } : null;
}
