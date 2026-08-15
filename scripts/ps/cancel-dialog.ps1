# Closes any stray Electron file dialog (AutomationId 2 = IDCANCEL).
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ClassNameProperty, '#32770')
$dialogs = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)
foreach ($d in $dialogs) {
  $proc = Get-Process -Id $d.Current.ProcessId -ErrorAction SilentlyContinue
  if ($proc -and $proc.ProcessName -eq 'electron') {
    $btnCond = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::AutomationIdProperty, '2')
    $btn = $d.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $btnCond)
    if ($btn) {
      $btn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
      Write-Output 'cancelled'
    }
  }
}
Write-Output 'done'
