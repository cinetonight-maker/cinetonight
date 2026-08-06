import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { supabasePublic } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

marked.setOptions({ breaks: true });

async function getPage(slug: string) {
  const supabase = supabasePublic();
  if (!supabase) return null;
  const { data } = await supabase
    .from("pages")
    .select("title, content, status")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const page = await getPage(params.slug);
  return { title: page?.title ?? "Page" };
}

export default async function CustomPage({ params }: { params: { slug: string } }) {
  const page = await getPage(params.slug);
  if (!page) return notFound();

  return (
    <div className="page">
      <div className="ad__panel" style={{ maxWidth: 820, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 18 }}>{page.title}</h1>
        {/* Page content is written in the dashboard by an authenticated admin
           only (never public input), so rendering the parsed markdown as
           HTML here is the same trust boundary as everything else in this
           admin-authored content model (blog posts, movie descriptions). */}
        <div className="pagecontent" dangerouslySetInnerHTML={{ __html: marked.parse(page.content || "") as string }} />
      </div>
    </div>
  );
}
