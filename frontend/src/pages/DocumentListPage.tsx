import { useState, useEffect, useRef } from 'react'
import {
    Card, Row, Col, Button, List, Tag, Upload,
    message, Spin, Typography, Space, Empty, Divider,
    InputNumber, Modal, Select, Popconfirm, Switch
} from 'antd'
import {
    UploadOutlined, FileTextOutlined, DeleteOutlined,
    ScissorOutlined, PlayCircleOutlined, CheckCircleOutlined, ReloadOutlined,
    LeftOutlined, RightOutlined, CheckOutlined, ClockCircleOutlined
} from '@ant-design/icons'
import { uploadApi, splitApi, auditApi, DocumentInfo, Segment, AuditResults, PageRange, SegmentType } from '../services/api'


const { Text, Paragraph } = Typography

// 分割标记类型
interface SplitMark {
    pageNum: number
    position: number
}

const STORAGE_KEY = 'audit_split_marks'

interface DocListItem {
    docId: string
    info: DocumentInfo
    segments: Segment[]
    auditResults: AuditResults | null
}

function DocumentListPage() {
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)
    const [docList, setDocList] = useState<DocListItem[]>([])
    const [selectedDoc, setSelectedDoc] = useState<string | null>(null)



    const [splitMode, setSplitMode] = useState(false)
    const [splitMarks, setSplitMarks] = useState<SplitMark[]>([])
    const [previewPage, setPreviewPage] = useState<number | null>(null)
    const [selectedPage, setSelectedPage] = useState<number | null>(null) // 单击选中的页面
    const [maxPagesPerSegment, setMaxPagesPerSegment] = useState(5)
    const [isDragging, setIsDragging] = useState(false)
    const [dragMarkIndex, setDragMarkIndex] = useState<number | null>(null)

    const containerRef = useRef<HTMLDivElement>(null)
    const uploadingCount = useRef(0)

    useEffect(() => {
        loadDocuments()
    }, [])

    useEffect(() => {
        if (selectedDoc) {
            loadSavedMarks(selectedDoc)
            setSelectedPage(null) // Clear selection when switching docs
        }
    }, [selectedDoc])

    // Auto-save marks when they change
    useEffect(() => {
        if (selectedDoc && splitMarks.length >= 0) {
            localStorage.setItem(`${STORAGE_KEY}_${selectedDoc}`, JSON.stringify(splitMarks))
        }
    }, [splitMarks, selectedDoc])

    const loadSavedMarks = (docId: string) => {
        try {
            const saved = localStorage.getItem(`${STORAGE_KEY}_${docId}`)
            if (saved) {
                setSplitMarks(JSON.parse(saved))
            } else {
                setSplitMarks([])
            }
        } catch { /* ignore */ }
    }

    // 从服务器加载文档列表
    const loadDocuments = async () => {
        try {
            const serverDocs = await uploadApi.getDocuments()
            const docItems: DocListItem[] = []

            for (const doc of serverDocs) {
                try {
                    const [segments, auditResults] = await Promise.all([
                        splitApi.getSegments(doc.doc_id),
                        auditApi.getResults(doc.doc_id).catch(() => null)
                    ])

                    docItems.push({
                        docId: doc.doc_id,
                        info: doc,
                        segments,
                        auditResults
                    })
                } catch {
                    docItems.push({
                        docId: doc.doc_id,
                        info: doc,
                        segments: [],
                        auditResults: null
                    })
                }
            }
            // 按文件名开头的数字排序 1, 2, 10
            docItems.sort((a, b) => {
                const getNum = (name: string) => {
                    const match = name.match(/^(\d+)/)
                    return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER
                }
                const numA = getNum(a.info.filename)
                const numB = getNum(b.info.filename)

                if (numA !== numB) {
                    return numA - numB
                }
                return a.info.filename.localeCompare(b.info.filename, 'zh-CN')
            })
            setDocList(docItems)
        } catch {
            message.error('加载文档列表失败')
        } finally {
            setLoading(false)
        }
    }

    // 上传文件
    const handleUpload = async (file: File) => {
        uploadingCount.current += 1
        setUploading(true)
        try {
            await uploadApi.upload(file)
            message.success(`${file.name} 上传成功！`)
        } catch {
            message.error(`${file.name} 上传失败`)
        } finally {
            uploadingCount.current -= 1
            if (uploadingCount.current === 0) {
                setUploading(false)
                message.success('所有文件处理完毕')
                await loadDocuments()
            }
        }
    }

    // 删除文档
    const deleteDoc = async (docId: string) => {
        try {
            await uploadApi.deleteDocument(docId)

            if (selectedDoc === docId) {
                setSelectedDoc(null)
            }

            setDocList(prev => prev.filter(d => d.docId !== docId))
            message.success('已从服务器删除')
        } catch {
            message.error('删除失败')
        }
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

    const createAllSegments = async () => {
        if (!selectedDoc) return
        const segs = calculateSegments()
        if (segs.length === 0) {
            message.warning('请先标记分割点')
            return
        }

        const proceed = async () => {
            for (const seg of selectedDocData?.segments || []) {
                await splitApi.deleteSegment(selectedDoc, seg.id)
            }

            try {
                for (const seg of segs) {
                    await splitApi.createSegment(selectedDoc, seg.name, seg.pages, 'exercise')
                }
                message.success(`已创建 ${segs.length} 个区块，默认类型为“训练题”`)
                loadDocuments()
            } catch {
                message.error('创建区块失败')
            }
        }

        if (selectedDocData && selectedDocData.segments.length > 0) {
            Modal.confirm({
                title: '确认覆盖当前区块？',
                content: '检测到已存在区块或审核记录。重新生成将清空现有区块和审核结果，操作无法撤销。',
                okText: '确认覆盖',
                cancelText: '取消',
                onOk: proceed
            })
        } else {
            proceed()
        }
    }

    const clearAllSegments = async () => {
        if (!selectedDoc) return
        for (const seg of selectedDocData?.segments || []) {
            await splitApi.deleteSegment(selectedDoc, seg.id)
        }
        loadDocuments()
        message.success('已清除区块')
    }

    const updateSegmentType = async (segment: Segment, newType: SegmentType) => {
        try {
            await splitApi.updateSegment(selectedDoc!, segment.id, { type: newType })
            setDocList(prev => prev.map(doc => {
                if (doc.docId === selectedDoc) {
                    return {
                        ...doc,
                        segments: doc.segments.map(s => s.id === segment.id ? { ...s, type: newType } : s)
                    }
                }
                return doc
            }))
            message.success('已更新区块类型')
        } catch {
            message.error('更新失败')
        }
    }

    const getPositionFromEvent = (e: React.MouseEvent): number => {
        if (!containerRef.current) return 0
        const rect = containerRef.current.getBoundingClientRect()
        const y = e.clientY - rect.top
        return Math.max(1, Math.min(99, Math.round((y / rect.height) * 100)))
    }

    const handleContainerClick = (e: React.MouseEvent) => {
        if (isDragging || !previewPage) return

        const percentage = getPositionFromEvent(e)
        // 检查是否点击在已有分割线附近
        const existingIndex = splitMarks.findIndex(
            m => m.pageNum === previewPage && Math.abs(m.position - percentage) < 4
        )

        if (existingIndex >= 0) {
            const newMarks = [...splitMarks]
            newMarks.splice(existingIndex, 1)
            setSplitMarks(newMarks)
            message.info('已删除分割线')
        } else {
            setSplitMarks(prev =>
                [...prev, { pageNum: previewPage, position: percentage }]
                    .sort((a, b) => a.pageNum === b.pageNum ? a.position - b.position : a.pageNum - b.pageNum)
            )
        }
    }

    const handleMouseDown = (index: number, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
        setDragMarkIndex(index)
    }

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || dragMarkIndex === null) return
        const percentage = getPositionFromEvent(e)
        setSplitMarks(prev => {
            const newMarks = [...prev]
            if (newMarks[dragMarkIndex]) {
                newMarks[dragMarkIndex] = { ...newMarks[dragMarkIndex], position: percentage }
            }
            return newMarks
        })
    }

    const handleMouseUp = () => {
        if (isDragging) {
            setIsDragging(false)
            setDragMarkIndex(null)
        }
    }

    const getPageSplitMarks = (pageNum: number) => {
        return splitMarks
            .map((m, i) => ({ ...m, originalIndex: i }))
            .filter(m => m.pageNum === pageNum)
    }

    const goToPage = (page: number) => {
        if (!selectedDocData) return
        if (page >= 1 && page <= selectedDocData.info.page_count) {
            setPreviewPage(page)
        }
    }

    const calculateSegments = () => {
        if (!selectedDocData) return []
        const info = selectedDocData.info

        const sortedMarks = [...splitMarks].sort((a, b) =>
            a.pageNum === b.pageNum ? a.position - b.position : a.pageNum - b.pageNum
        )

        const result: Array<{ name: string; pages: PageRange[] }> = []
        let currentStart = { page: 1, from: 0 }
        let segIndex = 1

        for (const mark of sortedMarks) {
            const pages: PageRange[] = []
            for (let p = currentStart.page; p <= mark.pageNum; p++) {
                const from = p === currentStart.page ? currentStart.from : 0
                const to = p === mark.pageNum ? mark.position : 100
                if (from < to) pages.push({ page: p, from, to })
            }
            if (pages.length > 0) {
                result.push({ name: `区块 ${segIndex}`, pages })
                segIndex++
            }
            currentStart = { page: mark.pageNum, from: mark.position }
        }

        if (currentStart.page <= info.page_count) {
            const pages: PageRange[] = []
            for (let p = currentStart.page; p <= info.page_count; p++) {
                const from = p === currentStart.page ? currentStart.from : 0
                if (from < 100) pages.push({ page: p, from, to: 100 })
            }
            if (pages.length > 0) {
                result.push({ name: `区块 ${segIndex}`, pages })
            }
        }
        return result
    }

    const autoSplit = () => {
        if (!selectedDocData) return
        const marks: SplitMark[] = []
        for (let i = maxPagesPerSegment; i < selectedDocData.info.page_count; i += maxPagesPerSegment) {
            marks.push({ pageNum: i, position: 100 })
        }
        setSplitMarks(marks)
        message.success(`已添加 ${marks.length} 个分割点`)
    }

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
                                multiple
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
                                style={{ height: 'calc(100vh - 180px)', overflowY: 'auto' }}
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

                {/* 中间：页面预览与分割 */}
                <Col span={8}>
                    <Card
                        title={
                            <Space>
                                <span>{selectedDocData ? `📄 ${selectedDocData.info.filename}` : '📄 页面预览'}</span>
                                {selectedDocData && (
                                    <Switch
                                        checkedChildren="分割模式"
                                        unCheckedChildren="预览模式"
                                        checked={splitMode}
                                        onChange={setSplitMode}
                                    />
                                )}
                            </Space>
                        }
                        extra={splitMode && selectedDocData && (
                            <Space>
                                <InputNumber
                                    size="small"
                                    min={1} max={10}
                                    value={maxPagesPerSegment}
                                    onChange={v => setMaxPagesPerSegment(v || 5)}
                                    style={{ width: 60 }}
                                    placeholder="页数"
                                />
                                <Button size="small" onClick={autoSplit}>自动</Button>
                                <Button size="small" danger onClick={() => setSplitMarks([])}>清空</Button>
                                <Button size="small" type="primary" icon={<CheckOutlined />} onClick={createAllSegments}>生成</Button>
                            </Space>
                        )}
                        styles={{ body: { padding: 12, height: 'calc(100vh - 180px)', display: 'flex', flexDirection: 'column' } }}
                    >
                        {!selectedDocData ? (
                            <Empty description="选择一个文档查看" style={{ marginTop: 100 }} />
                        ) : (
                            <>
                                <div style={{
                                    flex: 1,
                                    overflowY: 'auto',
                                    padding: 10, // Prevent scale clipping
                                    display: 'grid',
                                    gridTemplateColumns: splitMode ? 'repeat(auto-fill, minmax(90px, 1fr))' : 'repeat(4, 1fr)',
                                    gap: 8,
                                    alignContent: 'start'
                                }}>
                                    {Array.from({ length: selectedDocData.info.page_count }, (_, i) => i + 1).map(pageNum => {
                                        const marks = splitMode ? getPageSplitMarks(pageNum) : []
                                        const isSelected = selectedPage === pageNum

                                        return (
                                            <div key={pageNum} style={{ textAlign: 'center', cursor: 'pointer' }}
                                                onDoubleClick={() => {
                                                    // 双击弹出大图
                                                    setPreviewPage(pageNum)
                                                }}
                                                onClick={() => {
                                                    setSelectedPage(pageNum)
                                                }}
                                            >
                                                <div style={{
                                                    border: isSelected
                                                        ? '3px solid #1890ff'
                                                        : (marks.length > 0 ? '2px solid #ff4d4f' : '1px solid #d9d9d9'),
                                                    borderRadius: 3, padding: 2, background: '#fff', position: 'relative',
                                                    transform: isSelected ? 'scale(1.05)' : 'none',
                                                    transition: 'all 0.2s'
                                                }}>
                                                    <img
                                                        src={splitApi.getThumbnailUrl(selectedDoc!, pageNum)}
                                                        alt={`P${pageNum}`}
                                                        style={{ width: '100%', display: 'block' }}
                                                    />
                                                    {marks.map(m => (
                                                        <div key={m.originalIndex} style={{
                                                            position: 'absolute', left: 0, right: 0, top: `${m.position}%`,
                                                            height: 2, background: '#ff4d4f'
                                                        }} />
                                                    ))}
                                                </div>
                                                <Text style={{ fontSize: 10 }}>
                                                    P{pageNum}
                                                    {marks.length > 0 && <Tag color="red" style={{ fontSize: 10, marginLeft: 2, padding: '0 2px' }}>{marks.length}</Tag>}
                                                </Text>
                                            </div>
                                        )
                                    })}
                                </div>
                                {splitMode && (
                                    <Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12, textAlign: 'center' }}>
                                        双击页面打开大图添加分割线，最后点击右上角“生成”
                                    </Paragraph>
                                )}
                            </>
                        )}
                    </Card>
                </Col>

                {/* 右侧：区块列表 */}
                <Col span={8}>
                    <Card title="📦 区块与审核" styles={{ body: { padding: 12, height: 'calc(100vh - 180px)', display: 'flex', flexDirection: 'column' } }}>
                        {!selectedDocData ? (
                            <Empty description="选择一个文档" style={{ marginTop: 100 }} />
                        ) : selectedDocData.segments.length === 0 ? (
                            <Empty description="未分割，请在左侧开启分割模式" style={{ marginTop: 100 }}>
                                <Button type="primary" onClick={() => setSplitMode(true)}>
                                    去分割
                                </Button>
                            </Empty>
                        ) : (
                            <>
                                <div style={{ flex: 1, overflowY: 'auto' }}>
                                    <List
                                        size="small"
                                        dataSource={selectedDocData.segments}
                                        renderItem={seg => {
                                            const segIssues = selectedDocData.auditResults?.issues.filter(
                                                i => i.segment_id === seg.id
                                            ) || []
                                            const issueCount = segIssues.length

                                            return (
                                                <List.Item>
                                                    <div style={{ width: '100%' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                            <Text strong>{seg.name}</Text>
                                                            <Space>
                                                                <Select
                                                                    size="small"
                                                                    value={seg.type}
                                                                    style={{ width: 80 }}
                                                                    onChange={(val) => updateSegmentType(seg, val)}
                                                                    options={[
                                                                        { label: '练习', value: 'exercise' },
                                                                        { label: '例题', value: 'example' },
                                                                        { label: '知识', value: 'knowledge' },
                                                                    ]}
                                                                />
                                                                <Button
                                                                    size="small"
                                                                    danger
                                                                    icon={<DeleteOutlined />}
                                                                    onClick={() => {
                                                                        splitApi.deleteSegment(selectedDoc!, seg.id).then(() => loadDocuments())
                                                                    }}
                                                                />
                                                            </Space>
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <Space size={4}>
                                                                <Tag style={{ fontSize: 10 }}>
                                                                    {seg.pages.length > 0
                                                                        ? (seg.pages[0].page === seg.pages[seg.pages.length - 1].page
                                                                            ? `P${seg.pages[0].page}`
                                                                            : `P${seg.pages[0].page}-P${seg.pages[seg.pages.length - 1].page}`)
                                                                        : '无页面'}
                                                                </Tag>
                                                                {issueCount > 0 && (
                                                                    <Tag color="red" style={{ fontSize: 10 }}>
                                                                        {issueCount}问题
                                                                    </Tag>
                                                                )}
                                                            </Space>

                                                            {issueCount > 0 ? (
                                                                <Button
                                                                    size="small"
                                                                    type="default"
                                                                    onClick={() => {
                                                                        window.open(`/review/${selectedDoc}`, '_blank')
                                                                    }}
                                                                >
                                                                    查看结果
                                                                </Button>
                                                            ) : (
                                                                <Button
                                                                    size="small"
                                                                    type="primary"
                                                                    onClick={async () => {
                                                                        message.loading({ content: '审稿中...', key: 'audit_seg' })
                                                                        try {
                                                                            await auditApi.start(selectedDoc!, [seg.id])
                                                                            message.success({ content: '完成', key: 'audit_seg' })
                                                                            loadDocuments()
                                                                        } catch {
                                                                            message.error({ content: '失败', key: 'audit_seg' })
                                                                        }
                                                                    }}
                                                                >
                                                                    审核
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </List.Item>
                                            )
                                        }}
                                    />
                                </div>

                                <Divider style={{ margin: '12px 0' }} />

                                <Space direction="vertical" style={{ width: '100%' }}>
                                    <Button
                                        block
                                        type="primary"
                                        style={{ height: 40 }}
                                        icon={selectedDocData.auditResults ? <CheckCircleOutlined /> : <PlayCircleOutlined />}
                                        onClick={async () => {
                                            if (!selectedDocData.auditResults) {
                                                message.loading({ content: '全书审稿中...', key: 'audit_all', duration: 0 })
                                                try {
                                                    await auditApi.start(selectedDoc!)
                                                    message.success({ content: '全书审稿完成', key: 'audit_all' })
                                                    loadDocuments()
                                                    loadDocuments()
                                                    window.open(`/review/${selectedDoc}`, '_blank')
                                                } catch {
                                                    message.error({ content: '审稿失败', key: 'audit_all' })
                                                }
                                            } else {
                                                window.open(`/review/${selectedDoc}`, '_blank')
                                            }
                                        }}
                                    >
                                        {selectedDocData.auditResults ? '查看所有结果' : '一键AI全书审稿'}
                                    </Button>

                                    {selectedDocData.auditResults && (
                                        <Button
                                            block
                                            size="small"
                                            icon={<ReloadOutlined />}
                                            onClick={async () => {
                                                message.loading({ content: '重新审稿中...', key: 're_audit', duration: 0 })
                                                try {
                                                    await auditApi.start(selectedDoc!)
                                                    message.success({ content: '完成', key: 're_audit' })
                                                    loadDocuments()
                                                } catch {
                                                    message.error({ content: '失败', key: 're_audit' })
                                                }
                                            }}
                                        >
                                            重新全书审稿
                                        </Button>
                                    )}

                                    <Button block danger size="small" onClick={clearAllSegments}>
                                        清除所有区块
                                    </Button>
                                </Space>

                                {selectedDocData.auditResults && (
                                    <div style={{ marginTop: 12, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
                                        <Row gutter={8} style={{ textAlign: 'center' }}>
                                            <Col span={8}>
                                                <Text type="danger" strong>{selectedDocData.auditResults.issues.filter(i => i.level === 'CERTAIN_ERROR').length}</Text>
                                                <div style={{ fontSize: 10, color: '#999' }}>确定错误</div>
                                            </Col>
                                            <Col span={8}>
                                                <Text type="warning" strong>{selectedDocData.auditResults.issues.filter(i => i.level === 'UNCERTAIN').length}</Text>
                                                <div style={{ fontSize: 10, color: '#999' }}>待复核</div>
                                            </Col>
                                            <Col span={8}>
                                                <Text type="success" strong>{selectedDocData.auditResults.issues.filter(i => i.status !== 'pending').length}</Text>
                                                <div style={{ fontSize: 10, color: '#999' }}>已处理</div>
                                            </Col>
                                        </Row>
                                    </div>
                                )}
                            </>
                        )}
                    </Card>
                </Col>
            </Row>

            {/* 大图弹窗 - 用于编辑分割线 */}
            <Modal
                title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingRight: 24 }}>
                        <Space>
                            <ScissorOutlined />
                            <span>第{previewPage}/{selectedDocData?.info.page_count}页 - 编辑分割线</span>
                            <Tag>{previewPage ? getPageSplitMarks(previewPage).length : 0}条线</Tag>
                        </Space>
                        <Space>
                            <Button size="small" disabled={!previewPage || previewPage <= 1} onClick={() => goToPage(previewPage! - 1)}>
                                <LeftOutlined />上一页
                            </Button>
                            <Button size="small" disabled={!previewPage || !selectedDocData || previewPage >= selectedDocData.info.page_count} onClick={() => goToPage(previewPage! + 1)}>
                                下一页<RightOutlined />
                            </Button>
                        </Space>
                    </div>
                }
                open={previewPage !== null}
                onCancel={() => { setPreviewPage(null); setIsDragging(false); setDragMarkIndex(null) }}
                width={800}
                footer={[
                    <Button key="c" danger onClick={() => {
                        if (previewPage) {
                            setSplitMarks(prev => prev.filter(m => m.pageNum !== previewPage))
                        }
                    }}>清除本页线</Button>,
                    <Button key="ok" type="primary" onClick={() => setPreviewPage(null)}>完成</Button>
                ]}
            >
                {previewPage && selectedDoc && (
                    <div
                        ref={containerRef}
                        style={{ position: 'relative', cursor: isDragging ? 'ns-resize' : 'crosshair', userSelect: 'none' }}
                        onClick={handleContainerClick}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    >
                        <img
                            src={splitApi.getPageUrl(selectedDoc, previewPage)}
                            alt=""
                            style={{ width: '100%', display: 'block', pointerEvents: 'none' }}
                            draggable={false}
                        />

                        {getPageSplitMarks(previewPage).map(mark => (
                            <div key={mark.originalIndex}
                                style={{
                                    position: 'absolute', left: 0, right: 0, top: `${mark.position}%`,
                                    transform: 'translateY(-50%)', cursor: 'ns-resize', zIndex: 10
                                }}
                                onMouseDown={e => handleMouseDown(mark.originalIndex, e)}
                            >
                                <div style={{ height: 2, background: '#ff4d4f', boxShadow: '0 0 3px #ff4d4f' }} />
                                <div style={{
                                    position: 'absolute', left: '50%', top: 0, transform: 'translate(-50%, -100%)',
                                    background: '#ff4d4f', color: '#fff', padding: '1px 6px', borderRadius: 8,
                                    fontSize: 10, whiteSpace: 'nowrap'
                                }}>
                                    ✂️ {mark.position}%
                                </div>
                            </div>
                        ))}

                        {getPageSplitMarks(previewPage).length === 0 && (
                            <div style={{
                                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '10px 16px', borderRadius: 6,
                                pointerEvents: 'none', fontSize: 13
                            }}>
                                点击任意位置添加分割线
                            </div>
                        )}
                    </div>
                )}
            </Modal>


        </div >
    )
}

export default DocumentListPage
