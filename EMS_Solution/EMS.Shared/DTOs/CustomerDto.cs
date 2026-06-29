namespace EMS.Shared.DTOs;

public class CustomerDto
{
    public int CustomerID { get; set; }
    public string? Category { get; set; }
    public string CompanyName { get; set; } = string.Empty;
    public string? Address1 { get; set; }
    public string? Address2 { get; set; }
    public string? Rating { get; set; }
    public string? Type { get; set; }
    public string? FaxNo { get; set; }
    public string? Phone1 { get; set; }
    public string? Phone2 { get; set; }
    public string? MailId { get; set; }
    public string? Website { get; set; }
    public string Status { get; set; } = "Active";
}
