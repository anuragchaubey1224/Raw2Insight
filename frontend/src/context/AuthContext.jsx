import React, { createContext, useContext, useState, useEffect } from 'react'
import { login as loginService, signup as signupService, getCurrentUser, logout as logoutService } from '../services/authService'
import toast from 'react-hot-toast'

const AuthContext = createContext(null)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Check if user is logged in on mount
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('auth_token')
      const savedUser = localStorage.getItem('user')
      
      if (token && savedUser) {
        try {
          setUser(JSON.parse(savedUser))
          setIsAuthenticated(true)
          
          // Verify token is still valid
          const userData = await getCurrentUser()
          setUser(userData)
          localStorage.setItem('user', JSON.stringify(userData))
        } catch (error) {
          console.error('Token validation failed:', error)
          // Token invalid, clear storage
          localStorage.removeItem('auth_token')
          localStorage.removeItem('user')
          setUser(null)
          setIsAuthenticated(false)
        }
      }
      
      setLoading(false)
    }

    initAuth()
  }, [])

  const login = async (email, password) => {
    try {
      const data = await loginService(email, password)
      
      // Store token and user
      localStorage.setItem('auth_token', data.access_token)
      localStorage.setItem('user', JSON.stringify(data.user))
      
      setUser(data.user)
      setIsAuthenticated(true)
      
      toast.success('Login successful!')
      return data
    } catch (error) {
      toast.error(error.message)
      throw error
    }
  }

  const signup = async (email, password, fullName) => {
    try {
      const data = await signupService(email, password, fullName)
      
      // Store token and user
      localStorage.setItem('auth_token', data.access_token)
      localStorage.setItem('user', JSON.stringify(data.user))
      
      setUser(data.user)
      setIsAuthenticated(true)
      
      toast.success('Account created successfully!')
      return data
    } catch (error) {
      toast.error(error.message)
      throw error
    }
  }

  const logout = () => {
    logoutService()
    setUser(null)
    setIsAuthenticated(false)
    toast.success('Logged out successfully')
  }

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    signup,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
