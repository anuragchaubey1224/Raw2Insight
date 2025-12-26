import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getMyDocuments, cleanupJob } from '../services/documentService'
import Card from '../components/common/Card'
import Badge from '../components/common/Badge'
import Button from '../components/common/Button'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Modal from '../components/common/Modal'
import { FiTrash2, FiEye, FiClock, FiFilter } from 'react-icons/fi'
import { formatDate, sortBy } from '../utils/helpers'
import toast from 'react-hot-toast'

function HistoryPage() {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, completed, processing, failed
  const [sortOrder, setSortOrder] = useState('desc') // desc, asc
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, jobId: null })

  useEffect(() => {
    fetchDocuments()
  }, [])

  const fetchDocuments = async () => {
    try {
      const data = await getMyDocuments(0, 100) // Get all documents
      setDocuments(data.documents || [])
    } catch (error) {
      toast.error('Failed to load history')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    const { jobId } = deleteModal
    if (!jobId) return

    try {
      await cleanupJob(jobId)
      setDocuments(prev => prev.filter(doc => doc.job_id !== jobId))
      toast.success('Document deleted')
      setDeleteModal({ isOpen: false, jobId: null })
    } catch (error) {
      toast.error('Failed to delete document')
      console.error(error)
    }
  }

  const openDeleteModal = (jobId) => {
    setDeleteModal({ isOpen: true, jobId })
  }

  const closeDeleteModal = () => {
    setDeleteModal({ isOpen: false, jobId: null })
  }

  // Filter documents
  const filteredDocuments = documents.filter(doc => {
    if (filter === 'all') return true
    return doc.status === filter
  })

  // Sort documents
  const sortedDocuments = sortBy(filteredDocuments, 'created_at', sortOrder)

  if (loading) {
    return (
      <div className="container-custom py-8">
        <LoadingSpinner text="Loading history..." />
      </div>
    )
  }

  return (
    <div className="container-custom py-8">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Document History</h1>
        <p className="page-description">
          View and manage all your processed documents
        </p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <FiFilter className="w-5 h-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Status:</span>
            <div className="flex gap-2">
              {['all', 'completed', 'processing', 'failed'].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilter(status)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    filter === status
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <FiClock className="w-5 h-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Sort:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setSortOrder('desc')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  sortOrder === 'desc'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Newest
              </button>
              <button
                onClick={() => setSortOrder('asc')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  sortOrder === 'asc'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Oldest
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Documents List */}
      <Card>
        {sortedDocuments.length === 0 ? (
          <div className="text-center py-12">
            <FiClock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">
              {filter === 'all'
                ? 'No documents yet'
                : `No ${filter} documents`}
            </p>
            <Link to="/upload">
              <Button variant="primary">Upload Document</Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead className="table-header">
                <tr>
                  <th className="table-header-cell">Filename</th>
                  <th className="table-header-cell">Status</th>
                  <th className="table-header-cell">Date</th>
                  <th className="table-header-cell">Items</th>
                  <th className="table-header-cell">Total</th>
                  <th className="table-header-cell">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedDocuments.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="table-cell">
                      <div>
                        <p className="font-medium text-gray-900">{doc.filename}</p>
                        {doc.vendor && (
                          <p className="text-sm text-gray-500">{doc.vendor}</p>
                        )}
                      </div>
                    </td>
                    <td className="table-cell">
                      <Badge variant={doc.status}>{doc.status}</Badge>
                    </td>
                    <td className="table-cell text-gray-600">
                      {formatDate(doc.created_at)}
                    </td>
                    <td className="table-cell text-gray-600">
                      {doc.items_count || '-'}
                    </td>
                    <td className="table-cell font-medium text-gray-900">
                      {doc.total_amount || '-'}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        {doc.status === 'completed' && (
                          <Link to={`/results/${doc.job_id}`}>
                            <Button variant="outline" size="sm" icon={FiEye}>
                              View
                            </Button>
                          </Link>
                        )}
                        {doc.status === 'processing' && (
                          <Link to={`/processing/${doc.job_id}`}>
                            <Button variant="outline" size="sm">
                              Status
                            </Button>
                          </Link>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          icon={FiTrash2}
                          onClick={() => openDeleteModal(doc.job_id)}
                          className="!text-red-600 hover:!bg-red-50"
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModal.isOpen}
        onClose={closeDeleteModal}
        title="Delete Document"
        footer={
          <>
            <Button variant="outline" onClick={closeDeleteModal}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-gray-600">
          Are you sure you want to delete this document? This action cannot be undone.
        </p>
      </Modal>
    </div>
  )
}

export default HistoryPage
