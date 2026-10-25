namespace FormPortal.Api.Controllers;

[ApiController, Route("api")]
public class DashboardController(AppDbContext db, AccessService access, ICurrentUser me) : ControllerBase
{
    private static DateTime VnDayStartUtc(DateOnly d) => d.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc).AddHours(-7);

    /// <summary>Số liệu thật từ database; không có dữ liệu thì trả về số 0 hoặc danh sách rỗng.</summary>
    [HttpGet("dashboard/admin"), Authorize(Roles = RoleCodes.Admin)]
    public async Task<IActionResult> Admin([FromQuery] DateOnly? fromDate, [FromQuery] DateOnly? toDate, CancellationToken ct)
    {
        var today = Clock.TodayVn;
        var soon = today.AddDays(30);
        var fromUtc = VnDayStartUtc(fromDate ?? today.AddDays(-29));
        var toUtc = VnDayStartUtc((toDate ?? today).AddDays(1));

        var data = new
        {
            totals = new
            {
                applications = await db.Applications.CountAsync(ct),
                forms = await db.Forms.CountAsync(ct),
                activeVersions = await db.FormVersions.CountAsync(v => v.Status == VersionStatus.Active, ct),
                pendingVersions = await db.FormVersions.CountAsync(v => v.Status == VersionStatus.Pending, ct),
                expiringSoon = await db.FormVersions.CountAsync(v => v.Status == VersionStatus.Active && v.ExpiryDate != null && v.ExpiryDate <= soon, ct),
                activeUsers = await db.Users.CountAsync(u => u.Status == UserStatus.Active, ct),
                downloads = await db.DownloadLogs.CountAsync(d => d.DownloadedAt >= fromUtc && d.DownloadedAt < toUtc, ct)
            },
            formsByApplication = await db.Applications.Select(a => new { a.Code, a.Name, count = db.Forms.Count(f => f.ApplicationId == a.Id) })
                .OrderByDescending(x => x.count).Take(10).ToListAsync(ct),
            downloadsByDay = await db.DownloadLogs.Where(d => d.DownloadedAt >= fromUtc && d.DownloadedAt < toUtc)
                .GroupBy(d => d.DownloadedAt.Date).Select(g => new { day = g.Key, count = g.Count() })
                .OrderBy(x => x.day).ToListAsync(ct),
            recentVersions = await db.FormVersions.AsNoTracking().OrderByDescending(v => v.CreatedAt).Take(10)
                .Select(v => new { v.Id, v.FormId, formCode = v.Form.Code, formName = v.Form.Name, v.VersionNo, v.Status, v.CreatedAt, by = v.Creator.FullName })
                .ToListAsync(ct),
            expiringVersions = await db.FormVersions.AsNoTracking()
                .Where(v => v.Status == VersionStatus.Active && v.ExpiryDate != null && v.ExpiryDate <= soon)
                .OrderBy(v => v.ExpiryDate).Take(10)
                .Select(v => new { v.Id, v.FormId, formCode = v.Form.Code, formName = v.Form.Name, v.VersionNo, v.ExpiryDate })
                .ToListAsync(ct),
            recentAdminActions = await db.AuditLogs.AsNoTracking().Where(a => a.Result == "success" && a.Action != "file.download" && a.Action != "auth.login" && a.Action != "auth.logout")
                .OrderByDescending(a => a.OccurredAt).Take(10)
                .Select(a => new { a.OccurredAt, a.UsernameSnapshot, a.Action, a.ObjectType, a.ObjectId }).ToListAsync(ct)
        };
        return Ok(ApiResponse<object>.Ok(data));
    }

    /// <summary>Trang chủ người dùng: chỉ gồm hệ thống và mẫu biểu mà người dùng được phép xem.</summary>
    [HttpGet("dashboard/home")]
    public async Task<IActionResult> Home(CancellationToken ct)
    {
        var soon = Clock.TodayVn.AddDays(30);
        var forms = access.VisibleForms().Where(f => f.CurrentVersion != null && f.CurrentVersion.Status == VersionStatus.Active);

        var data = new
        {
            applications = await access.VisibleApplications().AsNoTracking().OrderBy(a => a.Name)
                .Select(a => new
                {
                    a.Id, a.Code, a.Name, a.Description,
                    formCount = db.Forms.Count(f => f.ApplicationId == a.Id && f.CurrentVersion != null && f.CurrentVersion.Status == VersionStatus.Active)
                }).ToListAsync(ct),
            recentForms = await forms.AsNoTracking().OrderByDescending(f => f.CurrentVersion!.ApprovedAt).Take(10)
                .Select(f => new { f.Id, f.Code, f.Name, applicationName = f.Application.Name, versionNo = f.CurrentVersion!.VersionNo, updatedAt = f.CurrentVersion!.ApprovedAt })
                .ToListAsync(ct),
            expiringForms = await forms.AsNoTracking()
                .Where(f => f.CurrentVersion!.ExpiryDate != null && f.CurrentVersion!.ExpiryDate <= soon)
                .OrderBy(f => f.CurrentVersion!.ExpiryDate).Take(10)
                .Select(f => new { f.Id, f.Code, f.Name, expiryDate = f.CurrentVersion!.ExpiryDate }).ToListAsync(ct),
            recentDownloads = await db.DownloadLogs.AsNoTracking().Where(d => d.UserId == me.Id)
                .OrderByDescending(d => d.DownloadedAt).Take(10)
                .Select(d => new { d.DownloadedAt, formId = d.Version.FormId, formCode = d.Version.Form.Code, formName = d.Version.Form.Name, d.Version.VersionNo })
                .ToListAsync(ct)
        };
        return Ok(ApiResponse<object>.Ok(data));
    }

    [HttpGet("audit-logs"), Authorize(Roles = RoleCodes.Admin)]
    public async Task<IActionResult> AuditLogs([FromQuery] DateOnly? fromDate, [FromQuery] DateOnly? toDate, [FromQuery] Guid? userId,
        [FromQuery] string? action, [FromQuery] string? result, [FromQuery] int page = 1, [FromQuery] int pageSize = 50,
        CancellationToken ct = default)
    {
        var q = db.AuditLogs.AsNoTracking().AsQueryable();
        if (fromDate is { } f) { var d = VnDayStartUtc(f); q = q.Where(a => a.OccurredAt >= d); }
        if (toDate is { } t) { var d = VnDayStartUtc(t.AddDays(1)); q = q.Where(a => a.OccurredAt < d); }
        if (userId is { } u) q = q.Where(a => a.UserId == u);
        if (!string.IsNullOrWhiteSpace(action)) { var like = TextUtil.RawLike(action); q = q.Where(a => EF.Functions.ILike(a.Action, like, "\\")); }
        if (!string.IsNullOrWhiteSpace(result)) q = q.Where(a => a.Result == result);

        var paged = await q.OrderByDescending(a => a.OccurredAt)
            .Select(a => new { a.Id, a.OccurredAt, a.UserId, a.UsernameSnapshot, a.Action, a.ObjectType, a.ObjectId, a.Result, a.IpAddress, a.RequestId, a.Detail })
            .ToPagedAsync(page, pageSize, ct);
        var items = paged.Items.Select(a => new AuditLogDto(a.Id, a.OccurredAt, a.UserId, a.UsernameSnapshot, a.Action,
            a.ObjectType, a.ObjectId, a.Result, a.IpAddress?.ToString(), a.RequestId, a.Detail)).ToList();
        return Ok(ApiResponse<PagedResult<AuditLogDto>>.Ok(new PagedResult<AuditLogDto>(items, paged.Page, paged.PageSize, paged.Total)));
    }

    /// <summary>Thống kê lượt tải theo mẫu biểu trong khoảng thời gian.</summary>
    [HttpGet("reports/downloads"), Authorize(Roles = RoleCodes.Admin)]
    public async Task<IActionResult> Downloads([FromQuery] DateOnly? fromDate, [FromQuery] DateOnly? toDate,
        [FromQuery] Guid? applicationId, CancellationToken ct)
    {
        var today = Clock.TodayVn;
        var fromUtc = VnDayStartUtc(fromDate ?? today.AddDays(-29));
        var toUtc = VnDayStartUtc((toDate ?? today).AddDays(1));
        var q = db.DownloadLogs.Where(d => d.DownloadedAt >= fromUtc && d.DownloadedAt < toUtc);
        if (applicationId is { } a) q = q.Where(d => d.Version.Form.ApplicationId == a);
        var rows = await q.GroupBy(d => new { d.Version.FormId, d.Version.Form.Code, d.Version.Form.Name })
            .Select(g => new { g.Key.FormId, g.Key.Code, g.Key.Name, downloads = g.Count(), users = g.Select(x => x.UserId).Distinct().Count() })
            .OrderByDescending(x => x.downloads).Take(200).ToListAsync(ct);
        return Ok(ApiResponse<object>.Ok(rows));
    }
}
