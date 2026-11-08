import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import PageFrame from "@/components/PageFrame";
import PostIndex from "@/components/PostIndex";
import { ApiError, getTagDetail, type TagDetail } from "@/lib/api";

export default function Tag() {
  const { tag = "" } = useParams();
  const [detail, setDetail] = useState<TagDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getTagDetail(tag)
      .then((data) => {
        if (!active) return;
        setDetail(data);
        setError("");
        document.title = `#${data.tag} · StarsailsClover`;
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof ApiError && reason.status === 404
            ? "这个标签还没有文章。"
            : "标签暂时无法读取。",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      document.title = "StarsailsClover · 飞流星墅";
    };
  }, [tag]);

  if (loading) {
    return (
      <PageFrame eyebrow="Tag" title={`#${tag}`}>
        <div className="content-state">
          <LoaderCircle size={20} className="spin" />
          <span>正在沿标签寻找文章…</span>
        </div>
      </PageFrame>
    );
  }

  if (!detail) {
    return (
      <PageFrame eyebrow="Tag" title={`#${tag}`}>
        <p className="content-state">{error}</p>
        <Link className="text-link" to="/blog">返回文章长廊</Link>
      </PageFrame>
    );
  }

  return (
    <PageFrame eyebrow={`Tag / ${detail.count} 篇`} title={`#${detail.tag}`}>
      <section className="tag-intro">
        <p>{detail.description}</p>
      </section>
      <PostIndex posts={detail.posts} />
    </PageFrame>
  );
}
