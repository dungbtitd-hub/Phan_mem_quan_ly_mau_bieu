namespace FormPortal.Api.Config;

public class UploadOptions
{
    public long MaxBytes { get; set; } = 31457280;
    public string StoragePath { get; set; } = "/data/files";
    public string[] AllowedExtensions { get; set; } = ["docx", "xlsx", "pdf", "doc", "xls"];
}
public class ClamAvOptions
{
    public bool Enabled { get; set; }
    public string Host { get; set; } = "clamav";
    public int Port { get; set; } = 3310;
}
public class SecurityOptions { public string[] AllowedOrigins { get; set; } = []; }
public class AdminSeedOptions
{
    public string? Username { get; set; }
    public string? Password { get; set; }
}
