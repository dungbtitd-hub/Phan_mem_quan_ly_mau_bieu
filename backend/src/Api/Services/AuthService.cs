namespace FormPortal.Api.Services;

public class AuthService(AppDbContext db, IPasswordHasher hasher, IAuditService audit)
{
    private const int MaxFailures = 5;
    private static readonly TimeSpan LockDuration = TimeSpan.FromMinutes(15);
    public const string GenericError = "Đăng nhập không thành công. Vui lòng kiểm tra thông tin hoặc liên hệ quản trị viên.";

    public async Task<(User User, List<string> Roles)> LoginAsync(string username, string password, CancellationToken ct)
    {
        var name = username.Trim();
        var lowered = name.ToLower();
        var user = await db.Users.Include(u => u.UserRoles).ThenInclude(r => r.Role)
            .FirstOrDefaultAsync(u => u.Username.ToLower() == lowered, ct);
        var now = DateTime.UtcNow;

        if (user is null)
        {
            hasher.BurnTime(password);
            await audit.WriteAsync("auth.login", "user", null, false, new { reason = "unknown_user" }, null, name);
            throw new AppException("AUTH_FAILED", GenericError, 401);
        }

        if (user.Status != UserStatus.Active || (user.LockedUntil is { } until && until > now))
        {
            hasher.BurnTime(password);
            await audit.WriteAsync("auth.login", "user", user.Id.ToString(), false,
                new { reason = user.Status != UserStatus.Active ? "account_" + user.Status : "temporarily_locked" }, user.Id, user.Username);
            throw new AppException("AUTH_FAILED", GenericError, 401);
        }

        if (!hasher.Verify(password, user.PasswordHash))
        {
            user.FailedLoginCount++;
            var lockedNow = user.FailedLoginCount >= MaxFailures;
            if (lockedNow) { user.LockedUntil = now + LockDuration; user.FailedLoginCount = 0; }
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("auth.login", "user", user.Id.ToString(), false,
                new { reason = "bad_password", lockedNow }, user.Id, user.Username);
            throw new AppException("AUTH_FAILED", GenericError, 401);
        }

        user.FailedLoginCount = 0;
        user.LockedUntil = null;
        user.LastLoginAt = now;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("auth.login", "user", user.Id.ToString(), true, null, user.Id, user.Username);
        return (user, user.UserRoles.Select(r => r.Role.Code).ToList());
    }
}
