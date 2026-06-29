# EMS - Enquiry Management System

A full-stack web application for managing enquiries, built with React (Frontend) and Node.js/Express (Backend) with MSSQL database.

## 🚀 Project Structure

```
EMS_demo/
├── src/                          # React Frontend
│   ├── components/
│   │   ├── Layout/              # Header, Navigation, MainLayout
│   │   ├── Enquiry/             # EnquiryForm, ListBoxControl, SearchEnquiry
│   │   └── Modals/              # CustomerModal, ContactModal, UserModal, EnquiryItemModal
│   ├── context/                 # DataContext (State Management)
│   ├── data/                    # mockData.js
│   ├── App.jsx
│   └── index.css
├── server/                      # Node.js Backend
│   ├── index.js                 # Express server
│   ├── dbConfig.js              # MSSQL connection
│   ├── .env                     # Database credentials (CONFIGURE THIS!)
│   └── package.json
├── database/
│   └── schema.sql               # MSSQL Database Schema
├── package.json                 # Frontend dependencies
└── vite.config.js
```

## 📋 Prerequisites

- **Node.js** v18+ and npm
- **Microsoft SQL Server** (Express/Developer/Standard)
- **SQL Server Management Studio (SSMS)** (optional, for DB management)

## 🔧 Installation & Setup

### 1. Database Setup

1. Open **SQL Server Management Studio (SSMS)**
2. Connect to your SQL Server instance
3. Open `database/schema.sql`
4. Execute the script to create the `EMS_DB` database and tables

### 2. Backend Configuration

1. Navigate to the `server` folder
2. Open `.env` file and update with your SQL Server credentials:

```env
DB_USER=your_sql_username
DB_PASSWORD=your_sql_password
DB_SERVER=localhost
DB_DATABASE=EMS_DB
PORT=5000
```

3. Install backend dependencies:
```bash
cd server
npm install
```

### 3. Frontend Setup

1. From the root directory, install frontend dependencies:
```bash
npm install
```

## ▶️ Running the Application

### Start Backend Server (Terminal 1)
```bash
cd server
node index.js
```
Expected output: `Server running on port 5000` and `Connected to MSSQL Database`

### Start Frontend (Terminal 2)
```bash
npm run dev
```
Expected output: `Local: http://localhost:5173/`

### Access Application
Open your browser and navigate to: **http://localhost:5173**

## 🎯 Features

### ✅ New Enquiry
- Create new enquiries with comprehensive form fields
- Add multiple enquiry types, customers, and concerned SEs
- Document tracking (Hard Copies, Drawings, DVDs, etc.)
- Auto-acknowledgment email option

### ✅ Modify Enquiry
- Load existing enquiries by Request Number
- Edit and update enquiry details
- Save changes to database

### ✅ Search Enquiry
- Filter by text, category, and date range
- View all enquiries in a table
- Open enquiries for modification
- Close/Archive enquiries

### ✅ Master Data Management (Modals)
- **Customer/Client/Consultant**: Add/Edit company details
- **Contact Persons**: Manage contact information
- **Users**: Add system users with roles
- **Enquiry Items**: Define enquiry categories

## 🗄️ Database Tables

- `Enquiries` - Main transaction table
- `Customers` - Customer/Client/Consultant master
- `Contacts` - Contact person details
- `Users` - System users
- `EnquiryItems` - Enquiry categories

## 🛠️ Technology Stack

**Frontend:**
- React 19
- Vite (Build Tool)
- Vanilla CSS (Custom Design)

**Backend:**
- Node.js
- Express.js
- mssql (SQL Server driver)
- CORS, dotenv

**Database:**
- Microsoft SQL Server

## 📝 API Endpoints

- `GET /api/enquiries` - Fetch all enquiries
- `POST /api/enquiries` - Create new enquiry
- `GET /api/customers` - Fetch all customers
- `POST /api/customers` - Add new customer

## 🐛 Troubleshooting

### Backend won't start
- Verify SQL Server is running
- Check `.env` credentials are correct
- Ensure `EMS_DB` database exists

### Frontend can't connect to backend
- Confirm backend is running on port 5000
- Check browser console for CORS errors
- Verify `API_URL` in `DataContext.jsx` is `http://localhost:5000/api`

### Database connection errors
- Test connection in SSMS first
- For local SQL Server, server name might be `localhost\\SQLEXPRESS`
- Check Windows Firewall isn't blocking port 1433

## 📄 License

This project is for demonstration purposes.

## 👨‍💻 Author

Created with Antigravity AI Assistant
