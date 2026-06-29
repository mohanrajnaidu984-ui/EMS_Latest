namespace EMS.Shared.DTOs;

public class UserDto
{
    public int UserID { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string? Designation { get; set; }
    public string MailId { get; set; } = string.Empty;
    public string LoginPassword { get; set; } = string.Empty;
    public string Status { get; set; } = "Active";
    public string? Department { get; set; }
    public string? Roles { get; set; }
}
