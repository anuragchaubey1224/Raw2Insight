import { APP_NAME } from '../../utils/constants'
import { FiGithub, FiMail, FiTwitter } from 'react-icons/fi'

function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200">
      <div className="container-custom py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* About */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">{APP_NAME}</h3>
            <p className="text-gray-600 text-sm">
              AI-powered document processing and intelligence platform. Extract insights from your documents automatically.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="/dashboard" className="text-gray-600 hover:text-primary-600">Dashboard</a>
              </li>
              <li>
                <a href="/upload" className="text-gray-600 hover:text-primary-600">Upload</a>
              </li>
              <li>
                <a href="/history" className="text-gray-600 hover:text-primary-600">History</a>
              </li>
              <li>
                <a href="/profile" className="text-gray-600 hover:text-primary-600">Profile</a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Contact</h3>
            <div className="flex space-x-4">
              <a href="#" className="text-gray-600 hover:text-primary-600">
                <FiGithub className="w-5 h-5" />
              </a>
              <a href="#" className="text-gray-600 hover:text-primary-600">
                <FiTwitter className="w-5 h-5" />
              </a>
              <a href="#" className="text-gray-600 hover:text-primary-600">
                <FiMail className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-200 text-center text-sm text-gray-600">
          <p>&copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
