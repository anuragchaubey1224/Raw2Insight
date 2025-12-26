import axios from 'axios'
import { API_BASE_URL } from './axios'

/**
 * System Health API Service
 * Note: /health endpoint does NOT use /api/v1 prefix
 */

export const checkHealth = async () => {
  try {
    // Remove /api/v1 from base URL for health check
    const baseUrl = API_BASE_URL.replace('/api/v1', '')
    const response = await axios.get(`${baseUrl}/health`, {
      timeout: 10000
    })
    return response.data
  } catch (error) {
    throw new Error('Backend service unavailable')
  }
}

export const ping = async () => {
  try {
    const baseUrl = API_BASE_URL.replace('/api/v1', '')
    const response = await axios.get(`${baseUrl}/ping`, {
      timeout: 5000
    })
    return response.data
  } catch (error) {
    throw new Error('Backend service unreachable')
  }
}
