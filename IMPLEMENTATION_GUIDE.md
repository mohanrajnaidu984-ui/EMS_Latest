# IIS Implementation Guide for EMS Application

This guide provides complete instructions to implement (deploy) the Enquiry Management System (EMS) on a Windows Server using IIS.

## 1. Prerequisites

Before starting, ensure the server has the following software installed.

### Software Requirements
1.  **Node.js (LTS Version)**
    *   Download: [Node.js v20.x (LTS)](https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi)
2.  **IIS URL Rewrite Module 2.1**
    *   Download: [URL Rewrite 2.1](https://www.iis.net/downloads/microsoft/url-rewrite)
3.  **Application Request Routing (ARR) 3.0**
    *   Download: [ARR 3.0](https://www.iis.net/downloads/microsoft/application-request-routing)
4.  **Microsoft OLE DB Driver for SQL Server**
    *   Download: [OLE DB Driver 19](https://go.microsoft.com/fwlink/?linkid=2270624)
5.  **PM2 (Process Manager)**
    *   Open PowerShell as Admin and run: `npm install -g pm2`

### IIS Roles & Features
*   **Method:** Server Manager > Add Roles and Features OR "Turn Windows features on or off".
*   **Required Features:**
    *   Web Server > Common HTTP Features > **Static Content**
    *   Web Server > Common HTTP Features > **Default Document**
    *   Web Server > Common HTTP Features > **HTTP Errors**
    *   Application Development > **WebSocket Protocol**
    *   Application Development > **CGI**

---

## 2. Server Configuration

### Enable Reverse Proxy
1.  Open **IIS Manager**.
2.  Select the Server Node.
3.  Open **Application Request Routing Cache** > **Server Proxy Settings**.
4.  Check **Enable proxy** and click **Apply**.

---

## 3. Deployment Steps

A deployment package has been generated at: `deployment_package/`
It contains two folders: `deployment_package/frontend` and `deployment_package/backend`.

### Step 3.1: File Setup
1.  Create a folder `C:\inetpub\wwwroot\EMS`.
2.  Copy contents of `deployment_package/frontend` to `C:\inetpub\wwwroot\EMS\Frontend`.
3.  Copy contents of `deployment_package/backend` to `C:\inetpub\wwwroot\EMS\Backend`.

### Step 3.2: Backend Setup
1.  Navigate to `C:\inetpub\wwwroot\EMS\Backend`.
2.  Open PowerShell as Admin here.
3.  Run `npm install --production`.
4.  Create a `.env` file with your DB credentials (see `server/.env.example` or ask dev).
5.  Start the server:
    ```powershell
    pm2 start index.js --name "EMS_Backend"
    pm2 save
    pm2 startup
    ```

### Step 3.3: IIS Website Setup
1.  Open **IIS Manager**.
2.  Add Website > Name: `EMS` > Path: `C:\inetpub\wwwroot\EMS\Frontend`.
3.  Set Port (e.g., 80) and Host Name.
4.  Click OK.

The application is now live. The `web.config` in the Frontend folder handles routing to the React app and proxying API calls to the Node.js backend.
