# Glamour Gatherings — Setup & Deployment Guide

Welcome to the **Glamour Gatherings Luxury Salon & Spa** full-stack setup guide. This document provides step-by-step instructions for running the appointment booking portal, MySQL database migrations, real-time service operations, and GitHub Pages deployment.

- **GitHub Repository**: [https://github.com/JeevananthanV/glamers_gathering_react](https://github.com/JeevananthanV/glamers_gathering_react)
- **Author**: Jeevananthan V

---

## 📋 System Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **MySQL**: 8.0 or higher (or MariaDB 10.4+)
- **Git**: v2.30.0 or higher

---

## 📥 1. Clone the Repository

```bash
git clone https://github.com/JeevananthanV/glamers_gathering_react.git
cd glamers_gathering_react
```

---

## 🗄️ 2. MySQL Database Setup

1. Start your local MySQL server (via XAMPP, WampServer, Docker, or MySQL Workbench).
2. Create the database:

```sql
CREATE DATABASE IF NOT EXISTS glamers_gathering_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

---

## ⚙️ 3. Environment Variables Configuration

### Backend Environment (`backend/.env`)

Create a `.env` file in the `backend/` directory:

```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5174

# MySQL Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=glamers_gathering_db
DB_PORT=3306

# Authentication Secrets
JWT_SECRET=glamour_luxury_salon_secret_jwt_key_2026
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

### Frontend Environment (`frontend/.env`)

Create a `.env` file in the `frontend/` directory:

```env
VITE_API_URL=http://localhost:5000
```

---

## 📦 4. Install Dependencies & Initialize Database

```bash
# 1. Install and setup backend
cd backend
npm install
node initDb.js

# 2. Install frontend dependencies
cd ../frontend
npm install
cd ..
```

---

## 🚀 5. Running the Application Locally

### Terminal 1: Backend API (Port 5000)

```bash
cd backend
node server.js
```
The backend server starts at: `http://localhost:5000`
- API Health Check: `http://localhost:5000/api/health`
- Bookings API: `http://localhost:5000/api/bookings`
- Services Catalog: `http://localhost:5000/api/services`

### Terminal 2: Frontend Client (Port 5174)

```bash
cd frontend
npm run dev -- --port 5174
```
Open your browser at: `http://localhost:5174`

---

## 🔐 6. Admin Panel & Booking Workflow

| Portal | URL | Credentials |
|---|---|---|
| **Client Booking Portal** | `http://localhost:5174/` | Public Access |
| **Admin Booking Console** | `http://localhost:5174/admin` | Username: `admin` / Password: `admin123` |
| **Backend REST API** | `http://localhost:5000/api` | JWT Authenticated |

---

## 🌐 7. GitHub Pages Deployment (Frontend)

The repository includes an automated GitHub Actions deployment workflow at `.github/workflows/deploy.yml`.

To deploy manually or test the production build:

```bash
cd frontend
npm run build
```
The output directory will be `frontend/dist/`. For custom domains, ensure `homepage` in `package.json` and `base` in `vite.config.js` match your repository name:
`base: '/glamers_gathering_react/'`

---

## 🛠️ Troubleshooting

- **MySQL ER_ACCESS_DENIED_ERROR**:
  Verify `DB_USER` and `DB_PASSWORD` in `backend/.env`. By default in XAMPP, `DB_USER=root` and `DB_PASSWORD=` (blank).
- **Port Conflict on 5000**:
  Change `PORT` in `backend/.env` to another port (e.g., `5002`) and update `VITE_API_URL` accordingly in `frontend/.env`.
