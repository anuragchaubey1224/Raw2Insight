import { uploadClient, apiClient } from './axios'

/**
 * Document Processing API Service
 * Handles file upload, processing, and results retrieval
 */

// Upload document file
export const uploadDocument = async (file, onUploadProgress) => {
  try {
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await uploadClient.post('/upload', formData, {
      onUploadProgress: (progressEvent) => {
        if (onUploadProgress) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onUploadProgress(percentCompleted)
        }
      }
    })
    
    return response.data
  } catch (error) {
    throw new Error(error.response?.data?.detail || 'Upload failed')
  }
}

// Start document processing
export const startProcessing = async (jobId) => {
  try {
    const response = await apiClient.post(`/process/${jobId}`)
    return response.data
  } catch (error) {
    throw new Error(error.response?.data?.detail || 'Failed to start processing')
  }
}

// Get job status
export const getJobStatus = async (jobId) => {
  try {
    const response = await apiClient.get(`/status/${jobId}`)
    return response.data
  } catch (error) {
    throw new Error(error.response?.data?.detail || 'Failed to get status')
  }
}

// Get processing results
export const getResults = async (jobId) => {
  try {
    const response = await apiClient.get(`/result/${jobId}`)
    return response.data
  } catch (error) {
    throw new Error(error.response?.data?.detail || 'Failed to get results')
  }
}

// Save extracted data
export const saveExtractedData = async (jobId, data) => {
  try {
    const response = await apiClient.patch(`/result/${jobId}/save`, data)
    return response.data
  } catch (error) {
    throw new Error(error.response?.data?.detail || 'Failed to save data')
  }
}

// Get all jobs for current user
export const getAllJobs = async () => {
  try {
    const response = await apiClient.get('/jobs')
    return response.data
  } catch (error) {
    throw new Error(error.response?.data?.detail || 'Failed to get jobs')
  }
}

// Get user's documents
export const getMyDocuments = async (skip = 0, limit = 50) => {
  try {
    const response = await apiClient.get(`/my-documents?skip=${skip}&limit=${limit}`)
    return response.data
  } catch (error) {
    throw new Error(error.response?.data?.detail || 'Failed to get documents')
  }
}

// Cleanup job data
export const cleanupJob = async (jobId) => {
  try {
    const response = await apiClient.delete(`/cleanup/${jobId}`)
    return response.data
  } catch (error) {
    throw new Error(error.response?.data?.detail || 'Failed to cleanup job')
  }
}

// Poll job status until completion
export const pollJobStatus = async (jobId, onProgress, maxAttempts = 60, interval = 5000) => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const status = await getJobStatus(jobId)
      
      if (onProgress) {
        onProgress(status)
      }
      
      if (status.status === 'completed' || status.status === 'failed') {
        return status
      }
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, interval))
    } catch (error) {
      console.error(`Status check attempt ${attempt + 1} failed:`, error)
      
      // If it's the last attempt, throw the error
      if (attempt === maxAttempts - 1) {
        throw error
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, interval))
    }
  }
  
  throw new Error('Polling timeout: Job did not complete within expected time')
}

// Complete upload and processing flow
export const uploadAndProcess = async (file, onProgress) => {
  try {
    // Step 1: Upload file
    onProgress?.({ stage: 'uploading', progress: 0 })
    const uploadResponse = await uploadDocument(file, (percent) => {
      onProgress?.({ stage: 'uploading', progress: percent })
    })
    
    const jobId = uploadResponse.job_id
    
    // Step 2: Processing starts automatically, just poll for status
    onProgress?.({ stage: 'processing', progress: 0, jobId })
    
    const finalStatus = await pollJobStatus(
      jobId,
      (status) => onProgress?.({ 
        stage: 'processing', 
        progress: status.progress || 0, 
        status: status.status,
        jobId 
      })
    )
    
    if (finalStatus.status === 'failed') {
      throw new Error(finalStatus.error || 'Processing failed')
    }
    
    // Step 3: Get results
    onProgress?.({ stage: 'retrieving', progress: 100, jobId })
    const results = await getResults(jobId)
    
    return { jobId, results, status: finalStatus }
  } catch (error) {
    console.error('Upload and process flow failed:', error)
    throw error
  }
}
