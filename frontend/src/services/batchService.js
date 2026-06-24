import { uploadClient, apiClient } from './axios'

/**
 * Batch Processing API Service
 * Upload many bills at once, track aggregate progress, fetch results, export CSV/Excel.
 * Mirrors documentService.js conventions.
 *
 * Note: POST /batch/upload is wired on the backend in Phase 2 (with the extraction core).
 * The status/results/download endpoints already exist on the batch router.
 */

// Upload multiple bills (images and/or PDFs) as one batch
export const uploadBatch = async (files, engine = 'local', onUploadProgress) => {
  try {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    formData.append('engine', engine)

    const response = await uploadClient.post('/batch/upload', formData, {
      onUploadProgress: (progressEvent) => {
        if (onUploadProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onUploadProgress(percent)
        }
      },
    })
    return response.data
  } catch (error) {
    throw new Error(error.response?.data?.detail || 'Batch upload failed')
  }
}

// Aggregate batch status: { batch_id, status, total, done, failed, engine }
export const getBatchStatus = async (batchId) => {
  try {
    const response = await apiClient.get(`/batch/${batchId}/status`)
    return response.data
  } catch (error) {
    throw new Error(error.response?.data?.detail || 'Failed to get batch status')
  }
}

// Batch results: { batch_id, status, rows: [{ filename, status, vendor, date, total, items, confidence }] }
export const getBatchResults = async (batchId) => {
  try {
    const response = await apiClient.get(`/batch/${batchId}/results`)
    return response.data
  } catch (error) {
    throw new Error(error.response?.data?.detail || 'Failed to get batch results')
  }
}

// Download the batch table as CSV or Excel (triggers a browser download)
export const downloadBatch = async (batchId, format = 'csv') => {
  try {
    const response = await apiClient.get(`/batch/${batchId}/download?format=${format}`, {
      responseType: 'blob',
    })
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `batch_${batchId}.${format === 'xlsx' ? 'xlsx' : 'csv'}`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  } catch (error) {
    throw new Error(error.response?.data?.detail || 'Download failed')
  }
}

// Poll batch status until every bill is processed (terminal = not "processing")
export const pollBatchStatus = async (batchId, onProgress, maxAttempts = 120, interval = 3000) => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const status = await getBatchStatus(batchId)
      onProgress?.(status)

      if (status.status && status.status !== 'processing') {
        return status
      }
      await new Promise((resolve) => setTimeout(resolve, interval))
    } catch (error) {
      if (attempt === maxAttempts - 1) throw error
      await new Promise((resolve) => setTimeout(resolve, interval))
    }
  }
  throw new Error('Polling timeout: batch did not finish within the expected time')
}

// Full flow: upload -> poll until done -> fetch results
export const uploadAndProcessBatch = async (files, engine, onProgress) => {
  try {
    onProgress?.({ stage: 'uploading', progress: 0 })
    const { batch_id: batchId } = await uploadBatch(files, engine, (percent) =>
      onProgress?.({ stage: 'uploading', progress: percent })
    )

    onProgress?.({ stage: 'processing', progress: 0, batchId })
    const finalStatus = await pollBatchStatus(batchId, (status) =>
      onProgress?.({
        stage: 'processing',
        batchId,
        status: status.status,
        done: status.done,
        failed: status.failed,
        total: status.total,
        progress: status.total ? Math.round(((status.done + status.failed) * 100) / status.total) : 0,
      })
    )

    onProgress?.({ stage: 'retrieving', progress: 100, batchId })
    const results = await getBatchResults(batchId)
    return { batchId, results, status: finalStatus }
  } catch (error) {
    console.error('Batch upload/process flow failed:', error)
    throw error
  }
}
