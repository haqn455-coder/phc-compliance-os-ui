import { copyFile, cp, mkdir } from 'node:fs/promises';

const files = [
  'apply-founder-baseline.html', 'founder-clinic-pilot.html', 'founder-export.html',
  'founder-pilot.html', 'friend-demo.html', 'legacy-console.html',
  'legacy-p01-owner.html', 'p01-login.html', 'p01-owner.html', 'pilot-admin.html',
  'pilot-request.html', 'robots.txt'
];
const directories = ['product', 'persistence', 'regulatory'];

await mkdir('dist', { recursive: true });
await Promise.all(files.map(file => copyFile(file, `dist/${file}`)));
await Promise.all(directories.map(dir => cp(dir, `dist/${dir}`, { recursive: true })));
