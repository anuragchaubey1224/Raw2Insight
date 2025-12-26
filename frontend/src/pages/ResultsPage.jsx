import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getResults } from '../services/documentService'
import Card from '../components/common/Card'
import Badge from '../components/common/Badge'
import Button from '../components/common/Button'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { FiDownload, FiArrowLeft, FiDollarSign, FiCalendar, FiMapPin } from 'react-icons/fi'
import { formatCurrency, formatDate } from '../utils/helpers'
import toast from 'react-hot-toast'

function ResultsPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchResults()
  }, [jobId])

  const fetchResults = async () => {
    try {
      const data = await getResults(jobId)
      setResults(data)
    } catch (error) {
      console.error('Results fetch error:', error)
      toast.error('Failed to load results')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadJSON = () => {
    if (!results) return

    const dataStr = JSON.stringify(results, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `results_${jobId}.json`
    link.click()
    URL.revokeObjectURL(url)

    toast.success('JSON downloaded')
  }

  if (loading) {
    return (
      <div className="container-custom py-8">
        <LoadingSpinner text="Loading results..." />
      </div>
    )
  }

  if (!results) {
    return (
      <div className="container-custom py-8">
        <Card>
          <div className="text-center py-8">
            <p className="text-gray-600 mb-4">Results not found</p>
            <Button variant="primary" onClick={() => navigate('/dashboard')}>
              Go to Dashboard
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  const extracted = results.extracted_data || {}
  const items = extracted.items || []

  return (
    <div className="container-custom py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Button
            variant="outline"
            size="sm"
            icon={FiArrowLeft}
            onClick={() => navigate('/dashboard')}
            className="mb-3"
          >
            Back
          </Button>
          <h1 className="page-title">Processing Results</h1>
        </div>
        <Button
          variant="outline"
          icon={FiDownload}
          onClick={handleDownloadJSON}
        >
          Download JSON
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary Card */}
          <Card title="Document Summary">
            <div className="grid grid-cols-2 gap-4">
              {extracted.vendor && (
                <div className="flex items-start space-x-2">
                  <FiMapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-600">Vendor</p>
                    <p className="font-medium text-gray-900">{extracted.vendor}</p>
                  </div>
                </div>
              )}
              {extracted.date && (
                <div className="flex items-start space-x-2">
                  <FiCalendar className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-600">Date</p>
                    <p className="font-medium text-gray-900">{extracted.date}</p>
                  </div>
                </div>
              )}
              {extracted.total && (
                <div className="flex items-start space-x-2">
                  <FiDollarSign className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-600">Total Amount</p>
                    <p className="font-medium text-gray-900 text-lg">
                      {formatCurrency(parseFloat(extracted.total) || 0)}
                    </p>
                  </div>
                </div>
              )}
              {extracted.category && (
                <div>
                  <p className="text-sm text-gray-600">Category</p>
                  <Badge variant="info">{extracted.category}</Badge>
                </div>
              )}
            </div>
          </Card>

          {/* Items Table */}
          {items.length > 0 && (
            <Card title={`Items (${items.length})`}>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead className="table-header">
                    <tr>
                      <th className="table-header-cell">Description</th>
                      <th className="table-header-cell">Quantity</th>
                      <th className="table-header-cell">Price</th>
                      <th className="table-header-cell">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {items.map((item, index) => (
                      <tr key={index}>
                        <td className="table-cell">{item.description || '-'}</td>
                        <td className="table-cell">{item.quantity || '-'}</td>
                        <td className="table-cell">
                          {item.unit_price
                            ? formatCurrency(parseFloat(item.unit_price))
                            : '-'}
                        </td>
                        <td className="table-cell font-medium">
                          {item.amount
                            ? formatCurrency(parseFloat(item.amount))
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Insights */}
          {results.insights && (
            <Card title="AI Insights">
              <div className="space-y-4">
                {results.insights.spending_by_category && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                      Spending by Category
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(results.insights.spending_by_category).map(
                        ([category, amount]) => (
                          <div
                            key={category}
                            className="flex items-center justify-between"
                          >
                            <span className="text-gray-600">{category}</span>
                            <span className="font-medium text-gray-900">
                              {formatCurrency(amount)}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                {results.insights.anomalies && results.insights.anomalies.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                      Anomalies Detected
                    </h4>
                    <div className="space-y-2">
                      {results.insights.anomalies.map((anomaly, index) => (
                        <div
                          key={index}
                          className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg"
                        >
                          <p className="text-sm text-yellow-900">{anomaly}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar - 1 column */}
        <div className="space-y-6">
          {/* Status */}
          <Card title="Processing Status">
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <Badge variant={results.status || 'completed'}>
                  {results.status || 'Completed'}
                </Badge>
              </div>
              {results.job_id && (
                <div>
                  <p className="text-sm text-gray-600">Job ID</p>
                  <p className="text-sm font-mono text-gray-900">{results.job_id}</p>
                </div>
              )}
              {results.created_at && (
                <div>
                  <p className="text-sm text-gray-600">Processed</p>
                  <p className="text-sm text-gray-900">
                    {formatDate(results.created_at)}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Actions */}
          <Card title="Actions">
            <div className="space-y-3">
              <Button variant="outline" fullWidth onClick={() => navigate('/upload')}>
                Upload New Document
              </Button>
              <Button variant="outline" fullWidth onClick={() => navigate('/history')}>
                View History
              </Button>
            </div>
          </Card>

          {/* Raw Data */}
          <Card title="Raw OCR Text">
            {extracted.raw_text ? (
              <div className="max-h-64 overflow-y-auto">
                <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                  {extracted.raw_text}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No raw text available</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

export default ResultsPage
