param([string]$Dir)
# Drives Electron's native folder-picker. ASCII-only on purpose (PS 5.1
# encoding); buttons are matched by AutomationId: 1 = IDOK, 2 = IDCANCEL.
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class W2 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
'@

function Find-ElectronDialog {
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $cond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ClassNameProperty, '#32770')
  $dialogs = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)
  foreach ($d in $dialogs) {
    $proc = Get-Process -Id $d.Current.ProcessId -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq 'electron') { return $d }
  }
  return $null
}

$deadline = (Get-Date).AddSeconds(10)
$dialog = $null
while ((Get-Date) -lt $deadline -and -not $dialog) {
  Start-Sleep -Milliseconds 300
  $dialog = Find-ElectronDialog
}
if (-not $dialog) { Write-Error 'dialog not found'; exit 1 }

[W2]::SetForegroundWindow([IntPtr]$dialog.Current.NativeWindowHandle) | Out-Null
Start-Sleep -Milliseconds 500

# Alt+D focuses the address bar; typing a path and Enter navigates into it.
[System.Windows.Forms.SendKeys]::SendWait('%d')
Start-Sleep -Milliseconds 400
[System.Windows.Forms.SendKeys]::SendWait($Dir)
Start-Sleep -Milliseconds 300
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
Start-Sleep -Milliseconds 1200

$okCond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::AutomationIdProperty, '1')
$select = $dialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $okCond)
if (-not $select) { Write-Error 'IDOK button not found'; exit 1 }
$select.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
Write-Output 'picked'
