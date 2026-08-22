import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '南宋声景｜未经验证的 AI 拟音原型',
  description: 'AI 辅助 vibe coding 的未验证原型：以可追溯规则探索南宋临安与婺州（金华）拟音。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
