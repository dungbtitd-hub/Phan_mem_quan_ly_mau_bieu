using DomainUser = FormPortal.Api.Domain.User;

namespace FormPortal.Api.Controllers;

[ApiController, Route("api/users"), Authorize(Roles = RoleCodes.Admin)]
public class UsersController(AppDbContext db, IPasswordHasher hasher, IAuditService audit, ICurrentUser me) : ControllerBase
{
    private IQueryable<UserDto> Project(IQueryable<DomainUser> q) => q.Select(u => new UserDto(
        u.Id, u.Username, u.FullName, u.Email, u.UnitName, u.Status,
        u.UserRoles.Select(r => r.Role.Code).ToList(), u.LastLoginAt, u.LockedUntil, u.CreatedAt));

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? q, [FromQuery] string? status, [FromQuery] string? role,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var query = db.Users.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(q))
        {
            var like = TextUtil.RawLike(q);
            var folded = TextUtil.FoldedLike(q);
            query = query.Where(u => EF.Functions.ILike(u.Username, like, "\\") ||
                                     EF.Functions.Like(AppDbContext.ImmutableUnaccent(u.FullName).ToLower(), folded, "\\"));
        }
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(u => u.Status == status);
        if (!string.IsNullOrWhiteSpace(role)) query = query.Where(u => u.UserRoles.Any(r => r.Role.Code == role));
        var result = await Project(query.OrderBy(u => u.Username)).ToPagedAsync(page, pageSize, ct);
        return Ok(ApiResponse<PagedResult<UserDto>>.Ok(result));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var dto = await Project(db.Users.AsNoTracking().Where(u => u.Id == id)).FirstOrDefaultAsync(ct)
                  ?? throw AppException.NotFound("Không tìm thấy người dùng");
        return Ok(ApiResponse<UserDto>.Ok(dto));
    }

    /// <summary>Tạo tài khoản với mật khẩu tạm thời sinh ngẫu nhiên, chỉ hiển thị một lần và bắt buộc đổi ở lần đăng nhập đầu.</summary>
    [HttpPost]
    public async Task<IActionResult> Create(UserCreateRequest req, CancellationToken ct)
    {
        var username = req.Username.Trim();
        var lowered = username.ToLower();
        if (await db.Users.AnyAsync(u => u.Username.ToLower() == lowered, ct))
            throw AppException.Conflict("USERNAME_EXISTS", "Tên đăng nhập đã tồn tại");
        var roleIds = await ResolveRolesAsync(req.Roles, ct);

        var temp = PasswordPolicy.Generate();
        var user = new DomainUser
        {
            Username = username, FullName = req.FullName.Trim(), Email = req.Email?.Trim(), UnitName = req.UnitName?.Trim(),
            PasswordHash = hasher.Hash(temp), MustChangePassword = true
        };
        foreach (var rid in roleIds) user.UserRoles.Add(new UserRole { UserId = user.Id, RoleId = rid });
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("user.create", "user", user.Id.ToString(), true, new { user.Username, roles = req.Roles });

        var dto = await Project(db.Users.AsNoTracking().Where(u => u.Id == user.Id)).FirstAsync(ct);
        return StatusCode(201, ApiResponse<CreatedUserDto>.Ok(new CreatedUserDto(dto, temp), "Đã tạo tài khoản"));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UserUpdateRequest req, CancellationToken ct)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct) ?? throw AppException.NotFound("Không tìm thấy người dùng");
        user.FullName = req.FullName.Trim();
        user.Email = req.Email?.Trim();
        user.UnitName = req.UnitName?.Trim();
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("user.update", "user", id.ToString(), true, new { user.Username });
        return Ok(ApiResponse<object?>.Ok(null, "Đã cập nhật"));
    }

    [HttpPost("{id:guid}/lock")]
    public async Task<IActionResult> Lock(Guid id, CancellationToken ct)
    {
        if (id == me.Id) throw AppException.Validation("Không thể tự khóa tài khoản của chính mình");
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct) ?? throw AppException.NotFound("Không tìm thấy người dùng");
        if (await IsLastActiveAdminAsync(user, ct))
            throw AppException.Conflict("LAST_ADMIN", "Không thể khóa quản trị viên đang hoạt động cuối cùng");
        user.Status = UserStatus.Locked;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("user.lock", "user", id.ToString(), true, new { user.Username });
        return Ok(ApiResponse<object?>.Ok(null, "Đã khóa tài khoản"));
    }

    [HttpPost("{id:guid}/unlock")]
    public async Task<IActionResult> Unlock(Guid id, CancellationToken ct)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct) ?? throw AppException.NotFound("Không tìm thấy người dùng");
        user.Status = UserStatus.Active;
        user.LockedUntil = null;
        user.FailedLoginCount = 0;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("user.unlock", "user", id.ToString(), true, new { user.Username });
        return Ok(ApiResponse<object?>.Ok(null, "Đã mở khóa tài khoản"));
    }

    [HttpPost("{id:guid}/reset-password")]
    public async Task<IActionResult> ResetPassword(Guid id, CancellationToken ct)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct) ?? throw AppException.NotFound("Không tìm thấy người dùng");
        var temp = PasswordPolicy.Generate();
        user.PasswordHash = hasher.Hash(temp);
        user.MustChangePassword = true;
        user.FailedLoginCount = 0;
        user.LockedUntil = null;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("user.reset_password", "user", id.ToString(), true, new { user.Username });
        Response.Headers.CacheControl = "no-store";
        return Ok(ApiResponse<TempPasswordDto>.Ok(new TempPasswordDto(temp), "Mật khẩu tạm thời chỉ hiển thị một lần"));
    }

    [HttpPut("{id:guid}/roles")]
    public async Task<IActionResult> SetRoles(Guid id, RolesRequest req, CancellationToken ct)
    {
        var user = await db.Users.Include(u => u.UserRoles).FirstOrDefaultAsync(u => u.Id == id, ct)
                   ?? throw AppException.NotFound("Không tìm thấy người dùng");
        var roleIds = await ResolveRolesAsync(req.Roles, ct);
        var adminRole = await db.Roles.Where(r => r.Code == RoleCodes.Admin).Select(r => r.Id).FirstAsync(ct);
        if (user.UserRoles.Any(r => r.RoleId == adminRole) && !roleIds.Contains(adminRole) &&
            await IsLastActiveAdminAsync(user, ct))
            throw AppException.Conflict("LAST_ADMIN", "Không thể gỡ vai trò của quản trị viên cuối cùng");

        db.UserRoles.RemoveRange(user.UserRoles);
        foreach (var rid in roleIds) db.UserRoles.Add(new UserRole { UserId = id, RoleId = rid });
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("user.set_roles", "user", id.ToString(), true, new { user.Username, roles = req.Roles });
        return Ok(ApiResponse<object?>.Ok(null, "Đã cập nhật vai trò"));
    }

    private async Task<List<short>> ResolveRolesAsync(List<string> codes, CancellationToken ct)
    {
        var distinct = codes.Select(c => c.Trim().ToLowerInvariant()).Distinct().ToList();
        if (distinct.Any(c => !RoleCodes.All.Contains(c))) throw AppException.Validation("Vai trò không hợp lệ");
        return await db.Roles.Where(r => distinct.Contains(r.Code)).Select(r => r.Id).ToListAsync(ct);
    }

    private async Task<bool> IsLastActiveAdminAsync(DomainUser user, CancellationToken ct)
    {
        var isAdmin = await db.UserRoles.AnyAsync(r => r.UserId == user.Id && r.Role.Code == RoleCodes.Admin, ct);
        if (!isAdmin) return false;
        var others = await db.Users.CountAsync(u => u.Id != user.Id && u.Status == UserStatus.Active &&
                                                    u.UserRoles.Any(r => r.Role.Code == RoleCodes.Admin), ct);
        return others == 0;
    }
}

