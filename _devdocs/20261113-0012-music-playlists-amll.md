# Sails Music Playlists & AMLL

请求时间: 2026-11-13 00:12 HKT

## 目标

- 修复歌词跟随真正的问题：自动居中时歌词区会自己滚到最底部。
- 音乐页在「创作专辑」下新增「精选歌单」，支持后台（sails-gg）完整编辑。
- 歌单可包含第三方曲目；后台可选接入 NetEaseCloudMusicApi-Enhanced。
- 主站右下角播放器可点开 AMLL 大歌词/大封面全屏页，复用全站播放状态。

## 设计

- 保持 React 18 + 原生 CSS 单一组件体系，不引入第二套 UI 库。
- 沿用夜雾黑绿 + 暖金视觉语言，12 栏栅格，移动端触控目标 ≥ 44px。
- AMLL 仅在全屏页动态加载（`import()`），不进入首屏 bundle；移动端降低模糊/缩放效果。
- 歌单数据落 SQLite，公共 API 只返回已发布歌单；管理 API 复用 session + CSRF + API 版本头。

## 数据

- `music_playlists`: 标题、slug、简介、封面、排序、状态、版本。
- `music_playlist_tracks`: 歌单、曲序、标题、歌手、专辑、封面、音频地址、来源、外部 ID、时长、原文/翻译 LRC。

## ToDo

- [x] 修复歌词自动居中的滚动目标计算并补首尾留白
- [x] 扩展 SQLite schema、迁移、歌单数据访问层
- [x] 公共与管理员歌单 API、可选网易云代理接口
- [x] 主站「精选歌单」区块与歌单详情页
- [x] 全站播放器支持歌单队列（上一首/下一首跟随歌单）
- [x] 管理端歌单工作区（增删改、曲目排序、发布）
- [x] AMLL 全屏歌词页（大封面 + 逐词歌词 + 双语）
- [x] 本地测试、类型检查、Lint、构建与浏览器验收
- [x] 部署 LAX、线上回归与文档/经验库更新

## 验收与发布

歌词跟随真正的问题不是「按钮自己冒出来」，而是自动居中算错了滚动目标：
`line.offsetTop` 的参照是页面容器（`page-frame`）而不是 `.lyric-viewport`，于是目标位置
（视口 2149 的最大滚动量下算出 2304）被浏览器夹到最底部。现改为按视口矩形差计算，
并在歌词容器首尾补留白，首句与末句也能居中。

### 新增能力

- 音乐页新增「精选歌单」区块与歌单详情页 `/music/playlist/:slug`。
- 写作室新增「歌单」工作区：新建/发布、封面、简介、访客排序、曲目增删改与上下移动。
- 歌单曲目支持站内上传音频、外链地址与网易云导入（需在后台填写自建接口地址）。
- 全站播放器点击标题或封面放大键进入 AMLL 大歌词/大封面页，逐词高亮 + 双语。

### 验证证据

- 服务端测试：`npm run test:server` 通过，新增歌单草稿不可见、发布可见、曲目排序与版本冲突覆盖。
- LRC 测试：`npm run test:lyrics` 4/4 通过。
- 本地浏览器：`C:\Users\Sails\.qa-playwright\verify-music-playlists-amll.mjs`
  （歌单 CRUD、`/music` 精选歌单、歌单详情、AMLL 逐词页 6 行有文字且第 16 句高亮、
  桌面与 390px 无横向溢出、唱片页 centerOffset 0/-1px、截图 7 张）。
- 线上回归：`C:\Users\Sails\.qa-playwright\sails-music-live-20261113.json`
  （音乐盒精选 11 首、真实播放 `/assets/musicbox/Elegant.mp3`、大歌词页、唱片页 centerOffset 0/-1px 未贴底）。
- AMLL 只在需要时动态加载：`amll-core` 453KB / `amll-lyric` 91KB 独立分包，主包不受影响。

### 发布

- 当前 LAX release：`/srv/sails-site/releases/20261112T170748Z`（上一版 `20261112T151408Z`）。
- 服务端源码同步到 `/srv/sails-site/app/server`，备份 `/root/sails-site-deploy-backups/20261112T170822Z-server`。
- 生产歌单：`音乐盒精选`（slug `musicbox-selection`，11 首旧音乐盒曲目，可在写作室继续编辑）。

### 依赖与许可

- 新增 `@applemusic-like-lyrics/core@0.6.0`（AGPL-3.0）、`@applemusic-like-lyrics/lyric@1.1.0`。
  站点源码公开在 `StarsailsClover/SailsSite`，满足 AGPL 的源码可得要求；若将来改为闭源，需要重新评估。
- 网易云接口仅为可选连接器：后台填写自建 `NeteaseCloudMusicApi-Enhanced` 地址后才可用，
  音频与封面统一经同源 `/media-proxy`（仅放行 126.net / 163.com 域名）转发，避免混合内容与防盗链。
