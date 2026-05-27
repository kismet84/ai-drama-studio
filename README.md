# Drama Studio — AI 短剧生产平台

一站式 AI 短剧生产平台，覆盖**剧本创作 → 视觉生成 → 配音合成**全流程。

## 工作流

```
剧本工坊 (9步创作向导)
  ├─ 选题 → 简介 → 世界观 → 人物属性卡 → 悬念清单
  ├─ 整体大纲 → 分集大纲 → 分场大纲 → 剧本正文
  └─ 一键调整修复（逻辑/人设/节奏/悬念/合规）
    ↓
视觉工坊
  ├─ 场景画面 — 全景/中景/特写 AI 出图（DeepSeek 提示词 + MiniMax Image-01）
  ├─ 角色形象 — 正面/侧面/背面三视图（正面作 subject_reference）
  ├─ 图生视频 — SiliconFlow Wan2.2 / MiniMax Hailuo-02
  └─ 素材库 — 管理 + 客户端调色
    ↓
配音工坊
  ├─ DeepSeek 通读全文提取对白（自动识别说话人/情绪/独白）
  ├─ 表格编辑 + SiliconFlow CosyVoice2 TTS
  └─ 龙套角色自动检测并推断属性
    ↓
合成工坊（即将上线）
```

## 技术栈

| 层级 | 技术 |
|---|---|
| 框架 | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS 4 + Radix UI |
| 数据库 | Prisma + SQLite |
| AI 文本 | DeepSeek V4 |
| AI 图片 | MiniMax Image-01 |
| AI 视频 | SiliconFlow Wan2.2 / MiniMax Hailuo-02 |
| AI 语音 | SiliconFlow CosyVoice2 |
| 提示词 | 集中管理 `lib/ai/prompts.ts` |

## 快速开始

```bash
npm install
cp .env.example .env  # 编辑 .env 填入各 AI 服务 API Key
npx prisma db push
npm run dev
```

访问 http://localhost:3000

## 环境变量

```env
DATABASE_URL="file:./dev.db"

# 文本生成
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...

# 图片生成
IMAGE_PROVIDER=minimax
MINIMAX_API_KEY=sk-...

# 语音合成
TTS_PROVIDER=siliconflow
SILICONFLOW_API_KEY=sk-...

# 视频生成 (siliconflow 或 minimax)
VIDEO_PROVIDER=siliconflow
```

## 项目结构

```
src/
├── app/
│   ├── (dashboard)/dashboard/   # 项目列表 Dashboard
│   ├── studio/[id]/
│   │   ├── script/              # 剧本工坊 — 9步创作向导
│   │   ├── visual/              # 视觉工坊 — 场景/角色/视频/素材
│   │   │   └── _components/     # SceneImagePanel, CharacterImagePanel, VideoPanel, AssetLibraryPanel
│   │   ├── voice/               # 配音工坊 — 对白提取 + TTS
│   │   └── composition/         # 合成工坊 — 即将上线
│   └── api/                     # REST API routes
├── components/ui/               # Radix UI 组件封装
├── lib/
│   ├── ai/
│   │   ├── client.ts            # AI 服务层（DeepSeek/MiniMax/SiliconFlow）
│   │   └── prompts.ts           # 模型提示词模板
│   ├── db/prisma.ts             # Prisma client
│   └── utils/cn.ts              # className 工具
└── types/index.ts               # TypeScript 类型定义
```

## AI 模型配置

所有提示词集中管理在 `src/lib/ai/prompts.ts`，按模型分组：

- **DeepSeek**: 剧本生成、角色三视图描述、场景镜头 prompt、对白提取、龙套推断
- **MiniMax Image-01**: 场景画面 + 角色三视图（通过 DeepSeek 生成的英文 prompt）
- **SiliconFlow Wan2.2**: 视频生成（Subject+Scene+Motion+Aesthetic 公式）
- **SiliconFlow CosyVoice2**: TTS 语音合成

## License

MIT
