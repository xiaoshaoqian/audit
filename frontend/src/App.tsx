import { Routes, Route } from 'react-router-dom'
import { Layout } from 'antd'
import DocumentListPage from './pages/DocumentListPage'
import AuditReviewPage from './pages/AuditReviewPage'
import HomePage from './pages/HomePage'
import WorkbenchPage from './pages/WorkbenchPage'

const { Header, Content } = Layout

function App() {
    return (
        <Layout style={{ minHeight: '100vh' }}>
            <Header style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 24px'
            }}>
                <h1 style={{ color: 'white', margin: 0, fontSize: '20px', cursor: 'pointer', marginRight: '40px' }}
                    onClick={() => window.location.href = '/'}>
                    📚 AI辅助物理教辅审稿系统
                </h1>
                <div style={{ display: 'flex', gap: '20px' }}>
                    <a href="/" style={{ color: 'white', fontSize: '16px' }}>首页 (审核)</a>
                    <a href="/workbench" style={{ color: 'white', fontSize: '16px' }}>✂️ 制作工作台</a>
                    <a href="/legacy" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>旧版文档库</a>
                </div>
            </Header>
            <Content style={{ padding: '0', background: '#f0f2f5' }}>
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/workbench" element={<WorkbenchPage />} />
                    <Route path="/legacy" element={<DocumentListPage />} />
                    <Route path="/review/:docId" element={<AuditReviewPage />} />
                </Routes>
            </Content>
        </Layout>
    )
}

export default App
