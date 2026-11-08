# LAX 部署说明

## 目录

- `/srv/sails-site/app`: Node API 和仅生产依赖。
- `/srv/sails-site/releases/<timestamp>/dist`: 前端静态文件。
- `/srv/sails-site/current`: 指向上一次或当前前端发布的软链接。
- `/srv/sails-site/data`: SQLite、WAL 与上传图片。
- `/srv/sails-site/shared/musicbox`: 只保存一份音乐媒体。

## 首次部署

1. 创建 `sails-site` 系统用户和上述目录。
2. 在 `/srv/sails-site/app` 安装 `server/package-lock.json` 的生产依赖。
3. 将 `server/`、`package.json`、`package-lock.json` 放入 `/srv/sails-site/app`。
4. 生成密码哈希和随机 `IP_HASH_SECRET`，写入权限 `600` 的 `/etc/sails-site.env`。
5. 安装 systemd 与 Nginx 配置，先启动 HTTP ACME 配置。
6. DNS 生效后签发同时覆盖两个域名的 Let's Encrypt 证书。
7. 切换最终 Nginx 配置，执行 `nginx -t` 后再 reload。

## 发布

1. 本地执行 `npm run check && npm run lint && npm run test:server && npm run build`。
2. 上传 `dist` 到新的 `/srv/sails-site/releases/<timestamp>/dist`。
3. 原子切换 `/srv/sails-site/current`。
4. 在发布目录的 `dist/assets/musicbox` 中为共享 MP3 建立软链接，避免每个版本重复占空间。
5. `systemctl restart sails-site`，再检测 `/healthz`、公开文章和两个域名的 TLS。
6. 只保留当前和上一版静态发布，删除更旧目录。

## 备份

- 数据库使用 SQLite 在线备份或 `sqlite3 data/site.db ".backup ..."`。
- 上传目录与数据库一起打包。
- 修改 Nginx 前先归档 `/etc/nginx/sites-available`、`sites-enabled` 和 `snippets`。
