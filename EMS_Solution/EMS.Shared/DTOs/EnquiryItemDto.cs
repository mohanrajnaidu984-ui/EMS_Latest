namespace EMS.Shared.DTOs;

public class EnquiryItemDto
{
    public int ItemID { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public string? CompanyName { get; set; }
    public string? DepartmentName { get; set; }
    public string Status { get; set; } = "Active";
    public string? CommonMailIds { get; set; }
    public string? CCMailIds { get; set; }
}
