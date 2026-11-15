Enquiry addendums
=================

New addendums record the creating user's email in CreatedByEmail, which is preserved on later edits and displayed as Addendum Added By in notification emails. The column is added automatically on first use after the API restarts. Older records retain NULL because their original creator email was not recorded. Addendum email rows use the same table renderer and 10pt font as the other enquiry rows, for both labels and values.

The Addendum + control is directly above Remarks. Each numbered addendum has its own details, public/private files and folders, and public/private download links. New attachments remain in the browser until Save Changes. Pending files can be removed; saved addendum attachments cannot be deleted, including through the API by an administrator.

Details are stored in dbo.EnquiryAddendums. Attachment records use the existing dbo.Attachments table with a nullable AddendumNo. Existing attachments retain NULL and their current behavior. New files use separate section folders under the existing configured ENQUIRY_ATTACHMENTS_ROOT: Enquiries/Public/<RequestNo>/Enquiry/<Division> for original enquiry files, and Enquiries/Public/<RequestNo>/Addendum-1/<Division> (Addendum-2, etc.) for addendum files. Private files follow the same structure under Enquiries/Private. Explicit public/private root overrides are still honored. Database FilePath records point to the actual stored file. Existing stored files stay in their original locations and remain accessible using their saved FilePath; this change does not migrate older files. The schema is created on first use; the API database account needs permission to create the table and add the column.

Update the frontend and backend together, then restart the API. Addendum and saved enquiry-update notifications go directly to the server and use the same SMTP transport, credentials, and sender rules as new-enquiry SMTP notifications. They do not require the desktop Outlook helper. Existing recipient lookup and notification exclusions continue to apply. The helper also shares the change-email template for compatibility with older callers.

Save Changes saves the enquiry, addendum details, and uploads in that order. Email runs after successful uploads, once for each changed addendum, or as an enquiry update when no addendum changed. Addendum subjects use “Addendum-# Received for Enquiry #### on dated DD-MMM-YY”. Supplementary received with lists the addendum's stored filenames (including extensions) in numbered order. Ordinary update emails list all enquiry filenames. The list includes private attachment names; download permissions remain unchanged.

If an upload fails, failed pending files remain available for retry and no change email is sent yet. Successfully stored addendum attachments are already protected from deletion. If notification fails, the saved enquiry stays open and the error is shown so the user can retry. This is a sequence of saves, not a distributed transaction across SQL, the file share, and email. Concurrent detail edits and numbering conflicts are rejected rather than overwritten.

Verification commands:

- node --test server/lib/__tests__/enquiryAddendums.test.cjs
- npx vitest run src/components/Enquiry/__tests__/addendumBlock.test.js
- npm run build

Automated checks use mocked persistence and do not send mail or write to the live attachment share. Deployment still requires a live save/reopen/upload/email smoke test with the site's database, share permissions, and mail configuration.
