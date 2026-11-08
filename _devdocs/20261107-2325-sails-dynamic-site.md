# Sails Dynamic Site

请求时间: 2026-11-07 23:25 HKT

<!-- G i t H u b @S t a r s a i l s C l o v e r -->

## 目标

- 将静态个人站升级为可从任意设备写文章和管理内容的动态站点。
- 公网入口: `https://sails.oxygenai.top`
- 独立管理入口: `https://sails-gg.oxygenai.top`
- 部署到 LAX，不干扰现有邮件、New API、QQ、Prima 等服务。
- 审计现有站点安全与可用性问题，并修复可复现风险。
- 桌面浏览器使用高质量 3D 光影与材质；移动端自动降低渲染成本。

## 技术方案

- 前端: React 18 + Vite 6 + React Three Fiber。
- 后端: Node.js 22 原生 HTTP 服务 + `node:sqlite`，避免额外数据库进程。
- 数据库: 单文件 SQLite，保存文章、管理员会话、登录审计和文章修订。
- 管理认证: `scrypt` 密码哈希、随机 HttpOnly 会话、CSRF 双提交、登录限速。
- 内容安全: Markdown 服务端与浏览器双端净化；严格 CSP 与安全响应头。
- 部署: Nginx 静态文件 + 同源 `/api/v1` 反向代理 + systemd 服务。
- 媒体: 本地图片上传经 MIME/尺寸校验、WebP 重编码和元数据剥离。

## 设计方向

- 色彩: 夜雾黑绿、冷灰玻璃、月光蓝、少量室内琥珀光。
- 字体: 中文衬线标题 + 系统无衬线正文；管理台使用系统无衬线，保证移动输入稳定。
- 布局: 十二竖格、二十四横格；桌面文章列表与编辑区双栏，手机单栏分段。
- 原则: 前台保留空间叙事；后台只保留写作、预览、发布、历史和设置四类动作。
- 3D: 桌面高精度模型、PCF 阴影、受控 Bloom、玻璃/水体高光；手机简化几何、关闭阴影和后处理。

## ToDo

- [x] 建立源码基线并完成现有构建
- [x] 实现 SQLite 数据层、认证、CSRF、限速与文章 CRUD API
- [x] 实现 Markdown 净化、图片上传与修订历史
- [x] 将公开博客切换为动态 API
- [x] 实现移动优先的独立文章管理端
- [x] 修复现有 XSS、外链、CSP、CNAME 和部署回退风险
- [x] 分档优化别墅、岩壁、水体、雾与光照
- [x] 完成 lint、类型检查、构建、API 测试和 Playwright 验收
- [x] 备份 LAX 配置并部署 systemd、Nginx、SQLite 与媒体
- [x] 配置 DNS 与 TLS，完成线上桌面/手机验收
- [x] 更新经验库与部署文档

## 第二阶段

完成时间: 2026-11-08 14:47 HKT

- [x] 文章合集、访客排序、合集简介与已有文章选择
- [x] 文章标签、博客筛选与标签详情页
- [x] 网站文案管理及首屏服务端注入，消除默认文案闪变
- [x] 图片/视频媒体库、粘贴 URL/Markdown、视频 Range 播放
- [x] X 动态服务端缓存、同源媒体代理与 `/feed` 真实内容
- [x] GitHub 资料、仓库、最近事件与 365 天贡献热力图
- [x] `/editor` 归档重定向，主站导航移除入口
- [x] marked + DOMPurify + highlight.js 双端净化渲染升级
- [x] 管理 API 域名隔离、API 版本门禁与安全响应头
- [x] 桌面/移动两档 3D 质量、别墅和山谷场景材质优化
- [x] 移动主站六等分顶栏与管理端 44px 触控模式栏
- [x] 原 Profile 仓库清理网站文件并保留 README 与 Actions 文件
- [x] 独立 `StarsailsClover/SailsSite` 仓库与 CI
- [x] LAX release、部署备份与临时包清理，只保留当前和上一版

## 发布证据

- 源码提交: `f5adaddf600a6a12155ab00f466009f85ae667d8`
- GitHub Actions: `42453433227`，成功
- 线上回归: `C:\Users\Sails\.qa-playwright\sails-final-regression-20261108.json`
- 当前 LAX release: `/srv/sails-site/releases/20261108T031422Z`
- 上一版: `/srv/sails-site/releases/20261108T024331Z`
