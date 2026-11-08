import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import PageFrame from "@/components/PageFrame";
import PostIndex from "@/components/PostIndex";
import {
  ApiError,
  getCollection,
  type CollectionDetail,
} from "@/lib/api";
import { useSiteText } from "@/hooks/useSiteText";

export default function Collection() {
  const { slug = "" } = useParams();
  const text = useSiteText();
  const [detail, setDetail] = useState<CollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    getCollection(slug)
      .then((data) => {
        if (!active) return;
        setDetail(data);
        document.title = `${data.collection.title} · StarsailsClover`;
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof ApiError && reason.status === 404
            ? "这个合集尚未公开。"
            : "合集暂时无法读取。",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      document.title = "StarsailsClover · 飞流星墅";
    };
  }, [slug]);

  if (loading) {
    return (
      <PageFrame eyebrow="Collection" title="文章合集">
        <div className="content-state">
          <LoaderCircle size={20} className="spin" />
          <span>正在打开合集…</span>
        </div>
      </PageFrame>
    );
  }

  if (!detail) {
    return (
      <PageFrame eyebrow="Collection" title="没有找到这个合集">
        <p className="content-state">{error}</p>
        <Link className="text-link" to="/blog">返回文章长廊</Link>
      </PageFrame>
    );
  }

  const { collection, posts } = detail;
  return (
    <PageFrame eyebrow={`${text.blog.collectionsTitle} / ${collection.postCount} 篇`} title={collection.title}>
      <section className="collection-intro">
        {collection.coverUrl && <img src={collection.coverUrl} alt="" />}
        <div>
          <p>{collection.description || "这个合集还没有简介。"}</p>
          <span>{collection.sortOrder === "oldest" ? "旧篇在上" : "新篇在上"}</span>
        </div>
      </section>
      <PostIndex posts={posts} emptyText="合集中还没有公开文章。" />
    </PageFrame>
  );
}
