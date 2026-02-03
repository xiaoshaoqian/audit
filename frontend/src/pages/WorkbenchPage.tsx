import React, { useState, useEffect, useRef } from 'react';
import { Layout, Row, Col, Card, List, Checkbox, Button, message, Input, Select, Space, Typography, Slider, Tooltip } from 'antd';
import { ScissorOutlined, ThunderboltOutlined, DeleteOutlined, ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons';
import { uploadApi, canvasApi, DocumentInfo, CanvasStitchResult } from '../services/api';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

interface CutLine {
    y: number; // Global Y coordinate
    id: string;
}

interface Block {
    id: string;
    y_start: number;
    y_end: number;
    type: 'knowledge' | 'example' | 'answer';
    label: string;
}

const WorkbenchPage: React.FC = () => {
    // State
    const [documents, setDocuments] = useState<DocumentInfo[]>([]);
    const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [canvas, setCanvas] = useState<CanvasStitchResult | null>(null);
    const [cutLines, setCutLines] = useState<CutLine[]>([]);
    const [blocks, setBlocks] = useState<Block[]>([]);
    const [zoom, setZoom] = useState(100);

    // Config: Default based on user feedback (2.54cm / 29.7cm ≈ 0.086)
    const [trimTop, setTrimTop] = useState(0.086);
    const [trimBottom, setTrimBottom] = useState(0.086);

    // Group & Save
    const [groupName, setGroupName] = useState('');
    const [hoverBlockId, setHoverBlockId] = useState<string | null>(null);

    // Refs
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll when hovering block
    useEffect(() => {
        if (!hoverBlockId || !canvas || !scrollContainerRef.current) return;

        const block = blocks.find(b => b.id === hoverBlockId);
        if (block) {
            // Calculate position
            const scale = zoom / 100;
            const targetY = block.y_start * scale;

            // Scroll with some padding
            scrollContainerRef.current.scrollTo({
                top: Math.max(0, targetY - 50),
                behavior: 'smooth'
            });
        }
    }, [hoverBlockId, canvas, zoom, blocks]);

    // Actions
    // Initial Load
    useEffect(() => {
        loadDocuments();
    }, []);

    const loadDocuments = async () => {
        try {
            const docs = await uploadApi.getDocuments();
            setDocuments(docs);
        } catch (error) {
            message.error('加载文档列表失败');
        }
    };

    // Actions
    const handleStitch = async () => {
        if (selectedDocIds.length === 0) {
            message.warning('请先选择文档');
            return;
        }
        setLoading(true);
        try {
            const result = await canvasApi.stitch(selectedDocIds, trimTop, trimBottom);
            setCanvas(result);
            setCutLines([]);
            setBlocks([]);
            setZoom(100);
            message.success('拼接完成');
        } catch (error) {
            message.error('拼接失败: ' + error);
        } finally {
            setLoading(false);
        }
    };

    const handleWrapperClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!canvas) return;

        // 获取点击相对于 currentTarget (wrapper) 的位置
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top; // Visual Y (Zoomed)

        // Convert to Global Y
        const scale = zoom / 100;
        const globalY = y / scale;

        // Add Cut Line
        const newLine: CutLine = {
            y: globalY,
            id: Date.now().toString()
        };

        const newLines = [...cutLines, newLine].sort((a, b) => a.y - b.y);
        setCutLines(newLines);
        updateBlocks(newLines, canvas.total_height);
    };

    const updateBlocks = (lines: CutLine[], totalHeight: number) => {
        const sortedY = [0, ...lines.map(l => l.y), totalHeight];
        const newBlocks: Block[] = [];

        for (let i = 0; i < sortedY.length - 1; i++) {
            const start = sortedY[i];
            const end = sortedY[i + 1];
            if (end - start < 10) continue;

            newBlocks.push({
                id: `block_${i}`,
                y_start: start,
                y_end: end,
                type: 'example',
                label: `Block ${i + 1}`
            });
        }
        setBlocks(newBlocks);
    };

    const removeLine = (lineId: string) => {
        if (!canvas) return;
        const newLines = cutLines.filter(l => l.id !== lineId);
        setCutLines(newLines);
        updateBlocks(newLines, canvas.total_height);
    };

    const handleBatchSave = async () => {
        if (!canvas || !groupName) return;
        setLoading(true);
        try {
            // Prepare blocks
            // Block y, h, etc.
            const blocksToSave = blocks.map(b => ({
                y: b.y_start,
                h: b.y_end - b.y_start,
                label: b.label,
                type: b.type
            }));

            const res = await canvasApi.saveSlices(canvas.canvas_id, groupName, blocksToSave);
            message.success(`成功保存 ${res.count} 个切片到组 "${groupName}"`);
        } catch (error) {
            message.error('保存失败: ' + error);
        } finally {
            setLoading(false);
        }
    };

    // Zoom Utils
    const containerStyle: React.CSSProperties = {
        position: 'relative',
        width: `${canvas?.total_width ? (canvas.total_width * zoom / 100) : '100%'}px`,
        margin: '0 auto', // Center horizontally
        cursor: 'crosshair',
        transformOrigin: 'top center',
        // Instead of transform scale, we width/height explicitly on images to avoid layout issues
    };

    return (
        <Layout style={{ height: 'calc(100vh - 64px)' }}>
            <Sider width={300} theme="light" style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid #f0f0f0' }}>

                {/* Fixed Top: Controls */}
                <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', background: '#fff', zIndex: 10 }}>
                    <Title level={5} style={{ marginTop: 0 }}>⚙️ 工作台设置</Title>

                    <Space direction="vertical" style={{ width: '100%' }} size="middle">
                        {/* Trim Settings */}
                        <div>
                            <Text type="secondary" style={{ fontSize: 12 }}>页边距切除比例 (0-1)</Text>
                            <Space style={{ width: '100%' }}>
                                <Input
                                    placeholder="顶部"
                                    addonBefore="顶"
                                    type="number"
                                    step="0.01"
                                    value={trimTop}
                                    onChange={e => setTrimTop(parseFloat(e.target.value))}
                                />
                                <Input
                                    placeholder="底部"
                                    addonBefore="底"
                                    type="number"
                                    step="0.01"
                                    value={trimBottom}
                                    onChange={e => setTrimBottom(parseFloat(e.target.value))}
                                />
                            </Space>
                        </div>

                        {/* Group Settings */}
                        <div>
                            <Input
                                addonBefore="分组"
                                placeholder="输入组名 (如:第一讲)"
                                value={groupName}
                                onChange={e => setGroupName(e.target.value)}
                            />
                        </div>

                        {/* Action */}
                        <Button
                            type="primary"
                            icon={<ScissorOutlined />}
                            block
                            onClick={handleStitch}
                            loading={loading}
                        >
                            拼接选中文档
                        </Button>
                    </Space>
                </div>

                {/* Scrollable Bottom: Document List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                    <Title level={5}>📚 文档选择</Title>
                    <Checkbox.Group style={{ width: '100%' }} value={selectedDocIds} onChange={(v) => setSelectedDocIds(v as string[])}>
                        <List
                            dataSource={documents}
                            renderItem={item => (
                                <List.Item>
                                    <Checkbox value={item.doc_id}>{item.filename}</Checkbox>
                                </List.Item>
                            )}
                        />
                    </Checkbox.Group>
                </div>
            </Sider>

            <Content style={{ position: 'relative', overflow: 'hidden', background: '#e6f7ff', display: 'flex', flexDirection: 'column' }}>
                {/* Toolbar */}
                <div style={{ padding: '8px 16px', background: 'white', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', gap: '16px', zIndex: 100 }}>
                    <Text strong>缩放:</Text>
                    <ZoomOutOutlined onClick={() => setZoom(Math.max(10, zoom - 10))} />
                    <Slider min={10} max={200} value={zoom} onChange={setZoom} style={{ width: 200 }} />
                    <ZoomInOutlined onClick={() => setZoom(Math.min(200, zoom + 10))} />
                    <Text>{zoom}%</Text>
                </div>

                {/* Canvas Scroll Area */}
                <div
                    ref={scrollContainerRef}
                    style={{ flex: 1, overflow: 'auto', padding: '24px' }}
                >
                    {canvas ? (
                        <div
                            style={containerStyle}
                            onClick={handleWrapperClick}
                        >
                            {/* Render Chunks Vertically */}
                            {canvas.chunks.map(chunk => (
                                <img
                                    key={chunk.index}
                                    src={chunk.url}
                                    style={{
                                        display: 'block',
                                        width: '100%', // Fill container width (which is scaled)
                                        height: 'auto',
                                        pointerEvents: 'none', // Allow click to pass through to Wrapper
                                        borderBottom: '1px dashed #ccc' // Helper line between chunks
                                    }}
                                />
                            ))}

                            {/* Render Cut Lines */}
                            {cutLines.map(line => (
                                <div
                                    key={line.id}
                                    style={{
                                        position: 'absolute',
                                        top: line.y * (zoom / 100),
                                        left: 0,
                                        width: '100%',
                                        height: '2px',
                                        background: 'red',
                                        pointerEvents: 'none',
                                        zIndex: 10
                                    }}
                                >
                                    <div style={{
                                        position: 'absolute',
                                        right: -24,
                                        top: -12,
                                        pointerEvents: 'auto',
                                        background: '#ff4d4f',
                                        color: 'white',
                                        borderRadius: '50%',
                                        width: '24px',
                                        height: '24px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                    }} onClick={(e) => { e.stopPropagation(); removeLine(line.id); }}>
                                        <DeleteOutlined style={{ fontSize: '14px' }} />
                                    </div>
                                </div>
                            ))}

                            {/* Highlights for Blocks */}
                            {blocks.map(block => (
                                <div
                                    key={`highlight_${block.id}`}
                                    style={{
                                        position: 'absolute',
                                        top: block.y_start * (zoom / 100),
                                        left: 0,
                                        width: '100%',
                                        height: (block.y_end - block.y_start) * (zoom / 100),
                                        background: hoverBlockId === block.id ? '#1890ff33' : 'transparent',
                                        pointerEvents: 'none',
                                        transition: 'background 0.2s',
                                        zIndex: 5
                                    }}
                                />
                            ))}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }}>
                            <Text>请在左侧选择文档并点击拼接</Text>
                        </div>
                    )}
                </div>
            </Content>

            <Sider width={350} theme="light" style={{ padding: '16px', borderLeft: '1px solid #f0f0f0', overflowY: 'auto' }}>
                <Title level={4}>✂️ 切片列表</Title>
                <Space direction="vertical" style={{ width: '100%' }}>
                    {blocks.map((block, index) => (
                        <Card
                            key={block.id}
                            size="small"
                            title={`#${index + 1}`}
                            style={{
                                borderColor: hoverBlockId === block.id ? '#1890ff' : '#f0f0f0',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={() => setHoverBlockId(block.id)}
                            onMouseLeave={() => setHoverBlockId(null)}
                        >
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <Input
                                    addonBefore="名称"
                                    value={block.label}
                                    onChange={e => {
                                        const newBlocks = [...blocks];
                                        newBlocks[index].label = e.target.value;
                                        setBlocks(newBlocks);
                                    }}
                                />
                                <Select
                                    style={{ width: '100%' }}
                                    value={block.type}
                                    onChange={v => {
                                        const newBlocks = [...blocks];
                                        newBlocks[index].type = v;
                                        setBlocks(newBlocks);
                                    }}
                                >
                                    <Option value="knowledge">📘 知识点</Option>
                                    <Option value="example">📝 例题</Option>
                                    <Option value="answer">✅ 答案</Option>
                                </Select>
                            </Space>
                        </Card>
                    ))}
                    {blocks.length > 0 && (
                        <Button
                            type="primary"
                            icon={<ThunderboltOutlined />}
                            block
                            danger
                            onClick={handleBatchSave}
                            loading={loading}
                            disabled={!groupName}
                        >
                            开始切片 (保存到组)
                        </Button>
                    )}
                </Space>
            </Sider>
        </Layout>
    );
};

export default WorkbenchPage;
