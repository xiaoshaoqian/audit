import React, { useEffect, useMemo, useState } from 'react';
import {
    Layout,
    Menu,
    Card,
    Typography,
    Empty,
    Space,
    Image,
    Button,
    message,
    Spin,
    Tag,
    Tabs,
    Input,
    Checkbox
} from 'antd';
import {
    FolderOutlined,
    SafetyCertificateOutlined,
    EditOutlined,
    DeleteOutlined
} from '@ant-design/icons';
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
    const [groups, setGroups] = useState<Group[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

    const [slices, setSlices] = useState<Slice[]>([]);
    const [selectedSlice, setSelectedSlice] = useState<Slice | null>(null);

    const [loadingGroups, setLoadingGroups] = useState(false);
    const [loadingSlices, setLoadingSlices] = useState(false);
    const [deletingGroupName, setDeletingGroupName] = useState<string | null>(null);

    const [selectedSliceIds, setSelectedSliceIds] = useState<Set<string>>(new Set());
    const [activeTabKey, setActiveTabKey] = useState<string>('all');

    const [editingSliceId, setEditingSliceId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    useEffect(() => {
        void loadGroups();
    }, []);

    useEffect(() => {
        if (!selectedGroup) {
            setSlices([]);
            setSelectedSlice(null);
            setSelectedSliceIds(new Set());
            setEditingSliceId(null);
            setActiveTabKey('all');
            return;
        }

        void loadSlices(selectedGroup);
        setSelectedSlice(null);
        setSelectedSliceIds(new Set());
        setEditingSliceId(null);
        setActiveTabKey('all');
    }, [selectedGroup]);

    useEffect(() => {
        setSelectedSliceIds((prev) => {
            const valid = new Set(slices.map((s) => s.filename));
            const next = new Set(Array.from(prev).filter((id) => valid.has(id)));
            return next;
        });

        if (selectedSlice && !slices.some((s) => s.filename === selectedSlice.filename)) {
            setSelectedSlice(null);
        }
    }, [slices, selectedSlice]);

    const loadGroups = async (preferredGroupName?: string | null) => {
        setLoadingGroups(true);
        try {
            const list = await groupApi.listGroups();
            setGroups(list);
            if (list.length === 0) {
                setSelectedGroup(null);
                return;
            }

            if (preferredGroupName && list.some((g) => g.name === preferredGroupName)) {
                setSelectedGroup(preferredGroupName);
                return;
            }

            if (selectedGroup && list.some((g) => g.name === selectedGroup)) {
                setSelectedGroup(selectedGroup);
                return;
            }

            setSelectedGroup(list[0].name);
        } catch {
            message.error('加载分组失败');
        } finally {
            setLoadingGroups(false);
        }
    };

    const loadSlices = async (groupName: string) => {
        setLoadingSlices(true);
        try {
            const list = await groupApi.getGroupSlices(groupName);
            setSlices(list);
        } catch {
            message.error('加载切片失败');
        } finally {
            setLoadingSlices(false);
        }
    };

    const startRename = (slice: Slice) => {
        setEditingSliceId(slice.filename);
        setEditName(slice.label);
    };

    const submitRename = async (slice: Slice) => {
        if (!selectedGroup) {
            setEditingSliceId(null);
            return;
        }

        const trimmed = editName.trim();
        if (!trimmed || trimmed === slice.label) {
            setEditingSliceId(null);
            return;
        }

        try {
            await groupApi.renameSlice(selectedGroup, slice.filename, trimmed);
            message.success('重命名成功');
            await loadSlices(selectedGroup);
        } catch {
            message.error('重命名失败');
        } finally {
            setEditingSliceId(null);
        }
    };

    const handleDelete = async (slice: Slice) => {
        if (!selectedGroup) return;
        if (!window.confirm(`确定要删除切片 "${slice.label}" 吗?`)) return;

        try {
            await groupApi.deleteSlice(selectedGroup, slice.filename);
            message.success('删除成功');
            await loadSlices(selectedGroup);
            if (selectedSlice?.filename === slice.filename) {
                setSelectedSlice(null);
            }
        } catch {
            message.error('删除失败');
        }
    };

    const handleDeleteGroup = async (groupName: string) => {
        if (deletingGroupName) return;
        if (!window.confirm(`确定删除分组 "${groupName}" 吗？该组下切片会一并删除。`)) {
            return;
        }

        setDeletingGroupName(groupName);
        try {
            await groupApi.deleteGroup(groupName);
            message.success('分组删除成功');
            const preferred = selectedGroup === groupName ? null : selectedGroup;
            await loadGroups(preferred);
        } catch {
            message.error('删除分组失败');
        } finally {
            setDeletingGroupName(null);
        }
    };

    const toggleSelection = (filename: string) => {
        setSelectedSliceIds((prev) => {
            const next = new Set(prev);
            if (next.has(filename)) {
                next.delete(filename);
            } else {
                next.add(filename);
            }
            return next;
        });
    };

    const getSlicesByTab = (tabKey: string): Slice[] => {
        if (tabKey === 'all') return slices;
        return slices.filter((s) => s.type === tabKey);
    };

    const currentTabSlices = useMemo(() => getSlicesByTab(activeTabKey), [activeTabKey, slices]);
    const selectedInCurrentTab = useMemo(
        () => currentTabSlices.filter((s) => selectedSliceIds.has(s.filename)),
        [currentTabSlices, selectedSliceIds]
    );
    const selectedCountInCurrentTab = selectedInCurrentTab.length;

    const handleSelectAll = (checked: boolean) => {
        const currentIds = currentTabSlices.map((s) => s.filename);
        setSelectedSliceIds((prev) => {
            const next = new Set(prev);
            if (checked) {
                currentIds.forEach((id) => next.add(id));
            } else {
                currentIds.forEach((id) => next.delete(id));
            }
            return next;
        });
    };

    const handleBatchAudit = () => {
        if (selectedCountInCurrentTab === 0) {
            message.warning('请先选择当前 Tab 的切片');
            return;
        }
        message.info(`开始批量审核 ${selectedCountInCurrentTab} 个切片（开发中）`);
    };

    const handleBatchDelete = async () => {
        if (!selectedGroup) return;
        if (selectedCountInCurrentTab === 0) {
            message.warning('请先选择当前 Tab 的切片');
            return;
        }

        if (!window.confirm(`确定删除当前 Tab 已选的 ${selectedCountInCurrentTab} 个切片吗?`)) {
            return;
        }

        const targetIds = new Set(selectedInCurrentTab.map((s) => s.filename));
        try {
            await Promise.all(selectedInCurrentTab.map((slice) => groupApi.deleteSlice(selectedGroup, slice.filename)));

            setSelectedSliceIds((prev) => {
                const next = new Set(prev);
                targetIds.forEach((id) => next.delete(id));
                return next;
            });

            if (selectedSlice && targetIds.has(selectedSlice.filename)) {
                setSelectedSlice(null);
            }

            await loadSlices(selectedGroup);
            message.success(`已删除 ${selectedCountInCurrentTab} 个切片`);
        } catch {
            message.error('批量删除失败');
        }
    };

    const isAllSelected = currentTabSlices.length > 0 && selectedCountInCurrentTab === currentTabSlices.length;
    const isIndeterminate = selectedCountInCurrentTab > 0 && selectedCountInCurrentTab < currentTabSlices.length;

    const renderSliceGrid = (list: Slice[]) => {
        if (list.length === 0) return <Empty description="暂无该类型切片" />;

        return (
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                    gap: 16
                }}
            >
                {list.map((slice) => {
                    const isSelected = selectedSliceIds.has(slice.filename);
                    const isEditing = editingSliceId === slice.filename;

                    return (
                        <Card
                            key={slice.filename}
                            hoverable
                            cover={
                                <div
                                    style={{
                                        height: 140,
                                        overflow: 'hidden',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: '#e6f7ff',
                                        position: 'relative'
                                    }}
                                >
                                    <img
                                        alt={slice.label}
                                        src={slice.url}
                                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                    />
                                    <div style={{ position: 'absolute', top: 8, left: 8 }}>
                                        <Checkbox
                                            checked={isSelected}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                toggleSelection(slice.filename);
                                            }}
                                        />
                                    </div>
                                    <div style={{ position: 'absolute', top: 8, right: 8 }}>
                                        <Button
                                            type="text"
                                            size="small"
                                            icon={<SafetyCertificateOutlined />}
                                            style={{ background: 'rgba(255,255,255,0.9)', color: '#1890ff' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                message.success('触发单张审核');
                                            }}
                                        >
                                            审核
                                        </Button>
                                    </div>
                                </div>
                            }
                            style={{
                                border: selectedSlice?.filename === slice.filename
                                    ? '2px solid #1890ff'
                                    : isSelected
                                        ? '2px solid #52c41a'
                                        : '1px solid #f0f0f0'
                            }}
                            bodyStyle={{ padding: '8px 12px' }}
                            onClick={() => {
                                if (!isEditing) {
                                    setSelectedSlice(slice);
                                }
                            }}
                            actions={[
                                <EditOutlined key="edit" onClick={(e) => { e.stopPropagation(); startRename(slice); }} />,
                                <DeleteOutlined key="delete" onClick={(e) => { e.stopPropagation(); void handleDelete(slice); }} />
                            ]}
                        >
                            <Card.Meta
                                title={
                                    isEditing ? (
                                        <Input
                                            autoFocus
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            onBlur={() => { void submitRename(slice); }}
                                            onPressEnter={() => { void submitRename(slice); }}
                                            onClick={(e) => e.stopPropagation()}
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

    const sliceTypes = Array.from(new Set(slices.map((s) => s.type))).sort();

    const typeLabels: Record<string, string> = {
        knowledge: '知识点',
        example: '例题',
        answer: '答案'
    };

    const tabItems = [
        {
            key: 'all',
            label: `全部 (${slices.length})`,
            children: renderSliceGrid(slices)
        },
        ...sliceTypes.map((type) => {
            const filtered = slices.filter((s) => s.type === type);
            return {
                key: type,
                label: `${typeLabels[type] ?? type} (${filtered.length})`,
                children: renderSliceGrid(filtered)
            };
        })
    ];

    return (
        <Layout style={{ height: 'calc(100vh - 64px)', background: '#fff' }}>
            <Sider width={250} theme="light" style={{ borderRight: '1px solid #f0f0f0', overflowY: 'auto' }}>
                <div style={{ padding: '16px 16px 0' }}>
                    <Title level={5}>任务分组</Title>
                </div>
                {loadingGroups ? (
                    <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
                ) : (
                    <Menu
                        mode="inline"
                        selectedKeys={selectedGroup ? [selectedGroup] : []}
                        onClick={({ key }) => setSelectedGroup(String(key))}
                        items={groups.map((g) => ({
                            key: g.name,
                            icon: <FolderOutlined />,
                            label: (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {g.name}
                                    </span>
                                    <Button
                                        type="text"
                                        size="small"
                                        danger
                                        icon={<DeleteOutlined />}
                                        loading={deletingGroupName === g.name}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            void handleDeleteGroup(g.name);
                                        }}
                                    />
                                </div>
                            )
                        }))}
                        style={{ borderRight: 0 }}
                    />
                )}
            </Sider>

            <Content style={{ borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}>
                <div
                    style={{
                        padding: 16,
                        borderBottom: '1px solid #f0f0f0',
                        background: '#fafafa',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <Title level={5} style={{ margin: 0 }}>
                            {selectedGroup ? `${selectedGroup} / 切片列表` : '切片预览'}
                        </Title>
                        {selectedGroup && currentTabSlices.length > 0 && (
                            <Checkbox
                                checked={isAllSelected}
                                indeterminate={isIndeterminate}
                                onChange={(e) => handleSelectAll(e.target.checked)}
                            >
                                全选
                            </Checkbox>
                        )}
                    </div>

                    {selectedCountInCurrentTab > 0 && (
                        <Space>
                            <Text strong>已选 {selectedCountInCurrentTab} 项</Text>
                            <Button type="primary" onClick={handleBatchAudit}>批量审核</Button>
                            <Button danger onClick={() => { void handleBatchDelete(); }}>批量删除</Button>
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
                        <Tabs activeKey={activeTabKey} onChange={setActiveTabKey} items={tabItems} style={{ marginTop: 16 }} />
                    )}
                </div>
            </Content>

            <Sider width={400} theme="light" style={{ background: '#fff', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0' }}>
                    <Title level={5}>审核面板</Title>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                    {!selectedSlice ? (
                        <Empty description="点击切片查看详情" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 100 }} />
                    ) : (
                        <Space direction="vertical" style={{ width: '100%' }} size="large">
                            <div>
                                <Text type="secondary">原始切片</Text>
                                <div style={{ border: '1px solid #eee', borderRadius: 4, padding: 4, marginTop: 8 }}>
                                    <Image src={selectedSlice.url} />
                                </div>
                            </div>

                            <Card size="small">
                                <Space direction="vertical">
                                    <Text><strong>类型:</strong> {selectedSlice.type}</Text>
                                    <Text><strong>标签:</strong> {selectedSlice.label}</Text>
                                    <Text><strong>文件名:</strong> {selectedSlice.filename}</Text>
                                </Space>
                            </Card>

                            <Space>
                                <Button type="primary" icon={<SafetyCertificateOutlined />}>
                                    通过
                                </Button>
                                <Button danger>
                                    驳回
                                </Button>
                            </Space>

                            <Card title="九章解析(模拟)" size="small">
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
