namespace FormPortal.Api.Controllers;

[ApiController, Route("api/applications")]
public class ApplicationsController(AppDbContext db, AccessService access, IAuditService audit, ICurrentUser me) : ControllerBase
{
    private IQueryable<ApplicationDto> Project(IQueryable<Application> q)
    {
        var privileged = access.Privileged;
        return q.Select(a => new ApplicationDto(a.Id, a.Code, a.Name, a.Description, a.OwnerUnit, a.ManagerId,
            db.Users.Where(u => u.Id == a.ManagerId).Select(u => u.FullName).FirstOrDefault(),
            a.Status,
            db.Forms.Count(f => f.ApplicationId == a.Id &&
                (privileged || (f.CurrentVersion != null && f.CurrentVersion.Status == VersionStatus.Active))),
            a.IsDemo, a.CreatedAt, a.UpdatedAt));
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? q, [FromQuery] string? status,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var query = access.VisibleApplications().AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q))
        {
            var folded = TextUtil.FoldedLike(q);
            var raw = TextUtil.RawLike(q);
            query = query.Where(a => EF.Functions.Like(AppDbContext.ImmutableUnaccent(a.Name).ToLower(), folded, "\\") ||
                                     EF.Functions.ILike(a.Code, raw, "\\"));
        }
        if (!string.IsNullOrWhiteSpace(status) && access.Privileged) query = query.Where(a => a.Status == status);
        var result = await Project(query.OrderBy(a => a.Name)).ToPagedAsync(page, pageSize, ct);
        return Ok(ApiResponse<PagedResult<ApplicationDto>>.Ok(result));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var dto = await Project(access.VisibleApplications().AsNoTracking().Where(a => a.Id == id)).FirstOrDefaultAsync(ct)
                  ?? throw AppException.NotFound("Không tìm thấy hệ thống ứng dụng");
        return Ok(ApiResponse<ApplicationDto>.Ok(dto));
    }

    [HttpPost, Authorize(Roles = RoleCodes.Admin)]
    public async Task<IActionResult> Create(ApplicationUpsertRequest req, CancellationToken ct)
    {
        var code = req.Code.Trim();
        var lowered = code.ToLower();
        if (await db.Applications.AnyAsync(a => a.Code.ToLower() == lowered, ct))
            throw AppException.Conflict("APP_CODE_EXISTS", "Mã hệ thống đã tồn tại");
        await EnsureManagerAsync(req.ManagerId, ct);
        var app = new Application
        {
            Code = code, Name = req.Name.Trim(), Description = req.Description?.Trim(),
            OwnerUnit = req.OwnerUnit?.Trim(), ManagerId = req.ManagerId
        };
        db.Applications.Add(app);
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("application.create", "application", app.Id.ToString(), true, new { app.Code });
        return StatusCode(201, ApiResponse<object>.Ok(new { app.Id }, "Đã tạo hệ thống ứng dụng"));
    }

    [HttpPut("{id:guid}"), Authorize(Roles = RoleCodes.Admin)]
    public async Task<IActionResult> Update(Guid id, ApplicationUpsertRequest req, CancellationToken ct)
    {
        var app = await db.Applications.FirstOrDefaultAsync(a => a.Id == id, ct) ?? throw AppException.NotFound("Không tìm thấy hệ thống ứng dụng");
        var code = req.Code.Trim();
        if (!string.Equals(code, app.Code, StringComparison.Ordinal))
        {
            if (await db.Forms.AnyAsync(f => f.ApplicationId == id, ct))
                throw AppException.Conflict("APP_CODE_LOCKED", "Không thể đổi mã hệ thống đã có mẫu biểu");
            var lowered = code.ToLower();
            if (await db.Applications.AnyAsync(a => a.Id != id && a.Code.ToLower() == lowered, ct))
                throw AppException.Conflict("APP_CODE_EXISTS", "Mã hệ thống đã tồn tại");
        }
        await EnsureManagerAsync(req.ManagerId, ct);
        app.Code = code;
        app.Name = req.Name.Trim();
        app.Description = req.Description?.Trim();
        app.OwnerUnit = req.OwnerUnit?.Trim();
        app.ManagerId = req.ManagerId;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("application.update", "application", id.ToString(), true, new { app.Code });
        return Ok(ApiResponse<object?>.Ok(null, "Đã cập nhật"));
    }

    [HttpPost("{id:guid}/lock"), Authorize(Roles = RoleCodes.Admin)]
    public Task<IActionResult> Lock(Guid id, CancellationToken ct) => SetStatus(id, AppStatus.Locked, "application.lock", "Đã khóa hệ thống ứng dụng", ct);

    [HttpPost("{id:guid}/unlock"), Authorize(Roles = RoleCodes.Admin)]
    public Task<IActionResult> Unlock(Guid id, CancellationToken ct) => SetStatus(id, AppStatus.Active, "application.unlock", "Đã mở khóa hệ thống ứng dụng", ct);

    [HttpGet("{id:guid}/permissions"), Authorize(Roles = RoleCodes.Admin)]
    public async Task<IActionResult> GetPermissions(Guid id, CancellationToken ct)
    {
        if (!await db.Applications.AnyAsync(a => a.Id == id, ct)) throw AppException.NotFound("Không tìm thấy hệ thống ứng dụng");
        var users = await db.ApplicationPermissions.Where(p => p.ApplicationId == id && p.UserId != null)
            .Join(db.Users, p => p.UserId, u => u.Id, (p, u) => new PermissionTarget(u.Id, u.FullName + " (" + u.Username + ")"))
            .ToListAsync(ct);
        var groups = await db.ApplicationPermissions.Where(p => p.ApplicationId == id && p.GroupId != null)
            .Join(db.UserGroups, p => p.GroupId, g => g.Id, (p, g) => new PermissionTarget(g.Id, g.Name))
            .ToListAsync(ct);
        return Ok(ApiResponse<PermissionsDto>.Ok(new PermissionsDto(users, groups)));
    }

    /// <summary>Thay toàn bộ quyền xem của hệ thống bằng danh sách mới.</summary>
    [HttpPut("{id:guid}/permissions"), Authorize(Roles = RoleCodes.Admin)]
    public async Task<IActionResult> SetPermissions(Guid id, PermissionsRequest req, CancellationToken ct)
    {
        if (!await db.Applications.AnyAsync(a => a.Id == id, ct)) throw AppException.NotFound("Không tìm thấy hệ thống ứng dụng");
        var userIds = req.UserIds.Distinct().ToList();
        var groupIds = req.GroupIds.Distinct().ToList();
        if (await db.Users.CountAsync(u => userIds.Contains(u.Id), ct) != userIds.Count ||
            await db.UserGroups.CountAsync(g => groupIds.Contains(g.Id), ct) != groupIds.Count)
            throw AppException.Validation("Danh sách chứa người dùng hoặc nhóm không tồn tại");

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        db.ApplicationPermissions.RemoveRange(await db.ApplicationPermissions.Where(p => p.ApplicationId == id).ToListAsync(ct));
        await db.SaveChangesAsync(ct);
        foreach (var uid in userIds) db.ApplicationPermissions.Add(new ApplicationPermission { ApplicationId = id, UserId = uid, GrantedBy = me.Id });
        foreach (var gid in groupIds) db.ApplicationPermissions.Add(new ApplicationPermission { ApplicationId = id, GroupId = gid, GrantedBy = me.Id });
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await audit.WriteAsync("application.set_permissions", "application", id.ToString(), true,
            new { users = userIds.Count, groups = groupIds.Count });
        return Ok(ApiResponse<object?>.Ok(null, "Đã cập nhật phân quyền"));
    }

    private async Task<IActionResult> SetStatus(Guid id, string status, string action, string message, CancellationToken ct)
    {
        var app = await db.Applications.FirstOrDefaultAsync(a => a.Id == id, ct) ?? throw AppException.NotFound("Không tìm thấy hệ thống ứng dụng");
        app.Status = status;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync(action, "application", id.ToString(), true, new { app.Code });
        return Ok(ApiResponse<object?>.Ok(null, message));
    }

    private async Task EnsureManagerAsync(Guid? managerId, CancellationToken ct)
    {
        if (managerId is { } m && !await db.Users.AnyAsync(u => u.Id == m, ct))
            throw AppException.Validation("Người quản lý không tồn tại");
    }
}
