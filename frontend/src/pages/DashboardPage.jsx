import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getMyDocuments } from '../services/documentService'
import Card from '../components/common/Card'
import Badge from '../components/common/Badge'
import Button from '../components/common/Button'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { FiUpload, FiFile, FiClock, FiTrendingUp } from 'react-icons/fi'
import { formatDate } from '../utils/helpers'
import toast from 'react-hot-toast'

function DashboardPage() {
  const { user } = useAuth()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    processing: 0,
    failed: 0,
  })

  useEffect(() => {
    fetchDocuments()
  }, [])

  const fetchDocuments = async () => {
    try {
      const data = await getMyDocuments(0, 10) // Get latest 10
      setDocuments(data.documents || [])
      
      // Calculate stats
      const total = data.documents?.length || 0
      const completed = data.documents?.filter(d => d.status === 'completed').length || 0
      const processing = data.documents?.filter(d => d.status === 'processing').length || 0
      const failed = data.documents?.filter(d => d.status === 'failed').length || 0
      
      setStats({ total, completed, processing, failed })
    } catch (error) {
      toast.error('Failed to load documents')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="container-custom py-8">
        <LoadingSpinner text="Loading dashboard..." />
      </div>
    )
  }

  return (
    <div className="container-custom py-8">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-description">
          Welcome back, {user?.full_name || user?.email?.split('@')[0] || 'User'}!
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="!p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Documents</p>
              <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
              <FiFile className="w-6 h-6 text-primary-600" />
            </div>
          </div>
        </Card>

        <Card className="!p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Completed</p>
              <p className="text-3xl font-bold text-green-600">{stats.completed}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <FiTrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="!p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Processing</p>
              <p className="text-3xl font-bold text-blue-600">{stats.processing}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <FiClock className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="!p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Failed</p>
              <p className="text-3xl font-bold text-red-600">{stats.failed}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <FiFile className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card title="Quick Actions" className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link to="/upload">
            <Button variant="primary" fullWidth icon={FiUpload}>
              Upload Document
            </Button>
          </Link>
          <Link to="/history">
            <Button variant="outline" fullWidth icon={FiClock}>
              View History
            </Button>
          </Link>
          <Link to="/profile">
            <Button variant="outline" fullWidth icon={FiFile}>
              My Profile
            </Button>
          </Link>
        </div>
      </Card>

      {/* Recent Documents */}
      <Card title="Recent Documents">
        {documents.length === 0 ? (
          <div className="text-center py-12">
            <FiFile className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">No documents yet</p>
            <Link to="/upload">
              <Button variant="primary" icon={FiUpload}>
                Upload Your First Document
              </Button>
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
                  <th className="table-header-cell">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{doc.filename}</td>
                    <td className="table-cell">
                      <Badge variant={doc.status}>{doc.status}</Badge>
                    </td>
                    <td className="table-cell text-gray-600">
                      {formatDate(doc.created_at)}
                    </td>
                    <td className="table-cell">
                      {doc.status === 'completed' ? (
                        <Link to={`/results/${doc.job_id}`}>
                          <Button variant="outline" size="sm">
                            View Results
                          </Button>
                        </Link>
                      ) : doc.status === 'processing' ? (
                        <Link to={`/processing/${doc.job_id}`}>
                          <Button variant="outline" size="sm">
                            View Status
                          </Button>
                        </Link>
                      ) : (
                        <Button variant="outline" size="sm" disabled>
                          {doc.status}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

export default DashboardPage
