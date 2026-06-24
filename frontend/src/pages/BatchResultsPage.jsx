import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getBatchResults, downloadBatch } from '../services/batchService'
import Card from '../components/common/Card'
import Button from '../components/common/Button'
import Badge from '../components/common/Badge'
import Alert from '../components/common/Alert'
import { FiDownload, FiChevronDown, FiChevronRight, FiUpload } from 'react-icons/fi'
import toast from 'react-hot-toast'

const STATUS_VARIANT = { completed: 'success', failed: 'error', processing: 'warning', partial: 'warning' }

function BatchRow({ row, expanded, onToggle }) {
  const items = row.items || []
  return (
    <>
      <tr className="border-b hover:bg-gray-50">
        <td className="py-2 pr-2">
          {items.length > 0 && (
            <button onClick={onToggle} className="text-gray-400 hover:text-gray-700" aria-label="Toggle items">
              {expanded ? <FiChevronDown className="w-4 h-4" /> : <FiChevronRight className="w-4 h-4" />}
            </button>
          )}
        </td>
        <td className="py-2 pr-4 truncate max-w-[180px]" title={row.filename}>{row.filename}</td>
        <td className="py-2 pr-4">{row.vendor || '—'}</td>
        <td className="py-2 pr-4">{row.date || '—'}</td>
        <td className="py-2 pr-4">{row.total ?? '—'}</td>
        <td className="py-2 pr-4">{items.length}</td>
        <td className="py-2 pr-4">
          <Badge variant={STATUS_VARIANT[row.status] || 'info'}>{row.status}</Badge>
        </td>
      </tr>
      {expanded && items.length > 0 && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-4 py-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-1 pr-4">Description</th>
                  <th className="py-1 pr-4">Qty</th>
                  <th className="py-1 pr-4">Unit Price</th>
                  <th className="py-1 pr-4">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-4">{it.description}</td>
                    <td className="py-1 pr-4">{it.qty}</td>
                    <td className="py-1 pr-4">{it.unit_price}</td>
                    <td className="py-1 pr-4">{it.line_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  )
}

function BatchResultsPage() {
  const { batchId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    let active = true
    setLoading(true)
    getBatchResults(batchId)
      .then((res) => { if (active) setData(res) })
      .catch((err) => { if (active) setError(err.message || 'Failed to load results') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [batchId])

  const handleDownload = async (format) => {
    try {
      await downloadBatch(batchId, format)
    } catch (err) {
      toast.error(err.message || 'Download failed')
    }
  }

  const toggle = (idx) => setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }))

  if (loading) {
    return (
      <div className="container-custom py-12 text-center">
        <div className="spinner w-12 h-12 border-primary-600 mx-auto"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container-custom py-8 max-w-2xl mx-auto">
        <Alert type="error" message={error} />
        <div className="mt-6">
          <Button variant="primary" icon={FiUpload} onClick={() => navigate('/batch')}>
            Back to Batch Upload
          </Button>
        </div>
      </div>
    )
  }

  const rows = data?.rows || []

  return (
    <div className="container-custom py-8">
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Batch Results</h1>
          <p className="page-description">{rows.length} bills · status: {data?.status}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={FiDownload} onClick={() => handleDownload('csv')}>CSV</Button>
          <Button variant="outline" icon={FiDownload} onClick={() => handleDownload('xlsx')}>Excel</Button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-2"></th>
                <th className="py-2 pr-4">File</th>
                <th className="py-2 pr-4">Vendor</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Total</th>
                <th className="py-2 pr-4">Items</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <BatchRow key={idx} row={row} expanded={!!expanded[idx]} onToggle={() => toggle(idx)} />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500">No bills in this batch</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-6">
        <Button variant="primary" icon={FiUpload} onClick={() => navigate('/batch')}>
          Upload another batch
        </Button>
      </div>
    </div>
  )
}

export default BatchResultsPage
