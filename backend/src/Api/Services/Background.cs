using Npgsql;

namespace FormPortal.Api.Services;

/// <summary>Kiểm tra database, thư mục tệp và tạo tài khoản Admin đầu tiên khi khởi động.</summary>
public class StartupInitializer(IServiceProvider sp, IOptions<AdminSeedOptions> seed, IOptions<UploadOptions> upload,
    IPasswordHasher hasher, ILogger<StartupInitializer> log) : IHostedService
{
    public async Task StartAsync(CancellationToken ct)
    {
        Directory.CreateDirectory(upload.Value.StoragePath);
        using var scope = sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        for (var attempt = 1; ; attempt++)
        {
            try { if (await db.Database.CanConnectAsync(ct)) break; }
            catch (Exception ex) when (ex is not OperationCanceledException) { log.LogWarning("Chưa kết nối được database: {Message}", ex.Message); }
            if (attempt >= 30) throw new InvalidOperationException("Không kết nối được database sau 30 lần thử");
            log.LogInformation("Chờ database sẵn sàng (lần {Attempt}/30)", attempt);
            await Task.Delay(TimeSpan.FromSeconds(2), ct);
        }

        short? adminRoleId;
        try { adminRoleId = await db.Roles.Where(r => r.Code == RoleCodes.Admin).Select(r => (short?)r.Id).FirstOrDefaultAsync(ct); }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UndefinedTable)
        {
            throw new InvalidOperationException("Database chưa có schema. Chạy scripts/migrate.sh trước khi khởi động API.");
        }
        if (adminRoleId is null)
            throw new InvalidOperationException("Database chưa có dữ liệu tham chiếu (vai trò). Chạy scripts/migrate.sh trước khi khởi động API.");

        if (await db.UserRoles.AnyAsync(r => r.RoleId == adminRoleId, ct)) return;

        var o = seed.Value;
        if (string.IsNullOrWhiteSpace(o.Username) || string.IsNullOrWhiteSpace(o.Password))
            throw new InvalidOperationException("Chưa có tài khoản Admin. Đặt AdminSeed__Username và AdminSeed__Password (ADMIN_INITIAL_USERNAME, ADMIN_INITIAL_PASSWORD).");
        if (o.Password.StartsWith("__", StringComparison.Ordinal))
            throw new InvalidOperationException("ADMIN_INITIAL_PASSWORD vẫn là giá trị mẫu trong .env.example. Hãy đặt mật khẩu tạm thời riêng.");
        var policy = PasswordPolicy.Validate(o.Password, o.Username!);
        if (policy is not null) throw new InvalidOperationException("Mật khẩu Admin khởi tạo không đạt chính sách: " + policy);

        var admin = new User
        {
            Username = o.Username!.Trim(), FullName = "Quản trị viên hệ thống",
            PasswordHash = hasher.Hash(o.Password), MustChangePassword = true
        };
        admin.UserRoles.Add(new UserRole { UserId = admin.Id, RoleId = adminRoleId.Value });
        db.Users.Add(admin);
        await db.SaveChangesAsync(ct);
        log.LogInformation("Đã tạo tài khoản Admin khởi tạo '{Username}' (bắt buộc đổi mật khẩu lần đầu)", admin.Username);
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;
}

/// <summary>Mỗi giờ chuyển các phiên bản đã quá ngày hết hiệu lực sang "Hết hiệu lực".</summary>
public class ExpiryService(IServiceProvider sp, ILogger<ExpiryService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(30), ct); } catch (OperationCanceledException) { return; }
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        do
        {
            try { await RunOnceAsync(ct); }
            catch (Exception ex) when (ex is not OperationCanceledException) { log.LogError(ex, "Lỗi khi cập nhật trạng thái hết hiệu lực"); }
        }
        while (await WaitAsync(timer, ct));
    }

    private static async Task<bool> WaitAsync(PeriodicTimer timer, CancellationToken ct)
    {
        try { return await timer.WaitForNextTickAsync(ct); } catch (OperationCanceledException) { return false; }
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        using var scope = sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var today = Clock.TodayVn;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var expired = await db.FormVersions.Include(v => v.Form)
            .Where(v => v.Status == VersionStatus.Active && v.ExpiryDate != null && v.ExpiryDate < today)
            .ToListAsync(ct);
        if (expired.Count == 0) return;
        foreach (var v in expired)
        {
            v.Status = VersionStatus.Expired;
            if (v.Form.CurrentVersionId == v.Id) v.Form.CurrentVersionId = null;
            db.ApprovalHistory.Add(new ApprovalHistory { VersionId = v.Id, ActorId = null, Action = ApprovalAction.Expire, Reason = "Quá ngày hết hiệu lực" });
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        log.LogInformation("Đã chuyển {Count} phiên bản sang trạng thái hết hiệu lực", expired.Count);
    }
}
