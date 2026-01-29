import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
    Card, Row, Col, Button, Modal, List, Tag, Divider,
    message, Spin, Typography, Space, Empty, InputNumber, Tooltip
} from 'antd'
import {
    ScissorOutlined, PlayCircleOutlined,
    CheckOutlined, EyeOutlined, LeftOutlined, RightOutlined,
    SaveOutlined, ReloadOutlined, DeleteOutlined
} from '@ant-design/icons'
import { uploadApi, splitApi, Segment, DocumentInfo, PageRange } from '../services/api'

const { Text, Paragraph } = Typography

// 分割标记类型
interface SplitMark {
    pageNum: number
    position: number
}

const STORAGE_KEY = 'audit_split_marks'

function SplitPage() {
    const { docId } = useParams<{ docId: string }>()
    const navigate = useNavigate()

    const [loading, setLoading] = useState(true)
    const [docInfo, setDocInfo] = useState<DocumentInfo | null>(null)
    const [segments, setSegments] = useState<Segment[]>([])
    const [splitMarks, setSplitMarks] = useState<SplitMark[]>([])
    const [previewPage, setPreviewPage] = useState<number | null>(null)
    const [previewSegment, setPreviewSegment] = useState<number | null>(null)
    const [maxPagesPerSegment, setMaxPagesPerSegment] = useState(5)
    const [isDragging, setIsDragging] = useState(false)
    const [dragMarkIndex, setDragMarkIndex] = useState<number | null>(null)

    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (docId) {
            loadData()
            loadSavedMarks()
        }
    }, [docId])

    const loadData = async () => {
        if (!docId) return
        try {
            const [info, segs] = await Promise.all([
                uploadApi.getInfo(docId),
                splitApi.getSegments(docId)
            ])
            setDocInfo(info)
            setSegments(segs)
        } catch {
            message.error('加载文档信息失败')
        } finally {
            setLoading(false)
        }
    }

    const loadSavedMarks = () => {
        try {
            const saved = localStorage.getItem(`${STORAGE_KEY}_${docId}`)
            if (saved) {
                setSplitMarks(JSON.parse(saved))
            }
        } catch { /* ignore */ }
    }

    const saveMarks = () => {
        try {
            localStorage.setItem(`${STORAGE_KEY}_${docId}`, JSON.stringify(splitMarks))
            message.success('分割标记已保存')
        } catch {
            message.error('保存失败')
        }
    }

    const getPositionFromEvent = (e: MouseEvent | React.MouseEvent): number => {
        if (!containerRef.current) return 0
        const rect = containerRef.current.getBoundingClientRect()
        const y = e.clientY - rect.top
        return Math.max(1, Math.min(99, Math.round((y / rect.height) * 100)))
    }

    // 点击添加分割线
    const handleContainerClick = (e: React.MouseEvent) => {
        if (isDragging || !previewPage) return

        const percentage = getPositionFromEvent(e)

        // 检查是否点击在已有分割线附近
        const existingIndex = splitMarks.findIndex(
            m => m.pageNum === previewPage && Math.abs(m.position - percentage) < 4
        )

        if (existingIndex >= 0) {
            // 删除分割线
            const newMarks = [...splitMarks]
            newMarks.splice(existingIndex, 1)
            setSplitMarks(newMarks)
            message.info('已删除分割线')
        } else {
            // 添加新分割线
            setSplitMarks(prev =>
                [...prev, { pageNum: previewPage, position: percentage }]
                    .sort((a, b) => a.pageNum === b.pageNum ? a.position - b.position : a.pageNum - b.pageNum)
            )
        }
    }

    // 开始拖拽
    const handleMouseDown = (index: number, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
        setDragMarkIndex(index)
    }

    // 拖拽移动
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

    // 结束拖拽 - 不删除，只是停止拖拽
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
        if (!docInfo) return
        if (page >= 1 && page <= docInfo.page_count) {
            setPreviewPage(page)
        }
    }

    const calculateSegments = () => {
        if (!docInfo) return []

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

        // 最后一个区块
        if (currentStart.page <= docInfo.page_count) {
            const pages: PageRange[] = []
            for (let p = currentStart.page; p <= docInfo.page_count; p++) {
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
        if (!docInfo) return
        const marks: SplitMark[] = []
        for (let i = maxPagesPerSegment; i < docInfo.page_count; i += maxPagesPerSegment) {
            marks.push({ pageNum: i, position: 100 })
        }
        setSplitMarks(marks)
        message.success(`已添加 ${marks.length} 个分割点`)
    }

    const createAllSegments = async () => {
        if (!docId) return
        const segs = calculateSegments()
        if (segs.length === 0) {
            message.warning('请先标记分割点')
            return
        }

        // 先清除旧区块
        for (const seg of segments) {
            await splitApi.deleteSegment(docId, seg.id)
        }

        try {
            for (const seg of segs) {
                await splitApi.createSegment(docId, seg.name, seg.pages)
            }
            message.success(`已创建 ${segs.length} 个区块`)
            loadData()
        } catch {
            message.error('创建区块失败')
        }
    }

    const clearAllSegments = async () => {
        if (!docId) return
        for (const seg of segments) {
            await splitApi.deleteSegment(docId, seg.id)
        }
        setSegments([])
        message.success('已清除区块')
    }

    const startAudit = () => {
        if (segments.length === 0) {
            message.warning('请先创建区块')
            return
        }
        navigate(`/review/${docId}`)
    }

    if (loading) {
        return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
    }

    if (!docInfo) {
        return <Empty description="文档不存在" />
    }

    const calculatedSegments = calculateSegments()
    const currentPageMarks = previewPage ? getPageSplitMarks(previewPage) : []

    return (
        <div>
            <Row gutter={16}>
                <Col span={16}>
                    <Card
                        title={<Space>
                            <span>📄 {docInfo.filename}</span>
                            <Tag color="blue">{docInfo.page_count}页</Tag>
                            <Tag color="orange">{splitMarks.length}分割点</Tag>
                        </Space>}
                        extra={<Space>
                            <Button icon={<SaveOutlined />} onClick={saveMarks}>保存</Button>
                            <Button icon={<ReloadOutlined />} onClick={loadSavedMarks} />
                        </Space>}
                        size="small"
                    >
                        <Space style={{ marginBottom: 12 }} wrap>
                            <Text>每区块页数:</Text>
                            <InputNumber min={1} max={10} value={maxPagesPerSegment}
                                onChange={v => setMaxPagesPerSegment(v || 5)} style={{ width: 60 }} />
                            <Button size="small" onClick={autoSplit}>自动分割</Button>
                            <Button size="small" danger onClick={() => setSplitMarks([])}>清除</Button>
                        </Space>

                        <Paragraph type="secondary" style={{ margin: '8px 0', fontSize: 12 }}>
                            双击页面打开大图，点击添加分割线，拖拽调整位置
                        </Paragraph>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
                            gap: 8,
                            maxHeight: 420,
                            overflowY: 'auto',
                            padding: 4
                        }}>
                            {Array.from({ length: docInfo.page_count }, (_, i) => i + 1).map(pageNum => {
                                const marks = getPageSplitMarks(pageNum)
                                return (
                                    <div key={pageNum} style={{ textAlign: 'center', cursor: 'pointer' }}
                                        onDoubleClick={() => setPreviewPage(pageNum)}>
                                        <div style={{
                                            border: marks.length > 0 ? '2px solid #ff4d4f' : '1px solid #d9d9d9',
                                            borderRadius: 3, padding: 2, background: '#fff', position: 'relative'
                                        }}>
                                            <img src={splitApi.getThumbnailUrl(docId!, pageNum)} alt={`P${pageNum}`}
                                                style={{ width: '100%', display: 'block' }} />
                                            {marks.map(m => (
                                                <div key={m.originalIndex} style={{
                                                    position: 'absolute', left: 0, right: 0, top: `${m.position}%`,
                                                    height: 2, background: '#ff4d4f'
                                                }} />
                                            ))}
                                        </div>
                                        <Text style={{ fontSize: 10 }}>
                                            P{pageNum}{marks.length > 0 && <Tag color="red" style={{ fontSize: 10, marginLeft: 2, padding: '0 2px' }}>{marks.length}</Tag>}
                                        </Text>
                                    </div>
                                )
                            })}
                        </div>
                    </Card>
                </Col>

                <Col span={8}>
                    <Card title="📦 区块" size="small"
                        extra={segments.length > 0 && <Button size="small" danger onClick={clearAllSegments}>清除</Button>}>
                        {segments.length > 0 ? (
                            <>
                                <List size="small" style={{ maxHeight: 180, overflowY: 'auto' }}
                                    dataSource={segments}
                                    renderItem={seg => (
                                        <List.Item actions={[
                                            <Button key="v" size="small" icon={<EyeOutlined />} onClick={() => setPreviewSegment(seg.id)} />
                                        ]}>
                                            <Text>{seg.name} ({seg.pages.length}页)</Text>
                                        </List.Item>
                                    )}
                                />
                                <Divider style={{ margin: '12px 0' }} />
                                <Button block onClick={createAllSegments} icon={<ReloadOutlined />}>重新生成</Button>
                                <Button block type="primary" style={{ marginTop: 8 }} icon={<PlayCircleOutlined />} onClick={startAudit}>
                                    开始审稿
                                </Button>
                            </>
                        ) : (
                            <>
                                <List size="small" style={{ maxHeight: 200, overflowY: 'auto' }}
                                    dataSource={calculatedSegments}
                                    locale={{ emptyText: '双击页面添加分割线' }}
                                    renderItem={seg => (
                                        <List.Item>
                                            <div style={{ fontSize: 12 }}>
                                                <Text strong>{seg.name}</Text>
                                                <br />
                                                <Text type="secondary">
                                                    {seg.pages.map(p => p.from === 0 && p.to === 100 ? `P${p.page}` : `P${p.page}[${p.from}-${p.to}%]`).join(' ')}
                                                </Text>
                                            </div>
                                        </List.Item>
                                    )}
                                />
                                {calculatedSegments.length > 0 && (
                                    <>
                                        <Divider style={{ margin: '12px 0' }} />
                                        <Button block type="primary" icon={<CheckOutlined />} onClick={createAllSegments}>
                                            确认分割 ({calculatedSegments.length}区块)
                                        </Button>
                                    </>
                                )}
                            </>
                        )}
                    </Card>

                    <Card title="💡 说明" size="small" style={{ marginTop: 12 }}>
                        <ol style={{ paddingLeft: 16, margin: 0, fontSize: 11 }}>
                            <li>双击缩略图打开大图</li>
                            <li>点击添加分割线</li>
                            <li>拖拽分割线调整位置</li>
                            <li>再次点击删除分割线</li>
                            <li>确认后开始审稿</li>
                        </ol>
                    </Card>
                </Col>
            </Row>

            {/* 大图弹窗 */}
            <Modal
                title={<div style={{ display: 'flex', justifyContent: 'space-between', paddingRight: 24 }}>
                    <Space>
                        <ScissorOutlined />
                        <span>第{previewPage}/{docInfo.page_count}页</span>
                        <Tag>{currentPageMarks.length}条线</Tag>
                    </Space>
                    <Space>
                        <Button size="small" disabled={previewPage === 1} onClick={() => goToPage(previewPage! - 1)}>
                            <LeftOutlined />上一页
                        </Button>
                        <Button size="small" disabled={previewPage === docInfo.page_count} onClick={() => goToPage(previewPage! + 1)}>
                            下一页<RightOutlined />
                        </Button>
                    </Space>
                </div>}
                open={previewPage !== null}
                onCancel={() => { setPreviewPage(null); setIsDragging(false); setDragMarkIndex(null) }}
                width={700}
                footer={[
                    <Button key="c" danger onClick={() => {
                        setSplitMarks(prev => prev.filter(m => m.pageNum !== previewPage))
                    }}>清除本页</Button>,
                    <Button key="s" onClick={saveMarks}>保存</Button>,
                    <Button key="ok" type="primary" onClick={() => setPreviewPage(null)}>完成</Button>
                ]}
            >
                {previewPage && (
                    <div
                        ref={containerRef}
                        style={{ position: 'relative', cursor: isDragging ? 'ns-resize' : 'crosshair', userSelect: 'none' }}
                        onClick={handleContainerClick}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    >
                        <img src={splitApi.getPageUrl(docId!, previewPage)} alt=""
                            style={{ width: '100%', display: 'block', pointerEvents: 'none' }} draggable={false} />

                        {currentPageMarks.map(mark => (
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

                        {currentPageMarks.length === 0 && (
                            <div style={{
                                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '10px 16px', borderRadius: 6,
                                pointerEvents: 'none', fontSize: 13
                            }}>
                                点击添加分割线
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* 区块预览 */}
            <Modal title="区块预览" open={previewSegment !== null} onCancel={() => setPreviewSegment(null)} width={800} footer={null}>
                {previewSegment && (
                    <img src={splitApi.getSegmentImageUrl(docId!, previewSegment)} alt="" style={{ width: '100%' }} />
                )}
            </Modal>
        </div>
    )
}

export default SplitPage
