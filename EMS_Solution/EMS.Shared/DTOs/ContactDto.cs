namespace EMS.Shared.DTOs;

public class ContactDto
{
    public int ContactID { get; set; }
    public string? Category { get; set; }
    public string? CompanyName { get; set; }
    public string ContactName { get; set; } = string.Empty;
    public string? Designation { get; set; }
    public string? CategoryOfDesignation { get; set; }
    public string? Address1 { get; set; }
    public string? Address2 { get; set; }
    public string? FaxNo { get; set; }
    public string? Phone { get; set; }
    public string? Mobile1 { get; set; }
    public string? Mobile2 { get; set; }
    public string? EmailId { get; set; }
}
