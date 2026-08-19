<#
    Crea (o repara) los accesos directos de BONK y les graba su AppUserModelID.

    Windows saca el nombre y el icono de la cabecera de las notificaciones del
    acceso directo del menú Inicio cuyo AppUserModelID coincide con el que
    declara la aplicación. Si no encuentra ninguno, resuelve por el ejecutable
    que la lanza: aquí, el motor de Electron, con su nombre y su átomo. Por eso
    también se retira el «Electron.lnk» que quedó suelto en el menú Inicio, que
    era exactamente lo que Windows estaba encontrando.

    El .lnk se crea con WScript.Shell, que es trivial, y la propiedad se graba
    con IPropertyStore, que no se puede tocar desde PowerShell sin bajar a COM.

    Uso:
      powershell -ExecutionPolicy Bypass -File shortcut.ps1 -Target <exe> -Arguments <args> -Icon <ico>
#>
param(
  [Parameter(Mandatory = $true)][string]$Target,
  [string]$Arguments = '',
  [string]$Icon = '',
  [string]$Name = 'BONK',
  [string]$AppId = 'com.bonk.desktop'
)

$ErrorActionPreference = 'Stop'

Add-Type -Namespace Bonk -Name Lnk -MemberDefinition @'
[DllImport("ole32.dll")] private static extern int CoCreateInstance(
    ref Guid clsid, IntPtr outer, uint ctx, ref Guid iid, out IntPtr obj);

[StructLayout(LayoutKind.Sequential)]
private struct PropertyKey { public Guid fmtid; public int pid; }

[StructLayout(LayoutKind.Sequential)]
private struct PropVariant {
    public ushort vt; ushort r1, r2, r3;
    public IntPtr p; int p2; IntPtr p3;
}

[ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"),
 InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
private interface IPropertyStore {
    int GetCount(out uint c);
    int GetAt(uint i, out PropertyKey key);
    int GetValue(ref PropertyKey key, out PropVariant value);
    int SetValue(ref PropertyKey key, ref PropVariant value);
    int Commit();
}

[ComImport, Guid("0000010b-0000-0000-C000-000000000046"),
 InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
private interface IPersistFile {
    void GetClassID(out Guid id);
    [PreserveSig] int IsDirty();
    void Load([MarshalAs(UnmanagedType.LPWStr)] string file, uint mode);
    void Save([MarshalAs(UnmanagedType.LPWStr)] string file, [MarshalAs(UnmanagedType.Bool)] bool remember);
    void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string file);
    void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string file);
}

// El identificador vive en la propiedad 5 del conjunto System.AppUserModel.
public static void SetAppId(string lnk, string appId) {
    Guid clsid = new Guid("00021401-0000-0000-C000-000000000046");
    Guid iidUnknown = new Guid("00000000-0000-0000-C000-000000000046");
    IntPtr raw;
    int hr = CoCreateInstance(ref clsid, IntPtr.Zero, 1, ref iidUnknown, out raw);
    if (hr != 0) throw new COMException("No se pudo crear el objeto ShellLink", hr);

    object link = Marshal.GetObjectForIUnknown(raw);
    Marshal.Release(raw);

    ((IPersistFile)link).Load(lnk, 2); // STGM_READWRITE: hay que volver a guardarlo

    PropertyKey key = new PropertyKey();
    key.fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
    key.pid = 5;

    PropVariant value = new PropVariant();
    value.vt = 31; // VT_LPWSTR
    value.p = Marshal.StringToCoTaskMemUni(appId);

    IPropertyStore store = (IPropertyStore)link;
    Marshal.ThrowExceptionForHR(store.SetValue(ref key, ref value));
    Marshal.ThrowExceptionForHR(store.Commit());

    ((IPersistFile)link).Save(lnk, true);
    Marshal.FreeCoTaskMem(value.p);
    Marshal.ReleaseComObject(link);
}
'@

$shell = New-Object -ComObject WScript.Shell
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$desktop = [Environment]::GetFolderPath('Desktop')

foreach ($folder in @($startMenu, $desktop)) {
  $path = Join-Path $folder "$Name.lnk"
  $link = $shell.CreateShortcut($path)
  $link.TargetPath = $Target
  $link.Arguments = $Arguments
  $link.WorkingDirectory = Split-Path $Target
  $link.Description = 'Gestor de finanzas personales'
  if ($Icon -and (Test-Path $Icon)) { $link.IconLocation = "$Icon,0" }
  $link.Save()
  [Bonk.Lnk]::SetAppId($path, $AppId)
  "  $path"
}

# El intruso: apunta al motor de Electron pelado, no abre nada útil y es lo que
# Windows encontraba al resolver quién manda los avisos.
$intruso = Join-Path $startMenu 'Electron.lnk'
if (Test-Path $intruso) {
  Remove-Item $intruso -Force
  '  (retirado Electron.lnk del menú Inicio)'
}
