import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
    Button, List, Tag, Tabs,
    message, Typography, Space, Empty, Badge,
    Descriptions, Layout, Spin, Card
} from 'antd'
import {
    FileTextOutlined, ArrowLeftOutlined, HomeOutlined
} from '@ant-design/icons'
import api, {
    splitApi, auditApi,
    DocumentInfo, Segment, Issue, AuditResults
} from '../services/api'

const { Header, Content } = Layout
const { Text, Title } = Typography

export default function AuditReviewPage() {
    const { docId } = useParams<{ docId: string }>()
    const navigate = useNavigate()

    const [loading, setLoading] = useState(false)
    const [auditing, setAuditing] = useState(false)
    const [docInfo, setDocInfo] = useState<DocumentInfo | null>(null)
    const [segments, setSegments] = useState<Segment[]>([])
    const [results, setResults] = useState<AuditResults | null>(null)
    const [selectedSegment, setSelectedSegment] = useState<number | null>(null)
    const [selectedSegmentIds, setSelectedSegmentIds] = useState<number[]>([])
    const [showAnnotations, setShowAnnotations] = useState(true)
    const [expandedIssues, setExpandedIssues] = useState<number[]>([])
    const [activeIssueTab, setActiveIssueTab] = useState('certain')

    useEffect(() => {
        if (docId) {
            refreshData()
        }
    }, [docId])

    const refreshData = async () => {
        if (!docId) return
        setLoading(true)
        try {
            // First get document info if needed (optional implementation if API exists)
            // But we mostly need segments and results.
            // Let's assume we can get basic info or just rely on IDs for now.
            // We'll try to get document info via uploadApi.getInfo if available
            try {
                // Assuming we can import uploadApi. But importing 'api' is cleaner.
                // Let's use the explicit uploadApi imported above.
                // Wait, I need to check if uploadApi is exported. Yes it is.
                const info = await import('../services/api').then(m => m.uploadApi.getInfo(docId))
                setDocInfo(info)
            } catch (e) {
                console.warn('Failed to load doc info', e)
            }

            const [segs, res] = await Promise.all([
                splitApi.getSegments(docId),
                auditApi.getResults(docId).catch(() => null)
            ])
            setSegments(segs)
            if (res && res.issues.length > 0) {
                setResults(res)
            }

            // Auto select first segment if none selected
            if (segs.length > 0 && selectedSegment === null) {
                setSelectedSegment(segs[0].id)
            }
        } catch {
            message.error('加载数据失败')
        } finally {
            setLoading(false)
        }
    }

    const startAudit = async () => {
        if (!docId) return
        // 优先使用勾选的区块，如果没有勾选，则使用当前查看的区块
        const idsToAudit = selectedSegmentIds.length > 0
            ? selectedSegmentIds
            : (selectedSegment ? [selectedSegment] : undefined)

        if (!idsToAudit) {
            message.warning('请先选择区块')
            return
        }

        setAuditing(true)
        try {
            const result = await auditApi.start(docId, idsToAudit)
            message.success(`审稿完成！发现 ${result.certain_count} 个确定问题`)
            await refreshData()
        } catch {
            message.error('审稿失败')
        } finally {
            setAuditing(false)
        }
    }

    const selectAllSegments = () => setSelectedSegmentIds(segments.map(s => s.id))
    const deselectAllSegments = () => setSelectedSegmentIds([])
    const expandAllIssues = () => setExpandedIssues(results?.issues.map(i => i.id) || [])
    const collapseAllIssues = () => setExpandedIssues([])

    const toggleIssue = (issueId: number) => {
        setExpandedIssues(prev =>
            prev.includes(issueId) ? [] : [issueId]
        )
    }

    const handleIssueClick = (issue: Issue) => {
        let targetTab = 'certain'
        if (issue.status === 'confirmed') targetTab = 'confirmed'
        else if (issue.level === 'CERTAIN_ERROR') targetTab = 'certain'
        else if (issue.level === 'UNCERTAIN') targetTab = 'uncertain'

        setActiveIssueTab(targetTab)
        setExpandedIssues([issue.id])

        setTimeout(() => {
            const element = document.getElementById(`issue-item-${issue.id}`)
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' })
                element.style.backgroundColor = '#e6f7ff'
                setTimeout(() => {
                    element.style.backgroundColor = 'transparent'
                }, 1000)
            }
        }, 100)
    }

    const updateIssueStatus = async (issue: Issue, status: 'confirmed' | 'rejected', note?: string) => {
        if (!docId) return
        try {
            await auditApi.updateIssue(docId, issue.id, status, note)
            message.success(status === 'confirmed' ? '已确认问题' : '已驳回标注')
            refreshData()
        } catch {
            message.error('操作失败')
        }
    }

    const getIssuesByLevel = (level: string) => results?.issues.filter(i => i.level === level) || []
    const getIssuesByStatus = (status: string) => results?.issues.filter(i => i.status === status) || []

    const certainIssues = getIssuesByLevel('CERTAIN_ERROR')
    const uncertainIssues = getIssuesByLevel('UNCERTAIN')
    const confirmedIssues = getIssuesByStatus('confirmed')

    if (!docId) return <Empty description="Invalid Document ID" />

    return (
        <Layout style={{ height: '100vh', flexDirection: 'column' }}>
            {/* Simple Header */}
            <Header style={{
                background: '#fff', padding: '0 24px', borderBottom: '1px solid #f0f0f0',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64
            }}>
                <Space>
                    <Button icon={<ArrowLeftOutlined />} onClick={() => window.close()}>关闭</Button>
                    <Title level={4} style={{ margin: 0 }}>
                        {docInfo ? `📄 ${docInfo.filename}` : `文档 ${docId}`} - 审稿结果
                    </Title>
                    {auditing && <Tag color="blue">正在审稿...</Tag>}
                </Space>
                <Space>
                    <Button type="primary" loading={auditing} onClick={startAudit} icon={<FileTextOutlined />}>
                        {selectedSegmentIds.length > 0 ? `重新审稿 (${selectedSegmentIds.length})` : '重新审稿当前页'}
                    </Button>
                </Space>
            </Header>

            <Content style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
                {/* Left: Preview */}
                <div style={{ flex: 3, borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa' }}>
                        <Space>
                            {results && (
                                <Button size="small" onClick={() => setShowAnnotations(!showAnnotations)}>
                                    {showAnnotations ? '隐藏标注' : '显示标注'}
                                </Button>
                            )}
                            {segments.length > 0 && (
                                <>
                                    <Button size="small" onClick={selectAllSegments}>全选</Button>
                                    <Button size="small" onClick={deselectAllSegments}>清空</Button>
                                    <Text type="secondary" style={{ fontSize: 12 }}>已选 {selectedSegmentIds.length} 个</Text>
                                </>
                            )}
                        </Space>
                    </div>

                    <div style={{ flex: 1, overflow: 'hidden', minWidth: 0, padding: 0, background: '#f5f5f5', display: 'flex', flexDirection: 'column' }}>
                        {!loading && segments.length > 0 ? (
                            <Tabs
                                style={{ height: '100%', width: '100%' }}
                                tabBarStyle={{ marginBottom: 0, padding: '0 16px', background: '#fff' }}
                                activeKey={String(selectedSegment)}
                                onChange={key => setSelectedSegment(Number(key))}
                                items={segments.map(seg => {
                                    const segmentIssues = results?.issues?.filter(i => i.segment_id === seg.id) || []
                                    // 查找关联的九章结果
                                    // 这里的 results 是后端 get_results 返回的完整对象，包含 segments 列表
                                    // @ts-ignore
                                    const auditSegment = results?.segments?.find((s: any) => String(s.segment_id) === String(seg.id))
                                    const jiuzhangResult = auditSegment?.jiuzhang_analysis

                                    // 添加调试日志，帮助排查为什么不显示
                                    console.debug(`Segment ${seg.id} Jiuzhang Data:`, jiuzhangResult)

                                    let jiuzhangContent = null
                                    // 兼容后端返回结构：有的返回 success=True，有的返回 available=True
                                    if ((jiuzhangResult?.success || jiuzhangResult?.available) && jiuzhangResult?.data?.result) {
                                        jiuzhangContent = jiuzhangResult.data.result
                                    }

                                    return {
                                        key: String(seg.id),
                                        label: (
                                            <span>
                                                {seg.name}
                                                {segmentIssues.length > 0 && <Badge count={segmentIssues.length} style={{ marginLeft: 5, transform: 'scale(0.8)' }} />}
                                            </span>
                                        ),
                                        children: (
                                            <div style={{ height: 'calc(100vh - 150px)', overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                <div style={{ position: 'relative', background: '#fff', padding: 4, borderRadius: 4, textAlign: 'center', width: 'fit-content', marginBottom: 16 }}>
                                                    <div style={{ position: 'relative', display: 'block', lineHeight: 0, width: 'fit-content' }}>
                                                        <img
                                                            src={splitApi.getSegmentImageUrl(docId, seg.id)}
                                                            alt={seg.name}
                                                            style={{ maxWidth: 'none', maxHeight: 'none', width: 'auto', display: 'block' }}
                                                        />
                                                        {showAnnotations && segmentIssues.map((issue) => {
                                                            if (!issue.coordinates) return null
                                                            const { x1, y1, x2, y2 } = issue.coordinates
                                                            const isError = issue.level === 'CERTAIN_ERROR'
                                                            const color = isError ? '#ff4d4f' : '#faad14'

                                                            return (
                                                                <div
                                                                    key={issue.id}
                                                                    onClick={() => handleIssueClick(issue)}
                                                                    style={{
                                                                        position: 'absolute',
                                                                        left: `${x1 / 10}%`, top: `${y1 / 10}%`,
                                                                        width: `${(x2 - x1) / 10}%`, height: `${(y2 - y1) / 10}%`,
                                                                        border: `2px solid ${color}`,
                                                                        backgroundColor: isError ? 'rgba(255, 77, 79, 0.15)' : 'rgba(250, 173, 20, 0.15)',
                                                                        cursor: 'pointer', zIndex: 10
                                                                    }}
                                                                />
                                                            )
                                                        })}
                                                    </div>
                                                </div>

                                                {/* 九章解析结果展示 */}
                                                {jiuzhangContent && (
                                                    <Card title="💡 九章模型解析 (MathGPT)" style={{ width: '100%', maxWidth: 800, marginTop: 16, textAlign: 'left' }}>
                                                        <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'sans-serif', lineHeight: 1.6 }}>
                                                            {jiuzhangContent}
                                                        </div>
                                                    </Card>
                                                )}
                                            </div>
                                        )
                                    }
                                })}
                            />
                        ) : (
                            loading ? <Spin style={{ marginTop: 100 }} /> : <Empty description="暂无数据" style={{ marginTop: 100 }} />
                        )}
                    </div>
                </div>

                {/* Right: Issues */}
                <div style={{ flex: 2, display: 'flex', flexDirection: 'column', background: '#fff', borderLeft: '1px solid #f0f0f0' }}>
                    <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0' }}>
                        <Space>
                            <Button size="small" onClick={expandAllIssues}>展开全部</Button>
                            <Button size="small" onClick={collapseAllIssues}>折叠全部</Button>
                        </Space>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        <Tabs
                            activeKey={activeIssueTab}
                            onChange={setActiveIssueTab}
                            items={[
                                {
                                    key: 'certain',
                                    label: <span style={{ padding: '0 8px' }}>确定错误 <Text type="danger">({certainIssues.length})</Text></span>,
                                    children: <IssueList issues={certainIssues} expandedIssues={expandedIssues} onToggle={toggleIssue} onUpdateStatus={updateIssueStatus} />
                                },
                                {
                                    key: 'uncertain',
                                    label: <span style={{ padding: '0 8px' }}>待复核 <Text style={{ color: '#faad14' }}>({uncertainIssues.length})</Text></span>,
                                    children: <IssueList issues={uncertainIssues} expandedIssues={expandedIssues} onToggle={toggleIssue} onUpdateStatus={updateIssueStatus} />
                                },
                                {
                                    key: 'confirmed',
                                    label: <span style={{ padding: '0 8px' }}>已确认 ({confirmedIssues.length})</span>,
                                    children: <IssueList issues={confirmedIssues} expandedIssues={expandedIssues} onToggle={toggleIssue} onUpdateStatus={updateIssueStatus} />
                                }
                            ]}
                        />
                    </div>
                </div>
            </Content>
        </Layout>
    )
}

function IssueList({ issues, expandedIssues = [], onToggle, onUpdateStatus }: any) {
    if (issues.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无" />
    return (
        <List
            dataSource={issues}
            renderItem={(issue: Issue) => (
                <List.Item
                    id={`issue-item-${issue.id}`}
                    style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'pointer', padding: 12, transition: 'background-color 0.3s' }}
                    onClick={() => onToggle(issue.id)}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Space>
                            <Tag color={issue.level === 'CERTAIN_ERROR' ? 'red' : 'orange'}>{issue.type}</Tag>
                            <Text strong>{issue.description?.substring(0, 15)}...</Text>
                        </Space>
                        <Text type="secondary">{expandedIssues.includes(issue.id) ? '▲' : '▼'}</Text>
                    </div>
                    {expandedIssues.includes(issue.id) && (
                        <div style={{ marginTop: 12, padding: 12, background: '#fafafa', borderRadius: 4, cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
                            <Descriptions column={1} size="small">
                                <Descriptions.Item label="完整描述">{issue.description}</Descriptions.Item>
                                <Descriptions.Item label="修改建议"><Text type="success">{issue.suggestion}</Text></Descriptions.Item>
                                <Descriptions.Item label="判断依据"><Text type="secondary">{issue.reasoning}</Text></Descriptions.Item>
                            </Descriptions>

                            {issue.status === 'pending' && (
                                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                    <Button size="small" danger onClick={() => onUpdateStatus(issue, 'rejected')}>
                                        驳回
                                    </Button>
                                    <Button size="small" type="primary" onClick={() => onUpdateStatus(issue, 'confirmed')}>
                                        确认
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </List.Item>
            )}
        />
    )
}
