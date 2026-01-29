/**
 * API服务
 */
import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    timeout: 300000, // 5分钟超时（审稿可能较慢）
});

// 类型定义
export interface DocumentInfo {
    doc_id: string;
    filename: string;
    page_count: number;
    pdf_path: string;
    image_paths: string[];
    thumbnails: string[];
}

export interface PageRange {
    page: number;
    from: number;
    to: number;
}

export interface Segment {
    id: number;
    name: string;
    pages: PageRange[];
}

export interface Issue {
    id: number;
    segment_id: number;
    location: string;
    confidence: string;
    level: 'CERTAIN_ERROR' | 'UNCERTAIN';
    type: string;
    description: string;
    suggestion: string;
    reasoning: string;
    status: 'pending' | 'confirmed' | 'rejected';
    note?: string;
    coordinates?: {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    };
}

export interface AuditResults {
    segments: Array<{
        segment_id: number;
        segment_name: string;
        summary?: string;
        error?: string;
        certain_count?: number;
        uncertain_count?: number;
    }>;
    issues: Issue[];
}

// 上传API
export const uploadApi = {
    async upload(file: File): Promise<DocumentInfo> {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post<DocumentInfo>('/upload/', formData);
        return response.data;
    },

    async getInfo(docId: string): Promise<DocumentInfo> {
        const response = await api.get<DocumentInfo>(`/upload/${docId}/info`);
        return response.data;
    },
};

// 分割API
export const splitApi = {
    async getSegments(docId: string): Promise<Segment[]> {
        const response = await api.get<Segment[]>(`/split/${docId}/segments`);
        return response.data;
    },

    async createSegment(docId: string, name: string, pages: PageRange[]): Promise<Segment> {
        const response = await api.post<Segment>(`/split/${docId}/segments`, { name, pages });
        return response.data;
    },

    async deleteSegment(docId: string, segmentId: number): Promise<void> {
        await api.delete(`/split/${docId}/segments/${segmentId}`);
    },

    getPageUrl(docId: string, pageNum: number): string {
        return `/api/split/${docId}/page/${pageNum}`;
    },

    getThumbnailUrl(docId: string, pageNum: number): string {
        return `/api/split/${docId}/thumbnail/${pageNum}`;
    },

    getSegmentImageUrl(docId: string, segmentId: number): string {
        return `/api/split/${docId}/segments/${segmentId}/image`;
    },
};

// 审稿API
export const auditApi = {
    async start(docId: string, segmentIds?: number[]): Promise<{
        message: string;
        total_segments: number;
        total_issues: number;
        certain_count: number;
        uncertain_count: number;
    }> {
        const response = await api.post(`/audit/${docId}/start`, { segment_ids: segmentIds });
        return response.data;
    },

    async getResults(docId: string): Promise<AuditResults> {
        const response = await api.get<AuditResults>(`/audit/${docId}/results`);
        return response.data;
    },

    async getIssues(docId: string, level?: string, status?: string): Promise<Issue[]> {
        const params = new URLSearchParams();
        if (level) params.append('level', level);
        if (status) params.append('status', status);
        const response = await api.get<Issue[]>(`/audit/${docId}/issues?${params}`);
        return response.data;
    },

    async updateIssue(docId: string, issueId: number, status: string, note?: string): Promise<void> {
        await api.put(`/audit/${docId}/issues/${issueId}`, { status, note });
    },
};

export default api;
