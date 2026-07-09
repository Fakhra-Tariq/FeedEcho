#FeedEcho - Interactive Learning Platform

A modern, full-stack interactive learning platform built with Node.js, React, and Firebase. Learnexa connects teachers and students through engaging courses, real-time collaboration, and comprehensive learning management.

## 🚀 Features

### For Students
- 📚 Browse and enroll in interactive courses
- 🎥 Video lessons with progress tracking
- 📝 Interactive assignments and quizzes
- 🏆 Earn certificates upon completion
- 📊 Personal learning analytics

### For Teachers
- 🎓 Create and manage courses
- 👥 Track student progress
- 📈 Course analytics and insights
- 💰 Revenue management
- 🎨 Rich content creation tools

### For Administrators
- 👤 User management and roles
- 📊 Platform analytics
- 🔒 Security and moderation
- ⚙️ System configuration

## 🛠 Tech Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Firebase Admin SDK** - Authentication and database
- **Firestore** - NoSQL database
- **JWT** - Additional authentication layer

### Frontend
- **React 18** - UI framework
- **React Router** - Navigation
- **Tailwind CSS** - Styling with professional pastel theme
- **Firebase Client SDK** - Authentication and real-time data
- **Lucide React** - Beautiful icons
- **React Hook Form** - Form management

### Authentication & Security
- Firebase Authentication
- Role-based access control (Student, Teacher, Admin)
- JWT tokens for API security
- Protected routes and middleware

## 🎨 Design System

The platform features a professional pastel color palette:

- **Primary**: Soft blues (#0ea5e9)
- **Secondary**: Gentle purples (#d946ef)
- **Accent**: Warm yellows (#f59e0b)
- **Success**: Fresh greens (#22c55e)
- **Warning**: Soft oranges (#f59e0b)
- **Error**: Light reds (#ef4444)

## 📁 Project Structure

```
learnexa/
├── server/                 # Backend application
│   ├── config/            # Firebase configuration
│   ├── middleware/        # Authentication middleware
│   ├── routes/           # API routes
│   └── index.js          # Server entry point
├── client/               # React frontend
│   ├── public/           # Static assets
│   ├── src/
│   │   ├── components/   # Reusable components
│   │   ├── contexts/     # React contexts
│   │   ├── pages/        # Page components
│   │   ├── services/     # API services
│   │   └── utils/        # Utility functions
│   └── package.json
├── .env.example          # Environment variables template
├── package.json          # Root package.json
└── README.md
```

## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Firebase project

### 1. Clone the repository
```bash
git clone <repository-url>
cd learnexa
```

### 2. Set up Firebase
1. Create a new Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Authentication (Email/Password)
3. Create Firestore database
4. Generate service account key
5. Copy Firebase configuration to `.env` file

### 3. Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your Firebase credentials
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id

# Server environment variables
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your_project_id.iam.gserviceaccount.com
```

### 4. Install Dependencies
```bash
# Install root dependencies
npm install

# Install client dependencies
cd client && npm install
```

### 5. Run the Application
```bash
# Start both backend and frontend
npm run dev

# Or start individually
npm run server  # Backend on port 5000
npm run client  # Frontend on port 3000
```

## 📚 API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile

### User Management
- `GET /api/users` - Get all users (admin/teacher)
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user (admin)

### Course Management
- `GET /api/courses` - Get all courses
- `POST /api/courses` - Create course (teacher/admin)
- `GET /api/courses/:id` - Get course details
- `PUT /api/courses/:id` - Update course
- `DELETE /api/courses/:id` - Delete course
- `POST /api/courses/:id/enroll` - Enroll in course

## 🔐 Authentication Flow

1. **Registration**: User creates account with email/password
2. **Email Verification**: Firebase sends verification email
3. **Profile Creation**: User profile stored in Firestore
4. **Login**: Firebase authenticates and returns ID token
5. **API Access**: Token used for authenticated requests
6. **Role-based Access**: Middleware checks user permissions

## 🎯 User Roles

### Student
- Browse and enroll in courses
- Complete assignments
- Track progress
- Earn certificates

### Teacher
- Create and manage courses
- Grade assignments
- View analytics
- Manage enrollments

### Admin
- Manage all users
- Platform configuration
- View system analytics
- Content moderation

## 🌟 Key Features

### Real-time Updates
- Live progress tracking
- Instant notifications
- Real-time collaboration

### Responsive Design
- Mobile-first approach
- Tablet and desktop optimization
- Touch-friendly interfaces

### Security
- Firebase authentication
- Role-based permissions
- Input validation
- XSS protection

### Performance
- Lazy loading
- Code splitting
- Optimized images
- Caching strategies

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.


## 🚀 Future Roadmap

- [ ] Mobile applications (iOS/Android)
- [ ] Advanced analytics dashboard
- [ ] Video conferencing integration
- [ ] Payment processing
- [ ] Multi-language support
- [ ] AI-powered recommendations
- [ ] Advanced assessment tools
- [ ] Gamification features

---

**Built with ❤️ for the education community**
