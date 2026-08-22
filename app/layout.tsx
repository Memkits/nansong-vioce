import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '南宋声景｜吴地拟音古文朗读',
  description: '以可追溯的音韵规则生成南宋临安与婺州（金华）的研究性拟音。',
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
