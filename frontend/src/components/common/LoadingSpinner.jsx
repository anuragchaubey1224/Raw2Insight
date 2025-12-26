function LoadingSpinner({ size = 'md', text = '' }) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  }
  
  return (
    <div className="flex flex-col items-center justify-center p-8">
      <div className={`spinner ${sizes[size]} border-primary-600`}></div>
      {text && <p className="mt-4 text-gray-600">{text}</p>}
    </div>
  )
}

export default LoadingSpinner
