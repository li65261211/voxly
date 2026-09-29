# Voxly — AI Text Rewriter Chrome Extension

> Your Voice, Not AI's Voice. A minimal, non-intrusive Chrome extension that rewrites any selected text while preserving your unique writing style.

---

## 产品概述

Voxly 是一个 Chrome 扩展 + Web Dashboard，专注于解决现有 AI 写作工具的三大痛点：
1. **侵入性 UI**（Grammarly 的弹窗和侧边栏）
2. **丢失个人风格**（所有工具改写后都像一个机器人写的）
3. **激进的免费限制**（QuillBot 免费版 125 字，QuillBot 月费 $20+）

**核心差异化：** Style Learning —— 上传几段你的文字，AI 学习你的语气模式，之后所有改写都保持你的调性。

---

## MVP 功能清单（按优先级）

### Phase 1 — P0 核心体验（2-3 周上线）

| # | 功能 | 描述 | 技术方案 | 验证指标 |
|---|------|------|----------|---------|
| F1 | 右键菜单重写 | 选中文字 → 右键 → "Rewrite with Voxly" → 侧边面板显示结果 | Chrome MV3 Content Script | 转化率 > 15% |
| F2 | Tone Selector | 5 种预设：Professional / Casual / Academic / Persuasive / Concise | OpenAI GPT-4o-mini API call | 留存率 > 40% |
| F3 | 一键复制结果 | 改写结果旁有 Copy 按钮，一键复制到剪贴板 | Clipboard API | 重复使用率 |
| F4 | 最小化弹窗 | 不弹 Toast、不自动关闭干扰，用户手动关闭 | CSS overlay panel | NPS > 30 |
| F5 | 免费额度 | 每天 50 次改写免费，超额引导升级 | Local storage counter + cloud sync via Supabase | 付费转化 > 5% |

### Phase 2 — P1 增长引擎（第 4-6 周）

| # | 功能 | 描述 | 技术方案 | 验证指标 |
|---|------|------|----------|---------|
| F6 | Style Learning | 上传 3-5 段个人文字，AI 提取风格特征（pangrams, sentence patterns） | Fine-tune prompt with user samples stored in Supabase | MRR 提升 3x |
| F7 | 历史记录 | 保存用户改写历史，可回溯 | Supabase rows table: user_id + content + output + timestamp | DAU/MAU > 30% |
| F8 | 快捷键 Ctrl+Shift+R | 不点右键也能快速触发 | chrome.commands API | 高级用户渗透率 |
| F9 | 多平台支持 | 同时在 Gmail、LinkedIn、Twitter、Notion 可用 | Manifest `<all_urls>` + content script injection | 跨平台使用占比 |
| F10 | 积分系统 | 购买积分包(100/500/2000次)，不用订阅 | Stripe one-time purchase → credits in Supabase | LTV > $30 |

### Phase 3 — P2 规模增长（第 7-12 周）

| # | 功能 | 描述 | 技术方案 | 验证指标 |
|---|------|------|----------|---------|
| F11 | AI Detector Badge | 显示改写文本的 AI 概率分数（可选） | GPTZero API 或自建 detector model | 学术用户群 |
| F12 | Team Workspace | 多人共享 Style Profile，团队统一语调 | Supabase RLS + team table | B2B 收入 |
| F13 | Browser Extension API | 其他开发者集成 Voxly API | REST API + rate limiting | Ecosystem lock-in |
| F14 | Mobile App (PWA) | 手机/平板上同样可用 | Next.js PWA | 移动端覆盖 |
| F15 | Affiliate Program | 推荐朋友得积分 | Referral codes in Supabase | CAC 降低 50% |

---

## 定价策略

**Phase 1 (MVP 首发):**
- **Free Tier:** 50 次/天, 5 种 Tone, 无历史记录
- **Pro (一次性买断):** $19 买断（含全部 Style Learning + 无限改写 + 历史记录）
- **Credits (按需充):** $5 = 100 次改写，$15 = 500 次

**定价逻辑:**
- 买断制避开订阅疲劳（Indie Hackers 社区强烈反馈）
- Credits 降低进入门槛（先用后付感更强）
- $19 是一次性消费心理锚点（一杯咖啡的钱）

---

## 技术栈

```
Frontend (Chrome Extension):
  - Vite + React + TypeScript
  - Chrome Manifest V3
  - Tailwind CSS (设计语言参考 Linear.app)

Web Dashboard:
  - Next.js 15 (App Router)
  - Supabase (Auth + Database + Storage)
  - Stripe (billing)

Backend API:
  - Supabase Edge Functions (Deno/Node)
  - OpenAI API (GPT-4o-mini 用于改写, GPT-4o 用于 Style Learning)

Infrastructure:
  - Vercel (Next.js hosting)
  - Cloudflare (DNS + CDN)
  - GitHub Actions (CI/CD)
```

---

## 成本预估（每月）

| 项目 | 成本 |
|------|------|
| OpenAI GPT-4o-mini API | ~$10-30 (前 1000 用户) |
| Supabase Pro | $25/月 |
| Vercel Hobby | $0 (免费 tier) |
| Cloudflare Pro | $0 (免费 tier) |
| **总计** | **$35-55/月** |

当月收入达到 $1000 MRR 时即可覆盖所有成本。

---

## Go-to-Market 策略

**Launch 渠道（按 ROI 排序）:**

1. **Product Hunt Launch** — 第一天冲榜，带来首批 1000+ 安装
2. **r/SaaS + r/chromeextensions + r/Entrepreneur** — 社区发帖分享构建过程
3. **Twitter/X Build in Public** — 每天发一条更新，积累种子用户
4. **Indie Hackers** — 发布 "How I built a $5K MRR Chrome extension"
5. **SEO Landing Page** — 目标关键词: "AI text rewriter", "rewrite text Chrome extension"
6. **Chrome Web Store ASO** — 标题/描述优化，获取自然搜索流量

---

## 成功指标（6 个月目标）

| 指标 | M1 | M3 | M6 |
|------|-----|-----|-----|
| Chrome Store Rating | - | 4.5+ | 4.7+ |
| Monthly Active Users | 500 | 2000 | 5000 |
| Conversion to Paid | 3% | 5% | 8% |
| MRR | $0 | $500 | $3000 |
| Churn Rate | - | <5% | <3% |

---

*Last updated: 2025*
*Author: Solo Founder @ Voxly*
