function Input({ 
  label, 
  error, 
  helpText,
  required = false,
  icon: Icon,
  ...props 
}) {
  return (
    <div className="form-group">
      {label && (
        <label className="label">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Icon className="w-5 h-5" />
          </div>
        )}
        
        <input
          className={`input ${error ? 'input-error' : ''} ${Icon ? 'pl-10' : ''}`}
          {...props}
        />
      </div>
      
      {error && <p className="error-text">{error}</p>}
      {helpText && !error && <p className="text-sm text-gray-500 mt-1">{helpText}</p>}
    </div>
  )
}

export default Input
