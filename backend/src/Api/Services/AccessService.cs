namespace FormPortal.Api.Services;

/// <summary>Quy tắc quyền xem dữ liệu. Quản trị viên và người phê duyệt xem tất cả; người dùng chỉ xem hệ thống được cấp quyền.</summary>
public class AccessService(AppDbContext db, ICurrentUser me)
{
    public bool Privileged => me.Privileged;

    public IQueryable<Application> VisibleApplications()
    {
        if (me.Privileged) return db.Applications;
        var uid = me.Id;
        return db.Applications.Where(a => a.Status == AppStatus.Active &&
            db.ApplicationPermissions.Any(p => p.ApplicationId == a.Id &&
                (p.UserId == uid ||
                 (p.GroupId != null && db.UserGroupMembers.Any(m => m.GroupId == p.GroupId && m.UserId == uid)))));
    }

    /// <summary>Người dùng thường chỉ thấy mẫu biểu có phiên bản đang hiệu lực.</summary>
    public IQueryable<Form> VisibleForms()
    {
        var apps = VisibleApplications();
        var q = db.Forms.Where(f => apps.Any(a => a.Id == f.ApplicationId));
        if (!me.Privileged)
            q = q.Where(f => f.CurrentVersion != null && f.CurrentVersion.Status == VersionStatus.Active);
        return q;
    }

    public async Task<bool> CanDownloadAsync(FormVersion v, CancellationToken ct)
    {
        if (me.Privileged) return true;
        var today = Clock.TodayVn;
        if (v.Status != VersionStatus.Active || v.Form.CurrentVersionId != v.Id) return false;
        if (v.ExpiryDate is { } e && e < today) return false;
        var appId = v.Form.ApplicationId;
        return await VisibleApplications().AnyAsync(a => a.Id == appId, ct);
    }
}
