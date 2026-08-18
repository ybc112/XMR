// 构建并合并 admin-panel 到 frontend/dist/panel（Vercel /panel 子路径部署）
// 由 frontend 的 build 脚本调用：vite build && node scripts/merge-admin.mjs
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, '..');
const adminDir = path.resolve(frontendDir, '..', 'admin-panel');
const target = path.join(frontendDir, 'dist', 'panel');

// 1. 构建 admin-panel（base: /panel/，Router basename: /panel）
console.log('[merge-admin] 构建 admin-panel ...');
execSync('npm install', { cwd: adminDir, stdio: 'inherit' });
execSync('npm run build', { cwd: adminDir, stdio: 'inherit' });

// 2. 复制到 frontend/dist/panel
console.log('[merge-admin] 合并到 dist/panel ...');
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(path.join(adminDir, 'dist'), target, { recursive: true });
console.log('[merge-admin] 完成 ✅ 后台将部署在 /panel 路径');
