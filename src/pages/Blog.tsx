import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, LoaderCircle, RotateCcw } from "lucide-react";
import PageFrame from "@/components/PageFrame";
import PostIndex from "@/components/PostIndex";
import {
  ApiError,
  getXFeed,
  listCollections,
  listPosts,
  listTags,
  type CollectionSummary,
  type PostSummary,
  type TagSummary,
  type XFeed,
} from "@/lib/api";
import { useSiteText } from "@/hooks/useSiteText";

function isLikelyDomestic() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const languages = (navigator.languages || [navigator.language]).join(",").toLowerCase();
  return timezone === "Asia/Shanghai" || languages.includes("zh-cn");
}

export default function Blog() {
  const text = useSiteText();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTag = searchParams.get("tag") || "";
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [xFeed, setXFeed] = useState<XFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const domestic = useMemo(() => isLikelyDomestic(), []);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([
      listPosts({ limit: 50, tag: activeTag }),
      listTags(),
      listCollections(),
      domestic ? Promise.resolve(null) : getXFeed().catch(() => null),
    ])
      .then(([postData, tagData, collectionData, feed]) => {
        setPosts(postData.posts);
        setTags(tagData);
        setCollections(collectionData);
        setXFeed(feed);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof ApiError ? reason.message : "文章暂时没有抵达。");
      })
      .finally(() => setLoading(false));
  }, [activeTag, domestic]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageFrame eyebrow={text.blog.eyebrow} title={text.blog.title}>
      {collections.length > 0 && (
        <section className="blog-collections">
          <header>
            <p className="eyebrow">{text.blog.collectionsTitle}</p>
            <p>{text.blog.collectionsLead}</p>
          </header>
          <div className="collection-river">
            {collections.map((collection) => (
              <Link to={`/collections/${collection.slug}`} key={collection.id}>
                <span>{String(collection.postCount).padStart(2, "0")} 篇</span>
                <strong>{collection.title}</strong>
                <p>{collection.description}</p>
                <ArrowUpRight size={17} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {tags.length > 0 && (
        <section className="tag-filter" aria-label={text.blog.tagsTitle}>
          <span>{text.blog.tagsTitle}</span>
          <button
            type="button"
            className={!activeTag ? "active" : ""}
            onClick={() => setSearchParams({})}
          >
            全部
          </button>
          {tags.map((tag) => (
            <button
              type="button"
              key={tag.name}
              className={activeTag === tag.name ? "active" : ""}
              onClick={() => setSearchParams({ tag: tag.name })}
            >
              {tag.name} <small>{tag.count}</small>
            </button>
          ))}
        </section>
      )}

      {loading && (
        <div className="content-state">
          <LoaderCircle size={20} className="spin" />
          <span>正在沿水线读取文章…</span>
        </div>
      )}
      {!loading && error && (
        <div className="content-state content-state-error">
          <p>{error}</p>
          <button type="button" onClick={load}>
            <RotateCcw size={15} />
            重新读取
          </button>
        </div>
      )}
      {!loading && !error && <PostIndex posts={posts} />}

      {!domestic && xFeed && xFeed.items.length > 0 && (
        <section className="x-inline-feed">
          <p className="eyebrow">{text.blog.xEyebrow}</p>
          <h2>{text.blog.xTitle}</h2>
          {xFeed.items.slice(0, 3).map((item) => (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="article-line x-post-line"
              key={item.id}
            >
              <time>{item.createdAt.slice(0, 10)}</time>
              <div><p>{item.text}</p></div>
              <ArrowUpRight size={18} />
            </a>
          ))}
        </section>
      )}
    </PageFrame>
  );
}
