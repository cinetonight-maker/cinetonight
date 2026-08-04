import Link from "next/link";
import type { Metadata } from "next";
import Icon from "@/components/Icon";
import { BLOGS } from "@/lib/data";
import { img } from "@/lib/images";

export const metadata: Metadata = { title: "Blog" };

export default function BlogPage() {
  return (
    <div className="page">
      <div className="page__head"><h1>The Blog</h1><p>Guides, spotlights and streaming news.</p></div>
      <div className="blog-grid">
        {BLOGS.map((b) => (
          <Link className="blogc" href={`/blog/${b.slug}`} key={b.slug}>
            <div className="blogc__img">{/* eslint-disable-next-line @next/next/no-img-element */}<img loading="lazy" alt="" src={img(`b-${b.slug}`, 600, 340)} /></div>
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
