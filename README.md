# 电影取票码生成器

粘贴取票通知，生成复古实体票风格的取票码票面，导出高清 PNG 保存到相册——既用于取票机扫码，也作为观影留念。

在线地址：<https://iskuggy.github.io/movie-ticket-code/>

## 定位

个人自用工具。**真正的产品是「保存到相册」导出的那张 PNG 票面**，网页本身只是生成器：在家生成、存入相册，到影院直接用相册里的图取票。因此本项目不追求离线能力、多用户加固或 CDN 容灾。

## 功能

- **智能识别**：粘贴猫眼、淘票票等平台的订单通知，本地正则提取电影名/影院/场次/座位/取票码；可开启 AI 模式（DeepSeek）获得更准确的解析
- **手动填写**：直接输入各字段生成
- **票面导出**：仿实体票设计（邮戳、撕票孔、点阵取票码、二维码），canvas 绘制 1242px 宽高清 PNG，通过系统分享面板存入相册

## 架构

```
index.html      单文件页面（CSS/JS 全内联），GitHub Pages 部署，push main 即上线
worker/         Cloudflare Worker，DeepSeek API 代理
assets/         图标
```

- 页面无构建步骤，无框架，改完直接 push（GitHub Pages 缓存 max-age=600，约 10 分钟全网生效）
- Worker 部署：`cd worker && npx wrangler deploy`，DeepSeek API key 存在 Cloudflare Secret 中，不出现在任何源码里
- **两套票面渲染**：页面展示卡（DOM/CSS）和导出 PNG（canvas 手绘）是独立的两份实现，改票面设计必须两边同步修改

## 已知事项与使用纪律

- **导出时需保证字体可加载**：canvas 票面使用 Google Fonts 的 Noto Sans SC / DM Sans，加载失败不会报错，只会静默退化为系统字体，存进相册的票面会永久变丑。生成时确保网络能访问 Google Fonts。
- **AI 解析在国内直连不可用**：`workers.dev` 域名被 DNS 污染，需代理环境；本地正则识别不受影响。
- **限流真相**：真正生效的是 Worker 内自写的内存滑动窗口（10 次/分/IP，按 isolate 独立）；`wrangler.toml` 里的 `[[ratelimits]]` 绑定对小突发基本不拦，只作为第二层。
- **自动化测试**：「保存票券」会调 `navigator.share` 弹出系统原生分享面板并卡死 CDP，浏览器自动化时需先覆盖 `window.canvasToFile` 再调 `saveTicket()`；本地预览用 `python3 -m http.server`（扩展不允许 `file://` 页面）。
