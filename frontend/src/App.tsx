import { Routes, Route } from 'react-router-dom'
import { Layout } from 'antd'
import DocumentListPage from './pages/DocumentListPage'
import AuditReviewPage from './pages/AuditReviewPage'

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
                <h1 style={{ color: 'white', margin: 0, fontSize: '20px', cursor: 'pointer' }}
                    onClick={() => window.location.href = '/'}>
                    📚 AI辅助物理教辅审稿系统
                </h1>
            </Header>
            <Content style={{ padding: '16px', background: '#f0f2f5' }}>
                <Routes>
                    <Route path="/" element={<DocumentListPage />} />
                    <Route path="/review/:docId" element={<AuditReviewPage />} />
                </Routes>
            </Content>
        </Layout>
    )
}

export default App
