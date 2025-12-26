import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getJobStatus } from '../services/documentService'
import Card from '../components/common/Card'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ProgressBar from '../components/common/ProgressBar'
import Badge from '../components/common/Badge'
import Button from '../components/common/Button'
import { FiRefreshCw, FiArrowRight } from 'react-icons/fi'
import { formatDate } from '../utils/helpers'
import toast from 'react-hot-toast'

function ProcessingPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [polling, setPolling] = useState(true)

  useEffect(() => {
    fetchStatus()

    // Poll every 3 seconds if processing
    const interval = setInterval(() => {
      if (polling) {
        fetchStatus()
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [jobId, polling])

  const fetchStatus = async () => {
    try {
      const data = await getJobStatus(jobId)
      setStatus(data)

      // Stop polling if completed or failed
      if (data.status === 'completed' || data.status === 'failed') {
        setPolling(false)
        
        if (data.status === 'completed') {
          toast.success('Processing completed!')
        } else {
          toast.error('Processing failed')
        }
      }
    } catch (error) {
      console.error('Status check error:', error)
      toast.error('Failed to get status')
      setPolling(false)
    } finally {
      setLoading(false)
    }
  }

  const handleViewResults = () => {
    navigate(`/results/${jobId}`)
  }

  if (loading) {
    return (
      <div className="container-custom py-8">
        <LoadingSpinner text="Loading status..." />
      </div>
    )
  }

  if (!status) {
    return (
      <div className="container-custom py-8">
        <Card>
          <div className="text-center py-8">
            <p className="text-gray-600 mb-4">Job not found</p>
            <Button variant="primary" onClick={() => navigate('/dashboard')}>
              Go to Dashboard
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="container-custom py-8">
      <div className="page-header">
        <h1 className="page-title">Processing Status</h1>
        <p className="page-description">
          Track the progress of your document processing
        </p>
      </div>

      <div className="max-w-3xl mx-auto">
        <Card>
          {/* Job Info */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-gray-600">Job ID</p>
                <p className="font-mono text-gray-900">{jobId}</p>
              </div>
              <Badge variant={status.status}>{status.status}</Badge>
            </div>
            {status.filename && (
              <div>
                <p className="text-sm text-gray-600">Filename</p>
                <p className="text-gray-900">{status.filename}</p>
              </div>
            )}
          </div>

          {/* Progress */}
          {status.status === 'processing' && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">Progress</p>
                <p className="text-sm text-gray-600">{status.progress || 0}%</p>
              </div>
              <ProgressBar progress={status.progress || 0} showPercentage={false} />
            </div>
          )}

          {/* Status Message */}
          {status.message && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-900">{status.message}</p>
            </div>
          )}

          {/* Error Message */}
          {status.error && (
            <div className="mb-6 p-4 bg-red-50 rounded-lg">
              <p className="text-sm text-red-900 font-medium">Error:</p>
              <p className="text-sm text-red-800 mt-1">{status.error}</p>
            </div>
          )}

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
            {status.created_at && (
              <div>
                <p className="text-gray-600">Started</p>
                <p className="text-gray-900">{formatDate(status.created_at)}</p>
              </div>
            )}
            {status.updated_at && (
              <div>
                <p className="text-gray-600">Last Updated</p>
                <p className="text-gray-900">{formatDate(status.updated_at)}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            {status.status === 'completed' ? (
              <Button
                variant="primary"
                fullWidth
                icon={FiArrowRight}
                onClick={handleViewResults}
              >
                View Results
              </Button>
            ) : status.status === 'processing' ? (
              <Button
                variant="outline"
                fullWidth
                icon={FiRefreshCw}
                onClick={fetchStatus}
              >
                Refresh Status
              </Button>
            ) : (
              <Button
                variant="primary"
                fullWidth
                onClick={() => navigate('/upload')}
              >
                Upload Another Document
              </Button>
            )}
          </div>
        </Card>

        {/* Processing Stages */}
        {status.status === 'processing' && (
          <Card title="Processing Stages" className="mt-6">
            <div className="space-y-3">
              {[
                { name: 'Upload', completed: true },
                { name: 'Preprocessing', completed: status.progress >= 20 },
                { name: 'OCR Extraction', completed: status.progress >= 40 },
                { name: 'Table Detection', completed: status.progress >= 60 },
                { name: 'Data Parsing', completed: status.progress >= 80 },
                { name: 'Insights Generation', completed: status.progress >= 100 },
              ].map((stage, index) => (
                <div key={index} className="flex items-center">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center mr-3 ${
                      stage.completed
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {stage.completed ? '✓' : index + 1}
                  </div>
                  <span
                    className={`${
                      stage.completed
                        ? 'text-gray-900 font-medium'
                        : 'text-gray-500'
                    }`}
                  >
                    {stage.name}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

export default ProcessingPage
