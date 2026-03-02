import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Layout,
    Card,
    List,
    Checkbox,
    Button,
    Upload,
    message,
    Input,
    Tooltip,
    Select,
    Space,
    Typography,
    Slider,
    Popconfirm
} from 'antd';
import {
    ScissorOutlined,
    ThunderboltOutlined,
    DeleteOutlined,
    ZoomInOutlined,
    ZoomOutOutlined,
    UploadOutlined,
    SortAscendingOutlined,
    SortDescendingOutlined
} from '@ant-design/icons';
import { uploadApi, canvasApi, DocumentInfo, CanvasHistoryItem, CanvasStitchResult } from '../services/api';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

interface Point {
    x: number;
    y: number;
}

interface CutLine {
    id: string;
    // User-clicked intermediate points. getFullPolyline() auto-extends to left/right canvas edges.
    points: Point[];
}

interface Block {
    id: string;
    y_start: number;  // min-y of polygon (for scroll-to)
    y_end: number;    // max-y of polygon (for scroll-to)
    type: 'knowledge' | 'example' | 'answer';
    label: string;
    polygon: Point[];  // closed polygon: top line L→R + bottom line R→L
}

/** Extends user clicked points to a full left-to-right polyline with edge anchors. */
const getFullPolyline = (points: Point[], totalWidth: number): Point[] => {
    if (points.length === 0) return [];
    return [
        { x: 0, y: points[0].y },
        ...points,
        { x: totalWidth, y: points[points.length - 1].y },
    ];
};

