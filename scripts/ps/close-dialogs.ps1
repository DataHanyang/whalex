# Sends WM_CLOSE to every #32770 dialog owned by electron processes.
Add-Type @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class WClose {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
  public static int CloseAll(HashSet<uint> pids) {
    int n = 0;
    EnumWindows((h, l) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (!pids.Contains(pid)) return true;
      var sb = new StringBuilder(64); GetClassName(h, sb, 64);
      if (sb.ToString() == "#32770") {
        IntPtr r;
        SendMessageTimeout(h, 0x0010, IntPtr.Zero, IntPtr.Zero, 0x0002, 2000, out r);
        n++;
      }
      return true;
    }, IntPtr.Zero);
    return n;
  }
}
'@
$pids = New-Object 'System.Collections.Generic.HashSet[uint32]'
Get-Process electron -ErrorAction SilentlyContinue | ForEach-Object { [void]$pids.Add([uint32]$_.Id) }
Write-Output ("closed " + [WClose]::CloseAll($pids))
