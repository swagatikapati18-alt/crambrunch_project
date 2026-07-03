# 🎓 CRAMBRUNCH — Smart Campus Management Platform

A full-stack web application for managing academic and campus activities with role-based dashboards.

---

## 🚀 Quick Start

### Prerequisites
- Node.js v16+
- MongoDB (local or Atlas)
- npm

### 1. Install & Configure Backend

```bash
cd backend
npm install
```

Edit `.env` with your settings:
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/crambrunch
JWT_SECRET=your_secret_key_here
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
FRONTEND_URL=http://localhost:5000
```

### 2. Start the Server

```bash
cd backend
npm start
# or for development with hot-reload:
npm run dev
```

### 3. Open the App

Navigate to: **http://localhost:5000**

The landing page is now the main portal. Use the sign in / sign up buttons directly on the homepage.

### 4. Seed Demo Data

Click the **"Seed Demo Data"** button on the homepage, or:
```
POST http://localhost:5000/api/auth/seed
```

---

## 🔐 Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | superadmin@crambrunch.com | SuperAdmin@123 |
| HOD | hod@crambrunch.com | Hod@123 |
| Teacher | teacher@crambrunch.com | Teacher@123 |
| Student | student@crambrunch.com | Student@123 |
| Parent | parent@crambrunch.com | Parent@123 |

---

## 📁 Project Structure

```
crambrunch/
├── backend/
│   ├── server.js              # Express app entry point
│   ├── .env                   # Environment variables
│   ├── package.json
│   ├── models/
│   │   ├── User.js            # User schema (all roles)
│   │   ├── Attendance.js      # Attendance records
│   │   ├── Marks.js           # Academic marks
│   │   ├── Grievance.js       # Grievance tickets
│   │   └── Others.js          # Material, SkillTask, Notification, Timetable, Feedback
│   ├── middleware/
│   │   └── auth.js            # JWT protect + RBAC
│   └── routes/
│       ├── auth.js            # Login, register, seed
│       ├── students.js        # Student CRUD
│       ├── attendance.js      # Mark attendance + 75% predictor
│       ├── marks.js           # Enter/view marks
│       ├── grievances.js      # Submit/manage grievances
│       ├── materials.js       # Upload/download study materials
│       ├── skillhub.js        # SkillHub tasks & badge system
│       ├── notifications.js   # In-app notifications
│       ├── timetable.js       # Timetable CRUD
│       └── feedback.js        # Teacher feedback
└── frontend/
    └── public/
        ├── index.html         # Landing + Login page
        ├── css/
        │   └── main.css       # Shared dashboard styles
        ├── js/
        │   └── app.js         # Shared utilities & API helpers
        └── pages/
            ├── student.html   # Student dashboard
            ├── teacher.html   # Teacher dashboard
            ├── hod.html       # HOD dashboard
            ├── parent.html    # Parent dashboard
            └── admin.html     # Super Admin dashboard
```

---

## 🎭 Role Dashboards

### 🎒 Student
- Personal attendance summary per subject
- **75% Predictor** — calculates how many more classes can be missed
- View marks across all subjects with charts
- Submit anonymous grievances with ticket tracking
- **SkillHub** — post & apply for skill barter / micro-internships
- Download study materials
- Submit teacher feedback (star ratings)
- Badge collection display

### 📚 Teacher
- Mark attendance for a class (bulk, with radio buttons)
- Enter marks (internal, practical, assignment, semester)
- View all students in their classes
- Upload study materials (with Google Drive link)
- View personal timetable
- See aggregated student feedback & ratings

### 🏛️ HOD
- Department overview stats
- View all students & filter by semester
- Generate attendance reports (flags below-75% students)
- **Grievance management** — respond, update status, escalate
- Manage department timetable
- View faculty feedback ratings

### 👨‍👩‍👧 Parent
- View linked ward's profile
- Real-time attendance feed per subject (with warning flags)
- Academic results and performance charts
- **Alerts** — warning notifications when attendance drops below 75%

### 🛡️ Super Admin
- Register new users of any role
- Manage (deactivate) all users
- System health overview
- All grievances with manual escalation trigger
- Auto-escalation check (flags grievances > 24h without response)
- SkillHub management + complete tasks & award badges
- View/delete all study materials

---

## ⚡ Key Features

| Feature | Description |
|---------|-------------|
| **75% Attendance Predictor** | Calculates eligibility based on remaining classes |
| **Auto Parent Alerts** | Triggers notification when attendance < 75% |
| **Anonymous Grievances** | Identity encrypted, ticket-based system |
| **Auto-Escalation** | Stale grievances (>24h) escalated to HOD |
| **SkillHub Badges** | Students earn badges on task completion |
| **Role-Based Access** | JWT + RBAC — each role sees only relevant data |
| **Real-time Notifications** | In-app notification panel across all dashboards |
| **Charts & Analytics** | Chart.js visualizations for attendance & marks |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Charts | Chart.js |
| Backend | Node.js, Express.js |
| Database | MongoDB + Mongoose |
| Auth | JWT + bcryptjs |
| Email | Nodemailer (Gmail SMTP) |
| Fonts | Google Fonts (Syne + DM Sans) |

---

## 📧 Email Notifications (Optional)

To enable email alerts for parents, configure Gmail in `.env`:

1. Enable 2FA on your Gmail account
2. Generate an App Password: Google Account → Security → App Passwords
3. Set `EMAIL_USER` and `EMAIL_PASS` in `.env`

---

## 🔧 API Endpoints

```
POST   /api/auth/login              Login
POST   /api/auth/register           Register user
GET    /api/auth/me                 Get current user
POST   /api/auth/seed               Seed demo data

GET    /api/students                List students
GET    /api/students/:id            Get student
PUT    /api/students/:id            Update student

POST   /api/attendance/mark         Mark class attendance
GET    /api/attendance/summary/:id  Student attendance summary
GET    /api/attendance/predict/:id/:subject   75% prediction

POST   /api/marks                   Enter marks
GET    /api/marks/student/:id       Student marks

POST   /api/grievances              Submit grievance
GET    /api/grievances              All grievances (hod/admin)
GET    /api/grievances/mine         My grievances (student)
PUT    /api/grievances/:id/status   Update status

GET    /api/materials               List materials
POST   /api/materials               Upload material

GET    /api/skillhub                SkillHub tasks
POST   /api/skillhub                Post task
POST   /api/skillhub/:id/apply      Apply for task
PUT    /api/skillhub/:id/complete   Complete & award badge

GET    /api/notifications           My notifications
PUT    /api/notifications/read-all  Mark all read

GET    /api/timetable               Get timetable
POST   /api/timetable               Add entry

POST   /api/feedback                Submit feedback
GET    /api/feedback/my             Teacher's own feedback
```

---

## 👩‍💻 Team

| Name | Roll Number |
|------|------------|
| Pujarani Sahoo | 15930V236036 |
| Swagatika Pati | 15930V236056 |
| Ipsita Priyadarshini Prusty | 15930V236019 |
| Piyusa Pravas Priyadarshi | 15930V236030 |
