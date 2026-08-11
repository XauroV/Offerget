# Offerget

Offerget 是一个面向校招求职者的本地岗位管理工具。粘贴公开招聘链接后，它会提取公司、岗位名称、发布日期、截止日期、工作地、岗位职责和任职要求，并在核对后写入岗位库。

项目同时提供 Codex Skill。遇到陌生招聘网站或字段识别不完整时，Codex 可以复现公开页面、补充平台适配器、添加回归测试并重新验证该链接。

## 核心能力

- 公开岗位链接识别，支持完整、局部、失败三种状态
- JSON-LD、普通 HTML、ByteDance、Alibaba Campus、北森招聘、Moka、Lever、Greenhouse
- 列表与看板视图、企业分组、投递规则备注
- 自定义投递状态、批量管理、岗位对比、回收站
- 喜欢、能做、一般、无感四档岗位偏好
- 产品、设计、运营、销售、管培生等标题驱动的宽口径岗位分类
- 手动关键词，使用逗号分隔
- 深色与浅色模式
- 本地 JSON 持久化，岗位数据默认不会离开电脑

## 本地运行

要求 Node.js `>=22.13.0`。

```bash
npm install
npm run dev -- -p 3001
```

打开 <http://localhost:3001/>。

Windows 也可以运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-job-tracker.ps1
```

该脚本使用 `3217` 端口并自动打开浏览器。

## 安装 Codex Skill

在仓库根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-offerget-skill.ps1
```

重新打开一个 Codex 任务后，可以发送：

```text
使用 $offerget 启动岗位库，并记录这个岗位链接：https://example.com/job/123
```

当链接识别局部或失败时，Skill 会在公开访问和安全边界内继续诊断适配器。

## 数据位置

网页数据默认保存在：

```text
.offerget/state.json
```

该目录已加入 `.gitignore`。请勿把真实岗位数据、备份文件、Cookies、登录凭证或 `.env.local` 提交到 GitHub。

早期桌面版 SQLite 数据可以使用以下脚本导出：

```bash
node skills/offerget/scripts/export-desktop-state.cjs <job-tracker.db> <backup.json>
```

## 验证

```bash
npm test
```

测试覆盖解析状态、招聘平台适配器、本地状态接口、关键交互和 Skill 包结构。

## 产品约定

完整产品决策、交互细节和验收边界见 [product-contract.md](skills/offerget/references/product-contract.md)，招聘网站适配流程见 [adapter-workflow.md](skills/offerget/references/adapter-workflow.md)。

## 隐私与边界

- 只读取用户提供的公开招聘页面
- 不绕过登录、验证码、人机验证、访问控制或速率限制
- 不编造缺失的岗位字段
- 不上传本地岗位数据和备份

## License

[MIT](LICENSE)
