using System.Linq.Expressions;
using Microsoft.AspNetCore.RateLimiting;

namespace FormPortal.Api.Controllers;

[ApiController, Route("api")]
public class VersionsController(AppDbContext db, AccessService access, FormService forms, IFileStorage files,
    IAuditService audit, ICurrentUser me) : ControllerBase
{
    private static readonly Expression<Func<FormVersion, VersionDto>> ToDto = v => new VersionDto(
        v.Id, v.FormId, v.Form.Code, v.Form.Name, v.VersionNo, v.OriginalFileName, v.ContentType, v.SizeBytes, v.Sha256,
        v.EffectiveDate, v.ExpiryDate, v.ChangeNote, v.Status, v.Creator.FullName, v.CreatedAt, v.SubmittedAt,
        v.Approver == null ? null : v.Approver.FullName, v.ApprovedAt, v.RevokedAt, v.Form.CurrentVersionId == v.Id);

    [HttpGet("forms/{formId:guid}/versions"), Authorize(Roles = RoleCodes.AdminOrApprover)]
    public async Task<IActionResult> ListForForm(Guid formId, CancellationToken ct)
    {
        if (!await db.Forms.AnyAsync(f => f.Id == formId, ct)) throw AppException.NotFound("Không tìm thấy mẫu biểu");
        var items = await db.FormVersions.AsNoTracking().Where(v => v.FormId == formId)
            .OrderByDescending(v => v.VersionNo).Select(ToDto).ToListAsync(ct);
        return Ok(ApiResponse<List<VersionDto>>.Ok(items));
    }

    [HttpPost("forms/{formId:guid}/versions"), Authorize(Roles = RoleCodes.Admin), Consumes("multipart/form-data")]
    public async Task<IActionResult> Create(Guid formId, [FromForm] VersionCreateRequest req, CancellationToken ct)
    {
        var id = await forms.AddVersionAsync(formId, req, ct);
        var dto = await db.FormVersions.AsNoTracking().Where(v => v.Id == id).Select(ToDto).FirstAsync(ct);
        return StatusCode(201, ApiResponse<VersionDto>.Ok(dto, "Đã tạo phiên bản mới (bản nháp)"));
    }

    [HttpGet("versions"), Authorize(Roles = RoleCodes.AdminOrApprover)]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] Guid? formId, [FromQuery] Guid? applicationId,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var q = db.FormVersions.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(status)) q = q.Where(v => v.Status == status);
        if (formId is { } f) q = q.Where(v => v.FormId == f);
        if (applicationId is { } a) q = q.Where(v => v.Form.ApplicationId == a);
        var result = await q.OrderByDescending(v => v.CreatedAt).Select(ToDto).ToPagedAsync(page, pageSize, ct);
        return Ok(ApiResponse<PagedResult<VersionDto>>.Ok(result));
    }

    [HttpGet("versions/{id:guid}"), Authorize(Roles = RoleCodes.AdminOrApprover)]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var dto = await db.FormVersions.AsNoTracking().Where(v => v.Id == id).Select(ToDto).FirstOrDefaultAsync(ct)
                  ?? throw AppException.NotFound("Không tìm thấy phiên bản");
        return Ok(ApiResponse<VersionDto>.Ok(dto));
    }

    [HttpPut("versions/{id:guid}"), Authorize(Roles = RoleCodes.Admin)]
    public async Task<IActionResult> Update(Guid id, VersionUpdateRequest req, CancellationToken ct)
    {
        await forms.UpdateVersionAsync(id, req, ct);
        return Ok(ApiResponse<object?>.Ok(null, "Đã cập nhật phiên bản"));
    }

    [HttpPut("versions/{id:guid}/file"), Authorize(Roles = RoleCodes.Admin), Consumes("multipart/form-data")]
    public async Task<IActionResult> ReplaceFile(Guid id, [FromForm] VersionFileRequest req, CancellationToken ct)
    {
        await forms.ReplaceFileAsync(id, req.File!, ct);
        return Ok(ApiResponse<object?>.Ok(null, "Đã thay tệp của bản nháp"));
    }

    [HttpPost("versions/{id:guid}/submit"), Authorize(Roles = RoleCodes.Admin)]
    public async Task<IActionResult> Submit(Guid id, CancellationToken ct)
    {
        await forms.SubmitAsync(id, ct);
        return Ok(ApiResponse<object?>.Ok(null, "Đã gửi phê duyệt"));
    }

    [HttpPost("versions/{id:guid}/approve"), Authorize(Roles = RoleCodes.Approver)]
    public async Task<IActionResult> Approve(Guid id, CancellationToken ct)
    {
        await forms.ApproveAsync(id, ct);
        return Ok(ApiResponse<object?>.Ok(null, "Đã phê duyệt, phiên bản có hiệu lực"));
    }

    [HttpPost("versions/{id:guid}/reject"), Authorize(Roles = RoleCodes.Approver)]
    public async Task<IActionResult> Reject(Guid id, ReasonRequest req, CancellationToken ct)
    {
        await forms.RejectAsync(id, req.Reason, ct);
        return Ok(ApiResponse<object?>.Ok(null, "Đã từ chối, phiên bản quay về bản nháp"));
    }

    [HttpPost("versions/{id:guid}/revoke"), Authorize(Roles = RoleCodes.AdminOrApprover)]
    public async Task<IActionResult> Revoke(Guid id, ReasonRequest req, CancellationToken ct)
    {
        await forms.RevokeAsync(id, req.Reason, ct);
        return Ok(ApiResponse<object?>.Ok(null, "Đã thu hồi phiên bản"));
    }

    [HttpGet("versions/{id:guid}/history"), Authorize(Roles = RoleCodes.AdminOrApprover)]
    public async Task<IActionResult> History(Guid id, CancellationToken ct)
    {
        if (!await db.FormVersions.AnyAsync(v => v.Id == id, ct)) throw AppException.NotFound("Không tìm thấy phiên bản");
        var items = await db.ApprovalHistory.AsNoTracking().Where(h => h.VersionId == id).OrderBy(h => h.ActedAt)
            .Select(h => new HistoryDto(h.Id, h.Action, h.Actor == null ? "Hệ thống" : h.Actor.FullName, h.Reason, h.ActedAt))
            .ToListAsync(ct);
        return Ok(ApiResponse<List<HistoryDto>>.Ok(items));
    }

    [HttpGet("versions/{id:guid}/download"), EnableRateLimiting("download")]
    public Task<IActionResult> DownloadVersion(Guid id, CancellationToken ct) => ServeAsync(id, ct);

    /// <summary>Tải phiên bản đang hiệu lực của mẫu biểu.</summary>
    [HttpGet("forms/{formId:guid}/download"), EnableRateLimiting("download")]
    public async Task<IActionResult> DownloadCurrent(Guid formId, CancellationToken ct)
    {
        var versionId = await access.VisibleForms().Where(f => f.Id == formId).Select(f => f.CurrentVersionId).FirstOrDefaultAsync(ct);
        if (versionId is null) throw AppException.NotFound("Mẫu biểu không có phiên bản đang hiệu lực");
        return await ServeAsync(versionId.Value, ct);
    }

    private async Task<IActionResult> ServeAsync(Guid versionId, CancellationToken ct)
    {
        var v = await db.FormVersions.AsNoTracking().Include(x => x.Form).FirstOrDefaultAsync(x => x.Id == versionId, ct);
        if (v is null || !await access.CanDownloadAsync(v, ct))
        {
            await audit.WriteAsync("file.download", "form_version", versionId.ToString(), false, new { reason = "not_found_or_denied" });
            throw AppException.NotFound("Không tìm thấy tệp hoặc bạn không có quyền tải");
        }

        var stream = files.Open(v.StoredName);
        try
        {
            db.DownloadLogs.Add(new DownloadLog { VersionId = v.Id, UserId = me.Id, IpAddress = me.Ip });
            await db.SaveChangesAsync(ct);
        }
        catch
        {
            await stream.DisposeAsync();
            throw;
        }
        await audit.WriteAsync("file.download", "form_version", v.Id.ToString(), true, new { v.Form.Code, v.VersionNo });

        Response.Headers.CacheControl = "no-store";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(stream, v.ContentType, v.OriginalFileName);
    }
}
