import { useEffect, useMemo, useState } from "react";
import { GitFork, Github, LoaderCircle, Star } from "lucide-react";
import PageFrame from "@/components/PageFrame";
import { getGitHubOverview, type GitHubOverview } from "@/lib/api";
import { useSiteText } from "@/hooks/useSiteText";

function eventLabel(event: GitHubOverview["events"][number]) {
  const repo = event.repo || "public repository";
  switch (event.type) {
    case "PushEvent":
      return `推进了 ${repo} 的代码潮汐`;
    case "WatchEvent":
      return `收藏了 ${repo}`;
    case "CreateEvent":
      return `创建了 ${repo} 的 ${event.refType || "新内容"}`;
    case "DeleteEvent":
      return `整理了 ${repo} 的分支或标签`;
    case "IssuesEvent":
      return `${event.action || "更新"}了 ${repo} 的 issue`;
    case "PullRequestEvent":
      return `${event.action || "更新"}了 ${repo} 的 pull request`;
    case "ForkEvent":
      return `复刻了 ${repo}`;
    case "ReleaseEvent":
      return `发布了 ${repo} 的新版本`;
    default:
      return `在 ${repo} 留下了一次活动`;
  }
}

export default function GitHub() {
  const text = useSiteText();
  const [overview, setOverview] = useState<GitHubOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getGitHubOverview()
      .then((data) => {
        if (active) setOverview(data);
      })
      .catch(() => {
        if (active) setError(text.github.statusOffline);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [text.github.statusOffline]);

  const activity = useMemo(
    () => overview?.events.slice(0, 8) ?? [],
    [overview?.events],
  );

  return (
    <PageFrame eyebrow={text.github.eyebrow} title={text.github.title}>
      {loading && (
        <div className="content-state">
          <LoaderCircle size={20} className="spin" />
          <span>{text.github.statusLoading}</span>
        </div>
      )}
      {!loading && error && (
        <div className="content-state content-state-error"><p>{error}</p></div>
      )}
      {overview?.profile && (
        <section className="github-profile">
          <img src={overview.profile.avatarUrl} alt="" />
          <div>
            <h2>{overview.profile.name || overview.profile.login}</h2>
            <a href={overview.profile.htmlUrl} target="_blank" rel="noreferrer">
              <Github size={15} /> @{overview.profile.login}
            </a>
            <p>{overview.profile.bio}</p>
          </div>
          <dl>
            <div><dt>Repos</dt><dd>{overview.profile.publicRepos}</dd></div>
            <div><dt>Followers</dt><dd>{overview.profile.followers}</dd></div>
            <div><dt>Following</dt><dd>{overview.profile.following}</dd></div>
          </dl>
        </section>
      )}

      {overview && (
        <>
          <section className="github-contributions">
            <header>
              <div>
                <p className="eyebrow">{text.github.contributionsTitle}</p>
                <strong>{overview.contributions.total}</strong>
                <span>次贡献</span>
              </div>
              <dl>
                <div><dt>当前连续</dt><dd>{overview.contributions.currentStreak} 天</dd></div>
                <div><dt>最长连续</dt><dd>{overview.contributions.longestStreak} 天</dd></div>
              </dl>
            </header>
            <div className="contribution-scroll">
              <div className="contribution-grid" aria-label="GitHub 贡献热力图">
                {overview.contributions.days.map((day) => (
                  <span
                    key={day.date}
                    data-level={day.level}
                    title={`${day.date}: ${day.count} 次贡献`}
                  />
                ))}
              </div>
            </div>
          </section>

          <div className="github-columns">
            <section>
              <p className="eyebrow">{text.github.activityTitle}</p>
              <div className="github-activity">
                {activity.map((event) => (
                  <article key={event.id}>
                    <time>{new Date(event.createdAt).toLocaleDateString("zh-CN")}</time>
                    <p>{eventLabel(event)}</p>
                  </article>
                ))}
              </div>
            </section>
            <section>
              <p className="eyebrow">{text.github.repositoriesTitle}</p>
              <div className="github-repos">
                {overview.repos.map((repo) => (
                  <a href={repo.html_url} key={repo.id} target="_blank" rel="noreferrer">
                    <div>
                      <strong>{repo.name}</strong>
                      <span>{repo.language || "Text"}</span>
                    </div>
                    <p>{repo.description || text.github.offlineDescription}</p>
                    <small>
                      <Star size={13} /> {repo.stargazers_count}
                      <GitFork size={13} /> {repo.forks_count}
                    </small>
                  </a>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </PageFrame>
  );
}
