import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import Icon from "@/components/Icon";
import { getBlogs } from "@/lib/data";
import { img } from "@/lib/images";

export const metadata: Metadata = {
  alternates: { canonical: "/blog" },
  title: "Blog",
  description: "Guides, spotlights and streaming news — what to watch next and why.",
};
// Cached (ISR): rendered once, reused for 300s, then refreshed in the
// background. Turns bot storms into cache hits instead of function runs.
export const revalidate = 300;

export default async function BlogPage() {
  const blogs = await getBlogs();
  return (
    <div className="page">
      <div className="page__head"><h1>The Blog</h1><p>Guides, spotlights and streaming news.</p></div>
      <div className="blog-grid">
        {blogs.map((b) => (
          <Link className="blogc" href={`/blog/${b.slug}`} key={b.slug}>
            <div className="blogc__img"><Image fill alt={b.title} src={b.imageUrl || img(`b-${b.slug}`, 600, 340)} sizes="(max-width: 760px) 100vw, 380px" /></div>
            <div className="blogc__b">
              <span className="blogc__cat">{b.cat}</span>
              <div className="blogc__t">{b.title}</div>
              <p className="blogc__x">{b.excerpt}</p>
              <div className="blogc__meta"><span>{b.date}</span><span>· {b.read} read</span><span className="rd">Read <Icon name="arrow" size={13} /></span></div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
