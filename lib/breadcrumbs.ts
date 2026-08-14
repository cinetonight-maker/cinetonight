import { baseUrl } from "@/lib/site";

/** BreadcrumbList JSON-LD — lets Google show the page's place in the site
 *  (Home › Movies › Title) under the search result instead of a raw URL.
 *  Pass items in order, WITHOUT the base URL; the last item is the page
 *  itself and carries no link per Google's guidelines. */
export function breadcrumbJsonLd(items: { name: string; path?: string }[]) {
  const base = baseUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      ...(it.path ? { item: `${base}${it.path}` } : {}),
    })),
  };
}
