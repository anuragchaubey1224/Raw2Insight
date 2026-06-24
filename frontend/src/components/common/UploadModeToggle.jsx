import { useNavigate } from 'react-router-dom'

/** Single <-> Batch upload mode switcher. `mode` is 'single' or 'batch'. */
function UploadModeToggle({ mode }) {
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

export default UploadModeToggle
