import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { uploadAndProcessBatch } from '../services/batchService'
import Card from '../components/common/Card'
import Button from '../components/common/Button'
import ProgressBar from '../components/common/ProgressBar'
import Alert from '../components/common/Alert'
import { FiUpload, FiFile, FiX } from 'react-icons/fi'
import { formatFileSize, isValidFileType } from '../utils/helpers'
import { MAX_FILE_SIZE, ALLOWED_FILE_EXTENSIONS } from '../utils/constants'
import toast from 'react-hot-toast'

const MAX_BILLS = 10 // matches backend MAX_BATCH_SIZE

function ModeToggle({ mode }) {
  const navigate = useNavigate()
  const base = 'px-4 py-1.5 rounded-md text-sm font-medium transition-colors'
  return (
    <div className="inline-flex rounded-lg border border-gray-300 p-1 mb-6">
      <button
        onClick={() => navigate('/upload')}
        className={`${base} ${mode === 'single' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
      >
        Single
      </button>
      <button
        onClick={() => navigate('/batch')}
        className={`${base} ${mode === 'batch' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
      >
        Batch
      </button>
    </div>
  )
}

function BatchUploadPage() {
  const [files, setFiles] = useState([])
  const [engine, setEngine] = useState('local')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState({ stage: '', progress: 0 })
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    setError('')
    if (rejectedFiles.length > 0) {
      setError(`Some files were rejected (type or size). Allowed: ${ALLOWED_FILE_EXTENSIONS.join(', ')}, max ${formatFileSize(MAX_FILE_SIZE)} each.`)
    }
    const valid = acceptedFiles.filter(isValidFileType)
    setFiles((prev) => {
      const combined = [...prev, ...valid]
      if (combined.length > MAX_BILLS) {
        setError(`Max ${MAX_BILLS} bills per batch — keeping the first ${MAX_BILLS}.`)
        return combined.slice(0, MAX_BILLS)
      }
      return combined
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/tiff': ['.tiff', '.tif'],
    },
    maxSize: MAX_FILE_SIZE,
    multiple: true,
  })

  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx))

  const handleUpload = async () => {
    if (files.length === 0) return
    setUploading(true)
    setError('')
    try {
      const { batchId } = await uploadAndProcessBatch(files, engine, setProgress)
      toast.success('Batch processed!')
      navigate(`/batch/${batchId}/results`)
    } catch (err) {
      console.error('Batch upload error:', err)
      setError(err.message || 'Batch upload failed. Please try again.')
      toast.error(err.message || 'Batch upload failed')
    } finally {
      setUploading(false)
      setProgress({ stage: '', progress: 0 })
    }
  }

  const stageText = {
    uploading: 'Uploading bills...',
    processing: 'Processing bills...',
    retrieving: 'Loading results...',
  }

  const processed = (progress.done || 0) + (progress.failed || 0)

  return (
    <div className="container-custom py-8">
      <div className="page-header">
        <h1 className="page-title">Batch Upload</h1>
        <p className="page-description">
          Upload up to {MAX_BILLS} bills at once and get one downloadable table
        </p>
      </div>

      <div className="max-w-2xl mx-auto">
        <ModeToggle mode="batch" />
        <Card>
          {!uploading ? (
            <>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
                }`}
              >
                <input {...getInputProps()} />
                <FiUpload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-lg text-gray-900 font-medium mb-2">
                  {isDragActive ? 'Drop your bills here' : 'Drag & drop bills, or click to browse'}
                </p>
                <p className="text-sm text-gray-500">
                  Up to {MAX_BILLS} files · {ALLOWED_FILE_EXTENSIONS.join(', ')} · max {formatFileSize(MAX_FILE_SIZE)} each
                </p>
              </div>

              {files.length > 0 && (
                <div className="mt-6 space-y-2">
                  <p className="text-sm font-medium text-gray-700">
                    {files.length} / {MAX_BILLS} bills selected
                  </p>
                  {files.map((file, idx) => (
                    <div key={`${file.name}-${idx}`} className="p-3 bg-gray-50 rounded-lg flex items-center justify-between">
                      <div className="flex items-center space-x-3 min-w-0">
                        <FiFile className="w-5 h-5 text-primary-600 flex-shrink-0" />
                        <span className="text-sm text-gray-900 truncate">{file.name}</span>
                        <span className="text-xs text-gray-500 flex-shrink-0">{formatFileSize(file.size)}</span>
                      </div>
                      <button
                        onClick={() => removeFile(idx)}
                        className="text-gray-400 hover:text-red-600 transition-colors flex-shrink-0"
                      >
                        <FiX className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Processing engine</label>
                <select
                  value={engine}
                  onChange={(e) => setEngine(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                >
                  <option value="local">My ML Pipeline (local, default)</option>
                  <option value="llm">AI / LLM (optional)</option>
                  <option value="compare">Compare both</option>
                </select>
              </div>

              {error && (
                <Alert type="error" message={error} onClose={() => setError('')} className="mt-6" />
              )}

              <div className="mt-6">
                <Button
                  variant="primary"
                  fullWidth
                  size="lg"
                  onClick={handleUpload}
                  disabled={files.length === 0}
                  icon={FiUpload}
                >
                  Process {files.length > 0 ? `${files.length} ` : ''}Bill{files.length === 1 ? '' : 's'}
                </Button>
              </div>
            </>
          ) : (
            <div className="py-8">
              <div className="text-center mb-6">
                <div className="spinner w-12 h-12 border-primary-600 mx-auto mb-4"></div>
                <p className="text-lg font-medium text-gray-900 mb-2">
                  {stageText[progress.stage] || 'Working...'}
                </p>
                {progress.total ? (
                  <p className="text-sm text-gray-600">{processed} of {progress.total} bills done</p>
                ) : (
                  <p className="text-sm text-gray-600">Please don&apos;t close this page</p>
                )}
              </div>
              <ProgressBar progress={progress.progress} />
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

export default BatchUploadPage
