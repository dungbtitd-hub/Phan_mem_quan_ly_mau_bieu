using System.Buffers.Binary;
using System.IO.Compression;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;

namespace FormPortal.Api.Services;

public record StoredFile(string StoredName, string Sha256, long Size, string ContentType, string OriginalName);

public interface IFileStorage
{
    Task<StoredFile> SaveAsync(IFormFile file, CancellationToken ct);
    Stream Open(string storedName);
    void Delete(string storedName);
}

public interface IVirusScanner { Task ScanAsync(string path, CancellationToken ct); }

public class NoOpScanner : IVirusScanner
{
    public Task ScanAsync(string path, CancellationToken ct) => Task.CompletedTask;
}

public class ClamAvScanner(IOptions<ClamAvOptions> options, ILogger<ClamAvScanner> log) : IVirusScanner
{
    public async Task ScanAsync(string path, CancellationToken ct)
    {
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(90));
            using var client = new TcpClient();
            await client.ConnectAsync(options.Value.Host, options.Value.Port, cts.Token);
            var ns = client.GetStream();
            await ns.WriteAsync("zINSTREAM\0"u8.ToArray(), cts.Token);

            await using var fs = File.OpenRead(path);
            var buf = new byte[64 * 1024];
            var len = new byte[4];
            int n;
            while ((n = await fs.ReadAsync(buf, cts.Token)) > 0)
            {
                BinaryPrimitives.WriteInt32BigEndian(len, n);
                await ns.WriteAsync(len, cts.Token);
                await ns.WriteAsync(buf.AsMemory(0, n), cts.Token);
            }
            BinaryPrimitives.WriteInt32BigEndian(len, 0);
            await ns.WriteAsync(len, cts.Token);

            using var reader = new StreamReader(ns, Encoding.ASCII);
            var resp = (await reader.ReadToEndAsync(cts.Token)).Trim('\0', '\n', ' ');
            if (resp.EndsWith("FOUND", StringComparison.Ordinal))
                throw new AppException("FILE_INFECTED", "Tệp bị phát hiện mã độc nên bị từ chối", 422);
            if (!resp.EndsWith("OK", StringComparison.Ordinal))
            {
                log.LogError("ClamAV trả về phản hồi không mong đợi: {Response}", resp);
                throw new AppException("SCAN_UNAVAILABLE", "Không quét được tệp, vui lòng thử lại sau", 503);
            }
        }
        catch (AppException) { throw; }
        catch (Exception ex)
        {
            // Từ chối tệp khi không quét được (fail closed)
            log.LogError(ex, "Lỗi kết nối ClamAV");
            throw new AppException("SCAN_UNAVAILABLE", "Không quét được tệp, vui lòng thử lại sau", 503);
        }
    }
}

