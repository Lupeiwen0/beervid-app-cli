export default function Home() {
  return (
    <main>
      <h1>BEERVID Next.js API Route 集成示例</h1>
      <p>本示例使用 Next.js App Router + API Route 模式集成 BEERVID Open API。</p>

      <h2>API Routes</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={th}>方法</th>
            <th style={th}>路径</th>
            <th style={th}>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}>GET</td>
            <td style={td}><code>/api/oauth/url?type=tt</code></td>
            <td style={td}>获取 OAuth URL</td>
          </tr>
          <tr>
            <td style={td}>GET</td>
            <td style={td}><code>/api/oauth/callback</code></td>
            <td style={td}>OAuth 回调处理</td>
          </tr>
          <tr>
            <td style={td}>POST</td>
            <td style={td}><code>/api/publish/tt</code></td>
            <td style={td}>TT 完整发布流程</td>
          </tr>
          <tr>
            <td style={td}>POST</td>
            <td style={td}><code>/api/publish/tts</code></td>
            <td style={td}>TTS 完整发布流程</td>
          </tr>
          <tr>
            <td style={td}>GET</td>
            <td style={td}><code>/api/status/[shareId]</code></td>
            <td style={td}>发布状态查询</td>
          </tr>
          <tr>
            <td style={td}>GET</td>
            <td style={td}><code>/api/products?creatorId=xxx</code></td>
            <td style={td}>商品查询</td>
          </tr>
        </tbody>
      </table>

      <h2>请求示例</h2>
      <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, overflow: 'auto' }}>
{`# 获取 OAuth URL
curl http://localhost:3000/api/oauth/url?type=tt

# TT 完整发布
curl -X POST http://localhost:3000/api/publish/tt \\
  -H "Content-Type: application/json" \\
  -d '{"businessId":"biz_123","videoUrl":"https://cdn.beervid.ai/xxx.mp4"}'

# TTS 完整发布
curl -X POST http://localhost:3000/api/publish/tts \\
  -H "Content-Type: application/json" \\
  -d '{"creatorId":"open_user_abc","videoFileId":"vf_123","productId":"prod_1","productTitle":"Widget"}'

# 查询状态
curl http://localhost:3000/api/status/share_abc?businessId=biz_123

# 查询商品
curl http://localhost:3000/api/products?creatorId=open_user_abc`}
      </pre>
    </main>
  )
}

const th: React.CSSProperties = {
  border: '1px solid #ddd', padding: '8px 12px', textAlign: 'left', background: '#f9f9f9',
}
const td: React.CSSProperties = {
  border: '1px solid #ddd', padding: '8px 12px',
}
