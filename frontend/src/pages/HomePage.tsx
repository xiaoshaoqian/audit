import React, { useState, useEffect } from 'react';
import { Layout, Menu, Card, Typography, Empty, Space, Image, Button, message, Spin, Tag, Tabs, Input, Modal, Checkbox } from 'antd';
import { FolderOutlined, SafetyCertificateOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { groupApi } from '../services/api';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;

interface Group {
    name: string;
    path: string;
}

interface Slice {
    filename: string;
    url: string;
    label: string;
    type: string;
}

const HomePage: React.FC = () => {
    // State
    const [groups, setGroups] = useState<Group[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
    const [slices, setSlices] = useState<Slice[]>([]);
    const [selectedSlice, setSelectedSlice] = useState<Slice | null>(null);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [loadingSlices, setLoadingSlices] = useState(false);

    // Selection & Batch
    const [selectedSliceIds, setSelectedSliceIds] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);

    // Inline Editing
    const [editingSliceId, setEditingSliceId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    // Initial Load
    useEffect(() => {
        loadGroups();
    }, []);

    // Load Groups
    const loadGroups = async () => {
        setLoadingGroups(true);
        try {
            const list = await groupApi.listGroups();
            setGroups(list);
            if (list.length > 0) {
                // Auto-select first group
                setSelectedGroup(list[0].name);
            }
        } catch (error) {
            message.error('加载分组失败');
        } finally {
            setLoadingGroups(false);
        }
    };

    // Load Slices when Group changes
    useEffect(() => {
        if (selectedGroup) {
            loadSlices(selectedGroup);
            setSelectedSlice(null);
            setSelectedSliceIds(new Set());
            setEditingSliceId(null);
        } else {
            setSlices([]);
        }
    }, [selectedGroup]);

    const loadSlices = async (groupName: string) => {
        setLoadingSlices(true);
        try {
            const list = await groupApi.getGroupSlices(groupName);
            setSlices(list);
        } catch (error) {
            message.error('加载切片失败');
        } finally {
            setLoadingSlices(false);
        }
    };

    // Actions
    const startRename = (slice: Slice) => {
        setEditingSliceId(slice.filename);
        setEditName(slice.label);
    };

    const submitRename = async (slice: Slice) => {
        if (!selectedGroup || !editName || editName === slice.label) {
            setEditingSliceId(null);
            return;
        }

        try {
            await groupApi.renameSlice(selectedGroup, slice.filename, editName);
            message.success("重命名成功");
            loadSlices(selectedGroup);
        } catch (error) {
            message.error("重命名失败");
        } finally {
            setEditingSliceId(null);
        }
    };

    const handleDelete = async (slice: Slice) => {
        if (!selectedGroup) return;
        if (window.confirm(`确定要删除切片 "${slice.label}" 吗?`)) {
            try {
                await groupApi.deleteSlice(selectedGroup, slice.filename);
                message.success("删除成功");
                loadSlices(selectedGroup);
                if (selectedSlice === slice) setSelectedSlice(null);
            } catch (error) {
                message.error("删除失败");
            }
        }
    };

    const toggleSelection = (filename: string) => {
        const newSet = new Set(selectedSliceIds);
        if (newSet.has(filename)) {
            newSet.delete(filename);
        } else {
            newSet.add(filename);
        }
        setSelectedSliceIds(newSet);
    };

    const handleBatchAudit = () => {
        message.info(`开始批量审核选中的 ${selectedSliceIds.size} 个切片... (功能开发中)`);
    };

    const handleSelectAll = (e: any) => {
        if (e.target.checked) {
            const allIds = new Set(slices.map(s => s.filename));
            setSelectedSliceIds(allIds);
        } else {
            setSelectedSliceIds(new Set());
        }
    };

    const isAllSelected = slices.length > 0 && selectedSliceIds.size === slices.length;
    const isIndeterminate = selectedSliceIds.size > 0 && selectedSliceIds.size < slices.length;

    const renderSliceGrid = (list: Slice[]) => {
        if (list.length === 0) return <Empty description="暂无该类型切片" />;
        return (
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '16px'
            }}>
                {list.map((slice, index) => {
                    const isSelected = selectedSliceIds.has(slice.filename);
                    const isEditing = editingSliceId === slice.filename;

                    return (
                        <Card
                            key={index}
                            hoverable
                            cover={
                                <div style={{ height: 120, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e6f7ff', position: 'relative' }}>
                                    <img
                                        alt={slice.label}
                                        src={slice.url}
                                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                    />
                                    {/* Selection Overlay */}
                                    <div style={{ position: 'absolute', top: 8, left: 8 }}>
                                        <Checkbox
                                            checked={isSelected}
                                            onChange={(e) => {
                                                e.stopPropagation(); // prevent card click
                                                toggleSelection(slice.filename);
                                            }}
                                        />
                                    </div>
                                    <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,0.8)', padding: '2px 6px', borderRadius: 4, cursor: 'pointer', zIndex: 10 }}>
                                        <Button
                                            type="text"
                                            size="small"
                                            icon={<SafetyCertificateOutlined />}
                                            style={{ color: '#1890ff', fontWeight: 'bold' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                message.success("触发单张审核");
                                            }}
                                        >审核</Button>
                                    </div>
                                </div>
                            }
                            style={{
                                border: selectedSlice === slice ? '2px solid #1890ff' : (isSelected ? '2px solid #52c41a' : '1px solid #f0f0f0'),
                                cursor: 'default'
                            }}
                            bodyStyle={{ padding: '8px 12px' }}
                            onClick={() => !isEditing && setSelectedSlice(slice)}
                            actions={[
                                <EditOutlined key="edit" onClick={(e) => { e.stopPropagation(); startRename(slice); }} />,
                                <DeleteOutlined key="delete" onClick={(e) => { e.stopPropagation(); handleDelete(slice); }} />
                            ]}
                        >
                            <Card.Meta
                                title={
                                    isEditing ? (
                                        <Input
                                            autoFocus
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            onBlur={() => submitRename(slice)}
                                            onPressEnter={() => submitRename(slice)}
                                            onClick={e => e.stopPropagation()}
                                        />
                                    ) : (
                                        <Text style={{ fontSize: 13 }} strong>{slice.label}</Text>
                                    )
                                }
                                description={<Tag color="blue" style={{ fontSize: 10 }}>{slice.type}</Tag>}
                            />
                        </Card>
                    );
                })}
            </div>
        );
    };

    // Group slices by type for Tabs
    const sliceTypes = Array.from(new Set(slices.map(s => s.type))).sort();

    const typeLabels: Record<string, string> = {
        'knowledge': '📘 知识点',
        'example': '📝 例题',
        'answer': '✅ 答案'
    };

    const tabItems = [
        {
            key: 'all',
            label: `全部 (${slices.length})`,
            children: renderSliceGrid(slices)
        },
        ...sliceTypes.map(type => {
            const filtered = slices.filter(s => s.type === type);
            const labelStr = typeLabels[type] || type;
            return {
                key: type,
                label: `${labelStr} (${filtered.length})`,
                children: renderSliceGrid(filtered)
            };
        })
    ];

    return (
        <Layout style={{ height: 'calc(100vh - 64px)', background: '#fff' }}>
            {/* Left: Group List */}
            <Sider width={250} theme="light" style={{ borderRight: '1px solid #f0f0f0', overflowY: 'auto' }}>
                <div style={{ padding: '16px 16px 0' }}>
                    <Title level={5}>📂 任务分组</Title>
                </div>
                {loadingGroups ? (
                    <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
                ) : (
                    <Menu
                        mode="inline"
                        selectedKeys={selectedGroup ? [selectedGroup] : []}
                        onClick={({ key }) => setSelectedGroup(key)}
                        items={groups.map(g => ({
                            key: g.name,
                            icon: <FolderOutlined />,
                            label: g.name
                        }))}
                        style={{ borderRight: 0 }}
                    />
                )}
            </Sider>

            {/* Center: Slice Gallery */}
            <Content style={{ borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', background: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <Title level={5} style={{ margin: 0 }}>
                            {selectedGroup ? `🖼️ ${selectedGroup} / 切片列表` : '🖼️ 切片预览'}
                        </Title>
                        {selectedGroup && slices.length > 0 && (
                            <Checkbox
                                checked={isAllSelected}
                                indeterminate={isIndeterminate}
                                onChange={handleSelectAll}
                            >
                                全选
                            </Checkbox>
                        )}
                    </div>

                    {selectedSliceIds.size > 0 && (
                        <Space>
                            <Text strong>已选 {selectedSliceIds.size} 项</Text>
                            <Button type="primary" onClick={handleBatchAudit}>批量审核</Button>
                        </Space>
                    )}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', background: '#f5f5f5' }}>
                    {!selectedGroup ? (
                        <Empty description="请选择左侧分组" style={{ marginTop: 100 }} />
                    ) : loadingSlices ? (
                        <div style={{ textAlign: 'center', padding: 50 }}><Spin /></div>
                    ) : slices.length === 0 ? (
                        <Empty description="该组暂无切片" />
                    ) : (
                        <Tabs defaultActiveKey="all" items={tabItems} style={{ marginTop: 16 }} />
                    )}
                </div>
            </Content>

            {/* Right: Audit Panel */}
            <Sider width={400} theme="light" style={{ background: '#fff', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0' }}>
                    <Title level={5}>✅ 审核面板</Title>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                    {!selectedSlice ? (
                        <Empty description="点击切片查看详情" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 100 }} />
                    ) : (
                        <Space direction="vertical" style={{ width: '100%' }} size="large">
                            {/* Image Preview */}
                            <div>
                                <Text type="secondary">原始切片</Text>
                                <div style={{ border: '1px solid #eee', borderRadius: 4, padding: 4, marginTop: 8 }}>
                                    <Image src={selectedSlice.url} />
                                </div>
                            </div>

                            {/* Meta Info */}
                            <Card size="small">
                                <Space direction="vertical">
                                    <Text><strong>类型:</strong> {selectedSlice.type}</Text>
                                    <Text><strong>标签:</strong> {selectedSlice.label}</Text>
                                    <Text><strong>文件名:</strong> {selectedSlice.filename}</Text>
                                </Space>
                            </Card>

                            {/* Actions (Placeholder) */}
                            <Space>
                                <Button type="primary" icon={<SafetyCertificateOutlined />}>
                                    通过
                                </Button>
                                <Button danger>
                                    驳回
                                </Button>
                            </Space>

                            {/* Solution Area (Placeholder) */}
                            <Card title="💡 九章解析(模拟)" size="small">
                                <Text type="secondary">点击审核按钮调用模型...</Text>
                            </Card>
                        </Space>
                    )}
                </div>
            </Sider>
        </Layout>
    );
};

export default HomePage;
