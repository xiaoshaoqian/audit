import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Upload, Button, message, Typography, Steps } from 'antd'
import { UploadOutlined, FileWordOutlined, ScissorOutlined, CheckCircleOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd/es/upload/interface'
import { uploadApi } from '../services/api'

const { Title, Paragraph } = Typography
const { Dragger } = Upload

function UploadPage() {
    const navigate = useNavigate()
    const [uploading, setUploading] = useState(false)
    const [fileList, setFileList] = useState<UploadFile[]>([])

    const handleUpload = async () => {
        if (fileList.length === 0) {
            message.warning('请先选择文件')
            return
        }

        const file = fileList[0].originFileObj
        if (!file) return

        setUploading(true)
        try {
            const result = await uploadApi.upload(file)
            message.success(`文档上传成功！共 ${result.page_count} 页，正在转换...`)
            navigate(`/split/${result.doc_id}`)
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : '未知错误'
            message.error(`上传失败: ${errorMessage}`)
        } finally {
            setUploading(false)
        }
    }

    return (
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <Card style={{ marginBottom: 24 }}>
                <Title level={3}>📄 上传教辅文档</Title>
                <Paragraph type="secondary">
                    上传DOCX格式的物理教辅文档，系统将自动转换为图片进行审稿。
                </Paragraph>

                <Steps
                    current={0}
                    items={[
                        { title: '上传文档', icon: <FileWordOutlined /> },
                        { title: '标记分割', icon: <ScissorOutlined /> },
                        { title: 'AI审稿', icon: <CheckCircleOutlined /> },
                    ]}
                    style={{ marginBottom: 32 }}
                />

                <Dragger
                    accept=".docx"
                    maxCount={1}
                    fileList={fileList}
                    beforeUpload={() => false}
                    onChange={({ fileList }) => setFileList(fileList)}
                    style={{ marginBottom: 24 }}
                >
                    <p className="ant-upload-drag-icon">
                        <UploadOutlined style={{ fontSize: 48, color: '#1890ff' }} />
                    </p>
                    <p className="ant-upload-text">点击或拖拽DOCX文件到此区域</p>
                    <p className="ant-upload-hint">仅支持 .docx 格式的Word文档</p>
                </Dragger>

                <Button
                    type="primary"
                    size="large"
                    icon={<UploadOutlined />}
                    loading={uploading}
                    onClick={handleUpload}
                    disabled={fileList.length === 0}
                    block
                >
                    {uploading ? '正在上传并转换...' : '开始上传'}
                </Button>
            </Card>

            <Card>
                <Title level={4}>💡 使用说明</Title>
                <Paragraph>
                    <ol>
                        <li><strong>上传文档</strong>：选择要审稿的DOCX文件上传</li>
                        <li><strong>标记分割</strong>：在预览页面标记内容分割点（支持页内分割）</li>
                        <li><strong>AI审稿</strong>：系统自动使用AI检查物理知识准确性</li>
                        <li><strong>人工复核</strong>：确认或驳回AI发现的问题</li>
                    </ol>
                </Paragraph>
                <Paragraph type="secondary">
                    建议：每个分割区块包含3-5页内容效果最佳
                </Paragraph>
            </Card>
        </div>
    )
}

export default UploadPage
