import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { uploadAndProcess } from '../services/documentService'
import Card from '../components/common/Card'
import Button from '../components/common/Button'
import ProgressBar from '../components/common/ProgressBar'
import Alert from '../components/common/Alert'
import { FiUpload, FiFile, FiX } from 'react-icons/fi'
import { formatFileSize, isValidFileType } from '../utils/helpers'
import { MAX_FILE_SIZE, ALLOWED_FILE_EXTENSIONS } from '../utils/constants'
import toast from 'react-hot-toast'

function UploadPage() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState({ stage: '', progress: 0 })
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    setError('')
    
    if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0]
      if (rejection.errors[0]?.code === 'file-too-large') {
        setError(`File too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}`)
      } else {
        setError('Invalid file type. Please upload PDF, JPG, PNG, or TIFF files.')
      }
      return
    }

    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0]
      if (!isValidFileType(file)) {
        setError('Invalid file type. Please upload PDF, JPG, PNG, or TIFF files.')
        return
      }
      setSelectedFile(file)
    }
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
    multiple: false,
  })

  const handleRemoveFile = () => {
    setSelectedFile(null)
    setError('')
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setUploading(true)
    setError('')

    try {
      const result = await uploadAndProcess(selectedFile, (progressInfo) => {
        setProgress(progressInfo)
      })

      toast.success('Processing completed!')
      navigate(`/results/${result.jobId}`)
    } catch (error) {
      console.error('Upload error:', error)
      setError(error.message || 'Upload failed. Please try again.')
      toast.error(error.message || 'Upload failed')
    } finally {
      setUploading(false)
      setProgress({ stage: '', progress: 0 })
    }
  }

  const getStageText = (stage) => {
    const stages = {
      uploading: 'Uploading file...',
      processing: 'Processing document...',
      retrieving: 'Retrieving results...',
    }
    return stages[stage] || 'Processing...'
  }

  return (
    <div className="container-custom py-8">
      <div className="page-header">
        <h1 className="page-title">Upload Document</h1>
        <p className="page-description">
          Upload receipts, invoices, or forms to extract and analyze data
        </p>
      </div>

      <div className="max-w-2xl mx-auto">
        <Card>
          {!uploading ? (
            <>
              {/* Dropzone */}
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
                {isDragActive ? (
                  <p className="text-lg text-primary-600 font-medium">
                    Drop your file here
                  </p>
                ) : (
                  <>
                    <p className="text-lg text-gray-900 font-medium mb-2">
                      Drag and drop your file here
                    </p>
                    <p className="text-gray-600 mb-4">or click to browse</p>
                    <p className="text-sm text-gray-500">
                      Supported formats: {ALLOWED_FILE_EXTENSIONS.join(', ')}
                    </p>
                    <p className="text-sm text-gray-500">
                      Maximum size: {formatFileSize(MAX_FILE_SIZE)}
                    </p>
                  </>
                )}
              </div>

              {/* Selected File */}
              {selectedFile && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <FiFile className="w-8 h-8 text-primary-600" />
                    <div>
                      <p className="font-medium text-gray-900">{selectedFile.name}</p>
                      <p className="text-sm text-gray-600">
                        {formatFileSize(selectedFile.size)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleRemoveFile}
                    className="text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <FiX className="w-5 h-5" />
                  </button>
                </div>
              )}

              {/* Error Alert */}
              {error && (
                <Alert
                  type="error"
                  message={error}
                  onClose={() => setError('')}
                  className="mt-6"
                />
              )}

              {/* Upload Button */}
              <div className="mt-6">
                <Button
                  variant="primary"
                  fullWidth
                  size="lg"
                  onClick={handleUpload}
                  disabled={!selectedFile || uploading}
                  icon={FiUpload}
                >
                  Upload and Process
                </Button>
              </div>
            </>
          ) : (
            /* Processing State */
            <div className="py-8">
              <div className="text-center mb-6">
                <div className="spinner w-12 h-12 border-primary-600 mx-auto mb-4"></div>
                <p className="text-lg font-medium text-gray-900 mb-2">
                  {getStageText(progress.stage)}
                </p>
                <p className="text-sm text-gray-600">
                  Please don't close this page
                </p>
              </div>

              <ProgressBar progress={progress.progress} />

              {progress.jobId && (
                <div className="mt-4 text-center">
                  <p className="text-sm text-gray-600">
                    Job ID: <span className="font-mono text-gray-900">{progress.jobId}</span>
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Info Card */}
        <Card title="Processing Steps" className="mt-6">
          <ol className="space-y-3 text-sm text-gray-600">
            <li className="flex items-start">
              <span className="font-medium text-primary-600 mr-2">1.</span>
              <span>File upload and validation</span>
            </li>
            <li className="flex items-start">
              <span className="font-medium text-primary-600 mr-2">2.</span>
              <span>Image preprocessing and enhancement</span>
            </li>
            <li className="flex items-start">
              <span className="font-medium text-primary-600 mr-2">3.</span>
              <span>OCR text extraction and table detection</span>
            </li>
            <li className="flex items-start">
              <span className="font-medium text-primary-600 mr-2">4.</span>
              <span>Data parsing and structure extraction</span>
            </li>
            <li className="flex items-start">
              <span className="font-medium text-primary-600 mr-2">5.</span>
              <span>ML-powered categorization and insights generation</span>
            </li>
          </ol>
        </Card>
      </div>
    </div>
  )
}

export default UploadPage
