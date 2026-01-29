import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Card, Row, Col, Button, List, Tag, Modal, Upload,
    message, Spin, Typography, Space, Empty, Progress, Popconfirm
} from 'antd'
import {
    UploadOutlined, FileTextOutlined, DeleteOutlined,
    ScissorOutlined, PlayCircleOutlined, EyeOutlined,
    CheckCircleOutlined, ClockCircleOutlined
} from '@ant-design/icons'
import type { UploadFile } from 'antd/es/upload/interface'
import { uploadApi, splitApi, auditApi, DocumentInfo, Segment, AuditResults } from '../services/api'

const { Title, Text, Paragraph } = Typography

interface DocListItem {
    docId: string
    info: DocumentInfo
    segments: Segment[]
    auditResults: AuditResults | null
}

function DocumentListPage() {
    const navigate = useNavigate()

    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)
    const [docList, setDocList] = useState<DocListItem[]>([])
    const [selectedDoc, setSelectedDoc] = useState<string | null>(null)

    useEffect(() => {
        loadDocuments()
    }, [])

    // 从localStorage加载文档ID列表
    const loadDocuments = async () => {
        try {
            const savedIds = JSON.parse(localStorage.getItem('audit_doc_ids') || '[]') as string[]
            const docs: DocListItem[] = []

            for (const docId of savedIds) {
                try {
                    const [info, segments] = await Promise.all([
                        uploadApi.getInfo(docId),
                        splitApi.getSegments(docId)
                    ])

                    let auditResults: AuditResults | null = null
                    try {
                        auditResults = await auditApi.getResults(docId)
                    } catch { /* 没有审核结果 */ }

                    docs.push({ docId, info, segments, auditResults })
                } catch {
                    // 文档可能已被删除，从列表移除
                    const newIds = savedIds.filter(id => id !== docId)
                    localStorage.setItem('audit_doc_ids', JSON.stringify(newIds))
                }
            }

            setDocList(docs)
        } catch {
            message.error('加载文档列表失败')
        } finally {
            setLoading(false)
        }
    }

    // 上传文件
    const handleUpload = async (file: File) => {
        setUploading(true)
        try {
            const result = await uploadApi.upload(file)

            // 保存到localStorage
            const savedIds = JSON.parse(localStorage.getItem('audit_doc_ids') || '[]') as string[]
            if (!savedIds.includes(result.doc_id)) {
                savedIds.unshift(result.doc_id)
                localStorage.setItem('audit_doc_ids', JSON.stringify(savedIds))
            }

            message.success(`上传成功！共${result.page_count}页`)
            loadDocuments()
            setSelectedDoc(result.doc_id)
        } catch {
            message.error('上传失败')
        } finally {
            setUploading(false)
        }
    }

    // 删除文档
    const deleteDoc = async (docId: string) => {
        const savedIds = JSON.parse(localStorage.getItem('audit_doc_ids') || '[]') as string[]
        const newIds = savedIds.filter((id: string) => id !== docId)
        localStorage.setItem('audit_doc_ids', JSON.stringify(newIds))

        if (selectedDoc === docId) {
            setSelectedDoc(null)
        }

        setDocList(prev => prev.filter(d => d.docId !== docId))
        message.success('已从列表移除')
    }

    const getDocStatus = (doc: DocListItem) => {
        if (doc.auditResults && doc.auditResults.issues.length > 0) {
            const total = doc.auditResults.issues.length
            const confirmed = doc.auditResults.issues.filter(i => i.status === 'confirmed').length
            const rejected = doc.auditResults.issues.filter(i => i.status === 'rejected').length
            return { status: 'audited', total, confirmed, rejected, pending: total - confirmed - rejected }
        }
        if (doc.segments.length > 0) {
            return { status: 'segmented', segmentCount: doc.segments.length }
        }
        return { status: 'uploaded' }
    }

    const selectedDocData = docList.find(d => d.docId === selectedDoc)

    if (loading) {
        return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
    }

    return (
        <div>
            <Row gutter={16}>
                {/* 左侧：文档列表 */}
                <Col span={8}>
                    <Card
                        title="📚 文档列表"
                        extra={
                            <Upload
                                accept=".docx"
                                showUploadList={false}
                                beforeUpload={file => { handleUpload(file); return false }}
                            >
                                <Button type="primary" icon={<UploadOutlined />} loading={uploading}>
                                    上传文档
                                </Button>
                            </Upload>
                        }
                    >
                        {docList.length === 0 ? (
                            <Empty description="暂无文档，请上传DOCX文件" />
                        ) : (
                            <List
                                dataSource={docList}
                                style={{ maxHeight: 500, overflowY: 'auto' }}
                                renderItem={doc => {
                                    const status = getDocStatus(doc)
                                    const isSelected = selectedDoc === doc.docId

                                    return (
                                        <List.Item
                                            style={{
                                                cursor: 'pointer',
                                                background: isSelected ? '#e6f7ff' : 'transparent',
                                                padding: '8px 12px',
                                                borderRadius: 4
                                            }}
                                            onClick={() => setSelectedDoc(doc.docId)}
                                            actions={[
                                                <Popconfirm
                                                    key="del"
                                                    title="确定移除？"
                                                    onConfirm={e => { e?.stopPropagation(); deleteDoc(doc.docId) }}
                                                >
                                                    <Button size="small" danger icon={<DeleteOutlined />} onClick={e => e.stopPropagation()} />
                                                </Popconfirm>
                                            ]}
                                        >
                                            <List.Item.Meta
                                                avatar={<FileTextOutlined style={{ fontSize: 24, color: '#1890ff' }} />}
                                                title={
                                                    <Text ellipsis style={{ maxWidth: 150 }}>
                                                        {doc.info.filename}
                                                    </Text>
                                                }
                                                description={
                                                    <Space size={4}>
                                                        <Tag>{doc.info.page_count}页</Tag>
                                                        {status.status === 'audited' && (
                                                            <Tag color="green"><CheckCircleOutlined /> 已审核</Tag>
                                                        )}
                                                        {status.status === 'segmented' && (
                                                            <Tag color="blue"><ScissorOutlined /> 已分割</Tag>
                                                        )}
                                                        {status.status === 'uploaded' && (
                                                            <Tag><ClockCircleOutlined /> 待处理</Tag>
                                                        )}
                                                    </Space>
                                                }
                                            />
                                        </List.Item>
                                    )
                                }}
                            />
                        )}
                    </Card>
                </Col>

                {/* 中间：页面缩略图 */}
                <Col span={8}>
                    <Card title={selectedDocData ? `📄 ${selectedDocData.info.filename}` : '📄 页面预览'}>
                        {!selectedDocData ? (
                            <Empty description="选择一个文档查看" />
                        ) : (
                            <>
                                <div style={{ marginBottom: 12 }}>
                                    <Button
                                        type="primary"
                                        icon={<ScissorOutlined />}
                                        onClick={() => navigate(`/split/${selectedDoc}`)}
                                    >
                                        编辑分割
                                    </Button>
                                </div>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(4, 1fr)',
                                    gap: 6,
                                    maxHeight: 420,
                                    overflowY: 'auto'
                                }}>
                                    {Array.from({ length: selectedDocData.info.page_count }, (_, i) => i + 1).map(p => (
                                        <div key={p} style={{ textAlign: 'center' }}>
                                            <img
                                                src={splitApi.getThumbnailUrl(selectedDoc!, p)}
                                                alt={`P${p}`}
                                                style={{ width: '100%', border: '1px solid #d9d9d9', borderRadius: 2 }}
                                            />
                                            <Text style={{ fontSize: 10 }}>P{p}</Text>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </Card>
                </Col>

                {/* 右侧：区块列表 */}
                <Col span={8}>
                    <Card title="📦 区块与审核">
                        {!selectedDocData ? (
                            <Empty description="选择一个文档" />
                        ) : selectedDocData.segments.length === 0 ? (
                            <Empty description="未分割，请先编辑分割">
                                <Button type="primary" onClick={() => navigate(`/split/${selectedDoc}`)}>
                                    去分割
                                </Button>
                            </Empty>
                        ) : (
                            <>
                                <List
                                    size="small"
                                    style={{ maxHeight: 300, overflowY: 'auto' }}
                                    dataSource={selectedDocData.segments}
                                    renderItem={seg => {
                                        const segIssues = selectedDocData.auditResults?.issues.filter(
                                            i => i.segment_id === seg.id
                                        ) || []
                                        const certainCount = segIssues.filter(i => i.level === 'CERTAIN_ERROR').length
                                        const uncertainCount = segIssues.filter(i => i.level === 'UNCERTAIN').length

                                        return (
                                            <List.Item
                                                actions={[
                                                    <Button
                                                        key="audit"
                                                        size="small"
                                                        type={segIssues.length > 0 ? 'default' : 'primary'}
                                                        onClick={() => navigate(`/review/${selectedDoc}?segment=${seg.id}`)}
                                                    >
                                                        {segIssues.length > 0 ? '查看' : '审核'}
                                                    </Button>
                                                ]}
                                            >
                                                <div>
                                                    <Text strong>{seg.name}</Text>
                                                    <br />
                                                    <Space size={4}>
                                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                                            {seg.pages.length}页
                                                        </Text>
                                                        {certainCount > 0 && <Tag color="red" style={{ fontSize: 10 }}>🔴{certainCount}</Tag>}
                                                        {uncertainCount > 0 && <Tag color="orange" style={{ fontSize: 10 }}>🟡{uncertainCount}</Tag>}
                                                    </Space>
                                                </div>
                                            </List.Item>
                                        )
                                    }}
                                />

                                <Divider style={{ margin: '12px 0' }} />

                                <Space direction="vertical" style={{ width: '100%' }}>
                                    <Button
                                        block
                                        type="primary"
                                        icon={<PlayCircleOutlined />}
                                        onClick={() => navigate(`/review/${selectedDoc}`)}
                                    >
                                        {selectedDocData.auditResults ? '查看审核结果' : '开始AI审稿'}
                                    </Button>
                                </Space>

                                {selectedDocData.auditResults && (
                                    <div style={{ marginTop: 12, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
                                        <Text strong style={{ fontSize: 12 }}>审核统计</Text>
                                        <Row gutter={8} style={{ marginTop: 4 }}>
                                            <Col span={8}>
                                                <Text type="danger" style={{ fontSize: 18 }}>
                                                    {selectedDocData.auditResults.issues.filter(i => i.level === 'CERTAIN_ERROR').length}
                                                </Text>
                                                <br />
                                                <Text type="secondary" style={{ fontSize: 10 }}>确定错误</Text>
                                            </Col>
                                            <Col span={8}>
                                                <Text style={{ fontSize: 18, color: '#faad14' }}>
                                                    {selectedDocData.auditResults.issues.filter(i => i.level === 'UNCERTAIN').length}
                                                </Text>
                                                <br />
                                                <Text type="secondary" style={{ fontSize: 10 }}>待复核</Text>
                                            </Col>
                                            <Col span={8}>
                                                <Text type="success" style={{ fontSize: 18 }}>
                                                    {selectedDocData.auditResults.issues.filter(i => i.status !== 'pending').length}
                                                </Text>
                                                <br />
                                                <Text type="secondary" style={{ fontSize: 10 }}>已处理</Text>
                                            </Col>
                                        </Row>
                                    </div>
                                )}
                            </>
                        )}
                    </Card>
                </Col>
            </Row>
        </div>
    )
}

export default DocumentListPage