public class FileStorage(IOptions<UploadOptions> options, IVirusScanner scanner, ILogger<FileStorage> log) : IFileStorage
{
    private static readonly Dictionary<string, string> ContentTypes = new()
    {
        ["pdf"] = "application/pdf",
        ["doc"] = "application/msword",
        ["xls"] = "application/vnd.ms-excel",
        ["docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ["xlsx"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    };
    private static readonly byte[] OleSignature = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

    private string Root => options.Value.StoragePath;

    public async Task<StoredFile> SaveAsync(IFormFile file, CancellationToken ct)
    {
        var o = options.Value;
        if (file is null || file.Length == 0) throw AppException.Validation("Chưa chọn tệp hoặc tệp rỗng");
        if (file.Length > o.MaxBytes)
            throw new AppException("FILE_TOO_LARGE", $"Tệp vượt quá {o.MaxBytes / 1024 / 1024} MB", 413);

        var original = Path.GetFileName(file.FileName ?? "");
        original = new string(original.Where(c => !char.IsControl(c)).ToArray()).Trim();
        if (original.Length == 0) throw AppException.Validation("Tên tệp không hợp lệ");
        if (original.Length > 300) original = original[^300..];
        var ext = Path.GetExtension(original).TrimStart('.').ToLowerInvariant();
        if (!o.AllowedExtensions.Contains(ext) || !ContentTypes.ContainsKey(ext))
            throw new AppException("FILE_TYPE_NOT_ALLOWED",
                $"Chỉ chấp nhận các loại tệp: {string.Join(", ", o.AllowedExtensions)}", 415);

        var tmpDir = Path.Combine(Root, "tmp");
        Directory.CreateDirectory(tmpDir);
        var tmp = Path.Combine(tmpDir, Guid.NewGuid().ToString("N"));
        try
        {
            long total = 0;
            using var sha = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            await using (var input = file.OpenReadStream())
            await using (var output = new FileStream(tmp, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                var buf = new byte[81920];
                int n;
                while ((n = await input.ReadAsync(buf, ct)) > 0)
                {
                    total += n;
                    if (total > o.MaxBytes)
                        throw new AppException("FILE_TOO_LARGE", $"Tệp vượt quá {o.MaxBytes / 1024 / 1024} MB", 413);
                    sha.AppendData(buf, 0, n);
                    await output.WriteAsync(buf.AsMemory(0, n), ct);
                }
            }

            if (!ContentMatchesExtension(ext, tmp))
                throw new AppException("FILE_CONTENT_INVALID", "Nội dung tệp không khớp với định dạng hoặc không được phép (ví dụ tệp có macro)", 422);

            await scanner.ScanAsync(tmp, ct);

            var id = Guid.NewGuid().ToString("N");
            var finalDir = Path.Combine(Root, id[..2]);
            Directory.CreateDirectory(finalDir);
            File.Move(tmp, Path.Combine(finalDir, id));
            return new StoredFile(id, Convert.ToHexString(sha.GetHashAndReset()).ToLowerInvariant(), total, ContentTypes[ext], original);
        }
        catch
        {
            if (File.Exists(tmp)) File.Delete(tmp);
            throw;
        }
    }

    public Stream Open(string storedName)
    {
        var path = PathFor(storedName);
        if (!File.Exists(path))
        {
            log.LogError("Thiếu tệp {StoredName} trên kho lưu trữ", storedName);
            throw new AppException("FILE_MISSING", "Không tìm thấy tệp trên kho lưu trữ. Vui lòng liên hệ quản trị viên.", 500);
        }
        return new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
    }

    public void Delete(string storedName)
    {
        try { var p = PathFor(storedName); if (File.Exists(p)) File.Delete(p); }
        catch (Exception ex) { log.LogWarning(ex, "Không xóa được tệp {StoredName}", storedName); }
    }

    private string PathFor(string storedName)
    {
        if (!Guid.TryParseExact(storedName, "N", out _)) throw new AppException("FILE_MISSING", "Tên tệp lưu trữ không hợp lệ", 500);
        return Path.Combine(Root, storedName[..2], storedName);
    }

    private static bool ContentMatchesExtension(string ext, string path)
    {
        using var fs = File.OpenRead(path);
        var head = new byte[1024];
        var n = fs.Read(head, 0, head.Length);
        switch (ext)
        {
            case "pdf":
                return head.AsSpan(0, n).IndexOf("%PDF-"u8) >= 0;
            case "doc":
            case "xls":
                return n >= 8 && head.AsSpan(0, 8).SequenceEqual(OleSignature);
            case "docx":
            case "xlsx":
                if (n < 4 || head[0] != 0x50 || head[1] != 0x4B || head[2] != 0x03 || head[3] != 0x04) return false;
                fs.Position = 0;
                try
                {
                    using var zip = new ZipArchive(fs, ZipArchiveMode.Read, leaveOpen: true);
                    if (zip.Entries.Count > 10000) return false;
                    var names = zip.Entries.Select(e => e.FullName).ToList();
                    if (!names.Contains("[Content_Types].xml", StringComparer.OrdinalIgnoreCase)) return false;
                    if (names.Any(x => x.EndsWith("vbaProject.bin", StringComparison.OrdinalIgnoreCase))) return false; // macro
                    var prefix = ext == "docx" ? "word/" : "xl/";
                    return names.Any(x => x.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
                }
                catch (InvalidDataException) { return false; }
            default:
                return false;
        }
    }
}
