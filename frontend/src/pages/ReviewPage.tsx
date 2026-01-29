import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
    Card, Row, Col, Button, Modal, Input, List, Tag, Tabs,
    message, Spin, Typography, Space, Empty, Badge,
    Descriptions, Alert, Checkbox
} from 'antd'
import {
    CheckCircleOutlined, CloseCircleOutlined,
    ExclamationCircleOutlined, QuestionCircleOutlined,
    ArrowLeftOutlined, FileTextOutlined
} from '@ant-design/icons'
import {
    uploadApi, splitApi, auditApi,
    DocumentInfo, Segment, Issue, AuditResults
} from '../services/api'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

function ReviewPage() {
    const { docId } = useParams<{ docId: string }>()
    const navigate = useNavigate()

    const [loading, setLoading] = useState(true)
    const [auditing, setAuditing] = useState(false)
    const [docInfo, setDocInfo] = useState<DocumentInfo | null>(null)
    const [segments, setSegments] = useState<Segment[]>([])
    const [results, setResults] = useState<AuditResults | null>(null)
    const [selectedSegment, setSelectedSegment] = useState<number | null>(null)
    const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)
    const [noteText, setNoteText] = useState('')
    const [issueModalVisible, setIssueModalVisible] = useState(false)
    const [selectedSegmentIds, setSelectedSegmentIds] = useState<number[]>([])
    const [showAnnotations, setShowAnnotations] = useState(true)
    const [expandedIssues, setExpandedIssues] = useState<number[]>([]) // 展开的问题ID列表

    useEffect(() => {
        if (docId) {
            loadData()
        }
    }, [docId])

    const loadData = async () => {
        if (!docId) return
        try {
            const [info, segs, res] = await Promise.all([
                uploadApi.getInfo(docId),
                splitApi.getSegments(docId),
                auditApi.getResults(docId).catch(() => null)
            ])
            setDocInfo(info)
            setSegments(segs)
            if (res && res.issues.length > 0) {
                setResults(res)
            }
        } catch {
            message.error('加载数据失败')
        } finally {
            setLoading(false)
        }
    }

    const startAudit = async () => {
        if (!docId) return

        // 如果有选中的区块，只审这些区块；否则审全部
        const segmentIds = selectedSegmentIds.length > 0 ? selectedSegmentIds : undefined

        setAuditing(true)
        try {
            const result = await auditApi.start(docId, segmentIds)
            const auditScope = segmentIds ? `${segmentIds.length} 个选中区块` : '所有区块'
            message.success(
                `${auditScope}审稿完成！发现 ${result.certain_count} 个确定问题，${result.uncertain_count} 个待复核问题`
            )
            loadData()
        } catch {
            message.error('审稿失败')
        } finally {
            setAuditing(false)
        }
    }

    const toggleSegmentSelection = (segmentId: number) => {
        setSelectedSegmentIds(prev =>
            prev.includes(segmentId)
                ? prev.filter(id => id !== segmentId)
                : [...prev, segmentId]
        )
    }

    const selectAllSegments = () => {
        setSelectedSegmentIds(segments.map(s => s.id))
    }

    const deselectAllSegments = () => {
        setSelectedSegmentIds([])
    }

    const expandAllIssues = () => {
        const allIssueIds = results?.issues.map(i => i.id) || []
        setExpandedIssues(allIssueIds)
    }

    const collapseAllIssues = () => {
        setExpandedIssues([])
    }

    const toggleIssue = (issueId: number) => {
        setExpandedIssues(prev =>
            prev.includes(issueId)
                ? prev.filter(id => id !== issueId)
                : [...prev, issueId]
        )
    }

    const handleIssueClick = (issue: Issue) => {
        setSelectedIssue(issue)
        setNoteText(issue.note || '')
        setIssueModalVisible(true)
    }

    const updateIssueStatus = async (status: 'confirmed' | 'rejected') => {
        if (!docId || !selectedIssue) return
        try {
            await auditApi.updateIssue(docId, selectedIssue.id, status, noteText)
            message.success(status === 'confirmed' ? '已确认问题' : '已驳回标注')
            setIssueModalVisible(false)
            loadData()
        } catch {
            message.error('操作失败')
        }
    }

    const getIssuesByLevel = (level: string) => {
        return results?.issues.filter(i => i.level === level) || []
    }

    const getIssuesByStatus = (status: string) => {
        return results?.issues.filter(i => i.status === status) || []
    }

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: 100 }}>
                <Spin size="large" tip="加载中..." />
            </div>
        )
    }

    const certainIssues = getIssuesByLevel('CERTAIN_ERROR')
    const uncertainIssues = getIssuesByLevel('UNCERTAIN')
    const pendingIssues = getIssuesByStatus('pending')
    const confirmedIssues = getIssuesByStatus('confirmed')
    const rejectedIssues = getIssuesByStatus('rejected')

    return (
        <div>
            <Row gutter={24}>
                {/* 左侧：文档预览 */}
                <Col span={14}>
                    <Card
                        title={
                            <Space>
                                <Button
                                    icon={<ArrowLeftOutlined />}
                                    onClick={() => navigate(`/split/${docId}`)}
                                >
                                    返回分割
                                </Button>
                                <span>📄 {docInfo?.filename}</span>
                            </Space>
                        }
                        extra={
                            <Space>
                                {results && (
                                    <Button
                                        size="small"
                                        type={showAnnotations ? 'primary' : 'default'}
                                        onClick={() => setShowAnnotations(!showAnnotations)}
                                    >
                                        {showAnnotations ? '🔍 隐藏标注' : '🔍 显示标注'}
                                    </Button>
                                )}
                                {segments.length > 0 && (
                                    <>
                                        <Button size="small" onClick={selectAllSegments}>
                                            全选
                                        </Button>
                                        <Button size="small" onClick={deselectAllSegments}>
                                            清空
                                        </Button>
                                        <Badge count={selectedSegmentIds.length} showZero>
                                            <span style={{ marginRight: 8 }}>已选</span>
                                        </Badge>
                                    </>
                                )}
                                <Button
                                    type="primary"
                                    loading={auditing}
                                    onClick={startAudit}
                                    icon={<FileTextOutlined />}
                                >
                                    {selectedSegmentIds.length > 0
                                        ? `审稿选中区块 (${selectedSegmentIds.length})`
                                        : (results ? '重新审稿全部' : '开始AI审稿')}
                                </Button>
                            </Space>
                        }
                    >
                        {!results && !auditing && (
                            <Alert
                                message="尚未进行审稿"
                                description="点击右上角「开始AI审稿」按钮，系统将使用AI检查所有分割区块"
                                type="info"
                                showIcon
                                style={{ marginBottom: 16 }}
                            />
                        )}

                        {auditing && (
                            <div style={{ textAlign: 'center', padding: 60 }}>
                                <Spin size="large" />
                                <Title level={4} style={{ marginTop: 16 }}>AI正在审稿中...</Title>
                                <Paragraph type="secondary">
                                    正在检查 {segments.length} 个区块，请稍候...
                                </Paragraph>
                            </div>
                        )}

                        {/* 区块选择列表 */}
                        {segments.length > 0 && !auditing && (
                            <div style={{ marginBottom: 16 }}>
                                <Space direction="vertical" style={{ width: '100%' }}>
                                    {segments.map(seg => (
                                        <Card key={seg.id} size="small" style={{ cursor: 'pointer' }}>
                                            <Space>
                                                <Checkbox
                                                    checked={selectedSegmentIds.includes(seg.id)}
                                                    onChange={() => toggleSegmentSelection(seg.id)}
                                                />
                                                <span>{seg.name}</span>
                                                <Tag color="blue">{seg.pages.length} 页</Tag>
                                            </Space>
                                        </Card>
                                    ))}
                                </Space>
                            </div>
                        )}

                        {results && (
                            <Tabs
                                items={segments.map(seg => {
                                    // 获取当前区块的所有问题
                                    const segmentIssues = results.issues.filter(
                                        issue => issue.segment_id === seg.id
                                    )

                                    return {
                                        key: String(seg.id),
                                        label: seg.name,
                                        children: (
                                            <div style={{ position: 'relative', display: 'inline-block' }}>
                                                <img
                                                    src={splitApi.getSegmentImageUrl(docId!, seg.id)}
                                                    alt={seg.name}
                                                    style={{ width: '100%', display: 'block' }}
                                                    id={`segment-img-${seg.id}`}
                                                />
                                                {/* 问题标注覆盖层 */}
                                                {showAnnotations && segmentIssues.map((issue) => {
                                                    if (!issue.coordinates) return null

                                                    const { x1, y1, x2, y2 } = issue.coordinates
                                                    const isError = issue.level === 'CERTAIN_ERROR'
                                                    const color = isError ? '#ff4d4f' : '#faad14'
                                                    const bgColor = isError
                                                        ? 'rgba(255, 77, 79, 0.15)'
                                                        : 'rgba(250, 173, 20, 0.15)'

                                                    return (
                                                        <div
                                                            key={issue.id}
                                                            onClick={() => handleIssueClick(issue)}
                                                            style={{
                                                                position: 'absolute',
                                                                left: `${x1 / 10}%`,
                                                                top: `${y1 / 10}%`,
                                                                width: `${(x2 - x1) / 10}%`,
                                                                height: `${(y2 - y1) / 10}%`,
                                                                border: `2px solid ${color}`,
                                                                backgroundColor: bgColor,
                                                                cursor: 'pointer',
                                                                boxSizing: 'border-box',
                                                                transition: 'all 0.3s',
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                e.currentTarget.style.backgroundColor =
                                                                    isError ? 'rgba(255, 77, 79, 0.3)' : 'rgba(250, 173, 20, 0.3)'
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.currentTarget.style.backgroundColor = bgColor
                                                            }}
                                                            title={`${issue.type}: ${issue.description}`}
                                                        >
                                                            <div style={{
                                                                position: 'absolute',
                                                                top: -2,
                                                                left: -2,
                                                                backgroundColor: color,
                                                                color: 'white',
                                                                padding: '2px 6px',
                                                                fontSize: '12px',
                                                                fontWeight: 'bold',
                                                                borderRadius: '3px',
                                                                whiteSpace: 'nowrap',
                                                                textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                                                            }}>
                                                                {isError ? '🔴' : '🟡'} {issue.type}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )
                                    }
                                })}
                                onChange={key => setSelectedSegment(Number(key))}
                            />
                        )}
                    </Card>
                </Col>

                {/* 右侧：问题列表 */}
                <Col span={10} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
                    <Card
                        title={
                            results && (
                                <Space>
                                    <span>问题列表</span>
                                    <Button
                                        size="small"
                                        type="primary"
                                        onClick={expandAllIssues}
                                    >
                                        📖 展开全部
                                    </Button>
                                    <Button
                                        size="small"
                                        onClick={collapseAllIssues}
                                    >
                                        📕 折叠全部
                                    </Button>
                                </Space>
                            )
                        }
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                    >
                        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <Tabs
                                style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                                items={[
                                    {
                                        key: 'certain',
                                        label: (
                                            <Badge count={certainIssues.length} offset={[10, 0]}>
                                                <span>🔴 确定错误</span>
                                            </Badge>
                                        ),
                                        children: (
                                            <IssueList
                                                issues={certainIssues}
                                                onIssueClick={handleIssueClick}
                                            />
                                        )
                                    },
                                    {
                                        key: 'uncertain',
                                        label: (
                                            <Badge count={uncertainIssues.length} offset={[10, 0]}>
                                                <span>🟡 待复核</span>
                                            </Badge>
                                        ),
                                        children: (
                                            <IssueList
                                                issues={uncertainIssues}
                                                onIssueClick={handleIssueClick}
                                                expandedIssues={expandedIssues}
                                                onToggle={toggleIssue}
                                            />
                                        )
                                    },
                                    {
                                        key: 'confirmed',
                                        label: (
                                            <Badge count={confirmedIssues.length} offset={[10, 0]}>
                                                <span>✅ 已确认</span>
                                            </Badge>
                                        ),
                                        children: (
                                            <IssueList
                                                issues={confirmedIssues}
                                                onIssueClick={handleIssueClick}
                                                expandedIssues={expandedIssues}
                                                onToggle={toggleIssue}
                                            />
                                        )
                                    },
                                    {
                                        key: 'rejected',
                                        label: (
                                            <Badge count={rejectedIssues.length} offset={[10, 0]}>
                                                <span>❌ 已驳回</span>
                                            </Badge>
                                        ),
                                        children: (
                                            <IssueList
                                                issues={rejectedIssues}
                                                onIssueClick={handleIssueClick}
                                                expandedIssues={expandedIssues}
                                                onToggle={toggleIssue}
                                            />
                                        )
                                    }
                                ]}
                            />
                        </div>
                    </Card>

                    {/* 统计卡片 */}
                    {results && (
                        <Card title="📊 审稿统计" style={{ marginTop: 16 }}>
                            <Row gutter={16}>
                                <Col span={8}>
                                    <div style={{ textAlign: 'center' }}>
                                        <Text type="danger" style={{ fontSize: 24 }}>
                                            {certainIssues.length}
                                        </Text>
                                        <br />
                                        <Text type="secondary">确定错误</Text>
                                    </div>
                                </Col>
                                <Col span={8}>
                                    <div style={{ textAlign: 'center' }}>
                                        <Text style={{ fontSize: 24, color: '#faad14' }}>
                                            {uncertainIssues.length}
                                        </Text>
                                        <br />
                                        <Text type="secondary">待复核</Text>
                                    </div>
                                </Col>
                                <Col span={8}>
                                    <div style={{ textAlign: 'center' }}>
                                        <Text type="success" style={{ fontSize: 24 }}>
                                            {confirmedIssues.length + rejectedIssues.length}
                                        </Text>
                                        <br />
                                        <Text type="secondary">已处理</Text>
                                    </div>
                                </Col>
                            </Row>
                        </Card>
                    )}
                </Col>
            </Row>

            {/* 问题详情弹窗 */}
            <Modal
                title={
                    <Space>
                        {selectedIssue?.level === 'CERTAIN_ERROR' ? (
                            <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                        ) : (
                            <QuestionCircleOutlined style={{ color: '#faad14' }} />
                        )}
                        <span>问题详情</span>
                        <Tag color={selectedIssue?.level === 'CERTAIN_ERROR' ? 'red' : 'orange'}>
                            {selectedIssue?.type}
                        </Tag>
                    </Space>
                }
                open={issueModalVisible}
                onCancel={() => setIssueModalVisible(false)}
                width={600}
                footer={
                    selectedIssue?.status === 'pending' ? [
                        <Button
                            key="reject"
                            danger
                            icon={<CloseCircleOutlined />}
                            onClick={() => updateIssueStatus('rejected')}
                        >
                            驳回标注
                        </Button>,
                        <Button
                            key="confirm"
                            type="primary"
                            icon={<CheckCircleOutlined />}
                            onClick={() => updateIssueStatus('confirmed')}
                        >
                            确认问题
                        </Button>
                    ] : [
                        <Button key="close" onClick={() => setIssueModalVisible(false)}>
                            关闭
                        </Button>
                    ]
                }
            >
                {selectedIssue && (
                    <Descriptions column={1} bordered size="small">
                        <Descriptions.Item label="位置">
                            {selectedIssue.location}
                        </Descriptions.Item>
                        <Descriptions.Item label="问题描述">
                            {selectedIssue.description}
                        </Descriptions.Item>
                        <Descriptions.Item label="修改建议">
                            <Text type="success">{selectedIssue.suggestion}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="AI判断依据">
                            <Text type="secondary">{selectedIssue.reasoning}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="置信度">
                            <Tag color={
                                selectedIssue.confidence === 'high' ? 'red' :
                                    selectedIssue.confidence === 'medium' ? 'orange' : 'default'
                            }>
                                {selectedIssue.confidence}
                            </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="状态">
                            <Tag color={
                                selectedIssue.status === 'confirmed' ? 'green' :
                                    selectedIssue.status === 'rejected' ? 'default' : 'blue'
                            }>
                                {selectedIssue.status === 'confirmed' ? '已确认' :
                                    selectedIssue.status === 'rejected' ? '已驳回' : '待处理'}
                            </Tag>
                        </Descriptions.Item>
                    </Descriptions>
                )}

                {selectedIssue?.status === 'pending' && (
                    <div style={{ marginTop: 16 }}>
                        <Text strong>备注（可选）：</Text>
                        <TextArea
                            value={noteText}
                            onChange={e => setNoteText(e.target.value)}
                            placeholder="添加你的备注..."
                            rows={3}
                            style={{ marginTop: 8 }}
                        />
                    </div>
                )}
            </Modal>
        </div>
    )
}

// 问题列表组件
function IssueList({
    issues,
    onIssueClick,
    expandedIssues = [],
    onToggle
}: {
    issues: Issue[],
    onIssueClick: (issue: Issue) => void,
    expandedIssues?: number[],
    onToggle?: (issueId: number) => void
}) {
    if (issues.length === 0) {
        return <Empty description="暂无问题" />
    }

    return (
        <List
            dataSource={issues}
            style={{ overflowY: 'auto', height: '100%' }}
            renderItem={issue => {
                const isExpanded = expandedIssues.includes(issue.id)

                return (
                    <List.Item
                        style={{
                            flexDirection: 'column',
                            alignItems: 'stretch',
                            cursor: 'pointer',
                            padding: '12px',
                            borderBottom: '1px solid #f0f0f0'
                        }}
                    >
                        <div
                            onClick={() => onToggle?.(issue.id)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                        >
                            <Space>
                                <Tag color={issue.level === 'CERTAIN_ERROR' ? 'red' : 'orange'}>
                                    {issue.type}
                                </Tag>
                                {issue.status === 'confirmed' && (
                                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                                )}
                                {issue.status === 'rejected' && (
                                    <CloseCircleOutlined style={{ color: '#999' }} />
                                )}
                            </Space>
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                                {isExpanded ? '▼' : '▶'}
                            </Text>
                        </div>

                        {/* 问题描述 */}
                        <Text
                            type="secondary"
                            style={{
                                marginTop: 8,
                                fontSize: '13px'
                            }}
                        >
                            {issue.description}
                        </Text>

                        {/* 展开的详细信息 */}
                        {isExpanded && (
                            <div style={{
                                marginTop: 12,
                                padding: '12px',
                                backgroundColor: '#fafafa',
                                borderRadius: '4px',
                                fontSize: '13px'
                            }}>
                                <Descriptions column={1} size="small" bordered={false}>
                                    <Descriptions.Item label="位置">
                                        {issue.location}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="修改建议">
                                        <Text type="success">{issue.suggestion}</Text>
                                    </Descriptions.Item>
                                    <Descriptions.Item label="AI判断依据">
                                        <Text type="secondary">{issue.reasoning}</Text>
                                    </Descriptions.Item>
                                    <Descriptions.Item label="置信度">
                                        <Tag color={
                                            issue.confidence === 'high' ? 'red' :
                                                issue.confidence === 'medium' ? 'orange' : 'default'
                                        }>
                                            {issue.confidence}
                                        </Tag>
                                    </Descriptions.Item>
                                    <Descriptions.Item label="状态">
                                        <Tag color={
                                            issue.status === 'confirmed' ? 'green' :
                                                issue.status === 'rejected' ? 'default' : 'blue'
                                        }>
                                            {issue.status === 'confirmed' ? '已确认' :
                                                issue.status === 'rejected' ? '已驳回' : '待处理'}
                                        </Tag>
                                    </Descriptions.Item>
                                </Descriptions>

                                {/* 操作按钮 */}
                                {issue.status === 'pending' && (
                                    <Space style={{ marginTop: 12 }}>
                                        <Button
                                            size="small"
                                            type="primary"
                                            icon={<CheckCircleOutlined />}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                onIssueClick(issue)
                                            }}
                                        >
                                            确认问题
                                        </Button>
                                        <Button
                                            size="small"
                                            danger
                                            icon={<CloseCircleOutlined />}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                onIssueClick(issue)
                                            }}
                                        >
                                            驳回标注
                                        </Button>
                                    </Space>
                                )}
                            </div>
                        )}
                    </List.Item>
                )
            }}
        />
    )
}

export default ReviewPage
