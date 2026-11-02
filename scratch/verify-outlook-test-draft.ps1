$ErrorActionPreference='Stop'
$outlookApp=[Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
$found=$false
for($i=$outlookApp.Inspectors.Count;$i -ge 1;$i--){
 $mail=$outlookApp.Inspectors.Item($i).CurrentItem
 if($mail.Subject -eq 'EMS Outlook connection test - DO NOT SEND - 20261031'){
  $names=@()
  for($j=1;$j -le $mail.Attachments.Count;$j++){
   $att=$mail.Attachments.Item($j);$names+=$att.FileName
   if($att.FileName -eq 'EMS_Connection_Test.pdf'){$att.SaveAsFile((Join-Path (Get-Location) 'e2e/artifacts/outlook-production/returned-attachment.pdf'))}
  }
  $proof=@{subject=$mail.Subject;sent=$mail.Sent;recipients=$mail.Recipients.Count;attachments=$names;draftVerified=$true}
  $proof|ConvertTo-Json|Set-Content e2e/artifacts/outlook-production/outlook-com-validation.json -Encoding UTF8
  $proof|ConvertTo-Json -Compress
  $mail.Close(1);$found=$true
 }
}
if(-not $found){throw 'The labelled test draft was not found.'}
$original=(Get-FileHash e2e/artifacts/outlook-production/connection-test.pdf).Hash
$returned=(Get-FileHash e2e/artifacts/outlook-production/returned-attachment.pdf).Hash
if($original -ne $returned){throw 'PDF attachment bytes differ'}
Write-Host 'PDF attachment hash matches. Test draft discarded without sending.'
