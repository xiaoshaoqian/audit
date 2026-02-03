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

    // Refs
    // 我们需要一个容器Ref来计算点击位置
    const containerRef = useRef<HTMLDivElement>(null);

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
            <Sider width={300} theme="light" style={{ padding: '16px', borderRight: '1px solid #f0f0f0', overflowY: 'auto' }}>
                <Title level={4}>📚 文档库</Title>
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
                <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>页边距切除比例 (0-1)</Text>
                    <Input
                        addonBefore="顶部(Header)"
                        type="number"
                        step="0.01"
                        value={trimTop}
                        onChange={e => setTrimTop(parseFloat(e.target.value))}
                    />
                    <Input
                        addonBefore="底部(Footer)"
                        type="number"
                        step="0.01"
                        value={trimBottom}
                        onChange={e => setTrimBottom(parseFloat(e.target.value))}
                    />
                </Space>

                <Button
                    type="primary"
                    icon={<ScissorOutlined />}
                    block
                    style={{ marginTop: 16 }}
                    onClick={handleStitch}
                    loading={loading}
                >
                    拼接文档
                </Button>
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
                <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
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
                                        top: -10,
                                        pointerEvents: 'auto',
                                        background: 'red',
                                        color: 'white',
                                        borderRadius: '4px',
                                        padding: '2px 6px',
                                        cursor: 'pointer',
                                        fontSize: '12px'
                                    }} onClick={(e) => { e.stopPropagation(); removeLine(line.id); }}>
                                        <DeleteOutlined />
                                    </div>
                                </div>
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
                        <Card key={block.id} size="small" title={`#${index + 1}`}>
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
                        <Button type="primary" icon={<ThunderboltOutlined />} block>
                            开始审核 ({blocks.length} 块)
                        </Button>
                    )}
                </Space>
            </Sider>
        </Layout>
    );
};

export default WorkbenchPage;
