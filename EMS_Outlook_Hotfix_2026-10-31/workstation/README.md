# EMS quote Outlook workstation helper

Install on each estimator's Windows PC, under that person's normal login.
Do not install under IIS, PM2, a Windows service, or the server's SYSTEM account.

Requires Node.js 22+ and Classic Outlook configured with the user's mail profile.
Unzip the complete workstation folder locally. Run INSTALL.cmd. Company script
policy must allow the installer; do not disable security controls to run it.
For a different EMS address, use `powershell -NoProfile -File install.ps1 -EmsOrigin https://ems.your-domain.example`.

It installs in `%LOCALAPPDATA%\EMS\OutlookClient` and creates a per-user Startup
shortcut. No administrator rights, backend files, database credentials, npm
installation, SMTP account or server Office installation are needed. It listens
only on 127.0.0.1:39281 and accepts draft requests only from its configured EMS
origin. `http://127.0.0.1:39281/health` reports version 2026-10-31.1.

**Automatic browser handoff requires a trusted HTTPS EMS address and permission
to access the workstation's loopback network.** Plain HTTP network origins are
blocked by current Chromium browsers. Installing the helper alone cannot remove
that browser restriction. Do not use disabled browser security or untrusted
certificate exceptions as a production solution. Use the .eml fallback until
trusted HTTPS is configured.

This helper handles quote drafts only. Do not replace an already-running legacy
enquiry helper without assessing its enquiry notification/acknowledgement use.
The installer refuses to replace a listening helper. Nothing is sent by this
quote helper; the user reviews and sends the displayed draft in Outlook.

To uninstall: remove the `EMS Quote Outlook Helper` shortcut from `shell:startup`,
sign out, then remove `%LOCALAPPDATA%\EMS\OutlookClient`. To change EMS origin,
sign out/in without the startup shortcut or stop this helper's own Node process,
then reinstall with the new origin. Avoid stopping unrelated Node processes.