[ApiController, Route("api/groups"), Authorize(Roles = RoleCodes.Admin)]
public class GroupsController(AppDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var items = await db.UserGroups.AsNoTracking().OrderBy(g => g.Name)
            .Select(g => new GroupDto(g.Id, g.Name, g.Description, db.UserGroupMembers.Count(m => m.GroupId == g.Id)))
            .ToListAsync(ct);
        return Ok(ApiResponse<List<GroupDto>>.Ok(items));
    }

    [HttpGet("{id:guid}/members")]
    public async Task<IActionResult> Members(Guid id, CancellationToken ct)
    {
        if (!await db.UserGroups.AnyAsync(g => g.Id == id, ct)) throw AppException.NotFound("Không tìm thấy nhóm");
        var items = await db.UserGroupMembers.Where(m => m.GroupId == id)
            .Join(db.Users, m => m.UserId, u => u.Id, (m, u) => new PermissionTarget(u.Id, u.FullName + " (" + u.Username + ")"))
            .ToListAsync(ct);
        return Ok(ApiResponse<List<PermissionTarget>>.Ok(items));
    }

    [HttpPost]
    public async Task<IActionResult> Create(GroupUpsertRequest req, CancellationToken ct)
    {
        var name = req.Name.Trim();
        var lowered = name.ToLower();
        if (await db.UserGroups.AnyAsync(g => g.Name.ToLower() == lowered, ct))
            throw AppException.Conflict("GROUP_EXISTS", "Tên nhóm đã tồn tại");
        var g = new UserGroup { Name = name, Description = req.Description?.Trim() };
        db.UserGroups.Add(g);
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("group.create", "user_group", g.Id.ToString(), true, new { g.Name });
        return StatusCode(201, ApiResponse<GroupDto>.Ok(new GroupDto(g.Id, g.Name, g.Description, 0)));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, GroupUpsertRequest req, CancellationToken ct)
    {
        var g = await db.UserGroups.FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("Không tìm thấy nhóm");
        var name = req.Name.Trim();
        var lowered = name.ToLower();
        if (await db.UserGroups.AnyAsync(x => x.Id != id && x.Name.ToLower() == lowered, ct))
            throw AppException.Conflict("GROUP_EXISTS", "Tên nhóm đã tồn tại");
        g.Name = name;
        g.Description = req.Description?.Trim();
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("group.update", "user_group", id.ToString(), true, new { g.Name });
        return Ok(ApiResponse<object?>.Ok(null, "Đã cập nhật nhóm"));
    }

    [HttpPut("{id:guid}/members")]
    public async Task<IActionResult> SetMembers(Guid id, IdListRequest req, CancellationToken ct)
    {
        if (!await db.UserGroups.AnyAsync(g => g.Id == id, ct)) throw AppException.NotFound("Không tìm thấy nhóm");
        var ids = req.Ids.Distinct().ToList();
        var valid = await db.Users.Where(u => ids.Contains(u.Id)).Select(u => u.Id).ToListAsync(ct);
        if (valid.Count != ids.Count) throw AppException.Validation("Danh sách người dùng chứa tài khoản không tồn tại");

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        db.UserGroupMembers.RemoveRange(await db.UserGroupMembers.Where(m => m.GroupId == id).ToListAsync(ct));
        foreach (var uid in ids) db.UserGroupMembers.Add(new UserGroupMember { GroupId = id, UserId = uid });
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await audit.WriteAsync("group.set_members", "user_group", id.ToString(), true, new { count = ids.Count });
        return Ok(ApiResponse<object?>.Ok(null, "Đã cập nhật thành viên"));
    }
}
