import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Icon from "@/components/Icon";
import { getBlog, blogSlugs } from "@/lib/data";
import { img } from "@/lib/images";

interface Params { params: { slug: string } }

export function generateStaticParams() {
  return blogSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({ params }: Params): Metadata {
  const b = getBlog(params.slug);
  return b ? { title: b.title, description: b.excerpt } : { title: "Not found" };
}

export default function ArticlePage({ params }: Params) {
  const b = getBlog(params.slug);
  if (!b) notFound();
  return (
    <div className="page">
      <div className="article">
        <span className="article__cat">{b.cat}</span>
        <h1 className="article__t">{b.title}</h1>
        <div className="article__meta">By Editorial Desk · {b.date} · {b.read} read</div>
        <div className="article__img">{/* eslint-disable-next-line @next/next/no-img-element */}<img alt="" src={img(`article-${b.slug}`, 1000, 500)} /></div>
        <div className="article__body">
          {(b.body ?? [b.excerpt]).map((p, i) => <p key={i}>{p}</p>)}
        </div>
        <div style={{ marginTop: 24 }}>
          <Link className="btn btn--ghost" href="/blog"><Icon name="chevl" size={15} /> Back to Blog</Link>
        </div>
      </div>
    </div>
  );
}
