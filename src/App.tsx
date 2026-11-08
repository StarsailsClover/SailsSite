import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes } from "react-router-dom";
import { Github, Home as HomeIcon, Music2, PenLine, Rss, UserRound } from "lucide-react";
import FloatingMusicPlayer from "@/components/music/FloatingMusicPlayer";
import { MusicProvider } from "@/components/music/MusicProvider";
import { useSiteText } from "@/hooks/useSiteText";

const Home = lazy(() => import("@/pages/Home"));
const Blog = lazy(() => import("@/pages/Blog"));
const BlogPost = lazy(() => import("@/pages/BlogPost"));
const Collection = lazy(() => import("@/pages/Collection"));
const Tag = lazy(() => import("@/pages/Tag"));
const GitHub = lazy(() => import("@/pages/GitHub"));
const About = lazy(() => import("@/pages/About"));
const Feed = lazy(() => import("@/pages/Feed"));
const Music = lazy(() => import("@/pages/Music"));
const Studio = lazy(() => import("@/pages/Studio"));

const navItems = [
  { to: "/", key: "villa", icon: HomeIcon },
  { to: "/blog", key: "blog", icon: PenLine },
  { to: "/github", key: "github", icon: Github },
  { to: "/about", key: "about", icon: UserRound },
  { to: "/feed", key: "feed", icon: Rss },
  { to: "/music", key: "music", icon: Music2 },
];

function RouteFallback() {
  return <div className="route-loading">正在穿过雾谷…</div>;
}

function SiteShell() {
  const text = useSiteText();
  return (
    <>
      <nav className="site-nav" aria-label="主导航">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} className="nav-mark">
              <Icon size={15} />
              <span>{text.nav[item.key] ?? item.key}</span>
            </NavLink>
          );
        })}
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/collections/:slug" element={<Collection />} />
        <Route path="/tags/:tag" element={<Tag />} />
        <Route path="/editor" element={<Navigate to="/blog" replace />} />
        <Route path="/github" element={<GitHub />} />
        <Route path="/about" element={<About />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/music" element={<Music />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <FloatingMusicPlayer />
    </>
  );
}

export default function App() {
  const isAdminHost = window.location.hostname === "sails-gg.oxygenai.top";
  const isLocalStudio =
    ["127.0.0.1", "localhost"].includes(window.location.hostname) &&
    window.location.pathname.startsWith("/studio");

  if (isAdminHost || isLocalStudio) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Studio />
      </Suspense>
    );
  }

  return (
    <BrowserRouter>
      <MusicProvider>
        <Suspense fallback={<RouteFallback />}>
          <SiteShell />
        </Suspense>
      </MusicProvider>
    </BrowserRouter>
  );
}
