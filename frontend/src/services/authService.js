import { apiClient } from './axios'

/**
 * Authentication API Service
 * Handles user signup, login, and profile management
 */

// Sign up new user
export const signup = async (email, password, fullName) => {
  try {
    const response = await apiClient.post('/auth/signup', {
      email,
      password,
      full_name: fullName
    })
    return response.data
  } catch (error) {
    throw new Error(error.response?.data?.detail || 'Signup failed')
  }
}

// Login user
export const login = async (email, password) => {
  try {
    const response = await apiClient.post('/auth/login', {
      email,
      password
    })
    return response.data
  } catch (error) {
    const message = error.response?.data?.detail || 'Login failed'
    throw new Error(message)
  }
}

// Get current user profile
export const getCurrentUser = async () => {
  try {
    const response = await apiClient.get('/auth/me')
    return response.data
  } catch (error) {
    throw new Error(error.response?.data?.detail || 'Failed to get user info')
  }
}

// Logout (client-side only)
export const logout = () => {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('user')
}
