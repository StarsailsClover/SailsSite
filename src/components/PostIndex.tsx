import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import type { PostSummary } from "@/lib/api";

export default function PostIndex({
  posts,
  emptyText = "岩壁还没有新的刻痕。",
}: {
  posts: PostSummary[];
  emptyText?: string;
}) {
  if (posts.length === 0) {
    return <div className="content-state"><p>{emptyText}</p></div>;
  }
  return (
    <div className="writing-index">
      {posts.map((post) => (
        <Link to={`/blog/${post.slug}`} className="article-line" key={post.id}>
          <time>{post.publishedAt?.slice(0, 10) ?? ""}</time>
          <div>
            <h2>{post.title}</h2>
            <p>{post.description}</p>
            <span>
              {post.tags.join(" / ")}
              {post.readingMinutes ? ` · ${post.readingMinutes} 分钟` : ""}
            </span>
          </div>
          <ArrowUpRight size={18} />
        </Link>
      ))}
    </div>
  );
}
