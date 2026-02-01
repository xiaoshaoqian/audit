import { useState, useEffect } from 'react'
import {
    Button, Modal, List, Tag, Tabs,
    message, Typography, Space, Empty, Badge,
    Descriptions
} from 'antd'
import {
    FileTextOutlined
} from '@ant-design/icons'
import {
    splitApi, auditApi,
    DocumentInfo, Segment, Issue, AuditResults
} from '../services/api'

const { Text } = Typography

interface AuditReviewModalProps {
    visible: boolean
    onClose: () => void
    docId: string
    docInfo: DocumentInfo | null
    initialSegments: Segment[]
    initialResults: AuditResults | null
    defaultSegmentId?: number | null
}

export function AuditReviewModal({
    visible,
    onClose,
    docId,
    docInfo,
    initialSegments,
    initialResults,
    defaultSegmentId
}: AuditReviewModalProps) {
    // Local state to manage audit process within the modal if needed, 
    // but ideally data is passed in. However, user might re-audit from here?
    // User said "Click View Result pops up page... to see results". 
    // Also "Click Audit -> Auditing -> View".
    // So this modal is primarily for VIEWING.
    // But existing ReviewPage had "Re-audit". Let's keep it powerful.

    const [loading, setLoading] = useState(false) // Data refreshing
    const [auditing, setAuditing] = useState(false)
    const [segments, setSegments] = useState<Segment[]>(initialSegments)
    const [results, setResults] = useState<AuditResults | null>(initialResults)
    const [selectedSegment, setSelectedSegment] = useState<number | null>(defaultSegmentId || null)
    // Removed unused state: selectedIssue, noteText, issueModalVisible
    const [selectedSegmentIds, setSelectedSegmentIds] = useState<number[]>([])
    const [showAnnotations, setShowAnnotations] = useState(true)

    const [expandedIssues, setExpandedIssues] = useState<number[]>([])
    const [activeIssueTab, setActiveIssueTab] = useState('certain')

    // Sync props to state when modal opens
    useEffect(() => {
        if (visible) {
            setSegments(initialSegments)
            setResults(initialResults)
            if (defaultSegmentId) {
                setSelectedSegment(defaultSegmentId)
                // Also select it in checkbox for auditing context
                setSelectedSegmentIds([defaultSegmentId])
            } else {
                setSelectedSegmentIds([])
            }
        }
    }, [visible, initialSegments, initialResults, defaultSegmentId])

    const refreshData = async () => {
        setLoading(true)
        try {
            const [segs, res] = await Promise.all([
                splitApi.getSegments(docId),
                auditApi.getResults(docId).catch(() => null)
            ])
            setSegments(segs)
            if (res && res.issues.length > 0) {
                setResults(res)
            }
        } catch {
            message.error('刷新数据失败')
        } finally {
            setLoading(false)
        }
    }

    const startAudit = async () => {
        const idsToAudit = selectedSegmentIds.length > 0 ? selectedSegmentIds : undefined
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

    // Removed toggleSegmentSelection (unused)

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
        // Determine tab
        let targetTab = 'certain'
        if (issue.status === 'confirmed') targetTab = 'confirmed'
        else if (issue.level === 'CERTAIN_ERROR') targetTab = 'certain'
        else if (issue.level === 'UNCERTAIN') targetTab = 'uncertain'

        setActiveIssueTab(targetTab)

        // 展开该问题 (只展开这一个)
        setExpandedIssues([issue.id])

        // 滚动到该问题
        setTimeout(() => {
            const element = document.getElementById(`issue-item-${issue.id}`)
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' })
                // 添加高亮效果
                element.style.backgroundColor = '#e6f7ff'
                setTimeout(() => {
                    element.style.backgroundColor = 'transparent'
                }, 1000)
            }
        }, 100)
    }

    const updateIssueStatus = async (issue: Issue, status: 'confirmed' | 'rejected', note?: string) => {
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

    return (
        <Modal
            open={visible}
            onCancel={onClose}
            width="95%"
            style={{ top: 20 }}
            footer={null}
            title={
                <Space>
                    <span>📄 {docInfo?.filename} - 审稿结果</span>
                    {auditing && <Tag color="blue">正在审稿...</Tag>}
                </Space>
            }
            styles={{ body: { height: '85vh', padding: 0, overflow: 'hidden' } }}
        >
            <div style={{ display: 'flex', height: '100%' }}>
                {/* Left: Preview */}
                <div style={{ flex: 3, borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                        <Button type="primary" loading={auditing} onClick={startAudit} icon={<FileTextOutlined />}>
                            {selectedSegmentIds.length > 0 ? `重新审稿 (${selectedSegmentIds.length})` : '重新审稿全部'}
                        </Button>
                    </div>

                    <div style={{ flex: 1, overflow: 'hidden', minWidth: 0, padding: 0, background: '#f5f5f5', display: 'flex', flexDirection: 'column' }}>
                        {results ? (
                            <Tabs
                                style={{ height: '100%', width: '100%' }}
                                tabBarStyle={{ marginBottom: 0, padding: '0 16px', background: '#fff' }}
                                activeKey={String(selectedSegment)}
                                onChange={key => setSelectedSegment(Number(key))}
                                items={segments.map(seg => {
                                    const segmentIssues = results.issues.filter(i => i.segment_id === seg.id)
                                    return {
                                        key: String(seg.id),
                                        label: (
                                            <span>
                                                {seg.name}
                                                {segmentIssues.length > 0 && <Badge count={segmentIssues.length} style={{ marginLeft: 5, transform: 'scale(0.8)' }} />}
                                            </span>
                                        ),
                                        children: (
                                            <div style={{ height: 'calc(85vh - 120px)', overflow: 'auto', padding: 16, display: 'flex', justifyContent: 'center' }}>
                                                <div style={{ position: 'relative', background: '#fff', padding: 4, borderRadius: 4, textAlign: 'center', minHeight: '100%', width: 'fit-content' }}>
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
                                            </div>
                                        )
                                    }
                                })}
                            />
                        ) : (
                            <Empty description="暂无审核结果" style={{ marginTop: 100 }} />
                        )}
                    </div>
                </div>

                {/* Right: Issues */}
                <div style={{ flex: 2, display: 'flex', flexDirection: 'column', background: '#fff' }}>
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
            </div>
        </Modal>
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
