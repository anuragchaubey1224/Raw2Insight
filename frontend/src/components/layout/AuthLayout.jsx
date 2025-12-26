import { Outlet } from 'react-router-dom'
import { APP_NAME } from '../../utils/constants'

function AuthLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-primary-600">{APP_NAME}</h1>
          <p className="mt-2 text-gray-600">Document Intelligence Platform</p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="card">
          <Outlet />
        </div>
      </div>

      <div className="mt-8 text-center text-sm text-gray-600">
        <p>&copy; 2024 {APP_NAME}. All rights reserved.</p>
      </div>
    </div>
  )
}

export default AuthLayout
