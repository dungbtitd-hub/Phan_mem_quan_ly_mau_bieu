namespace FormPortal.Api.Infrastructure;

public class AppException(string code, string message, int status = 400, object? details = null) : Exception(message)
{
    public string Code { get; } = code;
    public int Status { get; } = status;
    public object? Details { get; } = details;
    public static AppException NotFound(string m = "Không tìm thấy dữ liệu") => new("NOT_FOUND", m, 404);
    public static AppException Forbidden(string m = "Bạn không có quyền thực hiện thao tác này") => new("FORBIDDEN", m, 403);
    public static AppException Validation(string m, object? details = null) => new("VALIDATION_ERROR", m, 400, details);
    public static AppException Conflict(string code, string m) => new(code, m, 409);
}

public record ApiError(string Code, string Message, object? Details, string? RequestId);

public class ApiResponse<T>
{
    public bool Success { get; init; }
    public T? Data { get; init; }
    public string? Message { get; init; }
    public ApiError? Error { get; init; }
    public static ApiResponse<T> Ok(T data, string? message = null) =>
        new() { Success = true, Data = data, Message = message ?? "Request completed" };
}

public static class ApiResponse
{
    public static ApiResponse<object> Fail(string code, string message, object? details, string? requestId) =>
        new() { Success = false, Message = message, Error = new ApiError(code, message, details, requestId) };
}

public record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total);

public static class QueryExtensions
{
    public static async Task<PagedResult<T>> ToPagedAsync<T>(this IQueryable<T> q, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var total = await q.CountAsync(ct);
        var items = await q.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return new PagedResult<T>(items, page, pageSize, total);
    }
}
