import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Eye,
  Heart,
  LoaderCircle,
  MessageCircle,
  Repeat2,
} from "lucide-react";
import PageFrame from "@/components/PageFrame";
import { getXFeed, proxyXMedia, type XFeed } from "@/lib/api";
import { useSiteText } from "@/hooks/useSiteText";

export default function Feed() {
  const text = useSiteText();
  const [feed, setFeed] = useState<XFeed | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    getXFeed()
      .then(setFeed)
      .catch(() => setFeed(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <PageFrame eyebrow={text.blog.xEyebrow} title={text.blog.xTitle}>
      {feed?.profile && (
        <section className="x-profile">
          <img src={proxyXMedia(feed.profile.avatarUrl)} alt="" />
          <div>
            <h2>{feed.profile.name}</h2>
            <a href={feed.profile.url} target="_blank" rel="noreferrer">
              @{feed.profile.screenName}
            </a>
            <p>{feed.profile.description}</p>
          </div>
          <dl>
            <div><dt>Posts</dt><dd>{feed.profile.tweets}</dd></div>
            <div><dt>Followers</dt><dd>{feed.profile.followers}</dd></div>
          </dl>
        </section>
      )}

      {loading && (
        <div className="content-state">
          <LoaderCircle size={20} className="spin" />
          <span>正在沿潮汐同步 X 动态…</span>
        </div>
      )}
      {!loading && !feed && (
        <div className="content-state content-state-error">
          <p>X 动态暂时没有抵达。</p>
          <button type="button" onClick={load}>重新同步</button>
        </div>
      )}

      {feed && (
        <div className="x-timeline">
          {feed.offline && <p className="sync-line">当前显示最近一次缓存。</p>}
          {feed.items.map((item) => (
            <article key={item.id}>
              <header>
                <time>{new Date(item.createdAt).toLocaleString("zh-CN")}</time>
                <a href={item.url} target="_blank" rel="noreferrer" aria-label="在 X 查看">
                  <ArrowUpRight size={17} />
                </a>
              </header>
              <p>{item.text}</p>
              {item.media.length > 0 && (
                <div className="x-media-grid">
                  {item.media.slice(0, 4).map((media, index) =>
                    media.type === "video" ? (
                      <video key={`${item.id}-${index}`} controls preload="metadata" src={proxyXMedia(media.url)} poster={proxyXMedia(media.thumbnailUrl)} />
                    ) : (
                      <img key={`${item.id}-${index}`} src={proxyXMedia(media.url)} alt="" loading="lazy" />
                    ),
                  )}
                </div>
              )}
              <footer>
                <span><MessageCircle size={14} /> {item.replies}</span>
                <span><Repeat2 size={14} /> {item.reposts}</span>
                <span><Heart size={14} /> {item.likes}</span>
                {item.views > 0 && <span><Eye size={14} /> {item.views}</span>}
              </footer>
            </article>
          ))}
        </div>
      )}
    </PageFrame>
  );
}
