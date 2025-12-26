import { getStatusBadgeClass } from '../../utils/helpers'

function Badge({ children, variant = 'info', className = '' }) {
  const variants = {
    success: 'badge-success',
    warning: 'badge-warning',
    error: 'badge-error',
    info: 'badge-info',
  }
  
  const statusClass = typeof variant === 'string' && variants[variant]
    ? variants[variant]
    : getStatusBadgeClass(variant)
  
  return (
    <span className={`badge ${statusClass} ${className}`}>
      {children}
    </span>
  )
}

export default Badge
