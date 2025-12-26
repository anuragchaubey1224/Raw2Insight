/**
 * Utility Functions for Frontend
 */

// Format file size to human readable
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Format date to readable string
export const formatDate = (dateString) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Format currency
export const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount)
}

// Validate email
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Validate file type
export const isValidFileType = (file) => {
  const validTypes = ['image/jpeg', 'image/png', 'image/tiff', 'application/pdf']
  return validTypes.includes(file.type)
}

// Get file extension
export const getFileExtension = (filename) => {
  return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2)
}

// Truncate text
export const truncateText = (text, maxLength = 50) => {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

// Debounce function
export const debounce = (func, wait) => {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

// Get status color
export const getStatusColor = (status) => {
  const colors = {
    completed: 'green',
    processing: 'blue',
    pending: 'yellow',
    failed: 'red',
    uploaded: 'indigo',
  }
  return colors[status] || 'gray'
}

// Get status badge class
export const getStatusBadgeClass = (status) => {
  const classes = {
    completed: 'badge-success',
    processing: 'badge-info',
    pending: 'badge-warning',
    failed: 'badge-error',
    uploaded: 'badge-info',
  }
  return classes[status] || 'badge-info'
}

// Download file helper
export const downloadFile = (blob, filename) => {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

// Copy to clipboard
export const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (error) {
    console.error('Failed to copy:', error)
    return false
  }
}

// Parse error message
export const parseErrorMessage = (error) => {
  if (typeof error === 'string') return error
  if (error.response?.data?.detail) return error.response.data.detail
  if (error.message) return error.message
  return 'An unexpected error occurred'
}

// Calculate progress percentage
export const calculateProgress = (current, total) => {
  if (total === 0) return 0
  return Math.round((current / total) * 100)
}

// Group items by key
export const groupBy = (array, key) => {
  return array.reduce((result, item) => {
    const group = item[key]
    if (!result[group]) {
      result[group] = []
    }
    result[group].push(item)
    return result
  }, {})
}

// Sort array by key
export const sortBy = (array, key, order = 'asc') => {
  return [...array].sort((a, b) => {
    const aVal = a[key]
    const bVal = b[key]
    
    if (order === 'asc') {
      return aVal > bVal ? 1 : -1
    } else {
      return aVal < bVal ? 1 : -1
    }
  })
}

// Sleep/delay utility
export const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms))
}
