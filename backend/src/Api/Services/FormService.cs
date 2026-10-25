namespace FormPortal.Api.Services;

public class FormService(AppDbContext db, IFileStorage files, IAuditService audit, ICurrentUser me)
{
    public async Task<Guid> CreateFormAsync(FormCreateRequest r, CancellationToken ct)
    {
        var app = await db.Applications.FirstOrDefaultAsync(a => a.Id == r.ApplicationId, ct)
                  ?? throw AppException.NotFound("Không tìm thấy hệ thống ứng dụng");
        if (app.Status != AppStatus.Active)
            throw AppException.Conflict("APP_LOCKED", "Hệ thống ứng dụng đang bị khóa");
        await EnsureFormTypeAsync(r.FormTypeId, ct);
        ValidateDates(r.EffectiveDate, r.ExpiryDate);

        var code = r.Code.Trim();
        var lowered = code.ToLower();
        if (await db.Forms.AnyAsync(f => f.Code.ToLower() == lowered, ct))
            throw AppException.Conflict("FORM_CODE_EXISTS",
                "Mã mẫu biểu đã tồn tại. Hãy tạo phiên bản mới cho mẫu biểu hiện có thay vì tạo trùng mã.");

        var stored = await files.SaveAsync(r.File!, ct);
        try
        {
            var form = new Form
            {
                Code = code, Name = r.Name.Trim(), Description = r.Description?.Trim(),
                ApplicationId = r.ApplicationId, FormTypeId = r.FormTypeId, CreatedBy = me.Id
            };
            db.Forms.Add(form);
            db.FormVersions.Add(NewVersion(form.Id, 1, stored, r.EffectiveDate, r.ExpiryDate, r.ChangeNote));
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("form.create", "form", form.Id.ToString(), true, new { form.Code });
            return form.Id;
        }
        catch
        {
            files.Delete(stored.StoredName);
            throw;
        }
    }

    public async Task UpdateFormAsync(Guid id, FormUpdateRequest r, CancellationToken ct)
    {
        var form = await db.Forms.FirstOrDefaultAsync(f => f.Id == id, ct) ?? throw AppException.NotFound("Không tìm thấy mẫu biểu");
        await EnsureFormTypeAsync(r.FormTypeId, ct);
        var code = r.Code.Trim();
        if (!string.Equals(code, form.Code, StringComparison.Ordinal))
        {
            if (await db.FormVersions.AnyAsync(v => v.FormId == id && v.ApprovedAt != null, ct))
                throw AppException.Conflict("FORM_CODE_LOCKED", "Không thể đổi mã mẫu biểu đã có phiên bản được phê duyệt");
            var lowered = code.ToLower();
            if (await db.Forms.AnyAsync(f => f.Id != id && f.Code.ToLower() == lowered, ct))
                throw AppException.Conflict("FORM_CODE_EXISTS", "Mã mẫu biểu đã tồn tại");
        }
        var oldCode = form.Code;
        form.Code = code;
        form.Name = r.Name.Trim();
        form.Description = r.Description?.Trim();
        form.FormTypeId = r.FormTypeId;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("form.update", "form", id.ToString(), true, new { oldCode, newCode = code });
    }

    public async Task<Guid> AddVersionAsync(Guid formId, VersionCreateRequest r, CancellationToken ct)
    {
        var form = await db.Forms.Include(f => f.Application).FirstOrDefaultAsync(f => f.Id == formId, ct)
                   ?? throw AppException.NotFound("Không tìm thấy mẫu biểu");
        if (form.Application.Status != AppStatus.Active)
            throw AppException.Conflict("APP_LOCKED", "Hệ thống ứng dụng đang bị khóa");
        ValidateDates(r.EffectiveDate, r.ExpiryDate);
        if (await db.FormVersions.AnyAsync(v => v.FormId == formId &&
                (v.Status == VersionStatus.Draft || v.Status == VersionStatus.Pending), ct))
            throw AppException.Conflict("VERSION_IN_PROGRESS", "Mẫu biểu đang có phiên bản bản nháp hoặc chờ phê duyệt. Hãy xử lý phiên bản đó trước.");

        var next = (await db.FormVersions.Where(v => v.FormId == formId).MaxAsync(v => (int?)v.VersionNo, ct) ?? 0) + 1;
        var stored = await files.SaveAsync(r.File!, ct);
        try
        {
            var v = NewVersion(formId, next, stored, r.EffectiveDate, r.ExpiryDate, r.ChangeNote);
            db.FormVersions.Add(v);
            form.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("version.create", "form_version", v.Id.ToString(), true, new { form.Code, v.VersionNo });
            return v.Id;
        }
        catch
        {
            files.Delete(stored.StoredName);
            throw;
        }
    }

    public async Task UpdateVersionAsync(Guid id, VersionUpdateRequest r, CancellationToken ct)
    {
        var v = await GetAsync(id, ct);
        RequireStatus(v, VersionStatus.Draft);
        ValidateDates(r.EffectiveDate, r.ExpiryDate);
        v.EffectiveDate = r.EffectiveDate;
        v.ExpiryDate = r.ExpiryDate;
        v.ChangeNote = r.ChangeNote?.Trim();
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("version.update", "form_version", id.ToString(), true, new { v.Form.Code, v.VersionNo });
    }

    public async Task ReplaceFileAsync(Guid id, IFormFile file, CancellationToken ct)
    {
        var v = await GetAsync(id, ct);
        RequireStatus(v, VersionStatus.Draft);
        var stored = await files.SaveAsync(file, ct);
        var oldName = v.StoredName;
        try
        {
            v.OriginalFileName = stored.OriginalName;
            v.StoredName = stored.StoredName;
            v.ContentType = stored.ContentType;
            v.SizeBytes = stored.Size;
            v.Sha256 = stored.Sha256;
            await db.SaveChangesAsync(ct);
        }
        catch
        {
            files.Delete(stored.StoredName);
            throw;
        }
        files.Delete(oldName);
        await audit.WriteAsync("version.replace_file", "form_version", id.ToString(), true, new { v.Form.Code, v.VersionNo });
    }

