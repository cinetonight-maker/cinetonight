import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Icon from "@/components/Icon";
import { getBlog, getBlogs } from "@/lib/data";
import { img } from "@/lib/images";

interface Params { params: { slug: string } }

export async function generateStaticParams() {
  const blogs = await getBlogs();
  return blogs.map((b) => ({ slug: b.slug }));
}
export const dynamicParams = true;
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const b = await getBlog(params.slug);
  return b ? { title: b.title, description: b.excerpt } : { title: "Not found" };
}

export default async function ArticlePage({ params }: Params) {
  const b = await getBlog(params.slug);
  if (!b) notFound();
  return (
    <div className="page">
      <div className="article">
        <span className="article__cat">{b.cat}</span>
        <h1 className="article__t">{b.title}</h1>
        <div className="article__meta">By Editorial Desk · {b.date} · {b.read} read</div>
        <div className="article__img"><Image fill alt="" src={b.imageUrl || img(`article-${b.slug}`, 1000, 500)} sizes="(max-width: 900px) 100vw, 760px" priority /></div>
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
