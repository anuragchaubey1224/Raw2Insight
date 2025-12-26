/**
 * Application Constants
 */

export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Raw2Insight'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001/api/v1'

export const MAX_FILE_SIZE = import.meta.env.VITE_MAX_FILE_SIZE || 10485760 // 10MB

export const ALLOWED_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/tiff': ['.tiff', '.tif'],
}

export const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif']

export const JOB_STATUS = {
  UPLOADED: 'uploaded',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PENDING: 'pending',
}

export const PROCESSING_STAGES = {
  UPLOADING: 'uploading',
  PREPROCESSING: 'preprocessing',
  OCR: 'ocr',
  TABLE_DETECTION: 'table_detection',
  PARSING: 'parsing',
  INSIGHTS: 'insights',
  COMPLETED: 'completed',
}

export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  AUTH_FAILED: 'Authentication failed. Please login again.',
  FILE_TOO_LARGE: 'File size exceeds maximum limit.',
  INVALID_FILE_TYPE: 'Invalid file type. Please upload PDF, JPG, PNG, or TIFF.',
  UPLOAD_FAILED: 'File upload failed. Please try again.',
  PROCESSING_FAILED: 'Document processing failed. Please try again.',
  GENERIC_ERROR: 'An error occurred. Please try again.',
}

export const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: 'Login successful!',
  SIGNUP_SUCCESS: 'Account created successfully!',
  LOGOUT_SUCCESS: 'Logged out successfully',
  UPLOAD_SUCCESS: 'File uploaded successfully!',
  PROCESSING_COMPLETE: 'Processing completed!',
  DATA_SAVED: 'Data saved successfully!',
}

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  SIGNUP: '/signup',
  DASHBOARD: '/dashboard',
  UPLOAD: '/upload',
  PROCESSING: '/processing/:jobId',
  RESULTS: '/results/:jobId',
  HISTORY: '/history',
  PROFILE: '/profile',
}

export const LOCAL_STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  USER: 'user',
  THEME: 'theme',
}

export const POLLING_CONFIG = {
  MAX_ATTEMPTS: 60, // 5 minutes with 5-second intervals
  INTERVAL: 5000, // 5 seconds
}

export const CHART_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // yellow
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
]

export const DOCUMENT_TYPES = {
  RECEIPT: 'receipt',
  INVOICE: 'invoice',
  EXPENSE: 'expense',
  FORM: 'form',
  OTHER: 'other',
}
