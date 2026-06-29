# IIS Deployment Guide for EMS Application

This guide provides step-by-step instructions to deploy the Enquiry Management System (EMS) on a Windows Server using IIS.

## 1. Prerequisites

Before starting, ensure the server has the following software installed.

### Software Requirements
1.  **Node.js (LTS Version)**
    *   **Purpose:** Required to run the backend API.
    *   **Download:** [Node.js v20.x (LTS)](https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi)
2.  **IIS URL Rewrite Module 2.1**
    *   **Purpose:** Required for React routing and Reverse Proxying.
    *   **Download:** [URL Rewrite 2.1](https://www.iis.net/downloads/microsoft/url-rewrite)
3.  **Application Request Routing (ARR) 3.0**
    *   **Purpose:** Required to enable Reverse Proxy functionality in IIS.
    *   **Download:** [ARR 3.0](https://www.iis.net/downloads/microsoft/application-request-routing)
4.  **Microsoft OLE DB Driver for SQL Server**
    *   **Purpose:** Required for the backend to connect to the SQL Database.
    *   **Download:** [OLE DB Driver 19](https://go.microsoft.com/fwlink/?linkid=2270624)
5.  **PM2 (Process Manager)**
    *   **Purpose:** Keeps the Node.js backend running in the background.
    *   **Install Command:** Open PowerShell as Admin and run: `npm install -g pm2`

### IIS Roles & Features
Open **Server Manager** > **Manage** > **Add Roles and Features**:
1.  **Web Server (IIS)**
    *   Web Server > Common HTTP Features > **Static Content**
    *   Web Server > Common HTTP Features > **Default Document**
    *   Web Server > Common HTTP Features > **HTTP Errors**
    *   Web Server > Application Development > **WebSocket Protocol** (Optional but good to have)
    *   Web Server > Application Development > **CGI** (Sometimes needed for advanced Node configs)

---

## 2. Initial IIS Setup

### Enable Reverse Proxy
1.  Open **IIS Manager**.
2.  Click on the **Server Name** (root node) in the left tree.
3.  Double-click **Application Request Routing Cache**.
4.  Click **Server Proxy Settings** on the right actions pane.
5.  Check **Enable proxy**.
6.  Click **Apply**.

---

## 3. Application Deployment

We will deploy the application in two parts: **Frontend** (React) and **Backend** (Node.js).
A deployment package has been created for you at: `C:\Users\Vignesh\Downloads\New-EMS\New-EMS-Updated\deployment_package`

### Step 3.1: Copy Files
1.  Create a folder `C:\inetpub\wwwroot\EMS`.
2.  Inside it, create two folders: `Frontend` and `Backend`.
3.  **Frontend:** Copy contents of `deployment_package/frontend` to `C:\inetpub\wwwroot\EMS\Frontend`.
4.  **Backend:** Copy contents of `deployment_package/backend` to `C:\inetpub\wwwroot\EMS\Backend`.

### Step 3.2: Configure Backend
1.  Navigate to `C:\inetpub\wwwroot\EMS\Backend`.
2.  Open PowerShell as Administrator in this folder.
3.  Run `npm install --production` to install dependencies.
4.  Create a file named `.env` and add your database credentials:
    ```env
    DB_USER=your_db_user
    DB_PASS=your_db_password
    DB_SERVER=your_sql_server_ip
    DB_NAME=EMS_DB
    PORT=5000
    SMTP_HOST=smtp.office365.com
    SMTP_PORT=587
    SMTP_USER=your_email@domain.com
    SMTP_PASS=your_email_password
    ```
5.  Start the backend using PM2:
    ```powershell
    pm2 start index.js --name "EMS_Backend"
    pm2 save
    pm2 startup
    ```
    *(The `pm2 startup` command will generate a command you need to run to ensure it starts on reboot).*

### Step 3.3: Configure IIS Website
1.  Open **IIS Manager**.
2.  Right-click **Sites** > **Add Website**.
3.  **Site name:** `EMS`
4.  **Physical path:** `C:\inetpub\wwwroot\EMS\Frontend`
5.  **Port:** `80` (or `443` for HTTPS).
6.  **Host name:** `ems.yourdomain.com` (or leave blank for IP access).
7.  Click **OK**.

### Step 3.4: Verify Configuration
The `web.config` file included in the Frontend folder handles the magic. It tells IIS:
*   If the URL starts with `/api`, send it to `http://localhost:5000/api` (Backend).
*   Otherwise, serve the React app.

---

## 4. Future Updates

To update the application in the future:

1.  **Stop the Backend:** `pm2 stop EMS_Backend`
2.  **Backup:** Copy the current `EMS` folder to a backup location.
3.  **Update Files:** Overwrite the files in `Frontend` and `Backend` with the new version.
    *   *Note: You usually don't need to overwrite `node_modules` or `.env`.*
4.  **Update Config:** If `web.config` changed, update it.
5.  **Restart Backend:** `pm2 restart EMS_Backend`
6.  **Test:** Open the browser and verify.

---

## 5. Troubleshooting

*   **500 Error on API calls:** Check if Node.js is running (`pm2 status`). Check `C:\inetpub\wwwroot\EMS\Backend\logs` (if configured) or run `pm2 logs`.
*   **404 on Refresh:** Ensure URL Rewrite is installed and the `web.config` is present in the Frontend folder.
*   **Database Connection Error:** Check the `.env` file and ensure the SQL Server allows remote connections (TCP/IP enabled in SQL Configuration Manager).

---

## 6. Post-Deployment Test Plan

After deployment, perform the following tests to ensure the system is functioning correctly.

### Test 1: Application Access
*   **Action:** Open a web browser and navigate to `http://localhost` (or your configured domain).
*   **Expected Result:** The Login page should load successfully.
*   **Troubleshooting:** If the page doesn't load, check IIS Site status and Port bindings.

### Test 2: User Login
*   **Action:** Enter valid credentials and click "Login".
*   **Expected Result:** You should be redirected to the Dashboard/Enquiry page.
*   **Troubleshooting:** If "Network Error" occurs, check if the Backend is running (`pm2 status`) and if the database connection in `.env` is correct.

### Test 3: Create New Enquiry
*   **Action:**
    1.  Go to **New Enquiry**.
    2.  Verify **Request No** is auto-generated (e.g., `EYS/2025/...`).
    3.  Fill in required fields (Source, Enquiry Type, Customer, etc.).
    4.  Click **Add**.
*   **Expected Result:** A success message "Enquiry Added Successfully" should appear, and the form should reset.

### Test 4: Verify Data & Sorting
*   **Action:** Go to **Search Enquiry**.
*   **Expected Result:**
    1.  The newly created enquiry should appear at the **TOP** of the list.
    2.  Verify that the list is sorted by Date (Latest First).

### Test 5: Modify Enquiry
*   **Action:**
    1.  Click **Open** on an enquiry in the Search list.
    2.  Change a field (e.g., Status or Remarks).
    3.  Click **Save Changes**.
*   **Expected Result:** Success message appears. When you reload the enquiry, the changes should persist.

### Test 6: Modal Functionality
*   **Action:** Open any popup (e.g., "New" Customer).
*   **Expected Result:**
    1.  The popup should open **below the header** (not hidden behind it).
    2.  You should be able to **drag** the popup by clicking its border.

### Test 7: File Upload (Optional)
*   **Action:** In the Enquiry Form, try uploading a file attachment.
*   **Expected Result:** The file should be listed as "Uploaded". You should be able to download/view it.
*   **Troubleshooting:** If upload fails, check if the `uploads` folder exists in `C:\inetpub\wwwroot\EMS\Backend` and has write permissions.
