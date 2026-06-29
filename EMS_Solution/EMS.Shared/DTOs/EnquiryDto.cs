namespace EMS.Shared.DTOs;

public class EnquiryDto
{
    public string RequestNo { get; set; } = string.Empty;
    public string? SourceOfInfo { get; set; }
    public DateTime? EnquiryDate { get; set; }
    public DateTime? DueOn { get; set; }
    public DateTime? SiteVisitDate { get; set; }
    public string? EnquiryType { get; set; }
    public string? EnquiryFor { get; set; }
    public string? CustomerName { get; set; }
    public string? ReceivedFrom { get; set; }
    public string? ProjectName { get; set; }
    public string? ClientName { get; set; }
    public string? ConsultantName { get; set; }
    public string? ConcernedSE { get; set; }
    public string? DetailsOfEnquiry { get; set; }
    public string? DocumentsReceived { get; set; }
    public bool HardCopy { get; set; }
    public bool Drawing { get; set; }
    public bool DVD { get; set; }
    public bool Spec { get; set; }
    public bool EqpSchedule { get; set; }
    public string? Remark { get; set; }
    public bool AutoAck { get; set; }
    public bool CeoSign { get; set; }
    public string Status { get; set; } = "Enquiry";
    public DateTime CreatedAt { get; set; }
}
