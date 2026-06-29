using System.ComponentModel.DataAnnotations;

namespace EMS.Data.Models;

public class Enquiry
{
    [Key]
    [StringLength(50)]
    public string RequestNo { get; set; } = string.Empty;

    [StringLength(50)]
    public string? SourceOfInfo { get; set; }

    public DateTime? EnquiryDate { get; set; }

    public DateTime? DueOn { get; set; }

    public DateTime? SiteVisitDate { get; set; }

    public string? EnquiryType { get; set; }

    public string? EnquiryFor { get; set; }

    [StringLength(255)]
    public string? CustomerName { get; set; }

    [StringLength(255)]
    public string? ReceivedFrom { get; set; }

    [StringLength(255)]
    public string? ProjectName { get; set; }

    [StringLength(255)]
    public string? ClientName { get; set; }

    [StringLength(255)]
    public string? ConsultantName { get; set; }

    [StringLength(255)]
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

    [StringLength(50)]
    public string Status { get; set; } = "Enquiry";

    public DateTime CreatedAt { get; set; } = DateTime.Now;
}
