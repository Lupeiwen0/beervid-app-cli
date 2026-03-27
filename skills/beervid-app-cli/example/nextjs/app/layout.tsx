export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 800, margin: '0 auto', padding: 20 }}>
        {children}
      </body>
    </html>
  )
}
