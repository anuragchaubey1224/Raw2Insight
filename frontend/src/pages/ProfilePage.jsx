import { useAuth } from '../context/AuthContext'
import Card from '../components/common/Card'
import Button from '../components/common/Button'
import { FiUser, FiMail, FiCalendar, FiLogOut } from 'react-icons/fi'
import { formatDate } from '../utils/helpers'
import { useNavigate } from 'react-router-dom'

function ProfilePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="container-custom py-8">
      <div className="page-header">
        <h1 className="page-title">My Profile</h1>
        <p className="page-description">
          Manage your account settings and preferences
        </p>
      </div>

      <div className="max-w-3xl mx-auto space-y-6">
        {/* Profile Info */}
        <Card title="Profile Information">
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <FiUser className="w-5 h-5 text-gray-400 mt-1" />
              <div className="flex-1">
                <p className="text-sm text-gray-600">Full Name</p>
                <p className="text-gray-900 font-medium">
                  {user?.full_name || 'Not provided'}
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <FiMail className="w-5 h-5 text-gray-400 mt-1" />
              <div className="flex-1">
                <p className="text-sm text-gray-600">Email</p>
                <p className="text-gray-900 font-medium">{user?.email}</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <FiCalendar className="w-5 h-5 text-gray-400 mt-1" />
              <div className="flex-1">
                <p className="text-sm text-gray-600">Member Since</p>
                <p className="text-gray-900">
                  {user?.created_at ? formatDate(user.created_at) : 'N/A'}
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-5 h-5 flex items-center justify-center mt-1">
                <div
                  className={`w-3 h-3 rounded-full ${
                    user?.is_active ? 'bg-green-500' : 'bg-gray-400'
                  }`}
                />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-600">Account Status</p>
                <p className="text-gray-900 font-medium">
                  {user?.is_active ? 'Active' : 'Inactive'}
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Account Actions */}
        <Card title="Account Actions">
          <div className="space-y-3">
            <Button
              variant="danger"
              fullWidth
              icon={FiLogOut}
              onClick={handleLogout}
            >
              Sign Out
            </Button>
          </div>
        </Card>

        {/* API Information */}
        <Card title="Developer Information">
          <div className="space-y-2 text-sm">
            <p className="text-gray-600">
              <span className="font-medium text-gray-900">User ID:</span>{' '}
              {user?.id}
            </p>
            <p className="text-gray-600">
              <span className="font-medium text-gray-900">API Access:</span>{' '}
              Available via JWT token
            </p>
            <p className="text-gray-500 text-xs mt-4">
              Your authentication token is stored securely in browser localStorage
              and is automatically included in all API requests.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default ProfilePage
