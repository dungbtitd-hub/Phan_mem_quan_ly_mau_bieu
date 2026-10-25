using System.Security.Cryptography;
using System.Text;
using Konscious.Security.Cryptography;

namespace FormPortal.Api.Services;

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string password, string stored);
    /// <summary>Tiêu tốn thời gian tương đương một lần xác thực để tránh lộ việc tài khoản có tồn tại.</summary>
    void BurnTime(string password);
}

public class PasswordHasher : IPasswordHasher
{
    private const int MemoryKiB = 65536, Iterations = 3, Parallelism = 2, SaltBytes = 16, HashBytes = 32;
    private readonly string _dummy;

    public PasswordHasher() => _dummy = Hash(Guid.NewGuid().ToString());

    public string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltBytes);
        var hash = Compute(password, salt, MemoryKiB, Iterations, Parallelism, HashBytes);
        return $"argon2id$m={MemoryKiB},t={Iterations},p={Parallelism}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    public bool Verify(string password, string stored)
    {
        try
        {
            var parts = stored.Split('$');
            if (parts.Length != 4 || parts[0] != "argon2id") return false;
            var prm = parts[1].Split(',').Select(x => x.Split('=')).ToDictionary(x => x[0], x => int.Parse(x[1]));
            var salt = Convert.FromBase64String(parts[2]);
            var expected = Convert.FromBase64String(parts[3]);
            var actual = Compute(password, salt, prm["m"], prm["t"], prm["p"], expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (Exception ex) when (ex is FormatException or KeyNotFoundException or IndexOutOfRangeException or OverflowException)
        {
            return false;
        }
    }

    public void BurnTime(string password) => Verify(password, _dummy);

    private static byte[] Compute(string password, byte[] salt, int memory, int iterations, int parallelism, int length)
    {
        using var argon = new Argon2id(Encoding.UTF8.GetBytes(password))
        {
            Salt = salt,
            MemorySize = memory,
            Iterations = iterations,
            DegreeOfParallelism = parallelism
        };
        return argon.GetBytes(length);
    }
}

public static class PasswordPolicy
{
    private const string Lower = "abcdefghijkmnpqrstuvwxyz", Upper = "ABCDEFGHJKLMNPQRSTUVWXYZ",
        Digits = "23456789", Symbols = "!@#$%^&*-_=+";

    /// <summary>Trả về thông báo lỗi tiếng Việt nếu mật khẩu không đạt, ngược lại trả về null.</summary>
    public static string? Validate(string password, string username)
    {
        if (password.Length < 10) return "Mật khẩu phải có ít nhất 10 ký tự";
        if (password.Length > 128) return "Mật khẩu không được dài quá 128 ký tự";
        var classes = new[]
        {
            password.Any(char.IsLower), password.Any(char.IsUpper), password.Any(char.IsDigit),
            password.Any(c => !char.IsLetterOrDigit(c))
        }.Count(x => x);
        if (classes < 3) return "Mật khẩu phải gồm ít nhất 3 trong 4 loại: chữ thường, chữ hoa, chữ số, ký tự đặc biệt";
        if (username.Length >= 3 && password.Contains(username, StringComparison.OrdinalIgnoreCase))
            return "Mật khẩu không được chứa tên đăng nhập";
        return null;
    }

    public static string Generate()
    {
        var chars = new List<char>
        {
            Pick(Lower), Pick(Upper), Pick(Digits), Pick(Symbols)
        };
        var all = Lower + Upper + Digits + Symbols;
        while (chars.Count < 16) chars.Add(Pick(all));
        for (var i = chars.Count - 1; i > 0; i--)
        {
            var j = RandomNumberGenerator.GetInt32(i + 1);
            (chars[i], chars[j]) = (chars[j], chars[i]);
        }
        return new string(chars.ToArray());
    }

    private static char Pick(string s) => s[RandomNumberGenerator.GetInt32(s.Length)];
}
