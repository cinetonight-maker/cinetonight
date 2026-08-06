import Link from "next/link";
import Image from "next/image";
import Icon from "./Icon";
import { getBlogs } from "@/lib/data";
import { img } from "@/lib/images";

export default async function BlogSection({ count = 3 }: { count?: number }) {
  const blogs = await getBlogs();
  return (
    <section className="sec">
      <div className="sec__head"><h2>From the Blog</h2><Link className="sec__all" href="/blog">All Posts</Link></div>
      <div className="blog-grid">
        {blogs.slice(0, count).map((b) => (
          <Link className="blogc" href={`/blog/${b.slug}`} key={b.slug}>
            <div className="blogc__img"><Image fill alt="" src={b.imageUrl || img(`b-${b.slug}`, 600, 340)} sizes="(max-width: 760px) 100vw, 380px" /></div>
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
