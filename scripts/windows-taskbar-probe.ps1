param([long]$WindowHandle, [switch]$RequireThreadDeck)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ThreadDeckTaskbar {
  [StructLayout(LayoutKind.Sequential)] public struct PropertyKey {
    public Guid format; public uint id;
    public PropertyKey(uint value) { format = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"); id = value; }
  }
  [StructLayout(LayoutKind.Explicit, Size=24)] public struct Value {
    [FieldOffset(0)] public ushort type;
    [FieldOffset(8)] public IntPtr text;
  }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface Store {
    void GetCount(out uint count);
    void GetAt(uint index, out PropertyKey key);
    void GetValue(ref PropertyKey key, out Value value);
    void SetValue(ref PropertyKey key, ref Value value);
    void Commit();
  }
  [DllImport("shell32.dll", PreserveSig=false)] static extern void SHGetPropertyStoreForWindow(IntPtr window, ref Guid id, out Store store);
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref Value value);
  public static string Read(long window, uint id) {
    Guid iid = typeof(Store).GUID; Store store;
    SHGetPropertyStoreForWindow(new IntPtr(window), ref iid, out store);
    try {
      PropertyKey key = new PropertyKey(id); Value value;
      store.GetValue(ref key, out value);
      try { return value.type == 31 ? Marshal.PtrToStringUni(value.text) : ""; }
      finally { PropVariantClear(ref value); }
    } finally { Marshal.ReleaseComObject(store); }
  }
}
'@
if (!$WindowHandle) {
  $process = Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq 'ThreadDeck' } | Select-Object -First 1
  if (!$process) { throw 'No visible ThreadDeck window found' }
  $WindowHandle = $process.MainWindowHandle.ToInt64()
}
$result = [PSCustomObject]@{
  appId = [ThreadDeckTaskbar]::Read($WindowHandle, 5)
  relaunchCommand = [ThreadDeckTaskbar]::Read($WindowHandle, 2)
  relaunchIcon = [ThreadDeckTaskbar]::Read($WindowHandle, 3)
  relaunchName = [ThreadDeckTaskbar]::Read($WindowHandle, 4)
}
$result | ConvertTo-Json -Compress
if ($RequireThreadDeck -and ($result.appId -ne 'ThreadDeck' -or !$result.relaunchIcon -or !$result.relaunchName -or !$result.relaunchCommand)) {
  throw 'ThreadDeck taskbar identity/icon/relaunch metadata is incomplete'
}
