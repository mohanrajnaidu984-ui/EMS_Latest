# IIS Application Update Guide

This guide explains how to update your existing EMS application on the IIS server to the latest version.

## 1. Prerequisites

*   A new deployment package (generated in `deployment_package` folder).
*   Access to the server (Remote Desktop or physical access).
*   Administrator permissions.

## 2. Backup Current Deployment (Critical)

Before changing anything, always create a backup.

1.  Navigate to your IIS root folder (e.g., `C:\inetpub\wwwroot\EMS`).
2.  Copy the entire `EMS` folder.
3.  Paste it in a safe location (e.g., `C:\Backups\EMS_Backup_YYYY_MM_DD`).

## 3. Update Procedure

### Step 3.1: Stop the Backend Service
Platform: PowerShell (Admin)
1.  Open PowerShell as Administrator.
2.  Run the following command to stop the backend process:
    ```powershell
    pm2 stop EMS_Backend
    ```

### Step 3.2: Update Frontend Files
1.  Navigate to the **Frontend** folder on the server (e.g., `C:\inetpub\wwwroot\EMS\Frontend`).
2.  **Delete** all contents inside this folder.
3.  Copy the contents of your **Active Deployment Package** `deployment_package/frontend` into this empty folder.
    *   *Note: This ensures old build files are removed.*

### Step 3.3: Update Backend Files
1.  Navigate to the **Backend** folder on the server (e.g., `C:\inetpub\wwwroot\EMS\Backend`).
2.  **Delete** all files and folders **EXCEPT**:
    *   `node_modules` (Folder)
    *   `.env` (File)
    *   `uploads` (Folder - if any user uploads exist)
3.  Copy the contents of your **Active Deployment Package** `deployment_package/backend` into this folder.
    *   *Note: If prompted, overwrite files.*

### Step 3.4: Install New Dependencies (If any)
Platform: PowerShell (Admin) inside Backend folder
1.  In your PowerShell window, navigate to the backend folder:
    ```powershell
    cd C:\inetpub\wwwroot\EMS\Backend
    ```
2.  Run installation to ensure any new libraries are added:
    ```powershell
    npm install --production
    ```

### Step 3.5: Restart Backend Service
Platform: PowerShell (Admin)
1.  Restart the application:
    ```powershell
    pm2 restart EMS_Backend
    ```

## 4. Verification

1.  Open your browser and navigate to your site.
2.  Press `Ctrl + F5` to hard refresh (clear cache).
3.  Verify the version/changes.
4.  Test a critical flow (e.g., Login, Search Enquiry).

## 5. Rollback (In case of issues)

If something breaks:
1.  Stop the backend: `pm2 stop EMS_Backend`.
2.  Delete the current `EMS` folder content.
3.  Restore everything from your backup `EMS_Backup_YYYY_MM_DD` to `C:\inetpub\wwwroot\EMS`.
4.  Restart backend: `pm2 restart EMS_Backend`.
