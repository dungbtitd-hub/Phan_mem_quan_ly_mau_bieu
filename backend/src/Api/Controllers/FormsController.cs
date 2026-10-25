namespace FormPortal.Api.Controllers;

[ApiController, Route("api/forms")]
public class FormsController(AppDbContext db, AccessService access, FormService forms) : ControllerBase
{
    private static IQueryable<FormDto> Project(AppDbContext db, IQueryable<Form> q) => q.Select(f => new FormDto(
        f.Id, f.Code, f.Name, f.Description, f.ApplicationId, f.Application.Code, f.Application.Name,
        f.FormTypeId, f.FormType == null ? null : f.FormType.Name,
        db.FormVersions.Where(v => v.Id == f.CurrentVersionId)
            .Select(v => new VersionBriefDto(v.Id, v.VersionNo, v.Status, v.EffectiveDate, v.ExpiryDate, v.CreatedAt))
            .FirstOrDefault(),
        db.FormVersions.Where(v => v.FormId == f.Id).OrderByDescending(v => v.VersionNo)
            .Select(v => new VersionBriefDto(v.Id, v.VersionNo, v.Status, v.EffectiveDate, v.ExpiryDate, v.CreatedAt))
            .FirstOrDefault(),
        f.UpdatedAt, f.IsDemo));

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? q, [FromQuery] Guid? applicationId, [FromQuery] short? typeId,
        [FromQuery] string? status, [FromQuery] DateOnly? updatedFrom, [FromQuery] DateOnly? updatedTo,
        [FromQuery] string? sort, [FromQuery] bool desc = true,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var query = access.VisibleForms().AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q))
        {
            var folded = TextUtil.FoldedLike(q);
            var raw = TextUtil.RawLike(q);
            query = query.Where(f => EF.Functions.Like(AppDbContext.ImmutableUnaccent(f.Name).ToLower(), folded, "\\") ||
                                     EF.Functions.ILike(f.Code, raw, "\\"));
        }
        if (applicationId is { } a) query = query.Where(f => f.ApplicationId == a);
        if (typeId is { } t) query = query.Where(f => f.FormTypeId == t);
        if (updatedFrom is { } df) { var d = df.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc).AddHours(-7); query = query.Where(f => f.UpdatedAt >= d); }
        if (updatedTo is { } dt) { var d = dt.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc).AddHours(-7); query = query.Where(f => f.UpdatedAt < d); }
        if (!string.IsNullOrWhiteSpace(status))
        {
            if (!access.Privileged && status != VersionStatus.Active) status = VersionStatus.Active;
            query = query.Where(f => db.FormVersions.Where(v => v.FormId == f.Id)
                .OrderByDescending(v => v.VersionNo).Select(v => v.Status).FirstOrDefault() == status);
        }

        query = (sort?.ToLowerInvariant(), desc) switch
        {
            ("name", false) => query.OrderBy(f => f.Name),
            ("name", true) => query.OrderByDescending(f => f.Name),
            ("code", false) => query.OrderBy(f => f.Code),
            ("code", true) => query.OrderByDescending(f => f.Code),
            ("application", false) => query.OrderBy(f => f.Application.Name).ThenBy(f => f.Code),
            ("application", true) => query.OrderByDescending(f => f.Application.Name).ThenBy(f => f.Code),
            (_, false) => query.OrderBy(f => f.UpdatedAt),
            _ => query.OrderByDescending(f => f.UpdatedAt)
        };

        var result = await Project(db, query).ToPagedAsync(page, pageSize, ct);
        if (!access.Privileged)
            result = result with { Items = result.Items.Select(i => i with { Latest = i.Current }).ToList() };
        return Ok(ApiResponse<PagedResult<FormDto>>.Ok(result));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var dto = await Project(db, access.VisibleForms().AsNoTracking().Where(f => f.Id == id)).FirstOrDefaultAsync(ct)
                  ?? throw AppException.NotFound("Không tìm thấy mẫu biểu");
        if (!access.Privileged) dto = dto with { Latest = dto.Current };
        return Ok(ApiResponse<FormDto>.Ok(dto));
    }

    [HttpPost, Authorize(Roles = RoleCodes.Admin), Consumes("multipart/form-data")]
    public async Task<IActionResult> Create([FromForm] FormCreateRequest req, CancellationToken ct)
    {
        var id = await forms.CreateFormAsync(req, ct);
        return StatusCode(201, ApiResponse<object>.Ok(new { id }, "Đã tạo mẫu biểu (phiên bản 1 ở trạng thái bản nháp)"));
    }

    [HttpPut("{id:guid}"), Authorize(Roles = RoleCodes.Admin)]
    public async Task<IActionResult> Update(Guid id, FormUpdateRequest req, CancellationToken ct)
    {
        await forms.UpdateFormAsync(id, req, ct);
        return Ok(ApiResponse<object?>.Ok(null, "Đã cập nhật mẫu biểu"));
    }
}

[ApiController, Route("api/form-types")]
public class FormTypesController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct) =>
        Ok(ApiResponse<object>.Ok(await db.FormTypes.AsNoTracking().OrderBy(t => t.Name)
            .Select(t => new { t.Id, t.Code, t.Name }).ToListAsync(ct)));
}
