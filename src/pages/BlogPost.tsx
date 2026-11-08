import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import PageFrame from "@/components/PageFrame";
import MarkdownView from "@/components/MarkdownView";
import { ApiError, getPost, type Post } from "@/lib/api";
import { useSiteText } from "@/hooks/useSiteText";

export default function BlogPost() {
  const { slug = "" } = useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const text = useSiteText();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getPost(slug)
      .then((data) => {
        if (!active) return;
        setPost(data);
        document.title = `${data.title} · StarsailsClover`;
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setPost(null);
        setError(
          reason instanceof ApiError && reason.status === 404
            ? text.blog.missingTitle
            : "这篇文章暂时无法读取。",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      document.title = "StarsailsClover · 飞流星墅";
    };
  }, [slug, text.blog.missingTitle]);

  if (loading) {
    return (
      <PageFrame eyebrow={text.blog.eyebrow} title={text.blog.title}>
        <div className="content-state">
          <LoaderCircle size={20} className="spin" />
          <span>正在展开这一页…</span>
        </div>
      </PageFrame>
    );
  }

  if (!post) {
    return (
      <PageFrame eyebrow={text.blog.missingEyebrow} title={text.blog.missingTitle}>
        <p className="content-state">{error}</p>
        <Link className="text-link" to="/blog">{text.blog.backToBlog}</Link>
      </PageFrame>
    );
  }

  return (
    <PageFrame
      eyebrow={`${post.publishedAt?.slice(0, 10) ?? ""} / ${post.readingMinutes} 分钟`}
      title={post.title}
    >
      {post.tags.length > 0 && (
        <nav className="article-tags" aria-label="文章标签">
          {post.tags.map((tag) => (
            <Link to={`/tags/${encodeURIComponent(tag)}`} key={tag}>
              #{tag}
            </Link>
          ))}
        </nav>
      )}
      <MarkdownView source={post.bodyMarkdown} />
    </PageFrame>
  );
}
