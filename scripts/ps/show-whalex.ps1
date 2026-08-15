# Finds the Whalex Electron window via EnumWindows (its Win32 title can read
# as empty through Get-Process) and restores + foregrounds it.
Add-Type @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class WFind {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  public static List<IntPtr> Find(HashSet<uint> pids) {
    var found = new List<IntPtr>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (!pids.Contains(pid)) return true;
      var sb = new StringBuilder(256); GetClassName(h, sb, 256);
      if (sb.ToString() == "Chrome_WidgetWin_1") found.Add(h);
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
'@
$pids = New-Object 'System.Collections.Generic.HashSet[uint32]'
Get-Process electron -ErrorAction SilentlyContinue | ForEach-Object { [void]$pids.Add([uint32]$_.Id) }
$wins = [WFind]::Find($pids)
if ($wins.Count -eq 0) { Write-Error 'no window'; exit 1 }
foreach ($w in $wins) {
  [WFind]::ShowWindow($w, 9) | Out-Null   # SW_RESTORE
  [WFind]::SetForegroundWindow($w) | Out-Null
}
Write-Output ("shown " + $wins.Count)
