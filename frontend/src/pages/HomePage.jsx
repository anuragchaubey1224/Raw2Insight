import { Link } from 'react-router-dom'
import { FiUpload, FiZap, FiShield, FiTrendingUp } from 'react-icons/fi'
import Button from '../components/common/Button'
import { APP_NAME } from '../utils/constants'

function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="container-custom">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">R</span>
              </div>
              <span className="text-xl font-bold text-gray-900">{APP_NAME}</span>
            </div>
            
            <div className="flex items-center gap-4">
              <Link to="/login">
                <Button variant="outline">Login</Button>
              </Link>
              <Link to="/signup">
                <Button variant="primary">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container-custom py-20">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Transform Documents into
            <span className="text-primary-600"> Actionable Insights</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            AI-powered document processing platform that extracts, analyzes, and visualizes data
            from receipts, invoices, and forms automatically.
          </p>
          <div className="flex justify-center gap-4">
            <Link to="/signup">
              <Button variant="primary" size="lg" icon={FiUpload}>
                Start Processing
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="outline" size="lg">
                Learn More
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container-custom py-20">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
          Powerful Features
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="card text-center">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiZap className="w-8 h-8 text-primary-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Fast Processing
            </h3>
            <p className="text-gray-600">
              Advanced OCR and ML models process documents in seconds, extracting all key information automatically.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="card text-center">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiShield className="w-8 h-8 text-primary-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Secure & Private
            </h3>
            <p className="text-gray-600">
              Your documents are encrypted and securely processed. We never share your data with third parties.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="card text-center">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiTrendingUp className="w-8 h-8 text-primary-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Smart Insights
            </h3>
            <p className="text-gray-600">
              Get automatic spending analysis, category predictions, and anomaly detection for your expenses.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary-600 py-16">
        <div className="container-custom text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-primary-100 text-lg mb-8">
            Join thousands of users who trust {APP_NAME} for document processing
          </p>
          <Link to="/signup">
            <Button variant="secondary" size="lg">
              Create Free Account
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8">
        <div className="container-custom text-center">
          <p>&copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

export default HomePage
