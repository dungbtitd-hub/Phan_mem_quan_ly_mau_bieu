using System.Text;

namespace FormPortal.Api.Infrastructure;

public static class Clock
{
    /// <summary>Ngày hiện tại theo giờ Việt Nam (UTC+7, không có giờ mùa hè).</summary>
    public static DateOnly TodayVn => DateOnly.FromDateTime(DateTime.UtcNow.AddHours(7));
}

public static class TextUtil
{
    private static readonly Dictionary<char, char> Map = Build();

    private static Dictionary<char, char> Build()
    {
        var d = new Dictionary<char, char>();
        void Add(char target, string chars) { foreach (var c in chars) d[c] = target; }
        Add('a', "àáạảãâầấậẩẫăằắặẳẵ");
        Add('e', "èéẹẻẽêềếệểễ");
        Add('i', "ìíịỉĩ");
        Add('o', "òóọỏõôồốộổỗơờớợởỡ");
        Add('u', "ùúụủũưừứựửữ");
        Add('y', "ỳýỵỷỹ");
        Add('d', "đ");
        return d;
    }

    /// <summary>Chuyển về chữ thường không dấu, dùng để tìm kiếm.</summary>
    public static string Fold(string s)
    {
        var sb = new StringBuilder(s.Length);
        foreach (var ch in s.Normalize(NormalizationForm.FormC).Trim().ToLowerInvariant())
            sb.Append(Map.TryGetValue(ch, out var m) ? m : ch);
        return sb.ToString();
    }

    private static string Escape(string s) =>
        s.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");

    /// <summary>Mẫu LIKE (escape ký tự '\') khớp không dấu, không phân biệt hoa thường.</summary>
    public static string FoldedLike(string q) => "%" + Escape(Fold(q)) + "%";
    public static string RawLike(string q) => "%" + Escape(q.Trim()) + "%";
}