const WorkbenchPage: React.FC = () => {
    const [documents, setDocuments] = useState<DocumentInfo[]>([]);
    const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [loading, setLoading] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);

    const [canvas, setCanvas] = useState<CanvasStitchResult | null>(null);
    const [canvasHistory, setCanvasHistory] = useState<CanvasHistoryItem[]>([]);
    const [cutLines, setCutLines] = useState<CutLine[]>([]);
    const [blocks, setBlocks] = useState<Block[]>([]);
    const [zoom, setZoom] = useState(100);

    const [trimTop, setTrimTop] = useState(0.086);
    const [trimBottom, setTrimBottom] = useState(0.086);
    const [groupName, setGroupName] = useState('');
    const [hoverBlockId, setHoverBlockId] = useState<string | null>(null);
    const [leftPanelView, setLeftPanelView] = useState<'documents' | 'history'>('documents');
    const [stitchOrder, setStitchOrder] = useState<'asc' | 'desc'>('asc');

    // Polyline drawing state
    const [drawingPoints, setDrawingPoints] = useState<Point[] | null>(null);
    const [mousePos, setMousePos] = useState<Point | null>(null);

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const uploadingCount = useRef(0);
    const draftSaveTimer = useRef<number | null>(null);

    // Refs so the document keydown handler always sees latest values
    const drawingPointsRef = useRef<Point[] | null>(null);
    drawingPointsRef.current = drawingPoints;
    const canvasRef = useRef<CanvasStitchResult | null>(null);
    canvasRef.current = canvas;
    const cutLinesRef = useRef<CutLine[]>([]);
    cutLinesRef.current = cutLines;

    // Global keyboard handler: Escape = cancel drawing, Enter = finish line
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setDrawingPoints(null);
                setMousePos(null);
            } else if (e.key === 'Enter') {
                const pts = drawingPointsRef.current;
                const cvs = canvasRef.current;
                if (pts && pts.length > 0 && cvs) {
                    doCommitLine(pts, cutLinesRef.current, cvs.total_height, cvs.total_width);
                }
            }
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, []); // empty deps — uses refs to avoid stale closure issues

    useEffect(() => {
        void Promise.all([loadDocuments(), loadCanvasHistory()]);
    }, []);

    useEffect(() => {
        if (!hoverBlockId || !canvas || !scrollContainerRef.current) return;
        const block = blocks.find((b) => b.id === hoverBlockId);
        if (!block) return;
        const scale = zoom / 100;
        scrollContainerRef.current.scrollTo({ top: Math.max(0, block.y_start * scale - 50), behavior: 'smooth' });
    }, [hoverBlockId, canvas, zoom, blocks]);

    // Auto-save draft on cut-line / block changes only.
    // group_name is NOT included — it is saved only on explicit "开始切片" to avoid
    // overwriting a finished canvas's group when the user edits the input for the next one.
    useEffect(() => {
        if (!canvas?.canvas_id) return;
        const canvasId = canvas.canvas_id;
        const savedGroupName = canvas.group_name ?? '';
        if (draftSaveTimer.current) window.clearTimeout(draftSaveTimer.current);
        draftSaveTimer.current = window.setTimeout(() => {
            void canvasApi.saveDraft(canvasId, {
                group_name: savedGroupName,
                cut_lines: cutLines.map((l) => ({ id: l.id, points: l.points })),
                blocks: blocks.map((b) => ({
                    id: b.id,
                    y_start: b.y_start,
                    y_end: b.y_end,
                    type: b.type,
                    label: b.label,
                    polygon: b.polygon,
                })),
            }).catch(() => {});
        }, 500);
        return () => { if (draftSaveTimer.current) window.clearTimeout(draftSaveTimer.current); };
    }, [canvas?.canvas_id, canvas?.group_name, cutLines, blocks]);

    const normalizeBlockType = (value: string): 'knowledge' | 'example' | 'answer' => {
        if (value === 'knowledge' || value === 'answer') return value;
        return 'example';
    };

    const sortDocs = (docs: DocumentInfo[]) => {
        docs.sort((a, b) => {
            const getNum = (name: string) => {
                const match = name.match(/^(\d+)/);
                return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
            };
            const numA = getNum(a.filename);
            const numB = getNum(b.filename);
            if (numA !== numB) return numA - numB;
            return a.filename.localeCompare(b.filename, 'zh-CN');
        });
    };

    const loadDocuments = async () => {
        try {
            const docs = await uploadApi.getDocuments();
            sortDocs(docs);
            setDocuments(docs);
        } catch {
            message.error('加载文档列表失败');
        }
    };

    const loadCanvasHistory = async () => {
        setHistoryLoading(true);
        try {
            setCanvasHistory(await canvasApi.list());
        } catch {
            message.error('加载拼接历史失败');
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleUpload = async (file: File) => {
        uploadingCount.current += 1;
        setUploading(true);
        try {
            const uploaded = await uploadApi.upload(file);
            message.success(`上传成功: ${uploaded.filename}`);
            setSelectedDocIds((prev) => (prev.includes(uploaded.doc_id) ? prev : [...prev, uploaded.doc_id]));
        } catch {
            message.error(`上传失败: ${file.name}`);
        } finally {
            uploadingCount.current -= 1;
            if (uploadingCount.current === 0) {
                setUploading(false);
                await loadDocuments();
            }
        }
    };

    const handleDeleteDocument = async (docId: string) => {
        setDeleting(true);
        try {
            await uploadApi.deleteDocument(docId);
            setSelectedDocIds((prev) => prev.filter((id) => id !== docId));
            await loadDocuments();
            message.success('删除成功');
        } catch {
            message.error('删除失败');
        } finally {
            setDeleting(false);
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedDocIds.length === 0) { message.warning('请先选择文档'); return; }
        setDeleting(true);
        try {
            const ids = [...selectedDocIds];
            await Promise.all(ids.map((id) => uploadApi.deleteDocument(id)));
            setSelectedDocIds([]);
            await loadDocuments();
            message.success(`已删除 ${ids.length} 个文档`);
        } catch {
            message.error('批量删除失败');
        } finally {
            setDeleting(false);
        }
    };

    const handleStitch = async () => {
        if (selectedDocIds.length === 0) { message.warning('请先选择文档'); return; }
        setLoading(true);
        try {
            const orderedIds = stitchOrder === 'desc' ? [...selectedDocIds].reverse() : selectedDocIds;
            const result = await canvasApi.stitch(orderedIds, trimTop, trimBottom, groupName.trim());
            setCanvas(result);
            setCutLines([]);
            setBlocks([]);
            setDrawingPoints(null);
            setMousePos(null);
            setZoom(100);
            await loadCanvasHistory();
            message.success('拼接完成');
        } catch (error) {
            message.error(`拼接失败: ${error}`);
        } finally {
            setLoading(false);
        }
    };

    // ─── Block derivation ────────────────────────────────────────────────────

    const buildBlocks = (lines: CutLine[], totalHeight: number, totalWidth: number): Block[] => {
        const implicitTop: Point[] = [{ x: 0, y: 0 }, { x: totalWidth, y: 0 }];
        const implicitBottom: Point[] = [{ x: 0, y: totalHeight }, { x: totalWidth, y: totalHeight }];
        const allFull: Point[][] = [
            implicitTop,
            ...lines.map((l) => getFullPolyline(l.points, totalWidth)),
            implicitBottom,
        ];

        const result: Block[] = [];
        for (let i = 0; i < allFull.length - 1; i++) {
            const top = allFull[i];
            const bottom = allFull[i + 1];
            const allYs = [...top.map((p) => p.y), ...bottom.map((p) => p.y)];
            const yStart = Math.min(...allYs);
            const yEnd = Math.max(...allYs);
            if (yEnd - yStart < 10) continue;
            result.push({
                id: `block_${i}`,
                y_start: yStart,
                y_end: yEnd,
                type: 'example',
                label: `Block ${i + 1}`,
                // top L→R then bottom R→L forms a closed polygon
                polygon: [...top, ...[...bottom].reverse()],
            });
        }
        return result;
    };

    const updateBlocks = (lines: CutLine[], totalHeight: number, totalWidth: number) => {
        setBlocks(buildBlocks(lines, totalHeight, totalWidth));
    };

    // ─── Cut-line drawing ────────────────────────────────────────────────────

    /** Finalize the current drawing points into a committed CutLine. */
    const doCommitLine = (pts: Point[], existingLines: CutLine[], totalHeight: number, totalWidth: number) => {
        const newLine: CutLine = { id: Date.now().toString(), points: pts };
        const nextLines = [...existingLines, newLine].sort((a, b) => a.points[0].y - b.points[0].y);
        setCutLines(nextLines);
        updateBlocks(nextLines, totalHeight, totalWidth);
        setDrawingPoints(null);
        setMousePos(null);
    };

    const getCanvasCoords = (e: React.MouseEvent<HTMLDivElement>): Point => {
        const rect = e.currentTarget.getBoundingClientRect();
        const scale = zoom / 100;
        return {
            x: Math.round((e.clientX - rect.left) / scale),
            y: Math.round((e.clientY - rect.top) / scale),
        };
    };

    const handleWrapperClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!canvas) return;
        const { x, y } = getCanvasCoords(e);

        if (e.detail >= 2) {
            // Double-click: finish current polyline
            if (drawingPoints && drawingPoints.length >= 1) {
                doCommitLine(drawingPoints, cutLines, canvas.total_height, canvas.total_width);
            }
            return;
        }

        setDrawingPoints((prev) => (prev === null ? [{ x, y }] : [...prev, { x, y }]));
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!drawingPoints) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const scale = zoom / 100;
        setMousePos({
            x: Math.round((e.clientX - rect.left) / scale),
            y: Math.round((e.clientY - rect.top) / scale),
        });
    };

    const removeLine = (lineId: string) => {
        if (!canvas) return;
        const nextLines = cutLines.filter((l) => l.id !== lineId);
        setCutLines(nextLines);
        updateBlocks(nextLines, canvas.total_height, canvas.total_width);
    };

    // ─── Save / load ─────────────────────────────────────────────────────────

    const handleBatchSave = async () => {
        const normalizedGroupName = groupName.trim();
        if (!canvas || !normalizedGroupName) return;
        setLoading(true);
        try {
            await canvasApi.saveDraft(canvas.canvas_id, {
                group_name: normalizedGroupName,
                cut_lines: cutLines.map((l) => ({ id: l.id, points: l.points })),
                blocks: blocks.map((b) => ({
                    id: b.id, y_start: b.y_start, y_end: b.y_end,
                    type: b.type, label: b.label, polygon: b.polygon,
                })),
            });

            const payload = blocks.map((b) => ({ polygon: b.polygon, label: b.label, type: b.type }));
            const res = await canvasApi.saveSlices(canvas.canvas_id, normalizedGroupName, payload);

            // Clear canvas state so auto-save won't overwrite group_name
            // when the user changes the input for the next canvas
            setCanvas(null);
            setCutLines([]);
            setBlocks([]);
            setDrawingPoints(null);
            setMousePos(null);

            setGroupName(normalizedGroupName);
            await loadCanvasHistory();
            const collisionCount = Number(res?.collision_count ?? 0);
            if (collisionCount > 0) {
                message.warning(`已保存 ${res.count} 个切片；发现 ${collisionCount} 个同名，系统已自动重命名`);
            } else {
                message.success(`成功保存 ${res.count} 个切片到组: ${normalizedGroupName}`);
            }
        } catch (error) {
            message.error(`保存失败: ${error}`);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenCanvas = async (canvasId: string) => {
        setLoading(true);
        try {
            const data = await canvasApi.get(canvasId);

            // Support both new format { id, points } and old format { id, y }
            const restoredLines: CutLine[] = (data.cut_lines ?? [])
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((line: any, index: number) => {
                    if (line.points && Array.isArray(line.points)) {
                        const pts: Point[] = line.points.filter(
                            (p: any) => Number.isFinite(p.x) && Number.isFinite(p.y)
                        );
                        if (pts.length === 0) return null;
                        return { id: String(line.id ?? `line_${index}`), points: pts };
                    }
                    // Old format fallback
                    const y = Number(line.y);
                    if (!Number.isFinite(y)) return null;
                    return {
                        id: String(line.id ?? `line_${index}_${Date.now()}`),
                        points: [{ x: Math.round((data.total_width ?? 0) / 2), y }],
                    };
                })
                .filter(Boolean)
                .sort((a: any, b: any) => a.points[0].y - b.points[0].y) as CutLine[];

            setCanvas(data);
            setGroupName(data.group_name ?? '');
            setCutLines(restoredLines);
            setDrawingPoints(null);
            setMousePos(null);

            if (restoredLines.length > 0) {
                updateBlocks(restoredLines, data.total_height, data.total_width);
            } else {
                setBlocks([]);
            }
            setZoom(100);
            message.success('已恢复拼接结果');
        } catch {
            message.error('恢复拼接结果失败');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteCanvas = async (canvasId: string) => {
        setHistoryLoading(true);
        try {
            await canvasApi.deleteCanvas(canvasId);
            if (canvas?.canvas_id === canvasId) {
                setCanvas(null);
                setCutLines([]);
                setBlocks([]);
                setGroupName('');
                setDrawingPoints(null);
                setMousePos(null);
            }
            await loadCanvasHistory();
            message.success('拼接记录已删除');
        } catch {
            message.error('删除拼接记录失败');
        } finally {
            setHistoryLoading(false);
        }
    };

    // ─── Utilities ───────────────────────────────────────────────────────────

    const formatTime = (value?: string) => {
        if (!value) return '--';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return value;
        return d.toLocaleString('zh-CN', { hour12: false });
    };

    const parseTime = (value?: string) => {
        if (!value) return 0;
        const t = new Date(value).getTime();
        return Number.isNaN(t) ? 0 : t;
    };

    const groupedCanvasHistory = useMemo(() => {
        const groups = new Map<string, CanvasHistoryItem[]>();
        canvasHistory.forEach((item) => {
            const key = (item.group_name ?? '').trim() || '未分组';
            groups.set(key, [...(groups.get(key) ?? []), item]);
        });
        return Array.from(groups.entries())
            .map(([name, items]) => ({
                name,
                items: [...items].sort((a, b) => parseTime(b.updated_at) - parseTime(a.updated_at)),
            }))
            .sort((a, b) => {
                const aT = a.items.length > 0 ? parseTime(a.items[0].updated_at) : 0;
                const bT = b.items.length > 0 ? parseTime(b.items[0].updated_at) : 0;
                return bT - aT;
            });
    }, [canvasHistory]);

    // Preview polyline while drawing (includes left/right edge extensions)
    const getPreviewPolyline = (): Point[] => {
        if (!drawingPoints || drawingPoints.length === 0 || !canvas) return [];
        const cursor = mousePos ?? drawingPoints[drawingPoints.length - 1];
        return [
            { x: 0, y: drawingPoints[0].y },
            ...drawingPoints,
            ...(mousePos ? [mousePos] : []),
            { x: canvas.total_width, y: cursor.y },
        ];
    };

    // ─── Render helpers ──────────────────────────────────────────────────────

    const scale = zoom / 100;

    const renderDocumentList = (
        <Checkbox.Group style={{ width: '100%' }} value={selectedDocIds} onChange={(v) => setSelectedDocIds(v as string[])}>
            <List
                dataSource={documents}
                renderItem={(item) => (
                    <List.Item style={{ paddingInline: 0 }}>
                        <div style={{ display: 'flex', width: '100%', minWidth: 0, alignItems: 'center', gap: 8 }}>
                            <Checkbox value={item.doc_id} style={{ flex: 1, minWidth: 0 }}>
                                <Text ellipsis style={{ display: 'block' }}>{item.filename}</Text>
                            </Checkbox>
                            <Popconfirm title="确认删除该文档？" onConfirm={() => { void handleDeleteDocument(item.doc_id); }}>
                                <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                        </div>
                    </List.Item>
                )}
            />
        </Checkbox.Group>
    );

    const renderHistoryList = historyLoading ? (
        <Text type="secondary">加载中...</Text>
    ) : groupedCanvasHistory.length === 0 ? (
        <Text type="secondary">暂无拼接历史</Text>
    ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {groupedCanvasHistory.map((group) => (
                <div key={group.name}>
                    <Text strong style={{ fontSize: 12 }}>{group.name}</Text>
                    <List
                        size="small"
                        dataSource={group.items}
                        renderItem={(item) => (
                            <List.Item style={{ paddingInline: 0 }}>
                                <div style={{ display: 'flex', width: '100%', minWidth: 0, alignItems: 'flex-start', gap: 8 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                                        <Text style={{ fontSize: 12 }} ellipsis>{item.canvas_id}</Text>
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            {item.status === 'completed' ? '已切片' : '仅拼接'} · {formatTime(item.updated_at)}
                                        </Text>
                                    </div>
                                    <Space size={4}>
                                        <Button size="small" type="link" style={{ paddingInline: 0 }} onClick={() => { void handleOpenCanvas(item.canvas_id); }}>
                                            继续
                                        </Button>
                                        <Popconfirm title="确认删除该拼接记录？" onConfirm={() => { void handleDeleteCanvas(item.canvas_id); }}>
                                            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                                        </Popconfirm>
                                    </Space>
                                </div>
                            </List.Item>
                        )}
                    />
                </div>
            ))}
        </Space>
    );

    // ─── JSX ─────────────────────────────────────────────────────────────────

    return (
        <Layout style={{ height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
            {/* ── Left panel ── */}
            <Sider
                width={300}
                theme="light"
                style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #f0f0f0', overflow: 'hidden' }}
            >
                <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0', background: '#fff', flexShrink: 0 }}>
                        <Title level={5} style={{ marginTop: 0 }}>工作台设置</Title>
                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                            <div>
                                <Text type="secondary" style={{ fontSize: 12 }}>页边距切除比例 (0-1)</Text>
                                <Space style={{ width: '100%' }}>
                                    <Input addonBefore="顶" type="number" step="0.01" value={trimTop}
                                        onChange={(e) => { const v = Number(e.target.value); setTrimTop(Number.isFinite(v) ? v : 0); }} />
                                    <Input addonBefore="底" type="number" step="0.01" value={trimBottom}
                                        onChange={(e) => { const v = Number(e.target.value); setTrimBottom(Number.isFinite(v) ? v : 0); }} />
                                </Space>
                            </div>
                            <Input addonBefore="分组" placeholder="输入组名(如第一讲)" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
                            <div style={{ display: 'flex', gap: 8 }}>
                                <Upload accept=".docx" multiple showUploadList={false} beforeUpload={(file) => { void handleUpload(file as File); return false; }}>
                                    <Button icon={<UploadOutlined />} loading={uploading}>上传文档</Button>
                                </Upload>
                                <Popconfirm title="确认删除选中的文档？" onConfirm={() => { void handleDeleteSelected(); }} disabled={selectedDocIds.length === 0}>
                                    <Button danger icon={<DeleteOutlined />} loading={deleting} disabled={selectedDocIds.length === 0}>删除选中</Button>
                                </Popconfirm>
                            </div>
                            <Button type="primary" icon={<ScissorOutlined />} block onClick={handleStitch} loading={loading}>
                                拼接选中文档
                            </Button>
                            <Button
                                block
                                icon={stitchOrder === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />}
                                onClick={() => setStitchOrder((prev) => prev === 'asc' ? 'desc' : 'asc')}
                            >
                                拼接顺序: {stitchOrder === 'asc' ? '顺序' : '倒序'}
                            </Button>
                        </Space>
                    </div>

                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <Title level={5} style={{ margin: 0 }}>
                                {leftPanelView === 'documents' ? '文档选择' : '拼接历史'}
                            </Title>
                            <Space size={4}>
                                <Button size="small" type={leftPanelView === 'documents' ? 'primary' : 'default'} onClick={() => setLeftPanelView('documents')}>文档</Button>
                                <Button size="small" type={leftPanelView === 'history' ? 'primary' : 'default'} onClick={() => setLeftPanelView('history')}>拼接历史</Button>
                            </Space>
                        </div>
                        <div style={{ minWidth: 0 }}>
                            {leftPanelView === 'documents' ? renderDocumentList : renderHistoryList}
                        </div>
                    </div>
                </div>
            </Sider>

            {/* ── Main canvas area ── */}
            <Content style={{ position: 'relative', overflow: 'hidden', background: '#e6f7ff', display: 'flex', flexDirection: 'column' }}>
                {/* Toolbar */}
                <div style={{ padding: '8px 16px', background: 'white', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', gap: 16, zIndex: 100, flexShrink: 0, flexWrap: 'wrap' }}>
                    <Text strong>缩放:</Text>
                    <ZoomOutOutlined style={{ cursor: 'pointer' }} onClick={() => setZoom(Math.max(10, zoom - 10))} />
                    <Slider min={10} max={200} value={zoom} onChange={setZoom} style={{ width: 200 }} />
                    <ZoomInOutlined style={{ cursor: 'pointer' }} onClick={() => setZoom(Math.min(200, zoom + 10))} />
                    <Text>{zoom}%</Text>

                    {drawingPoints && (
                        <Space>
                            <Text type="warning" style={{ fontWeight: 500 }}>
                                折线绘制中（{drawingPoints.length} 个顶点）— 单击添加顶点 · 右键 / 双击 / Enter 完成 · Esc 取消
                            </Text>
                            <Button size="small" onClick={() => { setDrawingPoints(null); setMousePos(null); }}>取消</Button>
                        </Space>
                    )}
                </div>

                {/* Scrollable canvas */}
                <div ref={scrollContainerRef} style={{ flex: 1, overflow: 'auto', padding: 24 }}>
                    {canvas ? (
                        <div
                            style={{
                                position: 'relative',
                                width: `${canvas.total_width * scale}px`,
                                margin: '0 auto',
                                cursor: 'crosshair',
                            }}
                            onClick={handleWrapperClick}
                            onMouseMove={handleMouseMove}
                            onMouseLeave={() => setMousePos(null)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                if (drawingPoints && drawingPoints.length >= 1 && canvas) {
                                    doCommitLine(drawingPoints, cutLines, canvas.total_height, canvas.total_width);
                                }
                            }}
                        >
                            {/* Canvas chunk images */}
                            {canvas.chunks.map((chunk) => (
                                <img
                                    key={chunk.index}
                                    src={chunk.url}
                                    style={{ display: 'block', width: '100%', height: 'auto', pointerEvents: 'none', borderBottom: '1px dashed #ccc' }}
                                />
                            ))}

                            {/* SVG overlay: block highlights + committed polylines + drawing preview */}
                            <svg
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: `${canvas.total_width * scale}px`,
                                    height: `${canvas.total_height * scale}px`,
                                    pointerEvents: 'none',
                                    zIndex: 10,
                                    overflow: 'visible',
                                }}
                            >
                                {/* Block highlight polygons */}
                                {blocks.map((block) => (
                                    <polygon
                                        key={`poly_${block.id}`}
                                        points={block.polygon.map((p) => `${p.x * scale},${p.y * scale}`).join(' ')}
                                        fill={hoverBlockId === block.id ? 'rgba(24,144,255,0.15)' : 'transparent'}
                                        style={{ transition: 'fill 0.2s' }}
                                    />
                                ))}

                                {/* Committed cut polylines */}
                                {cutLines.map((line) => {
                                    const full = getFullPolyline(line.points, canvas.total_width);
                                    return (
                                        <polyline
                                            key={line.id}
                                            points={full.map((p) => `${p.x * scale},${p.y * scale}`).join(' ')}
                                            stroke="red"
                                            strokeWidth={2}
                                            fill="none"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    );
                                })}

                                {/* Vertex dots on committed lines */}
                                {cutLines.flatMap((line) =>
                                    line.points.map((p, i) => (
                                        <circle key={`dot_${line.id}_${i}`} cx={p.x * scale} cy={p.y * scale} r={4} fill="red" stroke="white" strokeWidth={1.5} />
                                    ))
                                )}

                                {/* Drawing preview — dashed polyline */}
                                {getPreviewPolyline().length > 1 && (
                                    <polyline
                                        points={getPreviewPolyline().map((p) => `${p.x * scale},${p.y * scale}`).join(' ')}
                                        stroke="red"
                                        strokeWidth={2}
                                        strokeDasharray="12,6"
                                        fill="none"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                )}

                                {/* Vertex dots while drawing */}
                                {drawingPoints && drawingPoints.map((p, i) => (
                                    <circle key={`dp_${i}`} cx={p.x * scale} cy={p.y * scale} r={5} fill="red" stroke="white" strokeWidth={2} />
                                ))}
                            </svg>

                            {/* Delete buttons — HTML divs anchored to each line's last point */}
                            {cutLines.map((line) => {
                                const lastPt = line.points[line.points.length - 1];
                                return (
                                    <div
                                        key={`del_${line.id}`}
                                        style={{
                                            position: 'absolute',
                                            right: -28,
                                            top: lastPt.y * scale - 12,
                                            pointerEvents: 'auto',
                                            background: '#ff4d4f',
                                            color: 'white',
                                            borderRadius: '50%',
                                            width: 24,
                                            height: 24,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                            zIndex: 30,
                                        }}
                                        onClick={(e) => { e.stopPropagation(); removeLine(line.id); }}
                                    >
                                        <DeleteOutlined style={{ fontSize: 14 }} />
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }}>
                            <Text>请在左侧选择文档并点击拼接</Text>
                        </div>
                    )}
                </div>
            </Content>

            {/* ── Right panel: block list ── */}
            <Sider width={350} theme="light" style={{ padding: 16, borderLeft: '1px solid #f0f0f0', overflowY: 'auto' }}>
                <Title level={4}>切片列表</Title>
                <Space direction="vertical" style={{ width: '100%' }}>
                    {blocks.map((block, index) => (
                        <Card
                            key={block.id}
                            size="small"
                            title={`#${index + 1}`}
                            style={{ borderColor: hoverBlockId === block.id ? '#1890ff' : '#f0f0f0', transition: 'all 0.2s' }}
                            onMouseEnter={() => setHoverBlockId(block.id)}
                            onMouseLeave={() => setHoverBlockId(null)}
                        >
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <Input
                                    addonBefore="名称"
                                    value={block.label}
                                    onChange={(e) => {
                                        const next = [...blocks];
                                        next[index] = { ...next[index], label: e.target.value };
                                        setBlocks(next);
                                    }}
                                />
                                <Select
                                    style={{ width: '100%' }}
                                    value={block.type}
                                    onChange={(v) => {
                                        const next = [...blocks];
                                        next[index] = { ...next[index], type: v };
                                        setBlocks(next);
                                    }}
                                >
                                    <Option value="knowledge">知识点</Option>
                                    <Option value="example">例题</Option>
                                    <Option value="answer">答案</Option>
                                </Select>
                            </Space>
                        </Card>
                    ))}
                    {blocks.length > 0 && (
                        <Tooltip title={!groupName.trim() ? '请先在左侧填写组名' : ''}>
                            <Button
                                type="primary"
                                icon={<ThunderboltOutlined />}
                                block
                                danger
                                onClick={handleBatchSave}
                                loading={loading}
                                disabled={!groupName.trim()}
                            >
                                开始切片(保存到组)
                            </Button>
                        </Tooltip>
                    )}
                </Space>
            </Sider>
        </Layout>
    );
};

export default WorkbenchPage;
