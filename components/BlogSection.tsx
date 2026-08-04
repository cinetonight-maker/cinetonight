import Link from "next/link";
import Icon from "./Icon";
import { BLOGS } from "@/lib/data";
import { img } from "@/lib/images";

export default function BlogSection({ count = 3 }: { count?: number }) {
  return (
    <section className="sec">
      <div className="sec__head"><h2>From the Blog</h2><Link className="sec__all" href="/blog">All Posts</Link></div>
      <div className="blog-grid">
        {BLOGS.slice(0, count).map((b) => (
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
    </section>
  );
}
