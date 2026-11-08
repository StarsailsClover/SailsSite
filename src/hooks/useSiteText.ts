import { useEffect, useState } from "react";

export type SiteText = {
  nav: Record<string, string>;
  home: {
    eyebrow: string;
    title: string;
    lead: string;
    weatherPrefix: string;
    humidityLabel: string;
    windLabel: string;
    scrollHint: string;
    sections: { index: string; title: string; text: string }[];
    porchEyebrow: string;
    porchTitle: string;
    portals: Record<string, string>;
  };
  about: {
    eyebrow: string;
    title: string;
    lead: string;
    timeline: { label: string; text: string }[];
    focus: { label: string; text: string }[];
    stack: string[];
  };
  music: {
    eyebrow: string;
    title: string;
    nowPlaying: string;
    silentTitle: string;
    waitingArtist: string;
  };
  blog: {
    eyebrow: string;
    title: string;
    xEyebrow: string;
    xTitle: string;
    missingEyebrow: string;
    missingTitle: string;
    backToBlog: string;
    collectionsTitle: string;
    collectionsLead: string;
    tagsTitle: string;
  };
  github: {
    eyebrow: string;
    title: string;
    statusLoading: string;
    statusSynced: string;
    statusOffline: string;
    offlineDescription: string;
    contributionsTitle: string;
    activityTitle: string;
    repositoriesTitle: string;
  };
};

const defaults: SiteText = {
  nav: {
    villa: "Villa",
    blog: "Blog",
    github: "GitHub",
    about: "About",
    feed: "Feed",
    music: "Music",
  },
  home: {
    eyebrow: "StarsailsClover / Waterfall Villa",
    title: "把少年心绪，安放在雾雨的山谷。",
    lead: "这里不止是代码栖息的数字住所，也是盛满梅雨季、盛夏残痕、细碎故事的精神山谷。人间聚散随风雨漫入，过往如潮水反复漫上阶沿。",
    weatherPrefix: "Guangzhou Atmosphere",
    humidityLabel: "潮意",
    windLabel: "风息",
    scrollHint: "Scroll",
    sections: [
      { index: "01", title: "雨谷", text: "少年心绪、细碎故事与滚烫思考，都被绵绵细雨收纳于此。" },
      { index: "02", title: "流光", text: "流淌的随笔、破碎的故事与未写完的词章在此往复生长。" },
      { index: "03", title: "雾墅", text: "潮湿氤氲的居所，只为沉陷在回忆里的人留一盏暖光。" },
    ],
    porchEyebrow: "Spatial Entrances",
    porchTitle: "踏过湿润门廊，走入属于你的一段心绪。",
    portals: {
      blog: "诗行长廊",
      github: "仓库观测台",
      about: "心绪会客室",
      feed: "雨雾广播",
      music: "晚夏水室",
    },
  },
  about: {
    eyebrow: "About",
    title: "一个往返于盛夏与雨季之间的人",
    lead: "StarsailsClover 的数字空间，以代码做骨架，以雨雾、少年心事当作水汽。这里没有制式履历，只有文字沉淀下来的痕迹，是直面人间聚散之后留下的心绪路径。",
    timeline: [
      { label: "Words", text: "借笔墨收容春愁夏绪，把瞬间与细碎故事凝固成文。" },
      { label: "Research", text: "关注 AI、交互系统，凝望技术迭代与人世聚散。" },
      { label: "Mood", text: "将梅雨季、蝉鸣盛夏与未竟的少年情愫揉进时间线。" },
    ],
    focus: [
      { label: "OxygenAI Lab", text: "研究智能体决策、记忆系统与新一代模型交互。" },
      { label: "NDBlockConnect", text: "维护 Minecraft 工具链、跨版本模组加载与调试基础设施。" },
      { label: "OHPBP", text: "把效率工具、网络协议与个人基础设施打磨成可持续作品。" },
    ],
    stack: ["Rust", "Python", "Java", "C#", "C++", "TypeScript", "Linux"],
  },
  music: {
    eyebrow: "Music Room",
    title: "晚夏漫溢的播放队列",
    nowPlaying: "正在回响",
    silentTitle: "万籁浸雨",
    waitingArtist: "静待旋律漫入雾谷",
  },
  blog: {
    eyebrow: "Blog Archive",
    title: "岩壁之上，刻满雨与旧梦的诗行",
    xEyebrow: "X / x.com/sailshuang_",
    xTitle: "供远方访客阅览的雨雾短章",
    missingEyebrow: "Absent",
    missingTitle: "这一段心事尚且无处落笔",
    backToBlog: "返回诗行长廊",
    collectionsTitle: "文章合集",
    collectionsLead: "把分散的篇章收束成一条可以反复走入的路径。",
    tagsTitle: "标签",
  },
  github: {
    eyebrow: "GitHub Observatory",
    title: "仓库如同潮汐，记录每一次起落",
    statusLoading: "正在打捞公开仓库的时间痕迹…",
    statusSynced: "潮汐同步完成：",
    statusOffline: "GitHub 公开接口暂时不可触，进入潮汐离线观测模式。",
    offlineDescription: "离线模式：仓库内容将待潮信恢复之后显现。",
    contributionsTitle: "过去一年的代码潮汐",
    activityTitle: "最近动态",
    repositoriesTitle: "常用仓库",
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch) || !isPlainObject(base)) {
    return patch === undefined ? base : (patch as T);
  }
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    merged[key] =
      key in base
        ? deepMerge((base as Record<string, unknown>)[key], value)
        : value;
  }
  return merged as T;
}

let hydratedText: SiteText | null = null;
let remoteText: Promise<unknown> | null = null;

function decodeBase64Utf8(value: string) {
  const binary = window.atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function readHydratedText(): SiteText {
  if (hydratedText) return hydratedText;
  const node = document.getElementById("sails-site-text");
  if (!node?.textContent) {
    hydratedText = defaults;
    return hydratedText;
  }
  try {
    hydratedText = deepMerge(
      defaults,
      JSON.parse(decodeBase64Utf8(node.textContent.trim())),
    );
  } catch {
    hydratedText = defaults;
  }
  return hydratedText;
}

function loadRemoteText() {
  if (!remoteText) {
    remoteText = fetch("/api/v1/site-text", {
      headers: { "X-Sails-API-Version": "1" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`site text ${response.status}`);
        const payload = await response.json();
        return payload.text;
      })
      .catch(() =>
        fetch("/config/text.json").then((response) => {
          if (!response.ok) throw new Error(`text.json ${response.status}`);
          return response.json();
        }),
      );
  }
  return remoteText;
}

export function useSiteText(): SiteText {
  const [text, setText] = useState<SiteText>(() => readHydratedText());

  useEffect(() => {
    let cancelled = false;
    loadRemoteText()
      .then((data) => {
        if (cancelled) return;
        const merged = deepMerge(defaults, data);
        hydratedText = merged;
        setText(merged);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return text;
}

export { defaults as defaultSiteText };
