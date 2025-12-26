# Raw2Insight Frontend

Modern React frontend for the Raw2Insight document processing platform. Built with React 18, Vite, Tailwind CSS, and TypeScript.

## 🚀 Features

- **Authentication**: Secure JWT-based authentication with signup/login
- **Document Upload**: Drag-and-drop file upload with real-time progress tracking
- **Live Processing**: Real-time job status monitoring with polling
- **Results Visualization**: Interactive display of extracted data and insights
- **Document History**: Manage and filter all processed documents
- **Responsive Design**: Mobile-first design with Tailwind CSS
- **Error Handling**: Comprehensive error handling with toast notifications

## 📁 Project Structure

```
frontend/
├── public/              # Static assets
├── src/
│   ├── components/      # Reusable React components
│   │   ├── common/      # Common UI components (Button, Input, Card, etc.)
│   │   └── layout/      # Layout components (Navbar, Footer, etc.)
│   ├── context/         # React Context providers (AuthContext)
│   ├── pages/           # Page components
│   │   ├── HomePage.jsx
│   │   ├── LoginPage.jsx
│   │   ├── SignupPage.jsx
│   │   ├── DashboardPage.jsx
│   │   ├── UploadPage.jsx
│   │   ├── ProcessingPage.jsx
│   │   ├── ResultsPage.jsx
│   │   ├── HistoryPage.jsx
│   │   └── ProfilePage.jsx
│   ├── services/        # API service layer
│   │   ├── axios.js          # Axios configuration
│   │   ├── authService.js    # Authentication APIs
│   │   ├── documentService.js # Document processing APIs
│   │   └── systemService.js  # Health check APIs
│   ├── utils/           # Utility functions and constants
│   │   ├── helpers.js        # Helper functions
│   │   └── constants.js      # App constants
│   ├── App.jsx          # Main App component with routing
│   ├── main.jsx         # App entry point
│   └── index.css        # Global styles and Tailwind imports
├── .env                 # Environment variables
├── .env.example         # Environment variables template
├── index.html           # HTML template
├── package.json         # Dependencies
├── tailwind.config.js   # Tailwind configuration
├── postcss.config.js    # PostCSS configuration
└── vite.config.js       # Vite configuration
```

## 🛠️ Tech Stack

- **React 18.2** - UI library
- **Vite 5.0** - Build tool and dev server
- **React Router DOM 6.21** - Client-side routing
- **Tailwind CSS 3.4** - Utility-first CSS framework
- **Axios 1.6** - HTTP client
- **React Dropzone 14.2** - File upload
- **React Hot Toast 2.4** - Toast notifications
- **React Icons 4.12** - Icon library
- **Recharts 2.10** - Chart library

## 📦 Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and set your backend API URL:
   ```env
   VITE_API_URL=https://your-backend-url.com/api/v1
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```
   
   The app will be available at `http://localhost:3000`

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL (with /api/v1 prefix) | `http://localhost:8001/api/v1` |
| `VITE_APP_NAME` | Application name | `Raw2Insight` |
| `VITE_MAX_FILE_SIZE` | Max file upload size in bytes | `10485760` (10MB) |
| `VITE_ALLOWED_FILE_TYPES` | Allowed file extensions | `.pdf,.jpg,.jpeg,.png,.tiff` |

### API Integration

The frontend connects to the backend API using the following services:

**Authentication Service** (`authService.js`):
- `signup(email, password, fullName)` - Register new user
- `login(email, password)` - User login
- `getCurrentUser()` - Get current user profile
- `logout()` - Clear local storage

**Document Service** (`documentService.js`):
- `uploadDocument(file, onProgress)` - Upload file with progress tracking
- `startProcessing(jobId)` - Start processing job
- `getJobStatus(jobId)` - Get job status
- `getResults(jobId)` - Get processing results
- `saveExtractedData(jobId, data)` - Save extracted data
- `getAllJobs()` - Get all user jobs
- `getMyDocuments(skip, limit)` - Get user documents
- `cleanupJob(jobId)` - Delete job
- `pollJobStatus(jobId, onProgress)` - Poll until completion
- `uploadAndProcess(file, onProgress)` - Complete upload flow

**System Service** (`systemService.js`):
- `checkHealth()` - Backend health check
- `ping()` - Backend ping

## 🎨 Component Library

### Common Components

- **Button** - Customizable button with variants (primary, secondary, danger, outline)
- **Input** - Form input with label, error handling, and icons
- **Card** - Content container with optional title and actions
- **Badge** - Status badge with color variants
- **LoadingSpinner** - Loading indicator with optional text
- **ProgressBar** - Progress bar with percentage
- **Alert** - Alert message with types (success, error, warning, info)
- **Modal** - Modal dialog with customizable size

### Layout Components

- **MainLayout** - Main app layout with navbar and footer
- **AuthLayout** - Authentication pages layout
- **Navbar** - Top navigation bar with user menu
- **Footer** - Footer with links and copyright

## 📱 Pages

1. **Home** (`/`) - Landing page with features
2. **Login** (`/login`) - User login page
3. **Signup** (`/signup`) - User registration page
4. **Dashboard** (`/dashboard`) - Main dashboard with stats and recent documents
5. **Upload** (`/upload`) - File upload page with drag-and-drop
6. **Processing** (`/processing/:jobId`) - Real-time processing status
7. **Results** (`/results/:jobId`) - Processing results with extracted data
8. **History** (`/history`) - Document history with filtering
9. **Profile** (`/profile`) - User profile and settings

## 🔐 Authentication

The app uses JWT token-based authentication:

1. User logs in/signs up
2. Backend returns JWT token
3. Token stored in `localStorage`
4. Token automatically included in all API requests via Axios interceptors
5. 401 responses trigger automatic logout and redirect to login

## 🚢 Deployment

### Build for Production

```bash
npm run build
```

The production-ready files will be in the `dist/` directory.

### Deploy to Vercel

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Deploy:
   ```bash
   vercel
   ```

3. Set environment variables in Vercel dashboard:
   - `VITE_API_URL` = Your production backend URL

### Deploy to Netlify

1. Build the project:
   ```bash
   npm run build
   ```

2. Deploy `dist/` folder to Netlify

3. Set environment variables in Netlify dashboard

## 🐛 Troubleshooting

### API Connection Issues

- Verify `VITE_API_URL` in `.env` is correct
- Check backend API is running and accessible
- Open browser DevTools Network tab to inspect API requests
- Check CORS configuration on backend

### Build Errors

- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Clear Vite cache: `rm -rf node_modules/.vite`
- Check Node.js version: `node --version` (should be >= 16)

### Styling Issues

- Rebuild Tailwind: `npm run build`
- Check Tailwind config includes all source files
- Verify PostCSS is properly configured

## 📄 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📞 Support

For issues and questions:
- Open an issue on GitHub
- Check documentation at `/docs`
- Contact support team

---

Built with ❤️ using React + Vite + Tailwind CSS