    public async Task SubmitAsync(Guid id, CancellationToken ct)
    {
        var v = await GetAsync(id, ct);
        RequireStatus(v, VersionStatus.Draft);
        ValidateDates(v.EffectiveDate, v.ExpiryDate);
        v.Status = VersionStatus.Pending;
        v.SubmittedAt = DateTime.UtcNow;
        db.ApprovalHistory.Add(new ApprovalHistory { VersionId = id, ActorId = me.Id, Action = ApprovalAction.Submit });
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("version.submit", "form_version", id.ToString(), true, new { v.Form.Code, v.VersionNo });
    }

    public async Task ApproveAsync(Guid id, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var v = await GetAsync(id, ct);
        RequireStatus(v, VersionStatus.Pending);
        if (v.CreatedBy == me.Id)
        {
            await audit.WriteAsync("version.approve", "form_version", id.ToString(), false, new { reason = "self_approval" });
            throw AppException.Forbidden("Người tải lên không được tự phê duyệt phiên bản của mình");
        }
        var today = Clock.TodayVn;
        if (v.ExpiryDate is { } exp && exp < today)
            throw AppException.Conflict("VERSION_EXPIRED", "Ngày hết hiệu lực đã qua, không thể phê duyệt");

        var now = DateTime.UtcNow;
        var previous = await db.FormVersions.Where(x => x.FormId == v.FormId && x.Status == VersionStatus.Active).ToListAsync(ct);
        foreach (var p in previous)
        {
            p.Status = VersionStatus.Expired;
            db.ApprovalHistory.Add(new ApprovalHistory
            {
                VersionId = p.Id, ActorId = me.Id, Action = ApprovalAction.Expire,
                Reason = $"Được thay thế bởi phiên bản {v.VersionNo}", ActedAt = now
            });
        }
        if (previous.Count > 0) await db.SaveChangesAsync(ct); // bỏ hiệu lực bản cũ trước khi kích hoạt bản mới

        v.Status = VersionStatus.Active;
        v.ApprovedBy = me.Id;
        v.ApprovedAt = now;
        v.EffectiveDate ??= today;
        v.Form.CurrentVersionId = v.Id;
        v.Form.UpdatedAt = now;
        db.ApprovalHistory.Add(new ApprovalHistory { VersionId = id, ActorId = me.Id, Action = ApprovalAction.Approve, ActedAt = now });
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await audit.WriteAsync("version.approve", "form_version", id.ToString(), true, new { v.Form.Code, v.VersionNo });
    }

    public async Task RejectAsync(Guid id, string reason, CancellationToken ct)
    {
        var v = await GetAsync(id, ct);
        RequireStatus(v, VersionStatus.Pending);
        v.Status = VersionStatus.Draft;
        v.SubmittedAt = null;
        db.ApprovalHistory.Add(new ApprovalHistory { VersionId = id, ActorId = me.Id, Action = ApprovalAction.Reject, Reason = reason.Trim() });
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("version.reject", "form_version", id.ToString(), true, new { v.Form.Code, v.VersionNo });
    }

    public async Task RevokeAsync(Guid id, string reason, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var v = await GetAsync(id, ct);
        RequireStatus(v, VersionStatus.Active);
        var now = DateTime.UtcNow;
        v.Status = VersionStatus.Revoked;
        v.RevokedAt = now;
        if (v.Form.CurrentVersionId == v.Id) v.Form.CurrentVersionId = null;
        v.Form.UpdatedAt = now;
        db.ApprovalHistory.Add(new ApprovalHistory { VersionId = id, ActorId = me.Id, Action = ApprovalAction.Revoke, Reason = reason.Trim(), ActedAt = now });
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await audit.WriteAsync("version.revoke", "form_version", id.ToString(), true, new { v.Form.Code, v.VersionNo });
    }

    // ===== helpers =====
    private async Task<FormVersion> GetAsync(Guid id, CancellationToken ct) =>
        await db.FormVersions.Include(v => v.Form).FirstOrDefaultAsync(v => v.Id == id, ct)
        ?? throw AppException.NotFound("Không tìm thấy phiên bản mẫu biểu");

    private static void RequireStatus(FormVersion v, string expected)
    {
        if (v.Status != expected)
            throw AppException.Conflict("INVALID_STATE", $"Thao tác không hợp lệ với phiên bản đang ở trạng thái '{v.Status}'");
    }

    private static void ValidateDates(DateOnly? effective, DateOnly? expiry)
    {
        if (effective is { } e && expiry is { } x && x < e)
            throw AppException.Validation("Ngày hết hiệu lực phải sau hoặc bằng ngày hiệu lực");
    }

    private async Task EnsureFormTypeAsync(short? typeId, CancellationToken ct)
    {
        if (typeId is { } t && !await db.FormTypes.AnyAsync(x => x.Id == t, ct))
            throw AppException.Validation("Loại biểu mẫu không tồn tại");
    }

    private FormVersion NewVersion(Guid formId, int no, StoredFile f, DateOnly? eff, DateOnly? exp, string? note) => new()
    {
        FormId = formId, VersionNo = no, OriginalFileName = f.OriginalName, StoredName = f.StoredName,
        ContentType = f.ContentType, SizeBytes = f.Size, Sha256 = f.Sha256, EffectiveDate = eff, ExpiryDate = exp,
        ChangeNote = note?.Trim(), Status = VersionStatus.Draft, CreatedBy = me.Id
    };
}
